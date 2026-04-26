/**
 * ActionGetThread.gs — handler for action: "get_thread".
 *
 * Returns full thread context (all messages, full bodies, metadata)
 * so an upstream orchestrator can formulate a reply / decision.
 */

/**
 * @param {object} payload - {
 *   action: 'get_thread',
 *   thread_id: string             // required
 * }
 * @returns {object} {
 *   success, thread_id, subject, participants, message_count, messages: [...], error
 * }
 */
function ActionGetThread_handle(payload) {
  var resp = {
    success: false,
    action: 'get_thread',
    thread_id: payload.thread_id || null,
    subject: null,
    participants: [],
    message_count: 0,
    messages: [],
    result_summary: null,
    log_id: null,
    error: null
  };

  try {
    if (!payload.thread_id) throw new Error("Missing required field: thread_id");

    var thread;
    try { thread = GmailApp.getThreadById(payload.thread_id); }
    catch (e) { throw new Error("Inaccessible thread_id: " + payload.thread_id + " (" + e + ")"); }
    if (!thread) throw new Error("Thread not found: " + payload.thread_id);

    var messages = thread.getMessages();
    resp.subject = thread.getFirstMessageSubject() || '';
    resp.message_count = messages.length;

    var participantSet = {};
    var serialized = [];

    messages.forEach(function (m) {
      var from = m.getFrom() || '';
      var to = splitAddrsV2_(m.getTo());
      var cc = splitAddrsV2_(m.getCc());

      var fromEmail = extractEmailV2_(from);
      if (fromEmail) participantSet[fromEmail.toLowerCase()] = fromEmail;
      to.forEach(function (a) { if (a) participantSet[a.toLowerCase()] = a; });
      cc.forEach(function (a) { if (a) participantSet[a.toLowerCase()] = a; });

      var rawAtts = m.getAttachments({ includeInlineImages: false, includeAttachments: true }) || [];
      var attachmentNames = rawAtts.map(function (a) { return a.getName(); });

      serialized.push({
        message_id: m.getId(),
        from: from,
        to: to,
        cc: cc,
        date: m.getDate() ? m.getDate().toISOString() : null,
        body_plain: m.getPlainBody() || '',
        has_attachments: attachmentNames.length > 0,
        attachment_names: attachmentNames
      });
    });

    // Chronological order (oldest first) — Gmail.getMessages() already returns this.
    resp.messages = serialized;
    resp.participants = Object.keys(participantSet).map(function (k) { return participantSet[k]; });
    resp.success = true;
    resp.result_summary = 'Returned ' + serialized.length + ' messages';
  } catch (err) {
    resp.success = false;
    resp.error = String(err && err.message ? err.message : err);
  }

  try { resp.log_id = logOperation(payload, resp); } catch (logErr) {}
  return resp;
}

/** @private */
function extractEmailV2_(addr) {
  if (!addr) return '';
  var m = String(addr).match(/<([^>]+)>/);
  if (m) return m[1].trim();
  return String(addr).trim();
}

/** @private */
function splitAddrsV2_(headerValue) {
  if (!headerValue) return [];
  return String(headerValue).split(',').map(function (s) {
    return extractEmailV2_(s.trim());
  }).filter(function (s) { return !!s; });
}
