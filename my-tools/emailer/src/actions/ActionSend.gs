/**
 * ActionSend.gs — handles action "send" (new outgoing email or draft).
 *
 * Required payload fields: recipient, subject, body_html or body_plain
 * Optional:  attachment_link, context, draft_only
 *
 * If draft_only:true → creates a Gmail draft, returns draft response, NO Reporter.
 * Otherwise         → sends email, runs Reporter in try/catch, returns full response.
 */

var ActionSend = (function () {

  /**
   * handle — entry point called by Main.gs dispatcher.
   * @param {object} payload
   * @returns {object}
   */
  function handle(payload) {
    payload = payload || {};

    // Validate required fields
    if (!payload.recipient) {
      return { success: false, action: 'send', error: 'Missing required field: recipient.' };
    }
    if (!payload.subject) {
      return { success: false, action: 'send', error: 'Missing required field: subject.' };
    }
    if (!payload.body_html && !payload.body_plain) {
      return { success: false, action: 'send', error: 'Missing required field: body_html or body_plain (at least one required).' };
    }

    // Validate optional "from" against whitelist
    if (payload.from) {
      var fromLower = String(payload.from).toLowerCase().trim();
      var allowedLower = ALLOWED_SENDER_INBOXES.map(function (a) { return a.toLowerCase(); });
      if (allowedLower.indexOf(fromLower) === -1) {
        return { ok: false, success: false, action: 'send', error: 'INVALID_FROM', allowed: ALLOWED_SENDER_INBOXES };
      }
    }

    var isDraft = !!payload.draft_only;

    if (isDraft) {
      return handleDraft_(payload);
    }
    return handleSend_(payload);
  }

  function handleDraft_(payload) {
    var result = {
      success: false,
      action: 'send',
      mode: 'draft',
      draft_id: null,
      draft_link: null,
      message_id: null,
      thread_id: null,
      error: null
    };

    try {
      var draftResult = createDraft('new', {
        recipient: payload.recipient,
        subject: payload.subject,
        bodyHtml: payload.body_html || null,
        bodyText: payload.body_plain || null,
        attachmentLink: payload.attachment_link || null,
        fromAddress: payload.from || null
      });
      result.success = true;
      result.draft_id = draftResult.draft_id;
      result.draft_link = draftResult.draft_link;
      result.result_summary = 'Draft created';
    } catch (err) {
      result.error = String(err.message || err);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  function handleSend_(payload) {
    var result = {
      success: false,
      action: 'send',
      mode: 'new',
      message_id: null,
      thread_id: null,
      archive_doc_link: null,
      archive_doc_id: null,
      archive_error: null,
      error: null
    };

    var resolvedFrom = payload.from || null;

    try {
      var sendResult = sendNew(
        payload.recipient,
        payload.subject,
        payload.body_html || null,
        payload.body_plain || null,
        payload.attachment_link || null,
        resolvedFrom
      );
      result.message_id = sendResult.message_id;
      result.thread_id = sendResult.thread_id;
      result.success = true;
      result.result_summary = 'Email sent to ' + payload.recipient;
    } catch (err) {
      result.error = String(err.message || err);
      logEmailerOperation(payload, result);
      return result;
    }

    // Reporter — mandatory, non-fatal
    try {
      var archiveResult = buildArchive({
        from: resolvedFrom || Session.getActiveUser().getEmail(),
        to: payload.recipient,
        subject: payload.subject,
        date: new Date().toISOString(),
        body_html: payload.body_html || null,
        body_plain: payload.body_plain || null,
        context: payload.context || null,
        attachment_link: payload.attachment_link || null,
        thread_id: result.thread_id,
        mode: 'new'
      });
      result.archive_doc_link = archiveResult.archive_doc_link;
      result.archive_doc_id = archiveResult.archive_doc_id;
    } catch (archiveErr) {
      result.archive_error = String(archiveErr.message || archiveErr);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  return { handle: handle };
})();
