/**
 * ActionReplyAll.gs — handler for action: "reply_all".
 *
 * Reply-all in an existing Gmail thread, preserving the full To + CC list.
 * Reporter "to" field is the comma-joined recipient list.
 */

/**
 * @param {object} payload - same shape as ActionReply payload
 * @returns {object} response envelope
 */
function ActionReplyAll_handle(payload) {
  var resp = {
    success: false,
    action: 'reply_all',
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
    var meEmail = getSenderIdentity_();
    var allRecipients = collectReplyAllRecipients_(payload.thread_id, meEmail);
    var draftOnly = payload.draft_only === true;
    resp.draft_only = draftOnly;

    if (draftOnly) {
      resp.mode = 'draft';
      var draftResult = createDraft('reply_all', {
        thread_id: payload.thread_id,
        subject: 'Re: ' + (threadContext.subject || ''),
        to_recipients: allRecipients.to,
        cc_recipients: allRecipients.cc,
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
      resp.mode = 'reply_all';
      var sendResult = replyAllToThread(
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
        var joinedRecipients = allRecipients.to.concat(allRecipients.cc).join(', ');
        var arch = buildArchive({
          from: meEmail,
          to: joinedRecipients || 'unknown',
          subject: threadContext.subject || '',
          date: new Date().toISOString(),
          body_html: payload.body_html || '',
          body_plain: payload.body_plain || '',
          context: payload.context || '',
          attachment_link: payload.attachment_link || '',
          thread_id: sendResult.thread_id,
          mode: 'reply_all'
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
 * collectReplyAllRecipients_ — pulls all unique To and CC addresses across the
 * thread, excluding our own email so we don't reply to ourselves.
 * @private
 * @returns {{to: string[], cc: string[]}}
 */
function collectReplyAllRecipients_(threadId, myEmail) {
  var thread = GmailApp.getThreadById(threadId);
  if (!thread) return { to: [], cc: [] };
  var msgs = thread.getMessages();

  var toSet = {};
  var ccSet = {};
  var myLower = (myEmail || '').toLowerCase();

  msgs.forEach(function (m) {
    var from = extractEmail_(m.getFrom());
    if (from && from.toLowerCase() !== myLower) toSet[from.toLowerCase()] = from;

    splitAddresses_(m.getTo()).forEach(function (a) {
      if (a && a.toLowerCase() !== myLower) toSet[a.toLowerCase()] = a;
    });
    splitAddresses_(m.getCc()).forEach(function (a) {
      if (a && a.toLowerCase() !== myLower) ccSet[a.toLowerCase()] = a;
    });
  });

  // Remove duplicates between to and cc — prefer To.
  Object.keys(toSet).forEach(function (k) { delete ccSet[k]; });

  return {
    to: Object.keys(toSet).map(function (k) { return toSet[k]; }),
    cc: Object.keys(ccSet).map(function (k) { return ccSet[k]; })
  };
}

/** @private */
function splitAddresses_(headerValue) {
  if (!headerValue) return [];
  return String(headerValue).split(',').map(function (s) {
    return extractEmail_(s.trim());
  }).filter(function (s) { return !!s; });
}
