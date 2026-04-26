/**
 * Main.gs — entry point for the Emailer Apps Script web app.
 *
 * Variant C: emailer is a thin sender. The CALLER prepares everything
 * (subject, body, optional attachment link, recipient or thread_id) and POSTs
 * a JSON payload. The emailer sends via Gmail, then ALWAYS archives the send
 * as a Google Doc in Drive and writes a row to the log Sheet.
 *
 * Payload schema:
 *   {
 *     "task":                 string,           // human-readable label (required)
 *     "recipient":            string (email),   // required if no thread_id
 *     "subject":              string,           // required for new email; ignored on reply
 *     "body_html":            string,           // optional; preferred if both present
 *     "body_text":            string,           // optional; plain-text fallback
 *     "attachment_link":      string,           // optional; URL appended to body if not already present
 *     "thread_id":            string,           // optional; triggers reply mode
 *     "in_reply_to_message_id": string,         // optional
 *     "context":              string            // optional; recorded in archive Doc
 *   }
 *   At least one of body_html / body_text must be present.
 *
 * Response JSON:
 *   { success, mode, message_id, thread_id, archive_doc_link, log_id, error }
 */

/**
 * doPost — HTTP entry point for the Emailer web app.
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  var payload = {};
  var result = {
    success: false,
    mode: null,
    message_id: null,
    thread_id: null,
    archive_doc_link: null,
    log_id: null,
    error: null
  };

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Empty request body. Expected JSON payload.');
    }
    payload = JSON.parse(e.postData.contents);
    result = handleEmailRequest(payload);
  } catch (err) {
    result.success = false;
    result.error = String(err && err.message ? err.message : err);
    try {
      result.log_id = logOperation(payload, result);
    } catch (logErr) {
      // Logging failure should not mask the original error.
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * handleEmailRequest — core routing function.
 *
 * @param {object} payload
 * @returns {object} result envelope
 */
function handleEmailRequest(payload) {
  var result = {
    success: false,
    mode: null,
    message_id: null,
    thread_id: null,
    archive_doc_link: null,
    log_id: null,
    error: null
  };

  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be a JSON object.');
  }
  if (!payload.task) {
    throw new Error('Missing required field: task.');
  }
  if (!payload.body_html && !payload.body_text) {
    throw new Error('Missing required field: body_html or body_text (at least one).');
  }

  var isReply = !!payload.thread_id;
  result.mode = isReply ? 'reply' : 'new';

  if (!isReply) {
    if (!payload.recipient) throw new Error('Missing required field: recipient (required for new emails).');
    if (!payload.subject) throw new Error('Missing required field: subject (required for new emails).');
  }

  // 1. Resolve thread context if replying (used in archive Doc and to validate access).
  var threadContext = null;
  if (isReply) {
    if (!validateThreadAccess(payload.thread_id)) {
      throw new Error('Invalid or inaccessible Gmail thread_id: ' + payload.thread_id);
    }
    threadContext = getThreadContext(payload.thread_id);
  }

  // 2. Send via Gmail.
  var sendResult;
  if (isReply) {
    sendResult = replyToThread(
      payload.thread_id,
      payload.body_html || null,
      payload.body_text || null,
      payload.attachment_link || null,
      payload.in_reply_to_message_id || null
    );
  } else {
    sendResult = sendNew(
      payload.recipient,
      payload.subject,
      payload.body_html || null,
      payload.body_text || null,
      payload.attachment_link || null
    );
  }

  result.message_id = sendResult.message_id;
  result.thread_id = sendResult.thread_id;

  // 3. Archive Doc — ALWAYS, after successful send.
  try {
    result.archive_doc_link = buildArchiveDoc(payload, sendResult, threadContext);
  } catch (archiveErr) {
    // Archive failure is non-fatal; the email was already sent.
    result.archive_doc_link = null;
    result.error = 'sent_ok_but_archive_failed: ' + (archiveErr && archiveErr.message ? archiveErr.message : archiveErr);
  }

  result.success = !result.error;
  result.log_id = logOperation(payload, result);
  return result;
}
