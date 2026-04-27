/**
 * Logger.gs — appends one row per emailer operation to a Google Sheet.
 *
 * Sheet ID lives in Script Property LOG_SHEET_ID. If unset, logging is a no-op.
 *
 * New V3 schema (14 columns):
 *   timestamp | action | mode | draft_only | recipient | thread_id | subject |
 *   has_attachment | archive_status | archive_doc_link | archive_error |
 *   result_summary | success | error
 *
 * If an existing Sheet has a legacy V2 schema, rows are appended using only
 * the columns that exist. A console.warn is emitted for missing columns.
 */

var LOGGER_HEADERS_V3_ = [
  'timestamp',
  'action',
  'mode',
  'draft_only',
  'recipient',
  'thread_id',
  'subject',
  'has_attachment',
  'archive_status',
  'archive_doc_link',
  'archive_error',
  'result_summary',
  'success',
  'error'
];

/**
 * logEmailerOperation — appends a row to the configured log sheet.
 *
 * @param {object} payload - the incoming action payload
 * @param {object} result  - the response object returned by the action handler
 * @returns {?string} row number as string, or null when logging is disabled
 */
function logEmailerOperation(payload, result) {
  var sheetId = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!sheetId) return null;

  var ss, sheet;
  try {
    ss = SpreadsheetApp.openById(sheetId);
    sheet = ss.getSheets()[0];
  } catch (err) {
    console.warn('Logger: cannot open sheet ' + sheetId + ': ' + String(err.message || err));
    return null;
  }

  payload = payload || {};
  result = result || {};

  var headerMap = ensureHeaders_(sheet);

  var action = payload.action || result.action || '';
  var isDraftOnly = !!payload.draft_only;
  var mode = result.mode || (isDraftOnly ? 'draft' : (payload.thread_id ? 'reply' : 'new'));
  var recipient = payload.recipient || payload.query || payload.message_id || result.thread_id || '';
  var subject = payload.subject || payload.attachment_name || '';
  var hasAttachment = !!(payload.attachment_link || payload.attachment_name);
  var archiveStatus = result.archive_doc_link ? 'ok' : (result.archive_error ? 'failed' : 'skipped');
  var resultSummary = result.result_summary || (result.success ? 'ok' : (result.error || ''));

  var rowData = {
    'timestamp':        new Date(),
    'action':           action,
    'mode':             mode,
    'draft_only':       isDraftOnly,
    'recipient':        String(recipient),
    'thread_id':        String(payload.thread_id || result.thread_id || ''),
    'subject':          String(subject),
    'has_attachment':   hasAttachment,
    'archive_status':   archiveStatus,
    'archive_doc_link': String(result.archive_doc_link || ''),
    'archive_error':    String(result.archive_error || ''),
    'result_summary':   String(resultSummary),
    'success':          result.success === true,
    'error':            String(result.error || '')
  };

  var row = buildRow_(rowData, headerMap);
  sheet.appendRow(row);
  return String(sheet.getLastRow());
}

/**
 * ensureHeaders_ — ensures the sheet has V3 headers in row 1.
 * If the sheet is empty, writes V3 headers. If it has a legacy schema,
 * logs a warning but does NOT overwrite — we append rows using the existing
 * column order instead.
 *
 * @returns {object} map of header name → 0-based column index
 * @private
 */
function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(LOGGER_HEADERS_V3_);
    sheet.setFrozenRows(1);
    var fresh = {};
    LOGGER_HEADERS_V3_.forEach(function (h, i) { fresh[h] = i; });
    return fresh;
  }

  var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var headerMap = {};
  existingHeaders.forEach(function (h, i) {
    if (h) headerMap[String(h)] = i;
  });

  // Warn about any V3 columns absent from legacy sheet
  var missing = LOGGER_HEADERS_V3_.filter(function (h) { return !(h in headerMap); });
  if (missing.length > 0) {
    console.warn('Logger: sheet is missing V3 columns: ' + missing.join(', ') +
      '. Rows will be appended with blank values for those columns.');
  }

  return headerMap;
}

/**
 * buildRow_ — maps a rowData object into an array matching sheet column order.
 * Missing columns get empty string.
 * @private
 */
function buildRow_(rowData, headerMap) {
  var colCount = Object.keys(headerMap).length;
  var row = new Array(colCount).fill('');
  Object.keys(rowData).forEach(function (key) {
    if (key in headerMap) {
      row[headerMap[key]] = rowData[key];
    }
  });
  return row;
}
