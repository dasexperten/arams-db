/**
 * Logger.gs — appends one row per emailer operation to a Google Sheet.
 *
 * V3 schema (extended for action-based dispatcher):
 *   timestamp | action | mode | draft_only | recipient | thread_id | subject |
 *   has_attachment | archive_status | archive_doc_link | archive_error |
 *   result_summary | success | error
 *
 * Sheet ID lives in PropertiesService key LOG_SHEET_ID. If unset, logging is
 * a no-op (so doPost still returns successfully during early setup).
 *
 * Backward compat: if the existing Sheet has a LEGACY V2 header row, we append
 * rows using only the columns that exist (mapped by name) and skip the rest
 * with console.warn. We do NOT crash and do NOT rewrite legacy headers.
 */

var LOGGER_HEADERS_V3_ = [
  'timestamp', 'action', 'mode', 'draft_only', 'recipient', 'thread_id', 'subject',
  'has_attachment', 'archive_status', 'archive_doc_link', 'archive_error',
  'result_summary', 'success', 'error'
];

/**
 * logOperation — appends a row to the configured log sheet.
 *
 * @param {object} payload - the original incoming payload
 * @param {object} result  - the response envelope returned by an action handler
 * @returns {?string} log row id (sheet row number as string), or null when disabled
 */
function logOperation(payload, result) {
  var sheetId = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!sheetId) {
    return null;
  }

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheets()[0];
  var headers = ensureOrReadHeaders_(sheet);

  payload = payload || {};
  result = result || {};

  var rowMap = buildRowMap_(payload, result);

  // Build row aligned to actual sheet headers.
  var row = headers.map(function (h) {
    if (Object.prototype.hasOwnProperty.call(rowMap, h)) return rowMap[h];
    // Header is not in our V3 map (likely legacy column) — leave empty.
    return '';
  });

  // Warn (once per call) about any V3 fields we couldn't store.
  var missing = LOGGER_HEADERS_V3_.filter(function (k) { return headers.indexOf(k) === -1; });
  if (missing.length) {
    console.warn('Logger: legacy sheet missing V3 columns: ' + missing.join(', '));
  }

  sheet.appendRow(row);
  return String(sheet.getLastRow());
}

/**
 * ensureOrReadHeaders_ — if sheet is empty, writes V3 header row.
 * Otherwise returns whatever header row already exists (legacy-tolerant).
 * @private
 */
function ensureOrReadHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(LOGGER_HEADERS_V3_);
    sheet.setFrozenRows(1);
    return LOGGER_HEADERS_V3_.slice();
  }
  var width = sheet.getLastColumn();
  if (width === 0) {
    sheet.appendRow(LOGGER_HEADERS_V3_);
    sheet.setFrozenRows(1);
    return LOGGER_HEADERS_V3_.slice();
  }
  var firstRow = sheet.getRange(1, 1, 1, width).getValues()[0];
  return firstRow.map(function (v) { return String(v || ''); });
}

/**
 * buildRowMap_ — produces a {column_name: value} object for the current operation.
 * Different actions populate different columns; missing values become empty string.
 * @private
 */
function buildRowMap_(payload, result) {
  var action = payload.action || result.action || '';
  var mode = result.mode || (payload.thread_id ? 'reply' : (action === 'find' || action === 'get_thread' || action === 'download_attachment' ? 'read-only' : 'new'));
  var draftOnly = (payload.draft_only === true);
  var draftOnlyCell = (action === 'send' || action === 'reply' || action === 'reply_all') ? draftOnly : 'N/A';

  // recipient column doubles as query / message_id depending on action.
  var recipientCell = '';
  if (action === 'find') {
    recipientCell = payload.query || '';
  } else if (action === 'get_thread' || action === 'download_attachment') {
    recipientCell = payload.message_id || payload.thread_id || '';
  } else {
    recipientCell = payload.recipient || '';
  }

  // subject column doubles as attachment_name for download.
  var subjectCell = '';
  if (action === 'download_attachment') {
    subjectCell = payload.attachment_name || (payload.attachment_index != null ? ('idx:' + payload.attachment_index) : '');
  } else {
    subjectCell = payload.subject || '';
  }

  return {
    'timestamp':         new Date(),
    'action':            action,
    'mode':              mode,
    'draft_only':        draftOnlyCell,
    'recipient':         recipientCell,
    'thread_id':         payload.thread_id || result.thread_id || '',
    'subject':           subjectCell,
    'has_attachment':    !!payload.attachment_link || (Array.isArray(result.attachment_names) && result.attachment_names.length > 0),
    'archive_status':    result.archive_status || (action === 'send' || action === 'reply' || action === 'reply_all' ? (draftOnly ? 'skipped' : '') : 'skipped'),
    'archive_doc_link':  result.archive_doc_link || '',
    'archive_error':     result.archive_error || '',
    'result_summary':    result.result_summary || buildSummary_(action, result),
    'success':           result.success === true,
    'error':             result.error || ''
  };
}

/** @private */
function buildSummary_(action, result) {
  if (!result) return '';
  switch (action) {
    case 'send':
    case 'reply':
    case 'reply_all':
      if (result.mode === 'draft') return 'Draft created';
      if (result.success) return 'Sent';
      return '';
    case 'find':
      if (typeof result.total_found === 'number') return 'Found ' + result.total_found + ' threads';
      return '';
    case 'get_thread':
      if (result.message_count != null) return 'Returned ' + result.message_count + ' messages';
      return '';
    case 'download_attachment':
      if (result.success) return 'Attachment saved (' + (result.size_bytes || 0) + ' bytes)';
      return '';
    default:
      return '';
  }
}
