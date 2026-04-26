/**
 * EmailComposer.gs — generates email subject + HTML/plain bodies.
 *
 * In reply mode, subject is inherited from the thread (Gmail enforces "Re:" anyway),
 * and the body opens with an acknowledgement of the previous message.
 * In new-email mode, subject is derived from brief.task or brief.subject.
 */

/**
 * composeEmail — assembles subject and body strings.
 *
 * @param {{task: string, brief: string, context: string, subject: ?string}} brief
 * @param {?{content: string, metadata: object}} skillResult
 * @param {?string} attachmentLink
 * @param {?{subject: string, last_message_from: string, last_message_snippet: string,
 *           message_count: number, participants: string[]}} threadContext
 * @returns {{subject: string, body_html: string, body_plain: string}}
 */
function composeEmail(brief, skillResult, attachmentLink, threadContext) {
  var isReply = !!threadContext;

  var subject;
  if (isReply) {
    subject = threadContext.subject || ('Re: ' + (brief.task || ''));
  } else if (brief.subject) {
    subject = brief.subject;
  } else {
    subject = deriveSubjectFromBrief_(brief.task, brief.brief);
  }

  var bodyText = skillResult && skillResult.content
    ? skillResult.content
    : brief.brief;

  var openingPlain;
  var openingHtml;
  if (isReply) {
    var lastFrom = threadContext.last_message_from || 'previous sender';
    var snippet = (threadContext.last_message_snippet || '').slice(0, 240);
    openingPlain = 'Thanks for your message, ' + lastFrom + '.\n\n'
      + (snippet ? 'Re: "' + snippet + '"\n\n' : '');
    openingHtml = '<p>Thanks for your message, ' + escapeHtml_(lastFrom) + '.</p>'
      + (snippet ? '<blockquote style="border-left:3px solid #ddd;margin:0 0 12px;padding:4px 12px;color:#555;">'
        + escapeHtml_(snippet) + '</blockquote>' : '');
  } else {
    openingPlain = '';
    openingHtml = '';
  }

  var attachmentBlockPlain = attachmentLink
    ? '\n\nAttachment: ' + attachmentLink
    : '';
  var attachmentBlockHtml = attachmentLink
    ? '<p style="margin-top:16px;">' +
      '<a href="' + escapeHtmlAttr_(attachmentLink) + '" ' +
      'style="display:inline-block;padding:8px 14px;background:#0b5fff;color:#fff;text-decoration:none;border-radius:4px;">' +
      'Open attachment' +
      '</a></p>'
    : '';

  var contextBlockPlain = brief.context ? '\n\nContext: ' + brief.context : '';
  var contextBlockHtml = brief.context
    ? '<p style="color:#666;font-size:13px;"><em>Context:</em> ' + escapeHtml_(brief.context) + '</p>'
    : '';

  var plain = ''
    + openingPlain
    + bodyText
    + contextBlockPlain
    + attachmentBlockPlain
    + '\n\n— Sent by Emailer (Das Experten)';

  var html = ''
    + '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f7;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;">'
    +   '<tr><td align="center" style="padding:24px 12px;">'
    +     '<table role="presentation" width="600" cellpadding="0" cellspacing="0" '
    +       'style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;'
    +       'font-family:Helvetica,Arial,sans-serif;color:#222;">'
    +       '<tr><td style="padding:18px 24px;background:#0b5fff;color:#fff;font-size:16px;font-weight:600;">'
    +         escapeHtml_(brief.task || subject)
    +       '</td></tr>'
    +       '<tr><td style="padding:24px;font-size:15px;line-height:1.55;">'
    +         openingHtml
    +         '<div>' + paragraphizeHtml_(bodyText) + '</div>'
    +         contextBlockHtml
    +         attachmentBlockHtml
    +       '</td></tr>'
    +       '<tr><td style="padding:14px 24px;background:#fafafa;color:#888;font-size:12px;'
    +         'border-top:1px solid #eee;">Sent by Emailer · Das Experten</td></tr>'
    +     '</table>'
    +   '</td></tr>'
    + '</table>'
    + '</body></html>';

  return { subject: subject, body_html: html, body_plain: plain };
}

/**
 * Derives a short subject line from a task name and brief.
 * @private
 */
function deriveSubjectFromBrief_(task, brief) {
  if (task && task.length <= 80) return task;
  if (task) return task.slice(0, 77) + '...';
  if (!brief) return 'Update from Das Experten';
  var firstLine = brief.split('\n')[0].trim();
  return firstLine.length <= 80 ? firstLine : firstLine.slice(0, 77) + '...';
}

/**
 * Wraps plain-text paragraphs in <p> tags.
 * @private
 */
function paragraphizeHtml_(text) {
  if (!text) return '';
  var parts = String(text).split(/\n{2,}/);
  return parts.map(function (p) {
    return '<p style="margin:0 0 12px;">' + escapeHtml_(p).replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

/**
 * Minimal HTML text escape.
 * @private
 */
function escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * HTML attribute escape (slightly stricter than text escape).
 * @private
 */
function escapeHtmlAttr_(s) {
  return escapeHtml_(s);
}
