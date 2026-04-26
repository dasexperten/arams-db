/**
 * ActionSend.gs — handler for action: "send".
 *
 * Sends a brand-new email. Reporter runs after a real send;
 * for draft_only:true the message is staged in Gmail Drafts and Reporter is skipped.
 */

/**
 * @param {object} payload - {
 *   action: 'send',
 *   recipient: string,            // required
 *   subject: string,               // required
 *   body_html: string,             // required (or body_plain)
 *   body_plain: string,            // optional fallback
 *   attachment_link: string,       // optional
 *   context: string,               // optional, recorded in archive
 *   draft_only: boolean            // optional, default false
 * }
 * @returns {object} response envelope
 */
function ActionSend_handle(payload) {
  var resp = {
    success: false,
    action: 'send',
    mode: null,
    draft_only: false,
    message_id: null,
    thread_id: null,
    draft_id: null,
    draft_link: null,
    archive_status: 'skipped',
    archive_doc_link: null,
    archive_error: null,
    result_summary: null,
    log_id: null,
    error: null
  };

  try {
    if (!payload.recipient) throw new Error("Missing required field: recipient");
    if (!payload.subject) throw new Error("Missing required field: subject");
    if (!payload.body_html && !payload.body_plain) {
      throw new Error("Missing required field: body_html or body_plain");
    }

    var draftOnly = payload.draft_only === true;
    resp.draft_only = draftOnly;

    if (draftOnly) {
      resp.mode = 'draft';
      var draftResult = createDraft('new', {
        recipient: payload.recipient,
        subject: payload.subject,
        body_html: payload.body_html || null,
        body_plain: payload.body_plain || null,
        attachment_link: payload.attachment_link || null
      });
      resp.draft_id = draftResult.draft_id;
      resp.draft_link = draftResult.draft_link;
      resp.thread_id = draftResult.thread_id;
      resp.archive_status = 'skipped';
      resp.result_summary = 'Draft created';
      resp.success = true;
    } else {
      resp.mode = 'new';
      var sendResult = sendNew(
        payload.recipient,
        payload.subject,
        payload.body_html || null,
        payload.body_plain || null,
        payload.attachment_link || null
      );
      resp.message_id = sendResult.message_id;
      resp.thread_id = sendResult.thread_id;
      resp.success = true;
      resp.result_summary = 'Sent';

      // Reporter — mandatory, fail-safe.
      try {
        var arch = buildArchive({
          from: getSenderIdentity_(),
          to: payload.recipient,
          subject: payload.subject,
          date: new Date().toISOString(),
          body_html: payload.body_html || '',
          body_plain: payload.body_plain || '',
          context: payload.context || '',
          attachment_link: payload.attachment_link || '',
          thread_id: sendResult.thread_id,
          mode: 'new'
        });
        resp.archive_status = 'ok';
        resp.archive_doc_link = arch.archive_doc_link;
      } catch (archErr) {
        resp.archive_status = 'failed';
        resp.archive_error = String(archErr && archErr.message ? archErr.message : archErr);
      }
    }
  } catch (err) {
    resp.success = false;
    resp.error = String(err && err.message ? err.message : err);
  }

  try { resp.log_id = logOperation(payload, resp); } catch (logErr) {
    // Logging failure must not propagate.
  }
  return resp;
}

/** @private */
function getSenderIdentity_() {
  try { return Session.getActiveUser().getEmail() || 'me'; }
  catch (e) { return 'me'; }
}
