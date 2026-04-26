/**
 * GmailSender.gs — sends new emails AND replies inside existing Gmail threads.
 *
 * Threading is preserved automatically by GmailApp.Thread.reply(): Gmail sets
 * In-Reply-To and References headers based on the thread, so we never produce
 * an orphan reply when a thread_id is supplied.
 */

/**
 * sendNew — sends a brand-new email and returns the message_id + thread_id.
 *
 * @param {string} recipient    - "to" address
 * @param {string} subject      - subject line
 * @param {string} htmlBody     - HTML body
 * @param {string} plainBody    - plain text fallback
 * @param {?string} attachmentLink - optional URL appended to plain body if provided
 * @returns {{message_id: string, thread_id: string}}
 */
function sendNew(recipient, subject, htmlBody, plainBody, attachmentLink) {
  if (!recipient) throw new Error('sendNew: recipient is required.');
  if (!subject) subject = '(no subject)';

  var fullPlain = appendLinkToPlain_(plainBody, attachmentLink);
  var fullHtml = appendLinkToHtml_(htmlBody, attachmentLink);

  GmailApp.sendEmail(recipient, subject, fullPlain, {
    htmlBody: fullHtml,
    name: 'Das Experten'
  });

  // GmailApp.sendEmail does not return IDs, so we locate the thread we just sent
  // by querying the Sent mailbox for the most recent message to this recipient
  // with the same subject. This is the standard Apps Script pattern.
  var query = 'in:sent to:' + recipient + ' subject:"' + subject.replace(/"/g, '\\"') + '"';
  var threads = GmailApp.search(query, 0, 1);
  if (!threads || !threads.length) {
    return { message_id: null, thread_id: null };
  }
  var thread = threads[0];
  var messages = thread.getMessages();
  var last = messages[messages.length - 1];

  return {
    message_id: last.getId(),
    thread_id: thread.getId()
  };
}

/**
 * replyToThread — replies inside an existing Gmail thread, preserving headers.
 *
 * Uses GmailApp.getThreadById(threadId).reply() so In-Reply-To / References
 * are set automatically — never produces an orphan message.
 *
 * @param {string} threadId
 * @param {string} htmlBody
 * @param {string} plainBody
 * @param {?string} attachmentLink
 * @param {?string} inReplyToMessageId - currently informational; Gmail handles threading via thread
 * @returns {{message_id: string, thread_id: string}}
 */
function replyToThread(threadId, htmlBody, plainBody, attachmentLink, inReplyToMessageId) {
  if (!threadId) throw new Error('replyToThread: threadId is required.');

  var thread;
  try {
    thread = GmailApp.getThreadById(threadId);
  } catch (err) {
    throw new Error('replyToThread: cannot access thread ' + threadId + ': ' + err);
  }
  if (!thread) {
    throw new Error('replyToThread: Gmail returned no thread for id ' + threadId);
  }

  var fullPlain = appendLinkToPlain_(plainBody, attachmentLink);
  var fullHtml = appendLinkToHtml_(htmlBody, attachmentLink);

  // Optional: anchor reply to a specific message in the thread (best-effort).
  // GmailApp doesn't expose explicit In-Reply-To control, but reply() is anchored
  // to the thread; if a specific message was requested, log the intent.
  if (inReplyToMessageId) {
    try {
      var msgs = thread.getMessages();
      for (var i = 0; i < msgs.length; i++) {
        if (msgs[i].getId() === inReplyToMessageId) {
          // Found the target message. Threading headers are still managed by Gmail
          // through thread.reply(), so we proceed normally.
          break;
        }
      }
    } catch (e) {
      // Non-fatal; continue with thread-level reply.
    }
  }

  thread.reply(fullPlain, {
    htmlBody: fullHtml,
    name: 'Das Experten'
  });

  // After reply(), the last message in the thread is ours.
  var refreshed = GmailApp.getThreadById(threadId);
  var messages = refreshed.getMessages();
  var last = messages[messages.length - 1];

  return {
    message_id: last.getId(),
    thread_id: refreshed.getId()
  };
}

/**
 * Appends "Attachment: <link>" to plain body if link is present.
 * @private
 */
function appendLinkToPlain_(plainBody, link) {
  if (!link) return plainBody || '';
  return (plainBody || '') + '\n\nAttachment: ' + link;
}

/**
 * Appends an HTML attachment block to html body if link is present and the body
 * doesn't already contain the link.
 * @private
 */
function appendLinkToHtml_(htmlBody, link) {
  if (!link) return htmlBody || '';
  if (htmlBody && htmlBody.indexOf(link) !== -1) return htmlBody;
  var block = '<p style="margin-top:16px;"><a href="' + link + '">Open attachment</a></p>';
  return (htmlBody || '') + block;
}
