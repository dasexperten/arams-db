/**
 * ThreadResolver.gs — resolves Gmail thread context so EmailComposer can match tone
 * and Main can validate access before attempting a reply.
 */

/**
 * getThreadContext — returns a compact descriptor of a Gmail thread.
 *
 * @param {string} threadId
 * @returns {{
 *   subject: string,
 *   last_message_from: string,
 *   last_message_snippet: string,
 *   message_count: number,
 *   participants: string[]
 * }}
 */
function getThreadContext(threadId) {
  if (!threadId) throw new Error('getThreadContext: threadId is required.');
  var thread = GmailApp.getThreadById(threadId);
  if (!thread) throw new Error('getThreadContext: thread not found: ' + threadId);

  var messages = thread.getMessages();
  var last = messages[messages.length - 1];

  var participants = {};
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    var from = m.getFrom();
    if (from) participants[from] = true;
    var to = m.getTo();
    if (to) {
      to.split(',').forEach(function (addr) {
        var trimmed = addr.trim();
        if (trimmed) participants[trimmed] = true;
      });
    }
  }

  return {
    subject: thread.getFirstMessageSubject() || '',
    last_message_from: last.getFrom() || '',
    last_message_snippet: (last.getPlainBody() || '').slice(0, 500),
    message_count: messages.length,
    participants: Object.keys(participants)
  };
}

/**
 * validateThreadAccess — returns true if Gmail can fetch the thread for this user.
 *
 * @param {string} threadId
 * @returns {boolean}
 */
function validateThreadAccess(threadId) {
  if (!threadId) return false;
  try {
    var thread = GmailApp.getThreadById(threadId);
    return !!(thread && thread.getMessages().length > 0);
  } catch (err) {
    return false;
  }
}
