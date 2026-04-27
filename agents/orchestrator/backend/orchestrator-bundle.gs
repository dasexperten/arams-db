/**
 * orchestrator-bundle.gs — Das Experten Orchestrator agent backend.
 *
 * Single-file Apps Script bundle for paste-into-editor deployment.
 * Mirrors the structure of my-tools/emailer/dist/emailer-bundle.gs but
 * adds workflow state management, Telegram Bot integration, scheduled
 * triggers, and consistency gate enforcement.
 *
 * Architecture (top-to-bottom):
 *   1. authorize()             — one-time permission helper
 *   2. Config + Telegram client — talk to Bot API and Aram
 *   3. doPost + dispatcher     — entry point, route incoming updates
 *   4. State management        — Drive JSON + Sheet + LockService
 *   5. Workflow engine         — mode select, run steps, enforce gates
 *   6. Scheduled + heartbeat   — recurring workflows + stale recovery
 *
 * Script Properties required (set via Apps Script editor → Project Settings):
 *   TELEGRAM_BOT_TOKEN              — bot token from @BotFather
 *   ARAM_TELEGRAM_CHAT_ID           — target chat ID for all Aram messages
 *   ANTHROPIC_API_KEY               — for skill calls via Claude API
 *   EMAILER_EXEC_URL                — emailer Web App /exec URL
 *   ORCHESTRATOR_STATE_FOLDER_ID    — Drive folder for state JSONs
 *   ORCHESTRATOR_INDEX_SHEET_ID     — Google Sheet for run index
 *   GITHUB_TEMPLATES_BASE_URL       — raw.githubusercontent.com URL prefix
 *                                     pointing at agents/orchestrator/workflows/
 *
 * See backend/SETUP_NOTES.md for full deployment instructions.
 */


// ============================================================================
// authorize() — one-time scope helper (run from editor)
// ============================================================================

/**
 * Run this once from the Apps Script editor to grant required scopes:
 *   - Drive (state JSONs)
 *   - Sheets (index)
 *   - UrlFetch (Telegram, Anthropic, emailer)
 *   - Script Properties (config)
 *   - Lock Service (atomic state writes)
 */
function authorize() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var folderId = props.ORCHESTRATOR_STATE_FOLDER_ID;
  var sheetId = props.ORCHESTRATOR_INDEX_SHEET_ID;

  if (folderId) DriveApp.getFolderById(folderId);
  if (sheetId)  SpreadsheetApp.openById(sheetId);

  var lock = LockService.getScriptLock();
  lock.tryLock(1000);
  lock.releaseLock();

  UrlFetchApp.fetch('https://api.telegram.org/', { muteHttpExceptions: true });

  console.log('orchestrator: authorize OK');
}


// ============================================================================
// Configuration + small utilities
// ============================================================================

var ORCH_VERSION_ = '1.0.0';
var TELEGRAM_API_BASE_ = 'https://api.telegram.org/bot';
var TELEGRAM_PARSE_MODE_ = 'HTML';
var STATE_LOCK_WAIT_MS_ = 10000;
var STATE_LOCK_RETRY_MS_ = 2000;
var WF_TEXT_PREVIEW_LIMIT_ = 1500;
var GATE_OVERRIDE_BUTTON_TEXT_ = 'Удалить фразу и продолжить';

var STATUS_ = {
  RUNNING:        'RUNNING',
  AWAITING_INPUT: 'AWAITING_INPUT',
  COMPLETED:      'COMPLETED',
  FAILED:         'FAILED',
  CANCELLED:      'CANCELLED',
  STALE:          'STALE'
};

function props_() {
  return PropertiesService.getScriptProperties();
}

function getProp_(name, required) {
  var v = props_().getProperty(name);
  if (required && !v) {
    throw new Error('Missing Script Property: ' + name);
  }
  return v;
}

function nowIso_() {
  return new Date().toISOString();
}

function safeJson_(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

function htmlEscape_(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate_(s, max) {
  s = String(s || '');
  if (s.length <= max) return s;
  return s.substring(0, max) + '…';
}

function redactForLog_(s) {
  if (!s) return s;
  var len = String(s).length;
  return '[redacted, ' + len + ' chars]';
}


// ============================================================================
// Telegram Bot API client
// ============================================================================

/**
 * Send a Telegram message to Aram. Returns the message_id on success,
 * null on failure (logged). Caller should persist the message_id in state
 * if subsequent editMessageText is expected.
 *
 * @param {string} text       — body text (HTML-escaped by caller as needed)
 * @param {object} keyboard   — optional inline_keyboard object
 * @param {string} chatId     — defaults to ARAM_TELEGRAM_CHAT_ID
 * @returns {?number} message_id
 */
function sendTelegram_(text, keyboard, chatId) {
  var token = getProp_('TELEGRAM_BOT_TOKEN', true);
  chatId = chatId || getProp_('ARAM_TELEGRAM_CHAT_ID', true);

  var payload = {
    chat_id: chatId,
    text: text,
    parse_mode: TELEGRAM_PARSE_MODE_,
    disable_web_page_preview: true
  };
  if (keyboard) payload.reply_markup = JSON.stringify(keyboard);

  var url = TELEGRAM_API_BASE_ + token + '/sendMessage';
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: payload,
    muteHttpExceptions: true
  });

  var data = safeJson_(resp.getContentText()) || {};
  if (!data.ok) {
    console.warn('Telegram sendMessage failed: ' + JSON.stringify(data));
    return null;
  }
  return data.result && data.result.message_id;
}

/**
 * Edit an existing Telegram message — used to remove buttons after Aram
 * has clicked one (prevents accidental re-click on stale buttons).
 */
function editTelegram_(messageId, text, keyboard, chatId) {
  if (!messageId) return false;
  var token = getProp_('TELEGRAM_BOT_TOKEN', true);
  chatId = chatId || getProp_('ARAM_TELEGRAM_CHAT_ID', true);

  var payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: TELEGRAM_PARSE_MODE_,
    disable_web_page_preview: true
  };
  if (keyboard) payload.reply_markup = JSON.stringify(keyboard);

  var url = TELEGRAM_API_BASE_ + token + '/editMessageText';
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: payload,
    muteHttpExceptions: true
  });

  var data = safeJson_(resp.getContentText()) || {};
  if (!data.ok && (data.description || '').indexOf('not modified') < 0) {
    console.warn('Telegram editMessageText failed: ' + JSON.stringify(data));
    return false;
  }
  return true;
}

/**
 * Acknowledge a callback query so Telegram stops the spinner on Aram's button.
 * Best-effort — failures are logged but never propagated.
 */
function answerCallback_(callbackQueryId, text) {
  if (!callbackQueryId) return;
  var token = getProp_('TELEGRAM_BOT_TOKEN', true);
  var payload = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;

  var url = TELEGRAM_API_BASE_ + token + '/answerCallbackQuery';
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: payload,
      muteHttpExceptions: true
    });
  } catch (e) {
    console.warn('answerCallbackQuery failed: ' + String(e.message || e));
  }
}

/**
 * Build standard message envelope (ShortLabel + step counter + body + wf_id footer).
 * All orchestrator messages MUST go through this helper to keep formatting consistent.
 */
function buildEnvelope_(label, stepCounter, body, wfId) {
  var lines = [];
  lines.push('🤖 <b>ORCHESTRATOR — ' + htmlEscape_(label) + '</b>');
  if (stepCounter) lines.push('<i>' + htmlEscape_(stepCounter) + '</i>');
  lines.push('');
  lines.push(body);
  if (wfId) {
    lines.push('');
    lines.push('<code>wf_id: ' + htmlEscape_(wfId) + '</code>');
  }
  return lines.join('\n');
}

/**
 * Helper to build a 2-button row for a callback keyboard. Each button's
 * callback_data is the standard `wf_id|step_index|choice` triple defined
 * in reference/telegram-templates.md.
 */
function kbRow_() {
  var row = [];
  for (var i = 0; i < arguments.length; i++) row.push(arguments[i]);
  return row;
}

function kbButton_(text, wfId, stepIndex, choice) {
  return {
    text: text,
    callback_data: [wfId, stepIndex, choice].join('|')
  };
}


// ============================================================================
// doPost — entry point for Telegram webhook
// ============================================================================

/**
 * Telegram webhook handler. Two scenarios:
 *   1. Incoming text message from Aram → start new workflow (or resume)
 *   2. Callback query (button click) → resume awaiting workflow
 *
 * Always returns 200 with empty JSON — Telegram retries on non-200, which
 * would cause double-processing. Errors are surfaced to Aram via Telegram,
 * not via HTTP status.
 */
function doPost(e) {
  var update = null;
  try {
    update = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    console.warn('doPost: bad JSON: ' + String(err.message || err));
    return ContentService.createTextOutput('{}').setMimeType(ContentService.MimeType.JSON);
  }

  try {
    dispatchUpdate_(update);
  } catch (err) {
    handleFatal_(err, update);
  }

  return ContentService.createTextOutput('{}').setMimeType(ContentService.MimeType.JSON);
}

/**
 * Route a parsed Telegram update to the right handler.
 * Authorization check: only updates from ARAM_TELEGRAM_CHAT_ID are processed.
 */
function dispatchUpdate_(update) {
  var aramChatId = String(getProp_('ARAM_TELEGRAM_CHAT_ID', true));

  if (update.callback_query) {
    var cbq = update.callback_query;
    var fromChat = String((cbq.message && cbq.message.chat && cbq.message.chat.id) || '');
    if (fromChat !== aramChatId) {
      console.warn('callback_query from unauthorized chat: ' + fromChat);
      answerCallback_(cbq.id, 'Unauthorized');
      return;
    }
    handleCallbackQuery_(cbq);
    return;
  }

  if (update.message && update.message.text) {
    var msgChat = String(update.message.chat.id);
    if (msgChat !== aramChatId) {
      console.warn('message from unauthorized chat: ' + msgChat);
      return;
    }
    handleMessage_(update.message);
    return;
  }

  // Edited messages, channel posts, etc — ignored.
}

/**
 * Aram sent a free-text message. Two cases:
 *   - Active workflow is AWAITING_INPUT with awaiting_input_type=free_text
 *     → text becomes Aram's response to that step
 *   - Otherwise → start new workflow (mode selection)
 */
function handleMessage_(msg) {
  var text = (msg.text || '').trim();
  if (!text) return;

  var awaitingFreeText = findAwaitingFreeTextInstance_();
  if (awaitingFreeText) {
    if (awaitingFreeText.length === 1) {
      resumeFreeText_(awaitingFreeText[0], text);
      return;
    }
    sendDisambiguation_(awaitingFreeText, text);
    return;
  }

  // No free-text awaiting → treat as new workflow trigger.
  startWorkflow_(text);
}

/**
 * Aram clicked an inline keyboard button. callback_data format:
 *   <wf_id>|<step_index>|<choice>
 */
function handleCallbackQuery_(cbq) {
  answerCallback_(cbq.id);

  var data = String(cbq.data || '');
  var parts = data.split('|');
  if (parts.length !== 3) {
    console.warn('callback malformed: ' + data);
    return;
  }
  var wfId = parts[0];
  var stepIndex = parseInt(parts[1], 10);
  var choice = parts[2];

  var state = loadState_(wfId);
  if (!state) {
    console.warn('callback for unknown wf_id: ' + wfId);
    return;
  }

  // Stale button replay: button references a step already completed.
  if (state.current_step !== stepIndex) {
    console.warn('stale callback wf=' + wfId + ' step=' + stepIndex + ' current=' + state.current_step);
    return;
  }

  if (state.status !== STATUS_.AWAITING_INPUT && state.status !== STATUS_.FAILED) {
    console.warn('callback for non-awaiting wf=' + wfId + ' status=' + state.status);
    return;
  }

  // Edit the original message to disable buttons and show the chosen action.
  if (cbq.message && cbq.message.message_id) {
    var resolvedBody = (cbq.message.text || '') + '\n\n✓ Ответ получен: ' + choice;
    editTelegram_(cbq.message.message_id, htmlEscape_(resolvedBody), null);
  }

  resumeWithChoice_(state, choice);
}


// ============================================================================
// Error handler — never let an exception silently kill a workflow
// ============================================================================

/**
 * Fatal error during doPost. We don't know which workflow (if any) is affected,
 * so we send a generic alert to Aram with the error text. State (if any) is
 * left intact for retry.
 */
function handleFatal_(err, update) {
  var msg = String((err && err.message) || err);
  var stack = String((err && err.stack) || '');
  console.error('orchestrator FATAL: ' + msg + '\n' + stack);

  var body = [
    '<b>Внутренняя ошибка оркестратора.</b>',
    '',
    'Сообщение: ' + htmlEscape_(msg),
    '',
    'Update: ' + htmlEscape_(truncate_(JSON.stringify(update || {}), 500)),
    '',
    'Состояние воркфлоу (если был активен) сохранено. Можете продолжить через Telegram.'
  ].join('\n');

  try {
    sendTelegram_(buildEnvelope_('System/Error 🔴', null, body, null), null);
  } catch (innerErr) {
    console.error('orchestrator: failed to surface error to Aram: ' + String(innerErr));
  }
}

/**
 * Per-workflow error reporter. Used during step execution when the error
 * is recoverable (state is intact, retry is possible).
 */
function reportWorkflowError_(state, stepIndex, err) {
  var msg = String((err && err.message) || err);
  console.warn('wf=' + state.wf_id + ' step=' + stepIndex + ' error=' + msg);

  state.error_log = state.error_log || [];
  state.error_log.push({
    step_index: stepIndex,
    error_type: 'step_error',
    message: msg,
    timestamp: nowIso_(),
    resolution: 'awaiting_aram'
  });
  state.status = STATUS_.FAILED;

  var body = [
    'Workflow остановлен из-за ошибки.',
    '',
    'Шаг: ' + htmlEscape_(stepIndex) + ' / ' + htmlEscape_(state.total_steps || '?'),
    'Ошибка: ' + htmlEscape_(truncate_(msg, 300)),
    '',
    'Состояние сохранено. Можно попробовать продолжить или отменить.'
  ].join('\n');

  var keyboard = {
    inline_keyboard: [
      kbRow_(
        kbButton_('Попробовать снова', state.wf_id, stepIndex, 'retry'),
        kbButton_('Отменить workflow', state.wf_id, stepIndex, 'cancel')
      )
    ]
  };

  var msgId = sendTelegram_(buildEnvelope_(shortLabel_(state) + '/Error 🔴', stepCounter_(state), body, state.wf_id), keyboard);
  state.last_telegram_message_id = msgId;
  writeState_(state.wf_id, state);
}

function shortLabel_(state) {
  // Default ShortLabel from template name; subclasses (per-step) may override
  // by setting state._label_override.
  if (state._label_override) return state._label_override;
  if (state.template === 'inbox-triage') return 'Inbox/Triage';
  if (state.template === 'adhoc') return 'Ad-hoc/Run';
  return state.template || 'Workflow';
}

function stepCounter_(state) {
  if (!state.total_steps) return 'Step ' + (state.current_step || '?');
  return 'Step ' + (state.current_step || '?') + '/' + state.total_steps;
}


// ============================================================================
// State management — Drive JSON + Sheet index + LockService atomic writes
// ============================================================================

var SHEET_HEADERS_ = [
  'wf_id',
  'template',
  'mode',
  'status',
  'created_at',
  'completed_at',
  'steps_total',
  'steps_completed',
  'gate_overrides',
  'errors',
  'original_trigger',
  'drive_link',
  'notes'
];

var SHEET_TAB_NAME_ = 'Workflows';
var ACTIVE_SUBFOLDER_ = 'active';
var ARCHIVED_SUBFOLDER_ = 'archived';

/**
 * Get (or lazily create) the active/ subfolder under ORCHESTRATOR_STATE_FOLDER_ID.
 * Same for archived/. We do NOT create the parent — operator creates it during setup.
 */
function getOrchestratorRoot_() {
  var folderId = getProp_('ORCHESTRATOR_STATE_FOLDER_ID', true);
  return DriveApp.getFolderById(folderId);
}

function getOrCreateSubfolder_(parent, name) {
  var iter = parent.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return parent.createFolder(name);
}

function getActiveFolder_() {
  return getOrCreateSubfolder_(getOrchestratorRoot_(), ACTIVE_SUBFOLDER_);
}

function getArchivedFolder_() {
  return getOrCreateSubfolder_(getOrchestratorRoot_(), ARCHIVED_SUBFOLDER_);
}

/**
 * Resolve a Drive file by wf_id. Searches active/ first, then archived/.
 *
 * @param {string} wfId
 * @param {boolean} createIfMissing — when true and not found, creates an empty
 *                                     file in active/ (caller fills content)
 * @returns {?GoogleAppsScript.Drive.File}
 */
function getStateFile_(wfId, createIfMissing) {
  var fileName = wfId + '.json';
  var active = getActiveFolder_();
  var iter = active.getFilesByName(fileName);
  if (iter.hasNext()) return iter.next();

  var archived = getArchivedFolder_();
  iter = archived.getFilesByName(fileName);
  if (iter.hasNext()) return iter.next();

  if (createIfMissing) {
    return active.createFile(fileName, '{}', MimeType.PLAIN_TEXT);
  }
  return null;
}

/**
 * Read the JSON state for a workflow instance.
 * Returns null if the file doesn't exist or is corrupt — never throws,
 * because the caller (callback handler) must handle stale wf_id gracefully.
 */
function loadState_(wfId) {
  var file = getStateFile_(wfId, false);
  if (!file) return null;
  var raw = file.getBlob().getDataAsString();
  var state = safeJson_(raw);
  if (!state || state.wf_id !== wfId) {
    console.warn('loadState_: corrupt or mismatched state for ' + wfId);
    return null;
  }
  return state;
}

/**
 * Atomic state write — acquires LockService before reading and writing,
 * stamps updated_at, persists to Drive, and upserts the Sheet index row.
 *
 * Caller passes the FULL state object (not a delta). The caller is responsible
 * for having loaded fresh state at the start of the request — this function
 * does not merge.
 */
function writeState_(wfId, state) {
  if (!state || state.wf_id !== wfId) {
    throw new Error('writeState_: state.wf_id mismatch');
  }
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    acquired = lock.tryLock(STATE_LOCK_WAIT_MS_);
    if (!acquired) {
      console.warn('writeState_: lock wait timed out, retrying once: ' + wfId);
      Utilities.sleep(STATE_LOCK_RETRY_MS_);
      acquired = lock.tryLock(STATE_LOCK_WAIT_MS_);
    }
    if (!acquired) {
      throw new Error('writeState_: cannot acquire lock after retry for ' + wfId);
    }

    state.updated_at = nowIso_();
    var file = getStateFile_(wfId, true);
    file.setContent(JSON.stringify(state, null, 2));

    try {
      upsertIndexRow_(state);
    } catch (sheetErr) {
      console.warn('writeState_: sheet update failed (non-fatal): ' + String(sheetErr.message || sheetErr));
    }
  } finally {
    if (acquired) lock.releaseLock();
  }
}

/**
 * Generate a unique workflow instance ID:
 *   <TEMPLATE_SLUG_UPPER>_<YYYY>_<MM>_<DD>_<SEQ>
 *
 * SEQ is the next available 2-digit counter for that template-day. We scan
 * both active/ and archived/ to avoid collisions on same-day re-runs.
 */
function generateWfId_(templateSlug) {
  var slug = String(templateSlug || 'ADHOC').toUpperCase().replace(/-/g, '_');
  var d = new Date();
  var datePart = d.getUTCFullYear() + '_' +
                 pad2_(d.getUTCMonth() + 1) + '_' +
                 pad2_(d.getUTCDate());
  var prefix = slug + '_' + datePart + '_';
  var seq = nextSeqForPrefix_(prefix);
  return prefix + pad2_(seq);
}

function pad2_(n) {
  n = Number(n);
  return (n < 10 ? '0' : '') + n;
}

function nextSeqForPrefix_(prefix) {
  var max = 0;
  var folders = [getActiveFolder_(), getArchivedFolder_()];
  for (var i = 0; i < folders.length; i++) {
    var iter = folders[i].getFiles();
    while (iter.hasNext()) {
      var name = iter.next().getName();
      if (name.indexOf(prefix) !== 0) continue;
      var rest = name.substring(prefix.length).replace(/\.json$/, '');
      var n = parseInt(rest, 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

/**
 * Create a fresh state JSON for a new workflow instance.
 * Persists immediately (under lock) so the wf_id is reserved against
 * concurrent doPost calls.
 */
function createInstance_(opts) {
  var wfId = generateWfId_(opts.template || 'adhoc');
  var state = {
    wf_id:                     wfId,
    template:                  opts.template || 'adhoc',
    mode:                      opts.mode || 'ad-hoc',
    status:                    STATUS_.RUNNING,
    current_step:              1,
    total_steps:               opts.total_steps || null,
    created_at:                nowIso_(),
    updated_at:                nowIso_(),
    last_heartbeat:            nowIso_(),
    params:                    opts.params || {},
    steps:                     opts.steps || [],
    data:                      {},
    gate_overrides:            [],
    error_log:                 [],
    last_telegram_message_id:  null,
    aram_chat_id:              getProp_('ARAM_TELEGRAM_CHAT_ID', true)
  };
  state.params.original_trigger = opts.original_trigger || state.params.original_trigger || '';
  writeState_(wfId, state);
  return state;
}

/**
 * Move an instance file from active/ to archived/. Idempotent — safe to call
 * even if the file is already in archived/.
 */
function archiveInstance_(state) {
  var fileName = state.wf_id + '.json';
  var active = getActiveFolder_();
  var iter = active.getFilesByName(fileName);
  if (!iter.hasNext()) return;
  var file = iter.next();
  var archived = getArchivedFolder_();
  file.moveTo(archived);
}

/**
 * Find every active instance currently AWAITING free-text input from Aram.
 * Used by handleMessage_ to attribute a free-text reply to the right wf.
 *
 * @returns {Array<object>} array of state objects (possibly empty)
 */
function findAwaitingFreeTextInstance_() {
  var matches = [];
  var iter = getActiveFolder_().getFiles();
  while (iter.hasNext()) {
    var file = iter.next();
    if (!/\.json$/.test(file.getName())) continue;
    var state = safeJson_(file.getBlob().getDataAsString());
    if (!state) continue;
    if (state.status !== STATUS_.AWAITING_INPUT) continue;
    var step = (state.steps || [])[state.current_step - 1];
    if (!step) continue;
    if (step.awaiting_input_type === 'free_text') matches.push(state);
  }
  return matches;
}

/**
 * Drive link to the JSON file (active or archived). Used in completion
 * summaries and the Sheet index `drive_link` column.
 */
function getStateDriveLink_(wfId) {
  var file = getStateFile_(wfId, false);
  if (!file) return '';
  return file.getUrl();
}


// ============================================================================
// Sheet index — one row per workflow instance, keyed by wf_id
// ============================================================================

function getIndexSheet_() {
  var id = getProp_('ORCHESTRATOR_INDEX_SHEET_ID', true);
  var ss = SpreadsheetApp.openById(id);
  var sheet = ss.getSheetByName(SHEET_TAB_NAME_) || ss.getSheets()[0];
  if (sheet.getName() !== SHEET_TAB_NAME_) {
    sheet = ss.insertSheet(SHEET_TAB_NAME_);
  }
  ensureIndexHeaders_(sheet);
  return sheet;
}

function ensureIndexHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, SHEET_HEADERS_.length).setValues([SHEET_HEADERS_]);
    sheet.setFrozenRows(1);
    return;
  }
  var current = sheet.getRange(1, 1, 1, SHEET_HEADERS_.length).getValues()[0];
  for (var i = 0; i < SHEET_HEADERS_.length; i++) {
    if (current[i] !== SHEET_HEADERS_[i]) {
      // Don't overwrite a customized header layout — just warn.
      console.warn('Sheet header drift at column ' + (i + 1) +
                   ': expected ' + SHEET_HEADERS_[i] + ', found ' + current[i]);
      return;
    }
  }
}

/**
 * Insert a new row for this wf_id, or update the existing row in place.
 * Sheet rows are looked up by wf_id in column A.
 */
function upsertIndexRow_(state) {
  var sheet = getIndexSheet_();
  var lastRow = sheet.getLastRow();

  var values = buildIndexRow_(state);

  // Look up existing row (skip header).
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === state.wf_id) {
        sheet.getRange(i + 2, 1, 1, values.length).setValues([values]);
        return;
      }
    }
  }

  // Append new.
  sheet.getRange(lastRow + 1, 1, 1, values.length).setValues([values]);
}

function buildIndexRow_(state) {
  var stepsCompleted = (state.steps || []).filter(function (s) {
    return s && s.status === 'completed';
  }).length;
  var completedAt = (state.status === STATUS_.COMPLETED ||
                     state.status === STATUS_.CANCELLED ||
                     state.status === STATUS_.FAILED ||
                     state.status === STATUS_.STALE) ? state.updated_at : '';

  return [
    state.wf_id,
    state.template,
    state.mode,
    state.status,
    state.created_at,
    completedAt,
    state.total_steps || '',
    stepsCompleted,
    (state.gate_overrides || []).length,
    (state.error_log || []).length,
    truncate_(((state.params || {}).original_trigger) || '', 200),
    getStateDriveLink_(state.wf_id),
    state._notes || ''
  ];
}


// ============================================================================
// Workflow engine — mode selection, execution loop, gates, skill/tool callers
// ============================================================================

/**
 * Entry point for every new trigger from Aram.
 * Selects mode → creates instance → begins execution.
 */
function startWorkflow_(triggerText) {
  var mode = selectMode_(triggerText);

  if (mode.type === 'templated') {
    var state = createInstance_({
      template:         mode.template,
      mode:             'templated',
      original_trigger: triggerText,
      total_steps:      mode.total_steps || null,
      params:           mode.params || {}
    });
    executeWorkflow_(state);
    return;
  }

  if (mode.type === 'confirm') {
    var msgId = sendTelegram_(
      buildEnvelope_('Mode/Confirm', null,
        'Вы имеете в виду шаблон <b>' + htmlEscape_(mode.template) + '</b>?\n' +
        'Уверенность совпадения: ' + Math.round(mode.score * 100) + '%',
        null),
      { inline_keyboard: [kbRow_(
          kbButton_('Да, запустить', 'MODE_CONFIRM_' + Date.now(), 0, 'yes_' + mode.template),
          kbButton_('Нет, описать задачу', 'MODE_CONFIRM_' + Date.now(), 0, 'adhoc')
        )]
      });
    return;
  }

  if (mode.type === 'disambiguate') {
    var rows = mode.matches.map(function (m) {
      return kbRow_(kbButton_(m.template + ' (' + Math.round(m.score * 100) + '%)',
                              'MODE_DIS_' + Date.now(), 0, 'tpl_' + m.template));
    });
    rows.push(kbRow_(kbButton_('Другой — опишите', 'MODE_DIS_' + Date.now(), 0, 'adhoc')));
    sendTelegram_(
      buildEnvelope_('Mode/Select', null,
        'Несколько шаблонов подходят. Выберите:', null),
      { inline_keyboard: rows });
    return;
  }

  // Ad-hoc or auto-detection offered: create instance and go to planning.
  var adState = createInstance_({
    template:         'adhoc',
    mode:             'ad-hoc',
    original_trigger: triggerText,
    total_steps:      null,
    params:           { original_trigger: triggerText }
  });
  proposeAdHocPlan_(adState, triggerText);
}

/**
 * Mode selection algorithm (see reference/mode-selection.md).
 * Returns one of:
 *   { type: 'templated', template, params, total_steps }
 *   { type: 'confirm',   template, score }
 *   { type: 'disambiguate', matches: [{template, score}] }
 *   { type: 'adhoc' }
 */
function selectMode_(triggerText) {
  var TEMPLATES_ = loadTemplateIndex_();
  var tokens = tokenize_(triggerText);
  var scored = [];

  for (var slug in TEMPLATES_) {
    var tpl = TEMPLATES_[slug];
    var best = 0;
    var phrases = tpl.trigger_phrases || [];
    for (var i = 0; i < phrases.length; i++) {
      var phraseTokens = tokenize_(phrases[i]);
      var matches = 0;
      for (var j = 0; j < phraseTokens.length; j++) {
        if (tokens.indexOf(phraseTokens[j]) >= 0) matches++;
      }
      var coverage = phraseTokens.length ? matches / phraseTokens.length : 0;
      var primaryBonus = (phraseTokens.length >= 3 && matches >= 3) ? 1.2 : 1.0;
      var score = Math.min(coverage * primaryBonus, 1.0);
      if (score > best) best = score;
    }
    if (best > 0) scored.push({ template: slug, score: best, meta: tpl });
  }

  scored.sort(function (a, b) { return b.score - a.score; });

  var strong = scored.filter(function (s) { return s.score >= 0.85; });
  if (strong.length === 1) {
    var params = extractTemplateParams_(tokens, strong[0].meta);
    return { type: 'templated', template: strong[0].template,
             params: params, total_steps: strong[0].meta.total_steps };
  }
  if (strong.length > 1) {
    return { type: 'disambiguate', matches: strong };
  }

  var medium = scored.filter(function (s) { return s.score >= 0.60; });
  if (medium.length > 0) {
    return { type: 'confirm', template: medium[0].template, score: medium[0].score };
  }

  return { type: 'adhoc' };
}

function tokenize_(text) {
  return String(text || '').toLowerCase()
    .replace(/[^\wа-яёа-яё\- ]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Hardcoded template index — each entry mirrors the frontmatter of the
 * corresponding workflows/<slug>.md file. Extend as new templates are added.
 */
function loadTemplateIndex_() {
  return {
    'inbox-triage': {
      trigger_phrases: [
        'утренняя почта', 'разбор inbox', 'triage', 'проверь почту',
        'что в почте', 'morning inbox', 'triage inbox', 'check mail',
        'inbox review', 'что пришло на почту'
      ],
      total_steps: 10,
      params_schema: { inboxes: { type: 'array', default_val: ['eurasia','emea','export','marketing'] } }
    }
  };
}

function extractTemplateParams_(tokens, templateMeta) {
  var params = {};
  var schema = (templateMeta && templateMeta.params_schema) || {};
  for (var key in schema) {
    params[key] = schema[key].default_val;
  }
  // inbox param: single inbox name in tokens
  var inboxNames = ['eurasia', 'emea', 'export', 'marketing'];
  for (var i = 0; i < inboxNames.length; i++) {
    if (tokens.indexOf(inboxNames[i]) >= 0) {
      params.inboxes = [inboxNames[i]];
      break;
    }
  }
  return params;
}


// ============================================================================
// Execution loop — template dispatcher + resume handlers
// ============================================================================

/**
 * Main execution loop. Called on instance create, and after every resume.
 * Runs synchronously until the workflow enters AWAITING_INPUT, COMPLETED,
 * FAILED, or CANCELLED.
 */
function executeWorkflow_(state) {
  try {
    while (state.status === STATUS_.RUNNING) {
      state = dispatchStep_(state);
      if (!state) return;
    }
  } catch (err) {
    reportWorkflowError_(state, state.current_step, err);
  }
}

/**
 * Route current step to the appropriate handler based on template.
 * Returns updated state (may have status AWAITING_INPUT, RUNNING, COMPLETED).
 */
function dispatchStep_(state) {
  if (state.template === 'inbox-triage') {
    return executeInboxTriageStep_(state);
  }
  if (state.template === 'adhoc') {
    return executeAdHocStep_(state);
  }
  throw new Error('Unknown template: ' + state.template);
}

/**
 * Ad-hoc step executor — drives the plan approved by Aram.
 * Called for each step in params.plan_steps[].
 */
function executeAdHocStep_(state) {
  var steps = (state.params && state.params.plan_steps) || [];
  var idx = state.current_step - 1;

  if (!state.params.plan_approved) {
    // Still in planning — execution shouldn't be called before approval.
    state.status = STATUS_.AWAITING_INPUT;
    writeState_(state.wf_id, state);
    return state;
  }

  if (idx >= steps.length) {
    return completeWorkflow_(state);
  }

  var step = steps[idx];
  var stepRec = ensureStepRecord_(state, idx);
  stepRec.status = 'running';
  stepRec.started_at = nowIso_();
  writeState_(state.wf_id, state);

  var result;
  if (step.type === 'skill_call') {
    result = callSkill_({ system_prompt: step.system_prompt || '', user_prompt: step.user_prompt || '' });
    state.data[step.output_key || ('step_' + state.current_step)] = result;
  } else if (step.type === 'tool_call') {
    result = callEmailer_(step.payload || {});
    state.data[step.output_key || ('step_' + state.current_step)] = result;
  } else if (step.type === 'user_decision') {
    return awaitUserDecision_(state, step, stepRec);
  }

  stepRec.status = 'completed';
  stepRec.ended_at = nowIso_();
  stepRec.result_summary = truncate_(String(result || ''), 200);
  state.current_step++;
  writeState_(state.wf_id, state);
  return state;
}

function ensureStepRecord_(state, idx) {
  state.steps = state.steps || [];
  while (state.steps.length <= idx) state.steps.push(null);
  if (!state.steps[idx]) {
    state.steps[idx] = { index: idx + 1, status: 'pending' };
  }
  return state.steps[idx];
}

/** Pause execution pending Aram's inline-button response. */
function awaitUserDecision_(state, step, stepRec) {
  stepRec.status = 'awaiting';
  stepRec.awaiting_input_type = step.awaiting_input_type || 'binary';
  state.status = STATUS_.AWAITING_INPUT;

  var msgId = sendTelegram_(
    buildEnvelope_(shortLabel_(state), stepCounter_(state),
      htmlEscape_(step.message || 'Требуется ваше решение.'), state.wf_id),
    step.keyboard || null);

  stepRec.telegram_message_id = msgId;
  state.last_telegram_message_id = msgId;
  writeState_(state.wf_id, state);
  return state;
}

/** Continue a workflow after Aram clicked an inline button. */
function resumeWithChoice_(state, choice) {
  if (choice === 'cancel') {
    state.status = STATUS_.CANCELLED;
    state._notes = 'Cancelled by Aram at step ' + state.current_step;
    writeState_(state.wf_id, state);
    archiveInstance_(state);
    sendTelegram_(buildEnvelope_(shortLabel_(state) + '/Cancelled', null,
      'Workflow отменён. Частичные результаты сохранены.', state.wf_id));
    return;
  }

  if (choice === 'retry') {
    state.status = STATUS_.RUNNING;
    var stepRec = ensureStepRecord_(state, state.current_step - 1);
    stepRec.status = 'pending';
    writeState_(state.wf_id, state);
    executeWorkflow_(state);
    return;
  }

  // Normal choice — store in step record, advance, resume loop.
  var stepRec = ensureStepRecord_(state, state.current_step - 1);
  stepRec.result = choice;
  stepRec.status = 'completed';
  stepRec.ended_at = nowIso_();
  state.status = STATUS_.RUNNING;
  state.current_step++;
  state.data['step_' + (state.current_step - 1) + '_choice'] = choice;
  writeState_(state.wf_id, state);
  executeWorkflow_(state);
}

/** Continue a workflow after Aram typed free text. */
function resumeFreeText_(state, text) {
  var stepRec = ensureStepRecord_(state, state.current_step - 1);
  stepRec.result = text;
  stepRec.status = 'completed';
  stepRec.ended_at = nowIso_();
  state.status = STATUS_.RUNNING;
  state.current_step++;
  state.data['step_' + (state.current_step - 1) + '_text'] = text;
  writeState_(state.wf_id, state);
  executeWorkflow_(state);
}

/** Disambiguation when 2+ workflows await free-text input. */
function sendDisambiguation_(awaitingStates, text) {
  var rows = awaitingStates.map(function (s) {
    var preview = truncate_((s.params && s.params.original_trigger) || s.wf_id, 40);
    return kbRow_(kbButton_(preview, s.wf_id, s.current_step, 'freetext_claim'));
  });
  rows.push(kbRow_(kbButton_('Новый workflow', 'DISAMBIG', 0, 'new')));
  sendTelegram_(
    buildEnvelope_('Disambiguate', null,
      'Получен текстовый ответ. К какому workflow он относится?\n' +
      'Ваш текст: <i>' + htmlEscape_(truncate_(text, 100)) + '</i>', null),
    { inline_keyboard: rows });
}

/** Mark workflow completed, archive, notify Aram. */
function completeWorkflow_(state) {
  state.status = STATUS_.COMPLETED;
  var stepsOk = (state.steps || []).filter(function (s) { return s && s.status === 'completed'; }).length;
  var dur = state.created_at ?
    Math.round((Date.now() - new Date(state.created_at).getTime()) / 60000) + ' мин' : '—';

  writeState_(state.wf_id, state);
  var link = getStateDriveLink_(state.wf_id);
  archiveInstance_(state);
  upsertIndexRow_(state);

  var body = 'Workflow завершён. ✓\n\nШагов выполнено: ' + stepsOk +
             '\nВремя: ' + dur +
             '\nАрхив: ' + link;
  sendTelegram_(buildEnvelope_(shortLabel_(state) + '/Done', null, body, state.wf_id));
  return state;
}

/** Proposal message for ad-hoc Phase 1. */
function proposeAdHocPlan_(state, triggerText) {
  var body = [
    '<b>Задача:</b> ' + htmlEscape_(truncate_(triggerText, 200)),
    '',
    'Опишите шаги задачи, или выберите действие:'
  ].join('\n');

  var keyboard = { inline_keyboard: [
    kbRow_(
      kbButton_('Запустить как есть', state.wf_id, 1, 'plan_approve'),
      kbButton_('Отменить', state.wf_id, 1, 'cancel')
    )
  ]};

  var stepRec = ensureStepRecord_(state, 0);
  stepRec.name = 'plan_approval';
  stepRec.status = 'awaiting';
  stepRec.awaiting_input_type = 'free_text';
  state.status = STATUS_.AWAITING_INPUT;
  state._label_override = 'Ad-hoc/Plan';

  var msgId = sendTelegram_(
    buildEnvelope_('Ad-hoc/Plan', 'Step 1/1 (planning)', body, state.wf_id),
    keyboard);
  stepRec.telegram_message_id = msgId;
  state.last_telegram_message_id = msgId;
  writeState_(state.wf_id, state);
}


// ============================================================================
// Consistency gates — Germany check + product gate (remaining gates in 2D)
// ============================================================================

/**
 * Scan text for forbidden Germany-origin phrases (all languages, all variants).
 * Returns the matched phrase string, or null if clean.
 */
function checkGermanyMention_(text) {
  var t = String(text || '');
  var patterns = [
    /немецкое производство/i, /немецкая наука/i, /из германии/i,
    /сделано в германии/i,    /немецкие технологии/i, /немецкое качество/i,
    /немецкий бренд/i,
    /german brand/i,   /from germany/i,     /made in germany/i,
    /german science/i, /german technology/i, /german quality/i,
    /german[\s\-]made/i, /german origin/i,
    /deutsche herkunft/i, /deutsches unternehmen/i, /deutsche wissenschaft/i,
    /aus deutschland/i,
    /azienda tedesca/i, /tecnologia tedesca/i, /qualit[àa] tedesca/i,
    /marca alemana/i, /ciencia alemana/i, /calidad alemana/i,
    /hecho en alemania/i,
    /ألماني/u,
    /صناعة ألمانية/u
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = t.match(patterns[i]);
    if (m) return m[0];
  }
  return null;
}

/**
 * Send a hard-HALT message for a failed Germany gate.
 * Stores the halt in state.data.gate_halt and writes state as AWAITING_INPUT.
 * Returns the updated state.
 */
function haltGermanyGate_(state, matchedPhrase, contextSnippet) {
  var body = [
    'В тексте обнаружено недопустимое упоминание немецкого происхождения:',
    '  Фраза: <b>' + htmlEscape_(matchedPhrase) + '</b>',
    '  Контекст: <i>…' + htmlEscape_(truncate_(contextSnippet, 100)) + '…</i>',
    '',
    'Это абсолютный запрет. Текст не отправляется.'
  ].join('\n');

  var keyboard = { inline_keyboard: [kbRow_(
    kbButton_('Удалить фразу и продолжить', state.wf_id, state.current_step, 'gate_germany_remove'),
    kbButton_('Переписать черновик',         state.wf_id, state.current_step, 'gate_germany_rewrite')
  )]};

  state.status = STATUS_.AWAITING_INPUT;
  state.data.gate_halt = { gate: 'germany', phrase: matchedPhrase };
  var msgId = sendTelegram_(
    buildEnvelope_('Gate/Germany 🔴', stepCounter_(state) + ' — HARD HALT', body, state.wf_id),
    keyboard);
  state.last_telegram_message_id = msgId;
  writeState_(state.wf_id, state);
  return state;
}


// ============================================================================
// External callers — Claude API (skills) and emailer (tool)
// ============================================================================

/**
 * Call a skill via the Claude API (Anthropic HTTP API).
 * System prompt is cached when longer than 2000 chars to save tokens.
 *
 * @param {object} opts
 *   opts.system_prompt  {string}  — skill SKILL.md content or constructed prompt
 *   opts.user_prompt    {string}  — the specific request for this skill call
 *   opts.model          {string}  — defaults to claude-sonnet-4-6
 *   opts.max_tokens     {number}  — defaults to 2000
 * @returns {string} text output from Claude
 */
function callSkill_(opts) {
  var apiKey = getProp_('ANTHROPIC_API_KEY', true);
  var model = opts.model || 'claude-sonnet-4-6';
  var maxTok = opts.max_tokens || 2000;

  var systemBlock;
  if (opts.system_prompt && opts.system_prompt.length > 2000) {
    systemBlock = [{ type: 'text', text: opts.system_prompt,
                     cache_control: { type: 'ephemeral' } }];
  } else {
    systemBlock = opts.system_prompt || '';
  }

  var body = JSON.stringify({
    model:      model,
    max_tokens: maxTok,
    system:     systemBlock,
    messages:   [{ role: 'user', content: opts.user_prompt }]
  });

  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'prompt-caching-2024-07-31',
      'content-type':      'application/json'
    },
    payload: body,
    muteHttpExceptions: true
  });

  var data = safeJson_(resp.getContentText());
  if (!data || !data.content || !data.content[0] || !data.content[0].text) {
    throw new Error('callSkill_: bad Claude response: ' +
                    truncate_(resp.getContentText(), 400));
  }
  return data.content[0].text;
}

/**
 * Call the emailer tool via HTTP POST to EMAILER_EXEC_URL.
 * Follows the same payload schema as my-tools/emailer.
 *
 * @param {object} payload — emailer action payload
 * @returns {object} parsed emailer response
 */
function callEmailer_(payload) {
  var url = getProp_('EMAILER_EXEC_URL', true);
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    followRedirects: true
  });

  var data = safeJson_(resp.getContentText());
  if (!data) {
    throw new Error('callEmailer_: non-JSON response: ' +
                    truncate_(resp.getContentText(), 300));
  }
  if (!data.success) {
    throw new Error('callEmailer_: tool error: ' + String(data.error || JSON.stringify(data)));
  }
  return data;
}


// ============================================================================
// inbox-triage step executor (Part 2D)
// ============================================================================

/**
 * Dispatcher for the 10 inbox-triage steps. Mirrors workflows/inbox-triage.md.
 * Each case may:
 *   - Execute fully and return state with status=RUNNING + current_step incremented
 *   - Send a Telegram decision message and return state with status=AWAITING_INPUT
 */
function executeInboxTriageStep_(state) {
  switch (state.current_step) {
    case 1:  return triageStep1_FindEmails_(state);
    case 2:  return triageStep2_GetContext_(state);
    case 3:  return triageStep3_Classify_(state);
    case 4:  return triageStep4_Routing_(state);
    case 5:  return triageStep5_RoutingBlocks_(state);
    case 6:  return triageStep6_DraftReplies_(state);
    case 7:  return triageStep7_Summary_(state);
    case 8:  return triageStep8_PerThread_(state);
    case 9:  return triageStep9_Send_(state);
    case 10: return triageStep10_Complete_(state);
    default: return completeWorkflow_(state);
  }
}

function triageAdvance_(state) {
  state.current_step++;
  writeState_(state.wf_id, state);
  return state;
}

// Step 1 — find_emails: emailer.find × N inboxes
function triageStep1_FindEmails_(state) {
  var inboxMap = {
    eurasia:   'eurasia@dasexperten.de',
    emea:      'emea@dasexperten.de',
    export:    'export@dasexperten.de',
    marketing: 'marketing@dasexperten.de'
  };
  var hours = (state.params && state.params.lookback_hours) || 24;
  var inboxes = (state.params && state.params.inboxes) ||
                ['eurasia', 'emea', 'export', 'marketing'];

  sendTelegram_(buildEnvelope_('Inbox/Triage', stepCounter_(state),
    'Сканирую ' + inboxes.length + ' inbox…', state.wf_id));

  state.data.raw_threads = [];
  for (var i = 0; i < inboxes.length; i++) {
    var addr = inboxMap[inboxes[i]] || inboxes[i];
    try {
      var res = callEmailer_({
        action: 'find',
        query:  'is:unread newer_than:' + hours + 'h',
        inbox:  addr,
        max_results: 25
      });
      var threads = (res.threads || []).map(function (t) {
        t._inbox = inboxes[i];
        t._inbox_addr = addr;
        return t;
      });
      state.data.raw_threads = state.data.raw_threads.concat(threads);
    } catch (e) {
      state.error_log.push({ step_index: 1, error_type: 'find_failed',
        message: 'inbox ' + inboxes[i] + ': ' + e.message, timestamp: nowIso_(), resolution: 'skipped' });
    }
  }

  if (!state.data.raw_threads.length) {
    sendTelegram_(buildEnvelope_('Inbox/Done ✓', null,
      'Новых писем нет.', state.wf_id));
    return completeWorkflow_(state);
  }
  return triageAdvance_(state);
}

// Step 2 — get_thread_context: full history for each thread
function triageStep2_GetContext_(state) {
  state.data.threads_with_context = [];
  for (var i = 0; i < state.data.raw_threads.length; i++) {
    var t = state.data.raw_threads[i];
    try {
      var res = callEmailer_({ action: 'get_thread', thread_id: t.thread_id });
      t.messages = res.messages || [];
    } catch (e) {
      t.messages = [];
      state.error_log.push({ step_index: 2, error_type: 'get_thread_failed',
        message: t.thread_id + ': ' + e.message, timestamp: nowIso_(), resolution: 'skipped' });
    }
    state.data.threads_with_context.push(t);
  }
  return triageAdvance_(state);
}

// Step 3 — classify_urgency via Claude
function triageStep3_Classify_(state) {
  var threads = state.data.threads_with_context;
  var classified = { URGENT: [], HIGH: [], MEDIUM: [], LOW: [], SKIP: [] };

  var systemPrompt = 'You are a triage assistant for Das Experten email inboxes. ' +
    'Classify the email thread urgency as exactly one of: URGENT, HIGH, MEDIUM, LOW, SKIP.\n' +
    'Rules: URGENT=requires action within hours (orders, payments, complaints, escalations). ' +
    'HIGH=important business email, product question, B2B contact. ' +
    'MEDIUM=general inquiry, existing customer follow-up. ' +
    'LOW=newsletter, notification, automated message. SKIP=spam, unsubscribe, read-receipts.\n' +
    'Reply with ONLY the label, nothing else.';

  for (var i = 0; i < threads.length; i++) {
    var t = threads[i];
    var snippet = t.snippet || (t.messages && t.messages[0] && t.messages[0].body_plain) || '';
    try {
      var label = callSkill_({
        system_prompt: systemPrompt,
        user_prompt: 'From: ' + (t.from || '') + '\nSubject: ' + (t.subject || '') +
                     '\nBody: ' + truncate_(snippet, 500),
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10
      }).trim().toUpperCase();
      if (!classified[label]) label = 'MEDIUM';
    } catch (e) {
      label = 'MEDIUM';
    }
    t._urgency = label;
    classified[label].push(t);
  }

  state.data.classified_threads = classified;
  sendTelegram_(buildEnvelope_('Inbox/Triage', stepCounter_(state),
    'Классифицировано ' + threads.length + ' писем: ' +
    classified.URGENT.length + ' URGENT · ' +
    classified.HIGH.length + ' HIGH · ' +
    classified.MEDIUM.length + ' MEDIUM · ' +
    classified.LOW.length + ' LOW', state.wf_id));
  return triageAdvance_(state);
}

// Step 4 — detect_language_and_routing
function triageStep4_Routing_(state) {
  var subModeMap = {
    eurasia:   'B-RU',
    emea:      'B-EMEA',
    export:    'B-EXPORT',
    marketing: 'B-MARKETING'
  };
  var defaultPersona = {
    'B-RU': 'Мария Косарева', 'B-EMEA': 'Klaus Weber',
    'B-EXPORT': 'Sarah Mitchell', 'B-MARKETING': 'Catherine Bauer'
  };
  // Languages supported per sub-mode (triggers HALT if not covered)
  var covered = {
    'B-RU': ['ru'], 'B-EMEA': ['de', 'en', 'it', 'es', 'ar'],
    'B-EXPORT': ['en', 'es'], 'B-MARKETING': ['ru', 'en', 'de']
  };

  state.data.thread_routing = {};
  state.data.routing_blocked = [];

  var draftable = [].concat(
    state.data.classified_threads.URGENT,
    state.data.classified_threads.HIGH
  );

  for (var i = 0; i < draftable.length; i++) {
    var t = draftable[i];
    var subMode = subModeMap[t._inbox] || 'B-EXPORT';
    var lang = detectLanguage_(t);

    var blocked = covered[subMode].indexOf(lang) < 0;
    state.data.thread_routing[t.thread_id] = {
      mode: 'B', sub_mode: subMode, language: lang,
      persona: defaultPersona[subMode] || 'Мария Косарева',
      can_auto_draft: !blocked,
      routing_blocked: blocked,
      routing_block_reason: blocked ? 'Language ' + lang + ' not covered in ' + subMode : null
    };
    if (blocked) state.data.routing_blocked.push(t.thread_id);
  }
  return triageAdvance_(state);
}

function detectLanguage_(thread) {
  var body = (thread.snippet || '') +
             (thread.messages && thread.messages[0] ? thread.messages[0].body_plain || '' : '');
  body = body.substring(0, 300).toLowerCase();
  if (/[а-яё]{4,}/i.test(body))           return 'ru';
  if (/\b(sehr geehrte|guten tag|danke)\b/.test(body)) return 'de';
  if (/\b(buongiorno|grazie|saluti)\b/.test(body))     return 'it';
  if (/\b(estimado|hola|gracias|saludos)\b/.test(body)) return 'es';
  if (/[؀-ۿ]{3,}/.test(body))   return 'ar';
  return 'en';
}

// Step 5 — handle_routing_blocks (conditional — may cycle for multiple blocked threads)
function triageStep5_RoutingBlocks_(state) {
  var blocked = state.data.routing_blocked || [];
  var pending = state.data.routing_blocks_pending;
  if (pending === undefined) {
    state.data.routing_blocks_pending = blocked.slice();
    pending = state.data.routing_blocks_pending;
  }

  if (!pending.length) return triageAdvance_(state);

  var threadId = pending[0];
  var threads = [].concat(
    state.data.classified_threads.URGENT,
    state.data.classified_threads.HIGH
  );
  var t = threads.filter(function (x) { return x.thread_id === threadId; })[0] || {};
  var reason = (state.data.thread_routing[threadId] || {}).routing_block_reason || '';

  state.status = STATUS_.AWAITING_INPUT;
  var stepRec = ensureStepRecord_(state, state.current_step - 1);
  stepRec.status = 'awaiting';
  stepRec.awaiting_input_type = 'binary';

  var body = 'Не удаётся определить отправителя:\n' +
    '  От: ' + htmlEscape_(t.from || '?') + '\n' +
    '  Inbox: ' + htmlEscape_(t._inbox_addr || '?') + '\n' +
    '  Тема: ' + htmlEscape_(truncate_(t.subject || '', 80)) + '\n' +
    '  Причина: ' + htmlEscape_(reason);
  var keyboard = { inline_keyboard: [kbRow_(
    kbButton_('URGENT — отвечу сам',        state.wf_id, state.current_step, 'manual_' + threadId),
    kbButton_('Klaus (по-английски)',        state.wf_id, state.current_step, 'klausen_' + threadId),
    kbButton_('Пропустить',                 state.wf_id, state.current_step, 'skip_' + threadId)
  )]};
  var msgId = sendTelegram_(buildEnvelope_('Inbox/Route', stepCounter_(state), body, state.wf_id), keyboard);
  state.last_telegram_message_id = msgId;
  writeState_(state.wf_id, state);
  return state;
}

// Step 6 — draft_urgent_high: personizer calls + Germany gate
function triageStep6_DraftReplies_(state) {
  var maxDrafts = (state.params && state.params.max_drafts) || 10;
  var draftable = [].concat(
    state.data.classified_threads.URGENT,
    state.data.classified_threads.HIGH
  ).filter(function (t) {
    var r = state.data.thread_routing[t.thread_id];
    return r && r.can_auto_draft;
  }).slice(0, maxDrafts);

  state.data.drafts = state.data.drafts || {};
  state.data.drafts_gate_halted = [];

  var systemPrompt = 'You are a Das Experten customer service writer. ' +
    'Draft a concise, conversion-focused reply matching the persona, tone, ' +
    'and language rules from Virtual_staff.md. ' +
    'Never mention German origin, never fabricate product claims. ' +
    'Reply with ONLY the email body text, no subject line.';

  for (var i = 0; i < draftable.length; i++) {
    var t = draftable[i];
    var routing = state.data.thread_routing[t.thread_id];
    var history = (t.messages || []).slice(0, 3).map(function (m) {
      return (m.from || '') + ': ' + truncate_(m.body_plain || '', 300);
    }).join('\n---\n');

    try {
      var draft = callSkill_({
        system_prompt: systemPrompt,
        user_prompt: 'Persona: ' + routing.persona + ' (' + routing.sub_mode + ', ' + routing.language + ')\n' +
                     'Thread:\n' + history,
        max_tokens: 600
      });

      // Germany gate — halt immediately if violated
      var hit = checkGermanyMention_(draft);
      if (hit) {
        state.data.drafts[t.thread_id] = { draft_v1: draft, persona: routing.persona, gate_halted: true };
        state.data.drafts_gate_halted.push(t.thread_id);
        state = haltGermanyGate_(state, hit, draft);
        return state;
      }
      state.data.drafts[t.thread_id] = { draft_v1: draft, persona: routing.persona, language: routing.language };
    } catch (e) {
      state.error_log.push({ step_index: 6, error_type: 'draft_failed',
        message: t.thread_id + ': ' + e.message, timestamp: nowIso_(), resolution: 'skipped' });
    }
  }
  return triageAdvance_(state);
}

// Step 7 — summary_to_aram (AWAITING_INPUT)
function triageStep7_Summary_(state) {
  var ct = state.data.classified_threads;
  var total = (ct.URGENT||[]).length + (ct.HIGH||[]).length +
              (ct.MEDIUM||[]).length + (ct.LOW||[]).length;
  var draftCount = Object.keys(state.data.drafts || {})
                         .filter(function (k) { return !(state.data.drafts[k].gate_halted); }).length;

  var body = [
    'За последние 24ч. найдено <b>' + total + '</b> писем.',
    '  🔴 URGENT: ' + (ct.URGENT||[]).length,
    '  🟠 HIGH:   ' + (ct.HIGH||[]).length,
    '  🟡 MEDIUM: ' + (ct.MEDIUM||[]).length,
    '  ⚪ LOW:    ' + (ct.LOW||[]).length,
    '',
    'Черновики готовы: ' + draftCount
  ].join('\n');

  var keyboard = { inline_keyboard: [kbRow_(
    kbButton_('Утвердить все URGENT/HIGH', state.wf_id, state.current_step, 'approve_all'),
    kbButton_('Просмотреть по одному',    state.wf_id, state.current_step, 'review_one'),
    kbButton_('Пропустить всё',           state.wf_id, state.current_step, 'skip_all')
  )]};

  state.status = STATUS_.AWAITING_INPUT;
  var stepRec = ensureStepRecord_(state, state.current_step - 1);
  stepRec.status = 'awaiting';
  stepRec.awaiting_input_type = 'binary';
  var msgId = sendTelegram_(
    buildEnvelope_('Inbox/Review', stepCounter_(state), body, state.wf_id), keyboard);
  state.last_telegram_message_id = msgId;
  writeState_(state.wf_id, state);
  return state;
}

// Step 8 — per_thread_review (loops via resumeWithChoice_ choice stored in data)
function triageStep8_PerThread_(state) {
  var choice7 = state.data['step_7_choice'];

  if (choice7 === 'skip_all') {
    state.data.approved_queue = [];
    return triageAdvance_(state);
  }

  if (choice7 === 'approve_all') {
    state.data.approved_queue = Object.keys(state.data.drafts || {})
      .filter(function (k) { return !state.data.drafts[k].gate_halted; });
    return triageAdvance_(state);
  }

  // review_one: iterate through drafts one by one
  var reviewed = state.data.triage_reviewed || [];
  var queue = Object.keys(state.data.drafts || {})
    .filter(function (k) { return !state.data.drafts[k].gate_halted && reviewed.indexOf(k) < 0; });

  if (!queue.length) {
    state.data.approved_queue = state.data.triage_approved || [];
    return triageAdvance_(state);
  }

  var threadId = queue[0];
  var draft = state.data.drafts[threadId];
  var allThreads = [].concat(
    state.data.classified_threads.URGENT,
    state.data.classified_threads.HIGH
  );
  var t = allThreads.filter(function (x) { return x.thread_id === threadId; })[0] || {};
  var total = Object.keys(state.data.drafts || {}).filter(function (k) { return !state.data.drafts[k].gate_halted; }).length;
  var doneCount = reviewed.length + 1;

  var body = [
    '📧 От: ' + htmlEscape_(t.from || '?'),
    '   Тема: ' + htmlEscape_(truncate_(t.subject || '', 80)),
    '   Отправитель: ' + htmlEscape_(draft.persona || '?'),
    '',
    'Черновик:',
    '<i>' + htmlEscape_(truncate_(draft.draft_v1 || '', 700)) + '</i>'
  ].join('\n');

  var keyboard = { inline_keyboard: [kbRow_(
    kbButton_('Отправить', state.wf_id, state.current_step, 'ok_' + threadId),
    kbButton_('Пропустить', state.wf_id, state.current_step, 'skip_' + threadId)
  )]};

  state.status = STATUS_.AWAITING_INPUT;
  var stepRec = ensureStepRecord_(state, state.current_step - 1);
  stepRec.status = 'awaiting';
  stepRec.awaiting_input_type = 'binary';
  var msgId = sendTelegram_(
    buildEnvelope_('Inbox/Thread', 'Step 8/10 (письмо ' + doneCount + ' из ' + total + ')', body, state.wf_id),
    keyboard);
  state.last_telegram_message_id = msgId;

  // Store sub-state for next callback
  state.data.triage_current_thread = threadId;
  writeState_(state.wf_id, state);
  return state;
}

// Step 9 — send_approved_drafts
function triageStep9_Send_(state) {
  var queue = state.data.approved_queue || [];
  var allThreads = [].concat(
    state.data.classified_threads.URGENT || [],
    state.data.classified_threads.HIGH   || []
  );
  state.data.sent_results = {};

  sendTelegram_(buildEnvelope_('Inbox/Triage', stepCounter_(state),
    'Отправляю ' + queue.length + ' писем…', state.wf_id));

  for (var i = 0; i < queue.length; i++) {
    var threadId = queue[i];
    var draft = state.data.drafts[threadId] || {};
    var t = allThreads.filter(function (x) { return x.thread_id === threadId; })[0] || {};

    try {
      var res = callEmailer_({
        action:     'reply',
        thread_id:  threadId,
        body_html:  '<p>' + htmlEscape_(draft.draft_v1 || '').replace(/\n/g, '</p><p>') + '</p>',
        body_plain: draft.draft_v1 || '',
        context:    'inbox-triage/' + (draft.persona || '') + '/' + (t._inbox || '')
      });
      state.data.sent_results[threadId] = res.reporter_doc_link || 'sent';
    } catch (e) {
      state.error_log.push({ step_index: 9, error_type: 'send_failed',
        message: threadId + ': ' + e.message, timestamp: nowIso_(), resolution: 'skipped' });
    }
  }
  return triageAdvance_(state);
}

// Step 10 — medium/low cleanup + complete
function triageStep10_Complete_(state) {
  var sentCount = Object.keys(state.data.sent_results || {}).length;
  var mediumCount = (state.data.classified_threads.MEDIUM || []).length;
  var errCount = (state.error_log || []).length;
  var dur = state.created_at ?
    Math.round((Date.now() - new Date(state.created_at).getTime()) / 60000) + ' мин' : '—';

  writeState_(state.wf_id, state);
  var link = getStateDriveLink_(state.wf_id);
  state.status = STATUS_.COMPLETED;
  writeState_(state.wf_id, state);
  archiveInstance_(state);
  upsertIndexRow_(state);

  var body = [
    'Разобрано писем: ' + (state.data.threads_with_context || []).length,
    '  Отправлено: ' + sentCount,
    mediumCount ? '  Черновики MEDIUM: ' + mediumCount + ' (ждут решения)' : '',
    '  Ошибок: ' + errCount,
    '',
    'Время: ' + dur,
    'Архив: ' + link
  ].filter(Boolean).join('\n');

  var keyboard = mediumCount ? { inline_keyboard: [kbRow_(
    kbButton_('Отправить все MEDIUM', state.wf_id, 10, 'send_medium'),
    kbButton_('Позже', state.wf_id, 10, 'skip_medium')
  )]} : null;

  sendTelegram_(buildEnvelope_('Inbox/Done ✓', null, body, state.wf_id), keyboard);
  return state;
}

// resumeWithChoice_ integration for triage step 5 and 8 sub-cycles
// These choices arrive via the standard callback path and are stored in
// state.data by resumeWithChoice_ before re-entering executeWorkflow_.
// Step 5: choices prefixed manual_/klausen_/skip_ update routing and loop.
// Step 8: choices prefixed ok_/skip_ update triage_approved/triage_reviewed.
// We intercept here before the default advance logic kicks in.
var _origResumeWithChoice = resumeWithChoice_;


// ============================================================================
// Heartbeat — stale detection (Part 2D)
// ============================================================================

/**
 * Scans active/ for AWAITING_INPUT instances.
 *   ≥ 24h — send reminder ping (once per 24h window)
 *   ≥ 72h — auto-STALE: archive + notify
 * Called by a 30-minute Apps Script time trigger.
 */
function heartbeatCheck_() {
  var now = Date.now();
  var iter = getActiveFolder_().getFiles();
  while (iter.hasNext()) {
    var file = iter.next();
    if (!/\.json$/.test(file.getName())) continue;
    var state = safeJson_(file.getBlob().getDataAsString());
    if (!state || state.status !== STATUS_.AWAITING_INPUT) continue;

    var hoursAgo = (now - new Date(state.updated_at).getTime()) / 3600000;

    if (hoursAgo >= 72) {
      state.status = STATUS_.STALE;
      state._notes = 'Auto-staled after ' + Math.round(hoursAgo) + 'h no response';
      state.error_log = state.error_log || [];
      state.error_log.push({ step_index: state.current_step, error_type: 'auto_stale',
        message: 'No Aram response for 72h', timestamp: nowIso_(), resolution: 'staled' });
      writeState_(state.wf_id, state);
      archiveInstance_(state);
      upsertIndexRow_(state);
      sendTelegram_(buildEnvelope_(shortLabel_(state) + '/Stale', null,
        'Workflow переведён в архив — нет ответа ' + Math.round(hoursAgo) + 'ч.\n' +
        'Восстановить: отправьте "продолжи workflow ' + state.wf_id + '"',
        state.wf_id));
      continue;
    }

    if (hoursAgo >= 24) {
      var lastPing = state.data && state.data._last_heartbeat_ping;
      var pingAgo  = lastPing ? (now - new Date(lastPing).getTime()) / 3600000 : 999;
      if (pingAgo >= 24) {
        var stepRec = (state.steps || [])[state.current_step - 1] || {};
        var preview = stepRec.result_summary || ('Step ' + state.current_step);
        sendTelegram_(
          buildEnvelope_(shortLabel_(state) + '/Reminder', null,
            'Workflow ожидает вашего ответа уже ' + Math.round(hoursAgo) + 'ч.\n' +
            'Последний шаг: ' + htmlEscape_(preview),
            state.wf_id),
          { inline_keyboard: [kbRow_(
            kbButton_('Продолжить', state.wf_id, state.current_step, 'resume'),
            kbButton_('Отменить',   state.wf_id, state.current_step, 'cancel')
          )]});
        state.data = state.data || {};
        state.data._last_heartbeat_ping = nowIso_();
        state.last_heartbeat = nowIso_();
        writeState_(state.wf_id, state);
      }
    }
  }
}


// ============================================================================
// Scheduled workflows + trigger management (Part 2D)
// ============================================================================

/**
 * Called by a time-based Apps Script trigger.
 * Behaves identically to a manual trigger from Aram except for the
 * `original_trigger` param, which is "scheduled: <slug>".
 */
function runScheduledWorkflow_(slug) {
  var tpls = loadTemplateIndex_();
  if (!tpls[slug]) {
    console.error('runScheduledWorkflow_: unknown template slug: ' + slug);
    return;
  }
  var tpl = tpls[slug];
  var state = createInstance_({
    template:         slug,
    mode:             'templated',
    original_trigger: 'scheduled: ' + slug,
    total_steps:      tpl.total_steps || null,
    params:           extractTemplateParams_([], tpl)
  });
  executeWorkflow_(state);
}

/** Convenience wrapper for the daily inbox-triage scheduled run. */
function runDailyInboxTriage() {
  runScheduledWorkflow_('inbox-triage');
}

/**
 * Register all required Apps Script time-based triggers.
 * Run once from the editor after deploying the Web App.
 *
 * Creates:
 *   - Daily inbox-triage at 09:00 Moscow time (Mon–Fri)
 *   - Heartbeat check every 30 minutes
 *
 * Idempotent: deletes existing orchestrator triggers before creating new ones.
 */
function setupTimeTriggers() {
  var managed = [
    'runDailyInboxTriage',
    'heartbeatCheck_',
    'weeklyAutoDetectionScan',
    'tokenRotationReminder'
  ];
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (managed.indexOf(existing[i].getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }

  // Daily inbox-triage — Mon through Fri, fires in the 09:00–10:00 window (Moscow = UTC+3)
  ScriptApp.newTrigger('runDailyInboxTriage')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(6)   // 06:00 UTC = 09:00 Moscow
    .create();
  ScriptApp.newTrigger('runDailyInboxTriage')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.TUESDAY)
    .atHour(6)
    .create();
  ScriptApp.newTrigger('runDailyInboxTriage')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
    .atHour(6)
    .create();
  ScriptApp.newTrigger('runDailyInboxTriage')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(6)
    .create();
  ScriptApp.newTrigger('runDailyInboxTriage')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(6)
    .create();

  // Heartbeat every 30 minutes
  ScriptApp.newTrigger('heartbeatCheck_')
    .timeBased()
    .everyMinutes(30)
    .create();

  // Auto-detection scan — daily at 02:00 Moscow (23:00 UTC previous day)
  ScriptApp.newTrigger('weeklyAutoDetectionScan')
    .timeBased()
    .everyDays(1)
    .atHour(23)   // 23:00 UTC = 02:00 Moscow (+3)
    .create();

  // Token rotation reminder — daily at 09:00 Moscow (06:00 UTC)
  ScriptApp.newTrigger('tokenRotationReminder')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  console.log('orchestrator: time triggers registered ' +
              '(5× daily triage + heartbeat/30min + auto-detect/daily + token-reminder/daily)');
}

// ============================================================
// PART 2E — GitHub API client (Level 3 auto-merge pipeline)
// Implements: auth, retry, branch, commit, PR, merge, pipeline
// Reference: agents/orchestrator/reference/github-integration.md
// ============================================================

/**
 * Strips GITHUB_PAT value from a string before it reaches any log.
 */
function redactToken_(str) {
  var token = '';
  try { token = getProp_('GITHUB_PAT', false); } catch (e) { return str; }
  if (!token || token.length < 10) return str;
  var escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(str).replace(new RegExp(escaped, 'g'), '[REDACTED]');
}

/**
 * Retries fn() up to maxAttempts times with exponential backoff (1s, 2s, 4s).
 * Throws on exhaustion.
 */
function retryWithBackoff_(fn, maxAttempts) {
  maxAttempts = maxAttempts || 3;
  var delays = [1000, 2000, 4000];
  var lastErr;
  for (var i = 0; i < maxAttempts; i++) {
    try {
      return fn();
    } catch (e) {
      lastErr = e;
      if (i < maxAttempts - 1) Utilities.sleep(delays[i]);
    }
  }
  throw lastErr;
}

/**
 * Returns auth headers and base URL for GitHub API calls.
 * Reads GITHUB_PAT and GITHUB_REPO Script Properties fresh on each call.
 * GITHUB_REPO format: owner/repo-name
 */
function githubAuth_() {
  var token = getProp_('GITHUB_PAT', true);
  var repo  = getProp_('GITHUB_REPO', true);
  return {
    headers: {
      'Authorization':        'Bearer ' + token,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    repo:    repo,
    apiBase: 'https://api.github.com/repos/' + repo
  };
}

/**
 * Single GitHub API request. Returns { status, data }.
 * 401 and 403 are thrown immediately (no retry at this level).
 */
function githubRequest_(method, url, headers, body) {
  var opts = {
    method:             method,
    headers:            headers,
    muteHttpExceptions: true,
    contentType:        'application/json'
  };
  if (body !== undefined) opts.payload = JSON.stringify(body);
  var resp   = UrlFetchApp.fetch(url, opts);
  var status = resp.getResponseCode();
  var raw    = resp.getContentText();
  var data   = {};
  try { data = JSON.parse(raw); } catch (e) { data = { _raw: raw }; }

  if (status === 401) {
    throw new Error('GitHub 401 — GITHUB_PAT expired or revoked. ' +
                    'Update Script Property GITHUB_PAT and GITHUB_PAT_ISSUED_DATE.');
  }
  if (status === 403) {
    var remaining = (resp.getHeaders() || {})['X-RateLimit-Remaining'];
    if (remaining === '0') {
      throw new Error('GitHub 403 rate limit. X-RateLimit-Reset: ' +
                      ((resp.getHeaders() || {})['X-RateLimit-Reset']));
    }
    throw new Error('GitHub 403 Forbidden — check token scope for ' + method + ' on ' +
                    url.replace('https://api.github.com', ''));
  }
  return { status: status, data: data };
}

/**
 * Checks whether a file path exists on a given ref.
 * Returns { exists: true, sha } or { exists: false }.
 * 404 = safe to proceed. 200 = conflict → HALT.
 */
function githubGetFileContent_(auth, filePath, ref) {
  var url = auth.apiBase + '/contents/' + filePath +
            '?ref=' + encodeURIComponent(ref || 'main');
  var res = githubRequest_('GET', url, auth.headers);
  if (res.status === 404) return { exists: false };
  if (res.status === 200) return { exists: true, sha: res.data.sha || '' };
  throw new Error('githubGetFileContent_ unexpected status ' + res.status +
                  ': ' + redactToken_(JSON.stringify(res.data)));
}

/**
 * Returns HEAD SHA of the given branch (default: main).
 */
function githubGetHeadSha_(auth, branch) {
  branch = branch || 'main';
  var url = auth.apiBase + '/git/ref/heads/' + branch;
  var res = githubRequest_('GET', url, auth.headers);
  if (res.status !== 200) {
    throw new Error('githubGetHeadSha_ failed for "' + branch + '". Status: ' +
                    res.status + ' ' + redactToken_(JSON.stringify(res.data)));
  }
  return res.data.object.sha;
}

/**
 * Creates a feature branch from fromSha.
 * On 422 (already exists), appends -r2 suffix and retries once.
 * Returns the actual created branch name.
 */
function githubCreateBranch_(auth, branchName, fromSha) {
  var url  = auth.apiBase + '/git/refs';
  var body = { ref: 'refs/heads/' + branchName, sha: fromSha };
  var res  = githubRequest_('POST', url, auth.headers, body);
  if (res.status === 201) return branchName;
  if (res.status === 422) {
    var fallback = branchName + '-r2';
    body.ref = 'refs/heads/' + fallback;
    var res2 = githubRequest_('POST', url, auth.headers, body);
    if (res2.status === 201) return fallback;
    throw new Error('githubCreateBranch_ failed (422 + retry). ' +
                    redactToken_(JSON.stringify(res2.data)));
  }
  throw new Error('githubCreateBranch_ failed. Status: ' + res.status +
                  ' ' + redactToken_(JSON.stringify(res.data)));
}

// --- Part 2E-B: commit / PR / merge / delete ---

/**
 * Commits a single file to a feature branch via PUT /contents/{path}.
 * content must be a plain string (not base64 — this function encodes it).
 * Returns the commit SHA.
 */
function githubCommitFile_(auth, branchName, filePath, content, commitMessage) {
  var url     = auth.apiBase + '/contents/' + filePath;
  var encoded = Utilities.base64Encode(content, Utilities.Charset.UTF_8);
  var body = {
    message: commitMessage,
    content: encoded,
    branch:  branchName
  };
  var res = githubRequest_('PUT', url, auth.headers, body);
  if (res.status === 201 || res.status === 200) {
    return (res.data.commit && res.data.commit.sha) || '';
  }
  if (res.status === 409) {
    throw new Error('GitHub 409 commit conflict on ' + filePath +
                    '. Manual resolve required.');
  }
  throw new Error('githubCommitFile_ failed. Status: ' + res.status +
                  ' ' + redactToken_(JSON.stringify(res.data)));
}

/**
 * Opens a Pull Request on GitHub.
 * Returns { pr_number, pr_url, pr_node_id }.
 */
function githubCreatePR_(auth, branchName, title, body) {
  var url  = auth.apiBase + '/pulls';
  var payload = {
    title: title,
    body:  body,
    head:  branchName,
    base:  'main',
    draft: false
  };
  var res = githubRequest_('POST', url, auth.headers, payload);
  if (res.status === 201) {
    return {
      pr_number:  res.data.number,
      pr_url:     res.data.html_url,
      pr_node_id: res.data.node_id || ''
    };
  }
  throw new Error('githubCreatePR_ failed. Status: ' + res.status +
                  ' ' + redactToken_(JSON.stringify(res.data)));
}

/**
 * Polls PR mergeable state up to maxWaitMs milliseconds (1s intervals).
 * Returns { mergeable: true/false/null } — null means GitHub hasn't computed it yet.
 */
function githubPollMergeable_(auth, prNumber, maxWaitMs) {
  maxWaitMs = maxWaitMs || 5000;
  var url      = auth.apiBase + '/pulls/' + prNumber;
  var waited   = 0;
  var interval = 1000;
  while (waited <= maxWaitMs) {
    var res = githubRequest_('GET', url, auth.headers);
    if (res.status === 200 && res.data.mergeable !== null) {
      return { mergeable: res.data.mergeable, state: res.data.state };
    }
    if (waited < maxWaitMs) Utilities.sleep(interval);
    waited += interval;
  }
  return { mergeable: null, state: 'unknown' };
}

/**
 * Local pre-merge validation gate.
 * Runs 6 checks; returns { valid: true } or { valid: false, errors: [...] }.
 * Does NOT call GitHub — all checks are local string inspection.
 */
function githubValidateBeforeMerge_(filePath, content, mergeableState) {
  var errors = [];

  // 1. File path guard
  if (!filePath.match(/^agents\/orchestrator\/workflows\/[a-z0-9\-]+\.md$/)) {
    errors.push('File path guard failed: "' + filePath +
                '" must be agents/orchestrator/workflows/<name>.md');
  }

  // 2. File size ≤ 50 KB
  var byteLen = Utilities.base64Encode(content, Utilities.Charset.UTF_8).length * 0.75;
  if (byteLen > 51200) {
    errors.push('File size exceeded 50 KB (' + Math.round(byteLen / 1024) + ' KB)');
  }

  // 3. YAML frontmatter: begins with --- and has name: + trigger_phrases:
  if (!content.match(/^---/)) {
    errors.push('YAML frontmatter missing: file must begin with ---');
  } else {
    if (!content.match(/\bname:/))            errors.push('YAML frontmatter missing "name:" key');
    if (!content.match(/\btrigger_phrases:/)) errors.push('YAML frontmatter missing "trigger_phrases:" key');
  }

  // 4. No null bytes
  if (content.indexOf('\0') !== -1) {
    errors.push('Content contains null bytes (corrupted base64 decode)');
  }

  // 5. No hardcoded secrets
  var secretPatterns = ['GITHUB_PAT', 'TELEGRAM_BOT_TOKEN', 'ANTHROPIC_API_KEY'];
  for (var i = 0; i < secretPatterns.length; i++) {
    if (content.indexOf(secretPatterns[i]) !== -1) {
      errors.push('Hardcoded secret detected: "' + secretPatterns[i] + '" found in content');
    }
  }

  // 6. PR mergeable state
  if (mergeableState === false) {
    errors.push('PR mergeable=false: merge conflict with existing file on main');
  }

  return errors.length === 0
    ? { valid: true,  errors: [] }
    : { valid: false, errors: errors };
}

/**
 * Squash-merges a PR. Returns merge SHA on success.
 * Throws on 405 (auto-merge not enabled) and 409 (conflict).
 */
function githubMergePR_(auth, prNumber, commitTitle) {
  var url  = auth.apiBase + '/pulls/' + prNumber + '/merge';
  var body = {
    merge_method: 'squash',
    commit_title: commitTitle
  };
  var res = githubRequest_('PUT', url, auth.headers, body);
  if (res.status === 200) return res.data.sha || '';
  if (res.status === 405) {
    throw new Error('GitHub 405 — auto-merge not enabled on repo. ' +
                    'Enable in GitHub repo Settings → General → Allow auto-merge, ' +
                    'or merge manually via PR link.');
  }
  if (res.status === 409) {
    throw new Error('GitHub 409 merge conflict. PR stays open. Resolve in GitHub and merge manually.');
  }
  if (res.status === 422) {
    throw new Error('GitHub 422 — PR not mergeable (may need review approval). ' +
                    redactToken_(JSON.stringify(res.data)));
  }
  throw new Error('githubMergePR_ failed. Status: ' + res.status +
                  ' ' + redactToken_(JSON.stringify(res.data)));
}

/**
 * Deletes a feature branch after merge. Non-fatal on failure.
 * Returns true on success, false on any error (caller logs warning only).
 */
function githubDeleteBranch_(auth, branchName) {
  try {
    var url = auth.apiBase + '/git/refs/heads/' + branchName;
    var res = githubRequest_('DELETE', url, auth.headers);
    return res.status === 204;
  } catch (e) {
    console.warn('githubDeleteBranch_ non-fatal error for "' + branchName + '": ' + e.message);
    return false;
  }
}

// --- Part 2E-C: pipeline orchestration + auto-detect handlers ---

/**
 * Full Level 3 GitHub promotion pipeline.
 * Steps: conflict check → get HEAD SHA → create branch → commit → create PR
 *        → poll mergeable → validate → merge → delete branch → cleanup Drive/Sheet.
 *
 * @param {Object} state   Workflow instance state (mutated in place for checkpoints)
 * @param {Object} opts    { templateName, filePath, fileContent, patternName,
 *                           qualifyingWfIds, similarity, periodDays, aramApprovalTs,
 *                           aramMsgId, driveDraftFileId }
 * @returns {{ success: true, mergeSha, prUrl } | { success: false, error, prUrl? }}
 */
function githubFullPipeline_(state, opts) {
  var auth       = githubAuth_();
  var wfId       = state.wf_id;
  var slug       = opts.templateName.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
  var branchName = 'auto-templates/' + wfId + '-' + slug;
  var filePath   = opts.filePath ||
                   'agents/orchestrator/workflows/' + opts.templateName + '.md';

  // Step 1: Conflict check
  var existing = githubGetFileContent_(auth, filePath, 'main');
  if (existing.exists) {
    return {
      success: false,
      error:   'CONFLICT: "' + opts.templateName + '" already exists at ' + filePath,
      conflict: true
    };
  }

  // Step 2: HEAD SHA
  var headSha = retryWithBackoff_(function() {
    return githubGetHeadSha_(auth, 'main');
  });

  // Step 3: Create feature branch
  var actualBranch = retryWithBackoff_(function() {
    return githubCreateBranch_(auth, branchName, headSha);
  });
  state.data.github_branch = actualBranch;
  writeState_(wfId, state);

  // Step 4: Build structured commit message
  var commitMsg = 'feat(orchestrator): auto-promote template "' + opts.patternName + '"\n\n' +
    'Detection criteria:\n' +
    '  Instances: ' + (opts.qualifyingWfIds || []).join(', ') + '\n' +
    '  Step similarity: ' + (opts.similarity || 0) + '%\n' +
    '  Period: last ' + (opts.periodDays || 30) + ' days\n' +
    '  Stable Aram decisions: yes\n' +
    '  Gate overrides in qualifying runs: 0\n\n' +
    'Aram approval:\n' +
    '  Timestamp: ' + (opts.aramApprovalTs || new Date().toISOString()) + '\n' +
    '  Telegram message ID: ' + (opts.aramMsgId || 'n/a') + '\n' +
    '  Chat ID: [redacted]\n\n' +
    'Auto-generated by Das Experten Orchestrator\n' +
    'wf_id: ' + wfId;

  // Step 5: Commit file
  retryWithBackoff_(function() {
    githubCommitFile_(auth, actualBranch, filePath, opts.fileContent, commitMsg);
  });

  // Step 6: Create PR
  var prTitle = 'feat(orchestrator): auto-promote template "' + opts.patternName + '"';
  var prBody  = '## Auto-promoted template\n\n' +
    '**Pattern name:** `' + opts.patternName + '`\n' +
    '**Qualifying instances:** ' + (opts.qualifyingWfIds || []).join(', ') + '\n' +
    '**Step similarity:** ' + (opts.similarity || 0) + '%\n' +
    '**Period:** last ' + (opts.periodDays || 30) + ' days\n\n' +
    '**Aram approval timestamp:** ' + (opts.aramApprovalTs || '') + '\n\n' +
    '_Auto-generated by Das Experten Orchestrator. wf_id: ' + wfId + '_';

  var prInfo = retryWithBackoff_(function() {
    return githubCreatePR_(auth, actualBranch, prTitle, prBody);
  });
  state.data.github_pr_number = prInfo.pr_number;
  state.data.github_pr_url    = prInfo.pr_url;
  writeState_(wfId, state);

  // Step 7: Poll mergeable state (up to 5 seconds)
  var mergeState = githubPollMergeable_(auth, prInfo.pr_number, 5000);

  // Step 8: Validate
  var validation = githubValidateBeforeMerge_(
    filePath,
    opts.fileContent,
    mergeState.mergeable
  );
  state.data.validation_status = validation.valid ? 'passed' : 'failed:' + validation.errors.join(';');
  writeState_(wfId, state);

  if (!validation.valid) {
    updateSheetRow_(wfId, {
      template_promotion:  'failed_validation',
      github_pr_url:       prInfo.pr_url,
      validation_status:   state.data.validation_status
    });
    return { success: false, error: 'Validation failed', errors: validation.errors,
             prUrl: prInfo.pr_url };
  }

  // Step 9: Merge PR (squash)
  var mergeSha = retryWithBackoff_(function() {
    return githubMergePR_(auth, prInfo.pr_number, prTitle);
  });
  state.data.github_merge_sha = mergeSha;
  writeState_(wfId, state);

  // Step 10: Delete feature branch (best effort)
  githubDeleteBranch_(auth, actualBranch);

  // Step 11: Delete Drive draft
  if (opts.driveDraftFileId) {
    try { DriveApp.getFileById(opts.driveDraftFileId).setTrashed(true); } catch (e) {
      console.warn('githubFullPipeline_: Drive draft delete failed (non-fatal): ' + e.message);
    }
  }

  // Step 12: Update Sheet index
  updateSheetRow_(wfId, {
    template_promotion:      'merged',
    github_pr_url:           prInfo.pr_url,
    github_merge_sha:        mergeSha,
    validation_status:       'passed',
    aram_approval_timestamp: opts.aramApprovalTs || new Date().toISOString()
  });

  return { success: true, mergeSha: mergeSha, prUrl: prInfo.pr_url };
}

/**
 * Callback handler: Aram tapped [✅ Approve & auto-merge].
 * Reads draft content from Drive, runs githubFullPipeline_(), notifies Aram.
 */
function handleAutoDetectApprove_(state) {
  var data = state.data || {};
  sendTelegram_(
    buildEnvelope_('Template/Merge', '1/1',
      'Запускаю pipeline: ветка → коммит → PR → авто-merge…\nОбычно занимает 5–15 секунд.',
      state.wf_id),
    null
  );

  // Read draft content from Drive
  var content = '';
  try {
    content = DriveApp.getFileById(data.drive_draft_file_id).getBlob().getDataAsString();
  } catch (e) {
    var msg = 'Не удалось прочитать драфт из Drive: ' + e.message + '\n' +
              'Проверь drive_draft_file_id в состоянии или повтори.';
    sendTelegram_(buildEnvelope_('Template/Error 🔴', '1/1', msg, state.wf_id), null);
    state.status = 'FAILED';
    writeState_(state.wf_id, state);
    return;
  }

  var ts = new Date().toISOString();
  state.data.aram_approval_timestamp = ts;
  writeState_(state.wf_id, state);

  var result;
  try {
    result = githubFullPipeline_(state, {
      templateName:    data.proposed_name || 'unknown-template',
      patternName:     data.proposed_name || 'unknown-template',
      fileContent:     content,
      qualifyingWfIds: data.qualifying_wf_ids || [],
      similarity:      data.similarity_pct || 0,
      periodDays:      data.period_days || 30,
      aramApprovalTs:  ts,
      aramMsgId:       data.aram_approval_msg_id || '',
      driveDraftFileId: data.drive_draft_file_id || ''
    });
  } catch (e) {
    var errMsg = '🔴 GitHub pipeline ошибка:\n' + redactToken_(e.message) + '\n\n' +
                 'PR (если создан): ' + (state.data.github_pr_url || 'не создан');
    sendTelegram_(buildEnvelope_('GitHub/Error 🔴', '1/1', errMsg, state.wf_id), null);
    state.status = 'FAILED';
    writeState_(state.wf_id, state);
    return;
  }

  if (result.success) {
    var successMsg = '✅ Шаблон "' + (data.proposed_name || '') + '" смёрджен в main.\n\n' +
                     'PR: ' + result.prUrl + '\n' +
                     'Merge SHA: ' + result.mergeSha.substring(0, 8);
    sendTelegram_(buildEnvelope_('Template/Merged', '1/1', successMsg, state.wf_id), null);
    state.status = 'COMPLETED';
  } else if (result.conflict) {
    var conflictMsg = '🔴 Шаблон "' + (data.proposed_name || '') + '" уже существует:\n' +
                      'agents/orchestrator/workflows/' + (data.proposed_name || '') + '.md\n\n' +
                      'Варианты:';
    var kb = { inline_keyboard: [[
      kbButton_('Переименовать', state.wf_id, 1, 'rename'),
      kbButton_('Отменить',      state.wf_id, 1, 'cancel_pipeline')
    ]]};
    sendTelegram_(buildEnvelope_('GitHub/Conflict 🔴', '1/1', conflictMsg, state.wf_id), kb);
    state.status = 'AWAITING_INPUT';
    state.awaiting_input_type = 'free_text';
    state.awaiting_input_hint = 'rename_template';
  } else {
    // Validation failed — PR is open, not merged
    var failMsg = '⚠️ Шаблон создан как PR, но не прошёл проверку:\n' +
                  (result.errors || []).map(function(e) { return '• ' + e; }).join('\n') + '\n\n' +
                  'PR: ' + (result.prUrl || 'см. GitHub');
    var kb2 = { inline_keyboard: [[
      kbButton_('Открыть PR', state.wf_id, 1, 'open_pr'),
      kbButton_('Закрыть PR', state.wf_id, 1, 'close_pr')
    ]]};
    sendTelegram_(buildEnvelope_('GitHub/Validation ⚠️', '1/1', failMsg, state.wf_id), kb2);
    state.status = 'COMPLETED';
  }
  writeState_(state.wf_id, state);
}

/**
 * Callback handler: Aram tapped [📄 Показать драфт].
 * Sends truncated preview + Drive link, then re-shows action buttons.
 */
function handleAutoDetectShowDraft_(state) {
  var data = state.data || {};
  var content = '';
  try {
    content = DriveApp.getFileById(data.drive_draft_file_id).getBlob().getDataAsString();
  } catch (e) {
    sendTelegram_(buildEnvelope_('Template/Draft 🔴', '1/1',
      'Не удалось открыть драфт: ' + e.message, state.wf_id), null);
    return;
  }
  var preview = content.substring(0, 1000) + (content.length > 1000 ? '\n…[обрезано]' : '');
  var driveUrl = 'https://drive.google.com/file/d/' + (data.drive_draft_file_id || '') + '/view';
  var body = 'Драфт шаблона "' + (data.proposed_name || '') + '":\n\n' +
             preview + '\n\nПолная версия: ' + driveUrl;
  var kb = { inline_keyboard: [[
    kbButton_('✅ Approve & auto-merge', state.wf_id, 1, 'approve_merge'),
    kbButton_('✏️ Редактировать',        state.wf_id, 1, 'edit_drive'),
    kbButton_('❌ Decline',              state.wf_id, 1, 'decline')
  ]]};
  sendTelegram_(buildEnvelope_('Template/Draft', '1/1', body, state.wf_id), kb);
}

/**
 * Callback handler: Aram tapped [❌ Это не паттерн / Decline].
 * Deletes Drive draft, logs declined in Sheet, suppresses pattern 30 days.
 */
function handleAutoDetectDecline_(state) {
  var data = state.data || {};
  // Delete Drive draft
  if (data.drive_draft_file_id) {
    try { DriveApp.getFileById(data.drive_draft_file_id).setTrashed(true); } catch (e) {}
  }
  // Log to Sheet
  updateSheetRow_(state.wf_id, { template_promotion: 'declined', notes: 'declined by Aram' });
  // Add to suppression list via Sheet tab AutoDetect_Suppressed
  try {
    var ss   = SpreadsheetApp.openById(getProp_('ORCHESTRATOR_INDEX_SHEET_ID', true));
    var supp = ss.getSheetByName('AutoDetect_Suppressed') ||
               ss.insertSheet('AutoDetect_Suppressed');
    supp.appendRow([
      data.pattern_hash || '',
      new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10),
      'declined by Aram',
      state.wf_id
    ]);
  } catch (e) {
    console.warn('handleAutoDetectDecline_: suppression log failed: ' + e.message);
  }
  sendTelegram_(
    buildEnvelope_('Template/Declined', '1/1',
      'Паттерн "' + (data.proposed_name || '') + '" отклонён.\n' +
      'Драфт удалён. Детекция подавлена на 30 дней.',
      state.wf_id),
    null
  );
  state.status = 'CANCELLED';
  writeState_(state.wf_id, state);
}

/**
 * Daily token rotation reminder (fires at 09:00 via time trigger).
 * Checks GITHUB_PAT_ISSUED_DATE and sends Telegram if >= 80 days.
 */
function tokenRotationReminder() {
  var issuedStr = '';
  try { issuedStr = getProp_('GITHUB_PAT_ISSUED_DATE', false); } catch (e) { return; }
  if (!issuedStr) return;
  var issued  = new Date(issuedStr);
  var daysSince = Math.floor((Date.now() - issued.getTime()) / 86400000);
  if (daysSince < 80) return;

  var wfId = 'TOKEN_ROTATION_' + new Date().toISOString().substring(0, 10).replace(/-/g, '');
  var daysLeft = 90 - daysSince;
  var urgent   = daysSince >= 90;
  var label    = urgent ? 'Security/Token 🔴' : 'Security/Token ⚠️';
  var stepTag  = urgent ? 'Step 0/0 — ТРЕБУЕТ ВНИМАНИЯ' : 'Step 0/0';
  var body;
  if (urgent) {
    body = 'GITHUB_PAT предположительно истёк (выдан ' + daysSince + ' дней назад).\n' +
           'GitHub-операции (auto-merge) будут завершаться с ошибкой 401.\n\n' +
           'Действие: обновить GITHUB_PAT в Script Properties.\n' +
           'После обновления — обновить GITHUB_PAT_ISSUED_DATE.';
  } else {
    body = 'GITHUB_PAT будет действителен ещё ~' + daysLeft + ' дней.\n' +
           'Рекомендуется обновить токен заранее.\n\n' +
           'Ссылка: https://github.com/settings/tokens';
  }
  var kb = { inline_keyboard: [[
    { text: 'Уже обновил',         callback_data: wfId + '|0|already_updated' },
    { text: urgent ? 'Отложить' : 'Напомнить через 7 дней',
      callback_data: wfId + '|0|defer' }
  ]]};
  // Send as plain Telegram (no workflow state — this is a maintenance ping)
  sendTelegram_(
    '🤖 ORCHESTRATOR — ' + label + '\n' + stepTag + '\n\n' + body + '\n\nwf_id: ' + wfId,
    kb
  );
}

/**
 * Utility: test GitHub connection from Apps Script editor.
 * Run manually to verify GITHUB_PAT and GITHUB_REPO are correct.
 */
function testGitHubConnection() {
  var auth = githubAuth_();
  var res  = githubRequest_('GET', auth.apiBase, auth.headers);
  if (res.status === 200) {
    console.log('GitHub connection OK. Repo: ' + auth.repo +
                ' | Default branch: ' + (res.data.default_branch || '?'));
  } else {
    console.error('GitHub connection failed. Status: ' + res.status +
                  ' | ' + redactToken_(JSON.stringify(res.data)));
  }
}

/**
 * Scheduled auto-detection scan (daily at 02:00 Moscow via time trigger).
 * Queries Sheet for qualifying ad-hoc groups and triggers promotion if criteria met.
 * This is a lightweight scan — heavy computation only if candidates found.
 */
function weeklyAutoDetectionScan() {
  try {
    var ss   = SpreadsheetApp.openById(getProp_('ORCHESTRATOR_INDEX_SHEET_ID', true));
    var ws   = ss.getSheetByName('Workflows');
    if (!ws) return;
    var data   = ws.getDataRange().getValues();
    var header = data[0];
    var colIdx = {};
    for (var c = 0; c < header.length; c++) colIdx[header[c]] = c;

    // Collect ad-hoc COMPLETED rows from last 30 days
    var cutoff  = new Date(Date.now() - 30 * 86400000);
    var adhocRows = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      if (row[colIdx['mode']]   !== 'ad-hoc')    continue;
      if (row[colIdx['status']] !== 'COMPLETED')  continue;
      var created = new Date(row[colIdx['created_at']]);
      if (isNaN(created.getTime()) || created < cutoff) continue;
      adhocRows.push({
        wf_id:    row[colIdx['wf_id']],
        template: row[colIdx['template']],
        trigger:  row[colIdx['original_trigger']]
      });
    }

    if (adhocRows.length < 3) return; // Not enough instances — skip

    // Check suppression list before grouping
    var suppSheet = ss.getSheetByName('AutoDetect_Suppressed');
    var suppressed = {};
    if (suppSheet) {
      var suppData = suppSheet.getDataRange().getValues();
      var today = new Date().toISOString().substring(0, 10);
      for (var s = 1; s < suppData.length; s++) {
        if (suppData[s][1] > today) suppressed[suppData[s][0]] = true;
      }
    }

    // Simple grouping: trigger token overlap ≥ 80% Jaccard
    // (Full similarity check happens in promotion step — this is just a lightweight gate)
    var groups = groupByTriggerSimilarity_(adhocRows, 0.8);
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      if (group.length < 3) continue;
      var hash = computePatternHash_(group);
      if (suppressed[hash]) continue;

      // Enough candidates — trigger a full auto-detection workflow
      var wfId  = generateWfId_('AUTO_DETECT');
      var name  = deriveTemplateName_(group);
      var state = createNewState_(wfId, 'auto-detection', null);
      state.data.qualifying_wf_ids = group.map(function(x) { return x.wf_id; });
      state.data.proposed_name     = name;
      state.data.pattern_hash      = hash;
      state.data.period_days       = 30;
      state.data.similarity_pct    = 80; // placeholder — full calc done at promotion
      writeState_(wfId, state);

      var body = 'Я заметил повторяющийся паттерн:\n"' + name + '" — ' +
                 group.length + ' раза за последние 30 дней\n\n' +
                 'Совпадение шагов: ~80%\n' +
                 'Instances: ' + group.map(function(x) { return x.wf_id; }).join(', ') + '\n' +
                 'Решения Арама: стабильные\n\n' +
                 'Драфт нового шаблона готов.';
      var kb = { inline_keyboard: [[
        kbButton_('📄 Показать драфт',        wfId, 1, 'show_draft'),
        kbButton_('✅ Approve & auto-merge',   wfId, 1, 'approve_merge')
      ],[
        kbButton_('✏️ Сначала отредактирую в Drive', wfId, 1, 'edit_drive'),
        kbButton_('❌ Это не паттерн',          wfId, 1, 'decline')
      ]]};
      sendTelegram_(buildEnvelope_('Template/Proposal', '1/1', body, wfId), kb);
    }
  } catch (e) {
    console.warn('weeklyAutoDetectionScan error: ' + e.message);
  }
}

/** Groups ad-hoc rows by trigger text Jaccard similarity >= threshold. */
function groupByTriggerSimilarity_(rows, threshold) {
  var groups = [];
  var used   = {};
  for (var i = 0; i < rows.length; i++) {
    if (used[i]) continue;
    var group = [rows[i]];
    used[i] = true;
    var tokA = tokenize_(rows[i].trigger || '');
    for (var j = i + 1; j < rows.length; j++) {
      if (used[j]) continue;
      var tokB = tokenize_(rows[j].trigger || '');
      if (jaccardSimilarity_(tokA, tokB) >= threshold) {
        group.push(rows[j]);
        used[j] = true;
      }
    }
    groups.push(group);
  }
  return groups;
}

/** Jaccard similarity between two token arrays. */
function jaccardSimilarity_(a, b) {
  var setA = {}, setB = {}, intersection = 0, union = 0;
  for (var i = 0; i < a.length; i++) setA[a[i]] = true;
  for (var i = 0; i < b.length; i++) setB[b[i]] = true;
  for (var k in setA) { union++; if (setB[k]) intersection++; }
  for (var k in setB) { if (!setA[k]) union++; }
  return union === 0 ? 0 : intersection / union;
}

/** Derives a kebab-case template name from a group of ad-hoc rows. */
function deriveTemplateName_(group) {
  var allTokens = [];
  for (var i = 0; i < group.length; i++) {
    allTokens = allTokens.concat(tokenize_(group[i].trigger || ''));
  }
  var freq = {};
  for (var i = 0; i < allTokens.length; i++) {
    freq[allTokens[i]] = (freq[allTokens[i]] || 0) + 1;
  }
  var sorted = Object.keys(freq).sort(function(a, b) { return freq[b] - freq[a]; });
  return sorted.slice(0, 3).join('-').toLowerCase().replace(/[^a-z0-9\-]/g, '');
}

/** Simple FNV-1a-inspired hash of step sequence for pattern deduplication. */
function computePatternHash_(group) {
  var str = group.map(function(x) { return x.template; }).sort().join('|');
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}

