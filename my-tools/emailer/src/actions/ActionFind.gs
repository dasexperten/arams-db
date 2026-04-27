/**
 * ActionFind.gs — handles action "find" (Gmail search).
 *
 * Required payload fields: query (Gmail search syntax string)
 * Optional:  max_results (default 10, hard cap 50)
 *
 * Returns threads ordered by Gmail relevance/recency (preserved from GmailApp.search).
 * Reporter does NOT run for read-only actions.
 */

var ActionFind = (function () {

  var DEFAULT_MAX = 10;
  var HARD_CAP = 50;

  function handle(payload) {
    payload = payload || {};

    if (!payload.query || typeof payload.query !== 'string') {
      return { success: false, action: 'find', error: 'Missing required field: query (Gmail search string).' };
    }

    var maxResults = parseInt(payload.max_results, 10) || DEFAULT_MAX;
    if (maxResults < 1) maxResults = 1;
    if (maxResults > HARD_CAP) maxResults = HARD_CAP;

    var result = {
      success: false,
      action: 'find',
      query: payload.query,
      total_found: 0,
      threads: [],
      error: null
    };

    try {
      var threads = GmailApp.search(payload.query, 0, maxResults);
      result.total_found = threads.length;
      result.threads = threads.map(function (thread) {
        return summarizeThread_(thread);
      });
      result.success = true;
      result.result_summary = 'Found ' + threads.length + ' thread(s)';
    } catch (err) {
      result.error = String(err.message || err);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  function summarizeThread_(thread) {
    var messages = thread.getMessages();
    var last = messages[messages.length - 1];

    var participants = {};
    messages.forEach(function (m) {
      collectAddresses_(m.getFrom(), participants);
      collectAddresses_(m.getTo(), participants);
    });

    var hasAttachments = messages.some(function (m) {
      return m.getAttachments().length > 0;
    });

    return {
      thread_id: thread.getId(),
      subject: thread.getFirstMessageSubject() || '',
      last_message_from: last.getFrom() || '',
      last_message_snippet: thread.getMessages()[messages.length - 1].getBody()
        ? (last.getPlainBody() || '').slice(0, 150)
        : '',
      message_count: messages.length,
      has_attachments: hasAttachments,
      last_message_date: last.getDate() ? last.getDate().toISOString() : '',
      participants: Object.keys(participants)
    };
  }

  function collectAddresses_(str, map) {
    if (!str) return;
    str.split(',').forEach(function (s) {
      var trimmed = s.trim();
      if (trimmed) map[trimmed] = true;
    });
  }

  return { handle: handle };
})();
