/**
 * ActionGetThread.gs — handles action "get_thread".
 *
 * Required payload fields: thread_id
 *
 * Returns full thread context: all messages ordered chronologically (oldest first),
 * full plain-text bodies, participant list, attachment filenames.
 * Reporter does NOT run for read-only actions.
 *
 * Attachments: every attachment in every message is automatically uploaded to R2
 * via uploadInboxAttachmentToR2.  Each message object in the response includes an
 * "attachments_resolved" array alongside the existing "attachment_names" field.
 * Files >25 MB are skipped with skipped_reason: "too_large".  Upload errors are
 * captured per-file; they never prevent the action from returning successfully.
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
        var msgDateIso = m.getDate() ? m.getDate().toISOString() : '';

        var attachmentsResolved = attachments.map(function (att) {
          try {
            return uploadInboxAttachmentToR2(att, att.getName(), msgDateIso);
          } catch (err) {
            return {
              filename: att.getName(),
              size_bytes: null,
              mime_type: att.getContentType() || null,
              r2_url: null,
              sha256: null,
              skipped_reason: 'upload_failed: ' + String(err.message || err)
            };
          }
        });

        return {
          message_id: m.getId(),
          from: m.getFrom() || '',
          to: parseAddressList_(m.getTo()),
          cc: parseAddressList_(m.getCc()),
          date: m.getDate() ? m.getDate().toISOString() : '',
          body_plain: (m.getPlainBody() || '').trim(),
          has_attachments: attachments.length > 0,
          attachment_names: attachmentNames,
          attachments_resolved: attachmentsResolved
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
