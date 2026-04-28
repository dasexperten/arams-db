/**
 * ActionFind.gs — handles action "find" (Gmail search).
 *
 * Required payload fields: query (Gmail search syntax string)
 * Optional:
 *   max_results  (default 10, hard cap 50)
 *   filter_junk  (boolean, default false) — when true, strips obvious junk threads
 *                before returning: noreply/automated senders, invoices, receipts,
 *                password resets, delivery notifications, etc.
 *                filtered_count in the response tells how many were removed.
 *
 * Returns threads ordered by Gmail relevance/recency (preserved from GmailApp.search).
 * Reporter does NOT run for read-only actions.
 */

var ActionFind = (function () {

  var DEFAULT_MAX = 10;
  var HARD_CAP    = 50;

  // ── Junk filter patterns ──────────────────────────────────────────────────

  var JUNK_SENDER_RE = /noreply|no-reply|donotreply|do-not-reply|billing@|support@|postmaster@|mailer-daemon|notifications?@|newsletter@|unsubscribe|автоответ|автоуведомление/i;

  var JUNK_SUBJECT_RE = /\binvoice\b|\breceipt\b|\bpassword\b|\bverif|\bconfirm your\b|\border #|\btracking\b|\bshipment\b|\bdelivery\b|\bsupport ticket\b|счёт\b|квитанци|подтвердите|сбросить пароль|ваш заказ|отслеживани/i;

  function isJunk_(thread) {
    var from    = thread.last_message_from || '';
    var subject = thread.subject           || '';
    return JUNK_SENDER_RE.test(from) || JUNK_SUBJECT_RE.test(subject);
  }

  // ── Handler ───────────────────────────────────────────────────────────────

  function handle(payload) {
    payload = payload || {};

    if (!payload.query || typeof payload.query !== 'string') {
      return { success: false, action: 'find', error: 'Missing required field: query (Gmail search string).' };
    }

    var maxResults = parseInt(payload.max_results, 10) || DEFAULT_MAX;
    if (maxResults < 1)        maxResults = 1;
    if (maxResults > HARD_CAP) maxResults = HARD_CAP;

    var filterJunk = payload.filter_junk === true || payload.filter_junk === 'true';

    var result = {
      success:         false,
      action:          'find',
      query:           payload.query,
      total_found:     0,
      filtered_count:  0,
      threads:         [],
      error:           null
    };

    try {
      var threads = GmailApp.search(payload.query, 0, maxResults);
      var summaries = threads.map(function (thread) {
        return summarizeThread_(thread);
      });

      if (filterJunk) {
        var clean = summaries.filter(function (t) { return !isJunk_(t); });
        result.filtered_count = summaries.length - clean.length;
        summaries = clean;
      }

      result.total_found    = summaries.length;
      result.threads        = summaries;
      result.success        = true;
      result.result_summary = 'Found ' + summaries.length + ' thread(s)' +
                              (filterJunk ? ' (' + result.filtered_count + ' junk removed)' : '');
    } catch (err) {
      result.error = String(err.message || err);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function summarizeThread_(thread) {
    var messages = thread.getMessages();
    var last     = messages[messages.length - 1];

    var participants = {};
    messages.forEach(function (m) {
      collectAddresses_(m.getFrom(), participants);
      collectAddresses_(m.getTo(),   participants);
    });

    var hasAttachments = messages.some(function (m) {
      return m.getAttachments().length > 0;
    });

    return {
      thread_id:            thread.getId(),
      subject:              thread.getFirstMessageSubject() || '',
      last_message_from:    last.getFrom() || '',
      last_message_snippet: last.getPlainBody()
        ? (last.getPlainBody() || '').slice(0, 150)
        : '',
      message_count:        messages.length,
      has_attachments:      hasAttachments,
      last_message_date:    last.getDate() ? last.getDate().toISOString() : '',
      participants:         Object.keys(participants)
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
