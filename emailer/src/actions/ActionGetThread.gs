/**
 * ActionGetThread.gs — handles action "get_thread".
 *
 * Required payload fields: thread_id
 *
 * Returns full thread context: all messages ordered chronologically (oldest first),
 * full plain-text bodies, participant list, attachment filenames.
 * Reporter does NOT run for read-only actions.
 */

var ActionGetThread = (function () {

  function handle(payload) {
    payload = payload || {};

    if (!payload.thread_id) {
      return { success: false, action: 'get_thread', error: 'Missing required field: thread_id.' };
    }

    var result = {
      success: false,
      action: 'get_thread',
      thread_id: payload.thread_id,
      subject: '',
      participants: [],
      message_count: 0,
      messages: [],
      error: null
    };

    try {
      var thread = GmailApp.getThreadById(payload.thread_id);
      if (!thread) throw new Error('Thread not found: ' + payload.thread_id);

      var messages = thread.getMessages();
      // Oldest first — GmailApp returns them chronologically already
      var participants = {};

      var serialized = messages.map(function (m) {
        collectAddresses_(m.getFrom(), participants);
        collectAddresses_(m.getTo(), participants);
        collectAddresses_(m.getCc(), participants);

        var attachments = m.getAttachments();
        var attachmentNames = attachments.map(function (a) { return a.getName(); });

        return {
          message_id: m.getId(),
          from: m.getFrom() || '',
          to: parseAddressList_(m.getTo()),
          cc: parseAddressList_(m.getCc()),
          date: m.getDate() ? m.getDate().toISOString() : '',
          body_plain: (m.getPlainBody() || '').trim(),
          has_attachments: attachments.length > 0,
          attachment_names: attachmentNames
        };
      });

      result.subject = thread.getFirstMessageSubject() || '';
      result.participants = Object.keys(participants);
      result.message_count = messages.length;
      result.messages = serialized;
      result.success = true;
      result.result_summary = 'Retrieved ' + messages.length + ' message(s) from thread';
    } catch (err) {
      result.error = String(err.message || err);
    }

    logEmailerOperation(payload, result);
    return result;
  }

  function collectAddresses_(str, map) {
    if (!str) return;
    str.split(',').forEach(function (s) {
      var trimmed = s.trim();
      if (trimmed) map[trimmed] = true;
    });
  }

  function parseAddressList_(str) {
    if (!str) return [];
    return str.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  return { handle: handle };
})();
