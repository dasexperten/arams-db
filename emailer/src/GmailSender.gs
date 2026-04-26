/**
 * GmailSender.gs — sends new emails AND replies inside existing Gmail threads.
 *
 * The caller provides the body fully formed (HTML and/or plain text). The only
 * transformation applied here is appending the attachment link to the body if
 * it was provided and isn't already inline.
 *
 * Threading is preserved automatically by GmailApp.Thread.reply(): Gmail sets
 * In-Reply-To and References headers based on the thread, so we never produce
 * an orphan reply when a thread_id is supplied.
 */

/**
 * sendNew — sends a brand-new email and returns the message_id + thread_id.
 *
 * @param {string} recipient
 * @param {string} subject
 * @param {?string} bodyHtml
 * @param {?string} bodyText
 * @param {?string} attachmentLink
 * @returns {{message_id: ?string, thread_id: ?string}}
 */
function sendNew(recipient, subject, bodyHtml, bodyText, attachmentLink) {
  if (!recipient) throw new Error('sendNew: recipient is required.');
  if (!subject) throw new Error('sendNew: subject is required.');

  var bodies = finalizeBodies_(bodyHtml, bodyText, attachmentLink);

  var options = { name: 'Das Experten' };
  if (bodies.html) options.htmlBody = bodies.html;
  GmailApp.sendEmail(recipient, subject, bodies.plain, options);

  return locateSentMessage_('to:' + recipient + ' subject:"' + escapeQuery_(subject) + '"');
}

/**
 * replyToThread — replies inside an existing Gmail thread, preserving headers.
 *
 * @param {string} threadId
 * @param {?string} bodyHtml
 * @param {?string} bodyText
 * @param {?string} attachmentLink
 * @param {?string} inReplyToMessageId  (informational; thread.reply() handles headers)
 * @returns {{message_id: ?string, thread_id: ?string}}
 */
function replyToThread(threadId, bodyHtml, bodyText, attachmentLink, inReplyToMessageId) {
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

  var bodies = finalizeBodies_(bodyHtml, bodyText, attachmentLink);

  var options = { name: 'Das Experten' };
  if (bodies.html) options.htmlBody = bodies.html;
  thread.reply(bodies.plain, options);

  var refreshed = GmailApp.getThreadById(threadId);
  var messages = refreshed.getMessages();
  var last = messages[messages.length - 1];
  return {
    message_id: last.getId(),
    thread_id: refreshed.getId()
  };
}

/**
 * finalizeBodies_ — builds final {html, plain} pair from caller input.
 * Appends attachment link if not already present.
 * @private
 */
function finalizeBodies_(bodyHtml, bodyText, attachmentLink) {
  var html = bodyHtml || null;
  var plain = bodyText || (html ? stripHtml_(html) : '');

  if (attachmentLink) {
    if (html && html.indexOf(attachmentLink) === -1) {
      html += '<p style="margin-top:16px;"><a href="' + attachmentLink + '">Open attachment</a></p>';
    }
    if (plain.indexOf(attachmentLink) === -1) {
      plain += '\n\nAttachment: ' + attachmentLink;
    }
  }

  return { html: html, plain: plain };
}

/**
 * locateSentMessage_ — looks up the most recently sent message matching a query.
 * GmailApp.sendEmail does not return IDs, so we re-query the Sent folder.
 * @private
 */
function locateSentMessage_(queryTail) {
  var threads = GmailApp.search('in:sent ' + queryTail, 0, 1);
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

/** @private */
function escapeQuery_(s) {
  return String(s == null ? '' : s).replace(/"/g, '\\"');
}

/** @private */
function stripHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
