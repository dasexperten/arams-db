/**
 * ActionFind.gs — handles action "find" (Gmail search), paginated.
 *
 * Required payload fields: query (Gmail search syntax string)
 * Optional:
 *   max_results         default 25, hard cap 100
 *   start               offset into the result set (for "Next" pagination), default 0
 *   upload_attachments  default FALSE. When false (the inbox list case) we DO NOT
 *                       copy attachments to R2 — that re-upload on every list call
 *                       is what made large batches time out. Attachments are
 *                       fetched lazily on open via get_thread / download_attachment.
 *
 * Returns threads ordered by Gmail relevance/recency, plus pagination info
 * (start, has_more) so the caller can render a Next button.
 */

var ActionFind = (function () {

  var DEFAULT_MAX = 25;
  var HARD_CAP = 100;

  function handle(payload) {
    payload = payload || {};

    if (!payload.query || typeof payload.query !== 'string') {
      return { success: false, action: 'find', error: 'Missing required field: query (Gmail search string).' };
    }

    var maxResults = parseInt(payload.max_results, 10) || DEFAULT_MAX;
    if (maxResults < 1) maxResults = 1;
    if (maxResults > HARD_CAP) maxResults = HARD_CAP;

    var start = parseInt(payload.start, 10) || 0;
    if (start < 0) start = 0;

    var uploadAttachments = payload.upload_attachments === true;

    var result = {
      success: false,
      action: 'find',
      query: payload.query,
      start: start,
      total_found: 0,
      has_more: false,
      threads: [],
      error: null
    };

    try {
      var threads = GmailApp.search(payload.query, start, maxResults);
      result.total_found = threads.length;
      result.has_more = threads.length === maxResults;   // a full page → probably more
      result.threads = threads.map(function (thread) {
        return summarizeThread_(thread, uploadAttachments);
      });
      result.success = true;
      result.result_summary = 'Found ' + threads.length + ' thread(s) from offset ' + start;
    } catch (err) {
      result.error = String(err.message || err);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  function summarizeThread_(thread, uploadAttachments) {
    var messages = thread.getMessages();
    var last = messages[messages.length - 1];

    var participants = {};
    messages.forEach(function (m) {
      collectAddresses_(m.getFrom(), participants);
      collectAddresses_(m.getTo(), participants);
    });

    var hasAttachments = false;
    var attachmentsResolved = [];

    messages.forEach(function (m) {
      var atts = m.getAttachments();
      if (atts.length > 0) hasAttachments = true;

      // LAZY: by default we only flag that attachments exist. We copy them to R2
      // only when explicitly asked (upload_attachments:true), e.g. on open — never
      // for the inbox list, which is what used to make this action time out.
      if (!uploadAttachments) return;

      var msgDateIso = m.getDate() ? m.getDate().toISOString() : '';
      var msgFrom = m.getFrom() || '';
      atts.forEach(function (att) {
        try {
          var resolved = uploadInboxAttachmentToR2(att, att.getName(), msgDateIso, msgFrom);
          attachmentsResolved.push(resolved);
        } catch (err) {
          attachmentsResolved.push({
            filename: att.getName(),
            size_bytes: null,
            mime_type: att.getContentType() || null,
            r2_url: null,
            sha256: null,
            skipped_reason: 'upload_failed: ' + String(err.message || err)
          });
        }
      });
    });

    return {
      thread_id: thread.getId(),
      subject: thread.getFirstMessageSubject() || '',
      last_message_from: last.getFrom() || '',
      last_message_snippet: last.getBody()
        ? (last.getPlainBody() || '').slice(0, 150)
        : '',
      message_count: messages.length,
      has_attachments: hasAttachments,
      last_message_date: last.getDate() ? last.getDate().toISOString() : '',
      participants: Object.keys(participants),
      attachments_resolved: attachmentsResolved
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
