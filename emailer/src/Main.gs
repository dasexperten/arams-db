/**
 * Main.gs — entry point for Emailer Apps Script web app.
 *
 * Receives JSON payloads via doPost(e), routes between NEW EMAIL and REPLY modes,
 * optionally calls a skill and builds a Google Doc artifact, then sends via Gmail.
 *
 * Expected payload schema:
 *   {
 *     "task":                 string,           // human-readable task name (required)
 *     "recipient":            string (email),   // required if no thread_id
 *     "subject":              string,           // optional, ignored when replying
 *     "content_brief":        string,           // what to write about (required)
 *     "attachment_link":      string,           // optional, pre-made artifact link
 *     "skill_call":           string,           // optional, skill name from /.claude/skills/
 *     "context":              string,           // optional, extra info
 *     "thread_id":            string,           // optional, Gmail thread ID for replies
 *     "in_reply_to_message_id": string          // optional, specific message to reply to
 *   }
 *
 * Returns JSON:
 *   { success, mode, message_id, thread_id, doc_link, log_id, error }
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
    doc_link: null,
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
 * handleEmailRequest — core routing function. Pure-ish: takes payload, returns result.
 * Used by doPost and by manual test runners inside the Apps Script editor.
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
    doc_link: null,
    log_id: null,
    error: null
  };

  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be a JSON object.');
  }
  if (!payload.task) {
    throw new Error('Missing required field: task.');
  }
  if (!payload.content_brief) {
    throw new Error('Missing required field: content_brief.');
  }

  var isReply = !!payload.thread_id;
  result.mode = isReply ? 'reply' : 'new';

  if (!isReply && !payload.recipient) {
    throw new Error('Missing required field: recipient (required for new emails).');
  }

  // 1. Resolve thread context if replying.
  var threadContext = null;
  if (isReply) {
    if (!validateThreadAccess(payload.thread_id)) {
      throw new Error('Invalid or inaccessible Gmail thread_id: ' + payload.thread_id);
    }
    threadContext = getThreadContext(payload.thread_id);
  }

  // 2. Build or skip the artifact.
  var attachmentLink = payload.attachment_link || null;
  var skillResult = null;

  if (!attachmentLink) {
    if (payload.skill_call) {
      skillResult = callSkill(payload.skill_call, {
        brief: payload.content_brief,
        context: payload.context || '',
        recipient: payload.recipient || null,
        thread_context: threadContext
      });
    }

    var docContent = skillResult && skillResult.content
      ? skillResult.content
      : payload.content_brief;
    var docTitle = payload.task || 'Emailer Report';
    var docId = buildReport(docContent, docTitle);
    attachmentLink = saveToDrive(docId, getDefaultDriveFolder_());
    result.doc_link = attachmentLink;
  } else {
    result.doc_link = attachmentLink;
  }

  // 3. Compose email body.
  var composed = composeEmail(
    {
      task: payload.task,
      brief: payload.content_brief,
      context: payload.context || '',
      subject: payload.subject || null
    },
    skillResult,
    attachmentLink,
    threadContext
  );

  // 4. Send via Gmail.
  var sendResult;
  if (isReply) {
    sendResult = replyToThread(
      payload.thread_id,
      composed.body_html,
      composed.body_plain,
      attachmentLink,
      payload.in_reply_to_message_id || null
    );
  } else {
    sendResult = sendNew(
      payload.recipient,
      composed.subject,
      composed.body_html,
      composed.body_plain,
      attachmentLink
    );
  }

  result.success = true;
  result.message_id = sendResult.message_id;
  result.thread_id = sendResult.thread_id;
  result.log_id = logOperation(payload, result);

  return result;
}

/**
 * Returns the default Drive folder name from PropertiesService, or a sensible default.
 * @private
 * @returns {string}
 */
function getDefaultDriveFolder_() {
  var folder = PropertiesService.getScriptProperties().getProperty('DEFAULT_DRIVE_FOLDER');
  return folder && folder.length ? folder : 'Emailer Reports';
}
