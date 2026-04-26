/**
 * ActionReplyAll.gs — handles action "reply_all" (reply-all in a thread or draft).
 *
 * Required payload fields: thread_id, body_html or body_plain
 * Optional:  attachment_link, context, draft_only, in_reply_to_message_id
 *
 * Reporter "to" field = comma-joined list of all To + CC recipients from thread context.
 */

var ActionReplyAll = (function () {

  function handle(payload) {
    payload = payload || {};

    if (!payload.thread_id) {
      return { success: false, action: 'reply_all', error: 'Missing required field: thread_id.' };
    }
    if (!payload.body_html && !payload.body_plain) {
      return { success: false, action: 'reply_all', error: 'Missing required field: body_html or body_plain (at least one required).' };
    }

    if (!validateThreadAccess(payload.thread_id)) {
      return { success: false, action: 'reply_all', error: 'Invalid or inaccessible thread_id: ' + payload.thread_id };
    }

    var isDraft = !!payload.draft_only;
    var threadContext = getFullThreadContext_(payload.thread_id);

    if (isDraft) {
      return handleDraft_(payload, threadContext);
    }
    return handleReplyAll_(payload, threadContext);
  }

  function handleDraft_(payload, threadContext) {
    var result = {
      success: false,
      action: 'reply_all',
      mode: 'draft',
      draft_id: null,
      draft_link: null,
      message_id: null,
      thread_id: payload.thread_id,
      error: null
    };

    try {
      var draftResult = createDraft('reply_all', {
        threadId: payload.thread_id,
        bodyHtml: payload.body_html || null,
        bodyText: payload.body_plain || null,
        attachmentLink: payload.attachment_link || null
      });
      result.success = true;
      result.draft_id = draftResult.draft_id;
      result.draft_link = draftResult.draft_link;
      result.result_summary = 'Reply-all draft created for thread ' + payload.thread_id;
    } catch (err) {
      result.error = String(err.message || err);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  function handleReplyAll_(payload, threadContext) {
    var result = {
      success: false,
      action: 'reply_all',
      mode: 'reply_all',
      message_id: null,
      thread_id: payload.thread_id,
      archive_doc_link: null,
      archive_doc_id: null,
      archive_error: null,
      error: null
    };

    try {
      var sendResult = replyAllToThread(
        payload.thread_id,
        payload.body_html || null,
        payload.body_plain || null,
        payload.attachment_link || null,
        payload.in_reply_to_message_id || null
      );
      result.message_id = sendResult.message_id;
      result.thread_id = sendResult.thread_id;
      result.success = true;
      result.result_summary = 'Reply-all sent in thread ' + payload.thread_id;
    } catch (err) {
      result.error = String(err.message || err);
      logEmailerOperation(payload, result);
      return result;
    }

    // Reporter "to" = all recipients from last message
    var recipientList = threadContext.all_recipients.join(', ') || 'unknown';
    try {
      var archiveResult = buildArchive({
        from: Session.getActiveUser().getEmail(),
        to: recipientList,
        subject: threadContext.subject || '(no subject)',
        date: new Date().toISOString(),
        body_html: payload.body_html || null,
        body_plain: payload.body_plain || null,
        context: payload.context || null,
        attachment_link: payload.attachment_link || null,
        thread_id: result.thread_id,
        mode: 'reply_all'
      });
      result.archive_doc_link = archiveResult.archive_doc_link;
      result.archive_doc_id = archiveResult.archive_doc_id;
    } catch (archiveErr) {
      result.archive_error = String(archiveErr.message || archiveErr);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  /**
   * getFullThreadContext_ — extends getThreadContext with To + CC lists from last message.
   * @private
   */
  function getFullThreadContext_(threadId) {
    var ctx = getThreadContext(threadId);
    var thread = GmailApp.getThreadById(threadId);
    var messages = thread.getMessages();
    var last = messages[messages.length - 1];

    var allRecipients = [];
    parseAddressList_(last.getTo()).forEach(function (a) {
      if (allRecipients.indexOf(a) === -1) allRecipients.push(a);
    });
    parseAddressList_(last.getCc()).forEach(function (a) {
      if (allRecipients.indexOf(a) === -1) allRecipients.push(a);
    });

    ctx.all_recipients = allRecipients;
    return ctx;
  }

  function parseAddressList_(str) {
    if (!str) return [];
    return str.split(',').map(function (s) {
      var m = s.trim().match(/<([^>]+)>/);
      return m ? m[1].trim() : s.trim();
    }).filter(Boolean);
  }

  return { handle: handle };
})();
