/**
 * ActionFind.gs — handler for action: "find".
 *
 * Searches Gmail using standard search syntax and returns lightweight
 * thread descriptors (no full bodies — call get_thread for that).
 */

/**
 * @param {object} payload - {
 *   action: 'find',
 *   query: string,                 // required, Gmail search syntax
 *   max_results: number            // optional, default 10, hard cap 50
 * }
 * @returns {object} {
 *   success, query, total_found, threads: [...], log_id, error
 * }
 */
function ActionFind_handle(payload) {
  var resp = {
    success: false,
    action: 'find',
    query: payload.query || null,
    total_found: 0,
    threads: [],
    result_summary: null,
    log_id: null,
    error: null
  };

  try {
    if (!payload.query || typeof payload.query !== 'string') {
      throw new Error("Missing required field: query (Gmail search syntax string)");
    }

    var max = Number(payload.max_results || 10);
    if (!isFinite(max) || max < 1) max = 10;
    if (max > 50) max = 50;

    var threads = GmailApp.search(payload.query, 0, max);
    resp.total_found = threads.length;
    resp.threads = threads.map(threadToDescriptor_);
    resp.success = true;
    resp.result_summary = 'Found ' + resp.total_found + ' threads';
  } catch (err) {
    resp.success = false;
    resp.error = String(err && err.message ? err.message : err);
  }

  try { resp.log_id = logOperation(payload, resp); } catch (logErr) {}
  return resp;
}

/**
 * threadToDescriptor_ — builds the per-thread summary for the find response.
 * @private
 */
function threadToDescriptor_(thread) {
  var messages = thread.getMessages();
  var last = messages[messages.length - 1];

  var participants = {};
  messages.forEach(function (m) {
    var from = extractEmailLocal_(m.getFrom());
    if (from) participants[from.toLowerCase()] = from;
    splitAddrs_(m.getTo()).forEach(function (a) {
      if (a) participants[a.toLowerCase()] = a;
    });
    splitAddrs_(m.getCc()).forEach(function (a) {
      if (a) participants[a.toLowerCase()] = a;
    });
  });

  var hasAttachments = false;
  for (var i = 0; i < messages.length; i++) {
    var atts = messages[i].getAttachments({ includeInlineImages: false, includeAttachments: true });
    if (atts && atts.length) { hasAttachments = true; break; }
  }

  return {
    thread_id: thread.getId(),
    subject: thread.getFirstMessageSubject() || '',
    last_message_from: last.getFrom() || '',
    last_message_snippet: (last.getPlainBody() || '').slice(0, 150),
    message_count: messages.length,
    has_attachments: hasAttachments,
    last_message_date: last.getDate() ? last.getDate().toISOString() : null,
    participants: Object.keys(participants).map(function (k) { return participants[k]; })
  };
}

/** @private */
function extractEmailLocal_(addr) {
  if (!addr) return '';
  var m = String(addr).match(/<([^>]+)>/);
  if (m) return m[1].trim();
  return String(addr).trim();
}

/** @private */
function splitAddrs_(headerValue) {
  if (!headerValue) return [];
  return String(headerValue).split(',').map(function (s) {
    return extractEmailLocal_(s.trim());
  }).filter(function (s) { return !!s; });
}
