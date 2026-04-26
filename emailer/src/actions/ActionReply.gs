/**
 * ActionReply.gs — handler for action: "reply".
 *
 * Replies inside an existing Gmail thread (sender only, no CC).
 * Reporter runs after a real send; skipped for draft_only:true.
 */

/**
 * @param {object} payload - {
 *   action: 'reply',
 *   thread_id: string,             // required
 *   body_html: string,             // required (or body_plain)
 *   body_plain: string,            // optional
 *   attachment_link: string,       // optional
 *   context: string,               // optional
 *   draft_only: boolean,           // optional
 *   in_reply_to_message_id: string // optional, informational
 * }
 * @returns {object} response envelope
 */
function ActionReply_handle(payload) {
  var resp = {
    success: false,
    action: 'reply',
    mode: null,
    draft_only: false,
    message_id: null,
    thread_id: payload.thread_id || null,
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
    if (!payload.thread_id) throw new Error("Missing required field: thread_id");
    if (!payload.body_html && !payload.body_plain) {
      throw new Error("Missing required field: body_html or body_plain");
    }
    if (!validateThreadAccess(payload.thread_id)) {
      throw new Error("Invalid or inaccessible Gmail thread_id: " + payload.thread_id);
    }

    var threadContext = getThreadContext(payload.thread_id);
    var primaryRecipient = resolvePrimaryReplyTo_(threadContext);
    var draftOnly = payload.draft_only === true;
    resp.draft_only = draftOnly;

    if (draftOnly) {
      resp.mode = 'draft';
      var draftResult = createDraft('reply', {
        thread_id: payload.thread_id,
        subject: 'Re: ' + (threadContext.subject || ''),
        to_recipients: [primaryRecipient],
        body_html: payload.body_html || null,
        body_plain: payload.body_plain || null,
        attachment_link: payload.attachment_link || null
      });
      resp.draft_id = draftResult.draft_id;
      resp.draft_link = draftResult.draft_link;
      resp.thread_id = draftResult.thread_id || payload.thread_id;
      resp.archive_status = 'skipped';
      resp.result_summary = 'Draft created';
      resp.success = true;
    } else {
      resp.mode = 'reply';
      var sendResult = replyToThread(
        payload.thread_id,
        payload.body_html || null,
        payload.body_plain || null,
        payload.attachment_link || null,
        payload.in_reply_to_message_id || null
      );
      resp.message_id = sendResult.message_id;
      resp.thread_id = sendResult.thread_id;
      resp.success = true;
      resp.result_summary = 'Sent';

      try {
        var arch = buildArchive({
          from: getSenderIdentity_(),
          to: primaryRecipient,
          subject: threadContext.subject || '',
          date: new Date().toISOString(),
          body_html: payload.body_html || '',
          body_plain: payload.body_plain || '',
          context: payload.context || '',
          attachment_link: payload.attachment_link || '',
          thread_id: sendResult.thread_id,
          mode: 'reply'
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

  try { resp.log_id = logOperation(payload, resp); } catch (logErr) {}
  return resp;
}

/**
 * resolvePrimaryReplyTo_ — derives the address a "Reply" would go to.
 * Convention: take the From of the most recent message in the thread.
 * @private
 */
function resolvePrimaryReplyTo_(threadContext) {
  if (threadContext && threadContext.last_message_from) {
    return extractEmail_(threadContext.last_message_from);
  }
  return 'unknown';
}

/** @private */
function extractEmail_(addr) {
  if (!addr) return 'unknown';
  var m = String(addr).match(/<([^>]+)>/);
  if (m) return m[1].trim();
  return String(addr).trim();
}
