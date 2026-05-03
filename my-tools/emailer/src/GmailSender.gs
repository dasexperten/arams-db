/**
 * GmailSender.gs — sends new emails, replies, reply-alls, and creates drafts.
 *
 * Threading is preserved by GmailApp.Thread.reply() / .replyAll(): Gmail sets
 * In-Reply-To and References headers automatically from the thread, so replies
 * never become orphan messages.
 *
 * createDraft uses the Gmail Advanced Service (Gmail.Users.Drafts.create) which
 * must be enabled via Resources → Advanced Google Services → Gmail API v1.
 */

/**
 * sendNew — sends a brand-new email.
 *
 * @param {string} recipient
 * @param {string} subject
 * @param {?string} bodyHtml
 * @param {?string} bodyText
 * @param {?string} attachmentLink
 * @param {?string} fromAddress - send-as alias; must be in ALLOWED_SENDER_INBOXES
 * @returns {{message_id: ?string, thread_id: ?string}}
 */
function sendNew(recipient, subject, bodyHtml, bodyText, attachmentLink, fromAddress) {
  if (!recipient) throw new Error('sendNew: recipient is required.');
  if (!subject) throw new Error('sendNew: subject is required.');

  var bodies = finalizeBodies_(bodyHtml, bodyText, attachmentLink);
  var options = { name: 'Das Experten' };
  if (bodies.html) options.htmlBody = bodies.html;
  if (fromAddress) options.from = fromAddress;
  GmailApp.sendEmail(recipient, subject, bodies.plain, options);

  return locateSentMessage_('to:' + recipient + ' subject:"' + escapeQuery_(subject) + '"');
}

/**
 * replyToThread — replies inside an existing Gmail thread.
 *
 * @param {string} threadId
 * @param {?string} bodyHtml
 * @param {?string} bodyText
 * @param {?string} attachmentLink
 * @param {?string} inReplyToMessageId  (informational; thread.reply() handles headers)
 * @param {?string} fromAddress - send-as alias; must be in ALLOWED_SENDER_INBOXES
 * @returns {{message_id: ?string, thread_id: ?string}}
 */
function replyToThread(threadId, bodyHtml, bodyText, attachmentLink, inReplyToMessageId, fromAddress) {
  if (!threadId) throw new Error('replyToThread: threadId is required.');

  var thread = fetchThread_(threadId);
  var bodies = finalizeBodies_(bodyHtml, bodyText, attachmentLink);
  var options = { name: 'Das Experten' };
  if (bodies.html) options.htmlBody = bodies.html;
  if (fromAddress) options.from = fromAddress;
  thread.reply(bodies.plain, options);

  var refreshed = GmailApp.getThreadById(threadId);
  var messages = refreshed.getMessages();
  var last = messages[messages.length - 1];
  return { message_id: last.getId(), thread_id: refreshed.getId() };
}

/**
 * replyAllToThread — reply-all inside an existing Gmail thread, preserving CC list.
 *
 * @param {string} threadId
 * @param {?string} bodyHtml
 * @param {?string} bodyText
 * @param {?string} attachmentLink
 * @param {?string} inReplyToMessageId
 * @param {?string} fromAddress - send-as alias; must be in ALLOWED_SENDER_INBOXES
 * @returns {{message_id: ?string, thread_id: ?string}}
 */
function replyAllToThread(threadId, bodyHtml, bodyText, attachmentLink, inReplyToMessageId, fromAddress) {
  if (!threadId) throw new Error('replyAllToThread: threadId is required.');

  var thread = fetchThread_(threadId);
  var bodies = finalizeBodies_(bodyHtml, bodyText, attachmentLink);
  var options = { name: 'Das Experten' };
  if (bodies.html) options.htmlBody = bodies.html;
  if (fromAddress) options.from = fromAddress;
  thread.replyAll(bodies.plain, options);

  var refreshed = GmailApp.getThreadById(threadId);
  var messages = refreshed.getMessages();
  var last = messages[messages.length - 1];
  return { message_id: last.getId(), thread_id: refreshed.getId() };
}

/**
 * createDraft — creates a Gmail draft instead of sending.
 * Uses Gmail Advanced Service (Gmail.Users.Drafts.create).
 *
 * @param {string} mode - "new" | "reply" | "reply_all"
 * @param {object} params
 *   {string}  recipient     - required for mode "new"
 *   {string}  subject       - required for mode "new"
 *   {?string} bodyHtml
 *   {?string} bodyText
 *   {?string} attachmentLink
 *   {?string} threadId      - required for mode "reply" | "reply_all"
 * @returns {{draft_id: string, draft_link: string, thread_id: ?string}}
 */
function createDraft(mode, params) {
  params = params || {};
  var bodies = finalizeBodies_(params.bodyHtml || null, params.bodyText || null, params.attachmentLink || null);

  var userEmail = Session.getActiveUser().getEmail();
  var fromEmail = params.fromAddress || userEmail;
  var rawMessage;

  if (mode === 'new') {
    if (!params.recipient) throw new Error('createDraft: recipient is required for new draft.');
    if (!params.subject) throw new Error('createDraft: subject is required for new draft.');
    rawMessage = buildMimeMessage_({
      to: params.recipient,
      subject: params.subject,
      from: fromEmail,
      bodyHtml: bodies.html,
      bodyText: bodies.plain
    });
    var draftResource = { message: { raw: rawMessage } };
    var created = Gmail.Users.Drafts.create(draftResource, 'me');
    return {
      draft_id: created.id,
      draft_link: 'https://mail.google.com/mail/u/0/#drafts/' + created.id,
      thread_id: null
    };

  } else if (mode === 'reply' || mode === 'reply_all') {
    if (!params.threadId) throw new Error('createDraft: threadId is required for ' + mode + ' draft.');
    var thread = fetchThread_(params.threadId);
    var messages = thread.getMessages();
    var lastMsg = messages[messages.length - 1];
    var lastMsgId = lastMsg.getId();

    // Build recipient list
    var toAddr, ccAddr;
    if (mode === 'reply') {
      toAddr = extractEmailAddress_(lastMsg.getFrom());
      ccAddr = null;
    } else {
      // reply_all: To = original To, CC = original CC, exclude self
      var allTo = parseAddressList_(lastMsg.getTo());
      var allCc = parseAddressList_(lastMsg.getCc());
      var originalFrom = extractEmailAddress_(lastMsg.getFrom());
      // Remove self and the original sender we are replying to
      var selfEmail = userEmail.toLowerCase();
      allTo = allTo.filter(function (a) { return a.toLowerCase() !== selfEmail; });
      allCc = allCc.filter(function (a) { return a.toLowerCase() !== selfEmail; });
      // Add original from to To if not already there
      if (originalFrom && allTo.indexOf(originalFrom) === -1) {
        allTo.unshift(originalFrom);
      }
      toAddr = allTo.join(', ');
      ccAddr = allCc.join(', ') || null;
    }

    var replySubject = 'Re: ' + (thread.getFirstMessageSubject() || '');
    rawMessage = buildMimeMessage_({
      to: toAddr,
      cc: ccAddr,
      subject: replySubject,
      from: fromEmail,
      bodyHtml: bodies.html,
      bodyText: bodies.plain,
      inReplyTo: lastMsgId,
      references: lastMsgId,
      threadId: params.threadId
    });

    var replyDraftResource = {
      message: {
        raw: rawMessage,
        threadId: params.threadId
      }
    };
    var createdReply = Gmail.Users.Drafts.create(replyDraftResource, 'me');
    return {
      draft_id: createdReply.id,
      draft_link: 'https://mail.google.com/mail/u/0/#drafts/' + createdReply.id,
      thread_id: params.threadId
    };

  } else {
    throw new Error('createDraft: unsupported mode: ' + mode);
  }
}

/**
 * buildMimeMessage_ — encodes a minimal RFC 2822 message as base64url.
 * @private
 */
function buildMimeMessage_(opts) {
  opts = opts || {};
  var lines = [];
  lines.push('From: ' + (opts.from || ''));
  lines.push('To: ' + (opts.to || ''));
  if (opts.cc) lines.push('Cc: ' + opts.cc);
  lines.push('Subject: ' + (opts.subject || ''));
  if (opts.inReplyTo) lines.push('In-Reply-To: <' + opts.inReplyTo + '>');
  if (opts.references) lines.push('References: <' + opts.references + '>');
  lines.push('MIME-Version: 1.0');

  if (opts.bodyHtml) {
    var boundary = 'boundary_' + Utilities.getUuid().replace(/-/g, '');
    lines.push('Content-Type: multipart/alternative; boundary="' + boundary + '"');
    lines.push('');
    lines.push('--' + boundary);
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('');
    lines.push(opts.bodyText || stripHtml_(opts.bodyHtml));
    lines.push('--' + boundary);
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('');
    lines.push(opts.bodyHtml);
    lines.push('--' + boundary + '--');
  } else {
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('');
    lines.push(opts.bodyText || '');
  }

  var raw = lines.join('\r\n');
  var encoded = Utilities.base64EncodeWebSafe(raw);
  return encoded;
}

/**
 * fetchThread_ — gets a GmailThread or throws a clear error.
 * @private
 */
function fetchThread_(threadId) {
  var thread;
  try {
    thread = GmailApp.getThreadById(threadId);
  } catch (err) {
    throw new Error('Cannot access thread ' + threadId + ': ' + String(err.message || err));
  }
  if (!thread) throw new Error('Gmail returned no thread for id ' + threadId);
  return thread;
}

/**
 * finalizeBodies_ — builds final {html, plain} pair, appending attachment link.
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
 * locateSentMessage_ — re-queries Sent to find the freshly-sent message.
 * GmailApp.sendEmail does not return IDs directly.
 * @private
 */
function locateSentMessage_(queryTail) {
  var threads = GmailApp.search('in:sent ' + queryTail, 0, 1);
  if (!threads || !threads.length) return { message_id: null, thread_id: null };
  var thread = threads[0];
  var messages = thread.getMessages();
  var last = messages[messages.length - 1];
  return { message_id: last.getId(), thread_id: thread.getId() };
}

/**
 * extractEmailAddress_ — pulls bare email from "Name <email>" format.
 * @private
 */
function extractEmailAddress_(str) {
  if (!str) return '';
  var m = str.match(/<([^>]+)>/);
  return m ? m[1].trim() : str.trim();
}

/**
 * parseAddressList_ — splits comma-separated address list into array of bare emails.
 * @private
 */
function parseAddressList_(str) {
  if (!str) return [];
  return str.split(',').map(function (s) {
    return extractEmailAddress_(s.trim());
  }).filter(Boolean);
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

/**
 * detectInboxFromThread_ — scans all messages in the thread and returns the
 * first To/CC address that matches ALLOWED_SENDER_INBOXES, or null if none found.
 *
 * Used by reply / reply_all to auto-select the correct outgoing alias so that
 * replies appear to come from the same inbox the customer originally wrote to.
 *
 * @param {string} threadId
 * @returns {?string} matched address from ALLOWED_SENDER_INBOXES, or null
 * @private
 */
function detectInboxFromThread_(threadId) {
  var thread;
  try {
    thread = GmailApp.getThreadById(threadId);
  } catch (err) {
    return null;
  }
  if (!thread) return null;

  var messages = thread.getMessages();
  var lowerAllowed = ALLOWED_SENDER_INBOXES.map(function (a) { return a.toLowerCase(); });

  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    var combined = [];
    var to = m.getTo();
    var cc = m.getCc();
    if (to) combined = combined.concat(to.split(','));
    if (cc) combined = combined.concat(cc.split(','));

    for (var j = 0; j < combined.length; j++) {
      var bare = extractEmailAddress_(combined[j].trim()).toLowerCase();
      var idx = lowerAllowed.indexOf(bare);
      if (idx !== -1) return ALLOWED_SENDER_INBOXES[idx];
    }
  }
  return null;
}
