/**
 * ActionReply.gs — handles action "reply" (reply to one thread sender or draft).
 *
 * Required payload fields: thread_id, body_html or body_plain
 * Optional:  attachment_link, context, draft_only, in_reply_to_message_id
 *
 * Reporter "to" field = primary sender of the last message in the thread.
 */

var ActionReply = (function () {

  function handle(payload) {
    payload = payload || {};

    if (!payload.thread_id) {
      return { success: false, action: 'reply', error: 'Missing required field: thread_id.' };
    }
    if (!payload.body_html && !payload.body_plain) {
      return { success: false, action: 'reply', error: 'Missing required field: body_html or body_plain (at least one required).' };
    }

    // Validate thread access early
    if (!validateThreadAccess(payload.thread_id)) {
      return { success: false, action: 'reply', error: 'Invalid or inaccessible thread_id: ' + payload.thread_id };
    }

    var isDraft = !!payload.draft_only;
    var threadContext = getThreadContext(payload.thread_id);

    if (isDraft) {
      return handleDraft_(payload, threadContext);
    }
    return handleReply_(payload, threadContext);
  }

  function handleDraft_(payload, threadContext) {
    var result = {
      success: false,
      action: 'reply',
      mode: 'draft',
      draft_id: null,
      draft_link: null,
      message_id: null,
      thread_id: payload.thread_id,
      error: null
    };

    try {
      var draftResult = createDraft('reply', {
        threadId: payload.thread_id,
        bodyHtml: payload.body_html || null,
        bodyText: payload.body_plain || null,
        attachmentLink: payload.attachment_link || null
      });
      result.success = true;
      result.draft_id = draftResult.draft_id;
      result.draft_link = draftResult.draft_link;
      result.result_summary = 'Draft created for thread ' + payload.thread_id;
    } catch (err) {
      result.error = String(err.message || err);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  function handleReply_(payload, threadContext) {
    var result = {
      success: false,
      action: 'reply',
      mode: 'reply',
      message_id: null,
      thread_id: payload.thread_id,
      archive_doc_link: null,
      archive_doc_id: null,
      archive_error: null,
      error: null
    };

    try {
      var sendResult = replyToThread(
        payload.thread_id,
        payload.body_html || null,
        payload.body_plain || null,
        payload.attachment_link || null,
        payload.in_reply_to_message_id || null
      );
      result.message_id = sendResult.message_id;
      result.thread_id = sendResult.thread_id;
      result.success = true;
      result.result_summary = 'Reply sent in thread ' + payload.thread_id;
    } catch (err) {
      result.error = String(err.message || err);
      logEmailerOperation(payload, result);
      return result;
    }

    // Reporter — mandatory, non-fatal
    var recipientAddress = extractBareEmail_(threadContext.last_message_from);
    try {
      var archiveResult = buildArchive({
        from: Session.getActiveUser().getEmail(),
        to: recipientAddress,
        subject: threadContext.subject || '(no subject)',
        date: new Date().toISOString(),
        body_html: payload.body_html || null,
        body_plain: payload.body_plain || null,
        context: payload.context || null,
        attachment_link: payload.attachment_link || null,
        thread_id: result.thread_id,
        mode: 'reply'
      });
      result.archive_doc_link = archiveResult.archive_doc_link;
      result.archive_doc_id = archiveResult.archive_doc_id;
    } catch (archiveErr) {
      result.archive_error = String(archiveErr.message || archiveErr);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  function extractBareEmail_(str) {
    if (!str) return 'unknown';
    var m = str.match(/<([^>]+)>/);
    return m ? m[1].trim() : str.trim();
  }

  return { handle: handle };
})();
