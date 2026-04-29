/**
 * Main.gs — action-based dispatcher for the Emailer Apps Script web app.
 * (deploy bump: trash_threads action)
 *
 * One POST endpoint. payload.action selects the handler. Each handler lives
 * in src/actions/ and returns a standardised response object that this file
 * JSON-stringifies and returns to the caller.
 *
 * Supported actions:
 *   send                → ActionSend.handle(payload)
 *   reply               → ActionReply.handle(payload)
 *   reply_all           → ActionReplyAll.handle(payload)
 *   find                → ActionFind.handle(payload)
 *   get_thread          → ActionGetThread.handle(payload)
 *   download_attachment → ActionDownloadAttachment.handle(payload)
 *   archive             → ActionArchive.handle(payload) — write a Doc to REPORTER_FOLDER_ID without sending mail
 *   trash_threads       → ActionTrashThreads.handle(payload) — move N threads to Gmail Trash (recoverable 30 days)
 *
 * Universal flag: draft_only:true on send/reply/reply_all creates a Gmail
 * draft instead of sending. Reporter is NOT called for drafts.
 */

/**
 * doPost — HTTP entry point.
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  var payload = {};
  var result;

  try {
    if (!e || !e.postData || !e.postData.contents) {
      result = { success: false, error: 'Empty request body. Expected JSON payload.' };
      return respond_(result);
    }

    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      result = { success: false, error: 'Invalid JSON: ' + String(parseErr.message || parseErr) };
      return respond_(result);
    }

    if (!payload || typeof payload !== 'object') {
      result = { success: false, error: 'Payload must be a JSON object.' };
      return respond_(result);
    }

    if (!payload.action || typeof payload.action !== 'string') {
      result = { success: false, error: 'Missing required field: action (must be a string).' };
      return respond_(result);
    }

    result = dispatchAction_(payload);

  } catch (err) {
    var errMsg = String(err && err.message ? err.message : err);
    result = {
      success: false,
      action: payload.action || null,
      error: 'Unhandled error in dispatcher: ' + errMsg
    };
    try { logOperation_(payload, result); } catch (ignore) {}
  }

  return respond_(result);
}

/**
 * dispatchAction_ — routes payload.action to the correct handler.
 * @private
 */
function dispatchAction_(payload) {
  var action = payload.action;

  switch (action) {
    case 'send':
      return ActionSend.handle(payload);
    case 'reply':
      return ActionReply.handle(payload);
    case 'reply_all':
      return ActionReplyAll.handle(payload);
    case 'find':
      return ActionFind.handle(payload);
    case 'get_thread':
      return ActionGetThread.handle(payload);
    case 'download_attachment':
      return ActionDownloadAttachment.handle(payload);
    case 'archive':
      return ActionArchive.handle(payload);
    case 'trash_threads':
      return ActionTrashThreads.handle(payload);
    default:
      return { success: false, error: 'Unknown action: ' + action };
  }
}

/** @private */
function respond_(result) {
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/** @private — thin wrapper so doPost catch block can call Logger without coupling */
function logOperation_(payload, result) {
  logEmailerOperation(payload, result);
}
