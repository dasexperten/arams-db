/**
 * ActionModify.gs — handles action "modify". Changes Gmail thread STATE
 * (archive, mark read / unread) without sending or drafting any mail.
 * Real Gmail mutation via GmailApp thread operations.
 *
 * Required payload field: thread_id
 * Optional booleans (at least one required):
 *   archive      — thread.moveToArchive()  (removes from Inbox)
 *   mark_read    — thread.markRead()
 *   mark_unread  — thread.markUnread()
 *
 * Returns:
 *   applied         — array of operations performed, in order
 *   thread_id       — echoes the target thread
 *   result_summary  — one-line human summary
 */

var ActionModify = (function () {

  function handle(payload) {
    payload = payload || {};

    var result = {
      success: false,
      action: 'modify',
      thread_id: payload.thread_id || null,
      applied: [],
      result_summary: null,
      error: null
    };

    try {
      if (!payload.thread_id || typeof payload.thread_id !== 'string') {
        return { success: false, action: 'modify', error: 'Missing required field: thread_id.' };
      }
      if (!payload.archive && !payload.mark_read && !payload.mark_unread) {
        return { success: false, action: 'modify', error: 'No operation requested. Set at least one of: archive, mark_read, mark_unread.' };
      }

      var thread = GmailApp.getThreadById(payload.thread_id);
      if (!thread) {
        throw new Error('Thread not found: ' + payload.thread_id);
      }

      // read-state first, then archive — order keeps Gmail behaviour predictable
      if (payload.mark_read)   { thread.markRead();      result.applied.push('mark_read'); }
      if (payload.mark_unread) { thread.markUnread();    result.applied.push('mark_unread'); }
      if (payload.archive)     { thread.moveToArchive(); result.applied.push('archive'); }

      result.success = true;
      result.result_summary = 'Thread ' + payload.thread_id + ' → ' + result.applied.join(', ');
    } catch (err) {
      result.error = String(err && err.message ? err.message : err);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  return { handle: handle };
})();
