/**
 * Logger.gs — appends one row per emailer operation to a Google Sheet.
 *
 * Sheet ID lives in PropertiesService key LOG_SHEET_ID. If unset, logging
 * is a no-op (so doPost still returns successfully during early setup).
 *
 * Columns (in order):
 *   timestamp | task | mode | recipient | thread_id | scenario |
 *   skill_called | doc_link | message_id | success | error
 */

var LOGGER_HEADERS_ = [
  'timestamp', 'task', 'mode', 'recipient', 'thread_id', 'scenario',
  'skill_called', 'doc_link', 'message_id', 'success', 'error'
];

/**
 * logOperation — appends a row to the configured log sheet.
 *
 * @param {object} payload - the original incoming payload
 * @param {object} result  - the result envelope returned by handleEmailRequest
 * @returns {?string} log row id (sheet row number as string), or null when disabled
 */
function logOperation(payload, result) {
  var sheetId = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!sheetId) {
    // Logging not configured yet; not a fatal condition.
    return null;
  }

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheets()[0];

  ensureHeaders_(sheet);

  payload = payload || {};
  result = result || {};

  var scenario = inferScenario_(payload);

  var row = [
    new Date(),
    payload.task || '',
    result.mode || (payload.thread_id ? 'reply' : 'new'),
    payload.recipient || '',
    payload.thread_id || result.thread_id || '',
    scenario,
    payload.skill_call || '',
    result.doc_link || payload.attachment_link || '',
    result.message_id || '',
    result.success === true,
    result.error || ''
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();
  return String(lastRow);
}

/**
 * Ensures the first row of the sheet contains our header columns.
 * @private
 */
function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(LOGGER_HEADERS_);
    sheet.setFrozenRows(1);
    return;
  }
  var firstRow = sheet.getRange(1, 1, 1, LOGGER_HEADERS_.length).getValues()[0];
  var matches = true;
  for (var i = 0; i < LOGGER_HEADERS_.length; i++) {
    if (firstRow[i] !== LOGGER_HEADERS_[i]) { matches = false; break; }
  }
  if (!matches) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, LOGGER_HEADERS_.length).setValues([LOGGER_HEADERS_]);
    sheet.setFrozenRows(1);
  }
}

/**
 * Maps a payload to one of the three documented scenarios A/B/C.
 * @private
 */
function inferScenario_(payload) {
  if (payload && payload.thread_id) return 'C_reply_in_thread';
  if (payload && payload.attachment_link) return 'A_new_with_attachment';
  return 'B_new_with_skill_doc';
}
