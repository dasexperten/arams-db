/**
 * ActionTrashThreads.gs — handles action "trash_threads".
 *
 * Moves N Gmail threads to Trash (recoverable for 30 days). Used by the
 * orchestrator's "удали <запрос>" flow after the user confirms via inline
 * keyboard. Per-thread error tolerance — bad ids are reported, not raised.
 *
 * Required payload fields:
 *   thread_ids   — array of Gmail thread IDs (strings).
 *
 * Optional:
 *   context      — caller-supplied context string for the operation log.
 *
 * Returns:
 *   trashed      — count of threads successfully moved to Trash.
 *   failed       — array of thread IDs that could not be trashed.
 *   total        — echoes input length.
 *
 * Quotas:
 *   GmailApp daily ops cap (~20k for consumer accounts) applies. Light
 *   throttle (300ms every 20 ops) keeps us well under per-second limits.
 *   For 1000+ threads the user should still prefer a Gmail filter.
 */

var ActionTrashThreads = (function () {

  var THROTTLE_EVERY = 20;
  var THROTTLE_MS    = 300;
  var HARD_CAP       = 200;

  function handle(payload) {
    payload = payload || {};

    var ids = payload.thread_ids;
    if (!Array.isArray(ids)) {
      return {
        success: false, action: 'trash_threads',
        error: 'Missing required field: thread_ids (array of strings).'
      };
    }
    if (ids.length === 0) {
      return {
        success: true, action: 'trash_threads',
        trashed: 0, failed: [], total: 0,
        result_summary: 'No threads to trash.'
      };
    }
    if (ids.length > HARD_CAP) {
      return {
        success: false, action: 'trash_threads',
        error: 'Too many threads in one call: ' + ids.length + ' (cap ' + HARD_CAP + ').'
      };
    }

    var result = {
      success: false,
      action: 'trash_threads',
      trashed: 0,
      failed: [],
      total: ids.length,
      error: null
    };

    try {
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        try {
          var thread = GmailApp.getThreadById(id);
          if (!thread) {
            result.failed.push(id);
            continue;
          }
          thread.moveToTrash();
          result.trashed++;
        } catch (perItem) {
          result.failed.push(id);
        }
        if (i % THROTTLE_EVERY === THROTTLE_EVERY - 1) {
          Utilities.sleep(THROTTLE_MS);
        }
      }
      result.success = true;
      result.result_summary = 'Trashed ' + result.trashed + ' of ' + ids.length +
        ' thread(s)' + (result.failed.length ? ' (' + result.failed.length + ' failed)' : '');
    } catch (err) {
      result.error = String(err.message || err);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  return { handle: handle };
})();
