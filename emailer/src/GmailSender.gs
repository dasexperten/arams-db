/**
 * GmailSender.gs — sends new emails, replies, reply-alls, and creates drafts.
 *
 * Threading is preserved automatically by GmailApp.Thread.reply() / replyAll():
 * Gmail sets In-Reply-To and References headers based on the thread, so we
 * never produce orphan messages.
 *
 * createDraft uses the Gmail Advanced Service (Gmail.Users.Drafts.create)
 * because GmailApp does not expose draft creation directly.
 */

/**
 * sendNew — sends a brand-new email and returns the message_id + thread_id.
 *
 * @param {string} recipient
 * @param {string} subject
 * @param {?string} bodyHtml
 * @param {?string} bodyPlain
 * @param {?string} attachmentLink
 * @returns {{message_id: ?string, thread_id: ?string}}
 */
function sendNew(recipient, subject, bodyHtml, bodyPlain, attachmentLink) {
  if (!recipient) throw new Error('sendNew: recipient is required.');
  if (!subject) throw new Error('sendNew: subject is required.');

  var bodies = finalizeBodies_(bodyHtml, bodyPlain, attachmentLink);
  var options = { name: 'Das Experten' };
  if (bodies.html) options.htmlBody = bodies.html;
  GmailApp.sendEmail(recipient, subject, bodies.plain, options);

  return locateSentMessage_('to:' + recipient + ' subject:"' + escapeQuery_(subject) + '"');
}

/**
 * replyToThread — replies inside an existing Gmail thread (sender only, no CC).
 *
 * @param {string} threadId
 * @param {?string} bodyHtml
 * @param {?string} bodyPlain
 * @param {?string} attachmentLink
 * @param {?string} inReplyToMessageId  (informational; thread.reply() handles headers)
 * @returns {{message_id: ?string, thread_id: ?string}}
 */
function replyToThread(threadId, bodyHtml, bodyPlain, attachmentLink, inReplyToMessageId) {
  if (!threadId) throw new Error('replyToThread: threadId is required.');
  var thread = GmailApp.getThreadById(threadId);
  if (!thread) throw new Error('replyToThread: thread not found: ' + threadId);

  var bodies = finalizeBodies_(bodyHtml, bodyPlain, attachmentLink);
  var options = { name: 'Das Experten' };
  if (bodies.html) options.htmlBody = bodies.html;
  thread.reply(bodies.plain, options);

  var refreshed = GmailApp.getThreadById(threadId);
  var messages = refreshed.getMessages();
  var last = messages[messages.length - 1];
  return { message_id: last.getId(), thread_id: refreshed.getId() };
}

/**
 * replyAllToThread — reply-all in an existing Gmail thread (preserves CC list).
 *
 * @param {string} threadId
 * @param {?string} bodyHtml
 * @param {?string} bodyPlain
 * @param {?string} attachmentLink
 * @param {?string} inReplyToMessageId
 * @returns {{message_id: ?string, thread_id: ?string}}
 */
function replyAllToThread(threadId, bodyHtml, bodyPlain, attachmentLink, inReplyToMessageId) {
  if (!threadId) throw new Error('replyAllToThread: threadId is required.');
  var thread = GmailApp.getThreadById(threadId);
  if (!thread) throw new Error('replyAllToThread: thread not found: ' + threadId);

  var bodies = finalizeBodies_(bodyHtml, bodyPlain, attachmentLink);
  var options = { name: 'Das Experten' };
  if (bodies.html) options.htmlBody = bodies.html;
  thread.replyAll(bodies.plain, options);

  var refreshed = GmailApp.getThreadById(threadId);
  var messages = refreshed.getMessages();
  var last = messages[messages.length - 1];
  return { message_id: last.getId(), thread_id: refreshed.getId() };
}

/**
 * createDraft — creates a Gmail draft instead of sending. Used when draft_only:true.
 *
 * @param {string} mode - "new" | "reply" | "reply_all"
 * @param {object} params
 *   For "new":
 *     { recipient, subject, body_html, body_plain, attachment_link }
 *   For "reply" / "reply_all":
 *     { thread_id, subject, body_html, body_plain, attachment_link, to_recipients[], cc_recipients[] }
 * @returns {{draft_id: string, draft_link: string, thread_id: ?string}}
 */
function createDraft(mode, params) {
  if (!params) throw new Error('createDraft: params required.');
  params = params || {};

  if (mode === 'new') {
    if (!params.recipient) throw new Error('createDraft(new): recipient required.');
    if (!params.subject) throw new Error('createDraft(new): subject required.');
  } else if (mode === 'reply' || mode === 'reply_all') {
    if (!params.thread_id) throw new Error('createDraft(' + mode + '): thread_id required.');
  } else {
    throw new Error('createDraft: unknown mode: ' + mode);
  }

  var bodies = finalizeBodies_(params.body_html || null, params.body_plain || null, params.attachment_link || null);
  var raw = buildRawMessage_(mode, {
    recipient: params.recipient,
    to_recipients: params.to_recipients || [],
    cc_recipients: params.cc_recipients || [],
    subject: params.subject || '',
    body_html: bodies.html,
    body_plain: bodies.plain
  });
  var rawBase64 = Utilities.base64EncodeWebSafe(raw);

  var draftReq = { message: { raw: rawBase64 } };
  if (mode === 'reply' || mode === 'reply_all') {
    draftReq.message.threadId = params.thread_id;
  }

  var draft = Gmail.Users.Drafts.create(draftReq, 'me');
  var draftId = draft.id;
  var threadId = (draft.message && draft.message.threadId) ? draft.message.threadId : (params.thread_id || null);

  return {
    draft_id: draftId,
    draft_link: 'https://mail.google.com/mail/u/0/#drafts/' + draftId,
    thread_id: threadId
  };
}

/**
 * finalizeBodies_ — builds final {html, plain} pair from caller input.
 * Appends attachment link if not already present.
 * @private
 */
function finalizeBodies_(bodyHtml, bodyPlain, attachmentLink) {
  var html = bodyHtml || null;
  var plain = bodyPlain || (html ? stripHtml_(html) : '');

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
 * buildRawMessage_ — builds an RFC 2822 message body for the Gmail Advanced API.
 * @private
 */
function buildRawMessage_(mode, p) {
  var lines = [];

  if (mode === 'new') {
    lines.push('To: ' + p.recipient);
  } else {
    if (p.to_recipients && p.to_recipients.length) {
      lines.push('To: ' + p.to_recipients.join(', '));
    }
    if (p.cc_recipients && p.cc_recipients.length) {
      lines.push('Cc: ' + p.cc_recipients.join(', '));
    }
  }
  lines.push('Subject: ' + encodeSubjectIfNeeded_(p.subject || ''));
  lines.push('MIME-Version: 1.0');

  var hasHtml = !!p.body_html;
  var hasPlain = !!p.body_plain;

  if (hasHtml && hasPlain) {
    var boundary = '----=_Part_' + Utilities.getUuid();
    lines.push('Content-Type: multipart/alternative; boundary="' + boundary + '"');
    lines.push('');
    lines.push('--' + boundary);
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Utilities.base64Encode(p.body_plain, Utilities.Charset.UTF_8));
    lines.push('--' + boundary);
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Utilities.base64Encode(p.body_html, Utilities.Charset.UTF_8));
    lines.push('--' + boundary + '--');
  } else if (hasHtml) {
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Utilities.base64Encode(p.body_html, Utilities.Charset.UTF_8));
  } else {
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Utilities.base64Encode(p.body_plain || '', Utilities.Charset.UTF_8));
  }

  return lines.join('\r\n');
}

/**
 * encodeSubjectIfNeeded_ — wraps non-ASCII subjects in MIME encoded-word format.
 * @private
 */
function encodeSubjectIfNeeded_(subject) {
  if (!subject) return '';
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  var b64 = Utilities.base64Encode(subject, Utilities.Charset.UTF_8);
  return '=?UTF-8?B?' + b64 + '?=';
}

/**
 * locateSentMessage_ — looks up the most recently sent message matching a query.
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
  return { message_id: last.getId(), thread_id: thread.getId() };
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
