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
// Stub forward declarations — implemented in 2C/2D.
// ============================================================================

function startWorkflow_(triggerText)        { throw new Error('startWorkflow_ not implemented (Part 2C)'); }
function resumeFreeText_(state, text)       { throw new Error('resumeFreeText_ not implemented (Part 2C)'); }
function resumeWithChoice_(state, choice)   { throw new Error('resumeWithChoice_ not implemented (Part 2C)'); }
function sendDisambiguation_(states, text)  { throw new Error('sendDisambiguation_ not implemented (Part 2C)'); }
