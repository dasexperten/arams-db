/**
 * Main.gs — V3 action-based dispatcher.
 *
 * One POST endpoint, multiple actions selected by payload.action.
 * Business logic lives in src/actions/Action*.gs handlers.
 * Each handler returns a standardized response object that Main.gs JSON-stringifies.
 *
 * Top-level payload schema:
 *   { "action": "send" | "reply" | "reply_all" | "find" | "get_thread" | "download_attachment", ... }
 *
 * Universal response envelope keys:
 *   { success, action, error, ...handler-specific-keys }
 */

/**
 * doPost — HTTP entry point for the Emailer web app.
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  var payload = {};
  var response = { success: false, action: null, error: null };

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Empty request body. Expected JSON payload.');
    }
    payload = JSON.parse(e.postData.contents);
    if (!payload.action || typeof payload.action !== 'string') {
      throw new Error("Missing or invalid 'action' field. " +
        "Required values: 'send' | 'reply' | 'reply_all' | 'find' | 'get_thread' | 'download_attachment'.");
    }
    response.action = payload.action;
    response = dispatchAction_(payload);
  } catch (err) {
    response.success = false;
    response.action = (payload && payload.action) || null;
    response.error = String(err && err.message ? err.message : err);
    try { logOperation(payload, response); } catch (logErr) {
      // Do not let logging mask the real error.
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * dispatchAction_ — exhaustive switch over supported actions.
 * Adding a new action = add one case here and one handler file under src/actions/.
 *
 * @private
 * @param {object} payload
 * @returns {object} response envelope from the handler
 */
function dispatchAction_(payload) {
  switch (payload.action) {
    case 'send':                return ActionSend_handle(payload);
    case 'reply':               return ActionReply_handle(payload);
    case 'reply_all':           return ActionReplyAll_handle(payload);
    case 'find':                return ActionFind_handle(payload);
    case 'get_thread':          return ActionGetThread_handle(payload);
    case 'download_attachment': return ActionDownloadAttachment_handle(payload);
    default:
      return {
        success: false,
        action: payload.action,
        error: 'Unknown action: ' + payload.action
      };
  }
}
