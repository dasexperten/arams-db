/**
 * orchestrator-bundle.gs — Das Experten Orchestrator v2
 *
 * Architecture:
 *   Telegram trigger → classify → skills → brief summary + action buttons
 *   No Drive files. No complex state machine. State in Script Properties only.
 *
 * Script Properties required:
 *   TELEGRAM_BOT_TOKEN          — from @BotFather
 *   ARAM_TELEGRAM_CHAT_ID       — your Telegram chat ID
 *   ANTHROPIC_API_KEY           — Claude API key
 *   EMAILER_EXEC_URL            — emailer Web App URL
 *   ORCHESTRATOR_EXEC_URL       — this Web App URL (for registerWebhook)
 */

// ── Config ───────────────────────────────────────────────────────────────────

var BOT_BASE_    = 'https://api.telegram.org/bot';
var MODEL_FAST_  = 'claude-haiku-4-5-20251001';
var MODEL_SMART_ = 'claude-sonnet-4-6';
var MAX_DRAFTS_  = 5;    // max emails drafted per triage run
var LOOKBACK_H_  = 24;   // hours to look back for unread mail

var INBOXES_ = {
  eurasia:   'eurasia@dasexperten.de',
  emea:      'emea@dasexperten.de',
  export:    'export@dasexperten.de',
  marketing: 'marketing@dasexperten.de'
};

// ── One-time setup (run from editor) ─────────────────────────────────────────

function authorize() {
  PropertiesService.getScriptProperties().getProperties();
  UrlFetchApp.fetch('https://api.telegram.org/', { muteHttpExceptions: true });
  console.log('authorize OK');
}

function registerWebhook() {
  var token = prop_('TELEGRAM_BOT_TOKEN', true);
  var url   = prop_('ORCHESTRATOR_EXEC_URL', true);
  var resp  = UrlFetchApp.fetch(
    BOT_BASE_ + token + '/setWebhook?url=' + encodeURIComponent(url)
  );
  console.log(resp.getContentText());
}

// ── doPost — returns 200 immediately, processes async ────────────────────────

function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) || '{}';

  try {
    PropertiesService.getScriptProperties().setProperty('_upd', raw);
    ScriptApp.getProjectTriggers()
      .filter(function(t) { return t.getHandlerFunction() === 'processUpdate_'; })
      .forEach(function(t) { ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('processUpdate_').timeBased().after(1000).create();
  } catch (err) {
    try { dispatch_(JSON.parse(raw)); } catch (_) {}
  }

  return ContentService.createTextOutput('{}').setMimeType(ContentService.MimeType.JSON);
}

function processUpdate_() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'processUpdate_'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });

  var raw = PropertiesService.getScriptProperties().getProperty('_upd') || '{}';
  PropertiesService.getScriptProperties().deleteProperty('_upd');

  var update;
  try { update = JSON.parse(raw); } catch (_) { return; }

  try {
    dispatch_(update);
  } catch (err) {
    tg_('⚠️ Ошибка: ' + String(err.message || err));
  }
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

function dispatch_(update) {
  var myChat = prop_('ARAM_TELEGRAM_CHAT_ID');

  if (update.callback_query) {
    var cbq = update.callback_query;
    answerCbq_(cbq.id);
    var fromChat = String((cbq.message && cbq.message.chat && cbq.message.chat.id) || '');
    if (fromChat !== myChat) return;
    handleAction_(String(cbq.data || ''));
    return;
  }

  if (update.message && update.message.text) {
    if (String(update.message.chat.id) !== myChat) return;
    handleText_(update.message.text.trim());
  }
}

// ── Text handler ─────────────────────────────────────────────────────────────

function handleText_(text) {
  // Awaiting edited draft text from Aram
  if (prop_('_awaiting_edit') === '1') {
    PropertiesService.getScriptProperties().deleteProperty('_awaiting_edit');
    var q = loadQueue_();
    if (q.length) {
      q[0].draft = text;
      saveQueue_(q);
      presentEmail_(q[0]);
    }
    return;
  }

  var lower = text.toLowerCase();
  if (/почта|triage|inbox|письм|mail|сканир/.test(lower)) {
    runTriage_();
    return;
  }

  tg_('Привет. Напиши <b>утренняя почта</b> чтобы разобрать inbox.');
}

// ── Inbox triage ─────────────────────────────────────────────────────────────

function runTriage_() {
  tg_('📬 Сканирую inbox…');

  // 1. Fetch unread threads from all inboxes
  var threads = [];
  var inboxNames = Object.keys(INBOXES_);
  for (var i = 0; i < inboxNames.length; i++) {
    var addr = INBOXES_[inboxNames[i]];
    try {
      var res = emailer_({ action: 'find', query: 'is:unread newer_than:' + LOOKBACK_H_ + 'h',
                           inbox: addr, max_results: 30 });
      (res.threads || []).forEach(function(t) { t._inbox = addr; });
      threads = threads.concat(res.threads || []);
    } catch (e) {
      console.warn('find failed ' + addr + ': ' + e.message);
    }
  }

  if (!threads.length) {
    tg_('✅ Новых писем нет.');
    return;
  }

  // 2. Classify each thread
  var counts = {};
  var important = [];
  for (var j = 0; j < threads.length; j++) {
    var t = threads[j];
    var label = classify_(t);
    t._urgency = label;
    counts[label] = (counts[label] || 0) + 1;
    if ((label === 'URGENT' || label === 'HIGH') && important.length < MAX_DRAFTS_) {
      important.push(t);
    }
  }

  // 3. Send summary
  var summary = '📊 <b>Inbox — ' + threads.length + ' писем</b>\n' +
    (counts.URGENT ? '🔴 Срочные: '   + counts.URGENT + '\n' : '') +
    (counts.HIGH   ? '🟠 Важные: '    + counts.HIGH   + '\n' : '') +
    (counts.MEDIUM ? '🟡 Обычные: '   + counts.MEDIUM + '\n' : '') +
    (counts.LOW    ? '⚪ Уведомления: '+ counts.LOW    + '\n' : '');
  tg_(summary);

  if (!important.length) {
    tg_('Срочных и важных писем нет.');
    return;
  }

  // 4. Draft replies for important threads
  tg_('✍️ Готовлю черновики…');
  var queue = [];
  for (var k = 0; k < important.length; k++) {
    var email = important[k];
    var body  = getBody_(email);
    var draft = draft_(email, body);
    queue.push({
      thread_id: email.thread_id || '',
      inbox:     email._inbox   || '',
      subject:   (email.subject || '(без темы)').substring(0, 100),
      from:      (email.from    || '?').substring(0, 80),
      urgency:   email._urgency,
      draft:     draft.substring(0, 600)
    });
  }

  saveQueue_(queue);
  presentEmail_(queue[0]);
}

// ── Present one email ─────────────────────────────────────────────────────────

function presentEmail_(email) {
  var icon = email.urgency === 'URGENT' ? '🔴' : '🟠';
  var q    = loadQueue_();
  var pos  = q.length > 1 ? ' (' + 1 + '/' + q.length + ')' : '';

  var text = icon + ' <b>' + esc_(email.subject) + '</b>' + pos + '\n' +
    'От: ' + esc_(email.from) + '\n' +
    'Inbox: ' + esc_(email.inbox) + '\n\n' +
    '<b>Черновик:</b>\n' + esc_(email.draft);

  var kb = { inline_keyboard: [[
    { text: '✅ Отправить', callback_data: 'send' },
    { text: '📝 Черновик',  callback_data: 'edit' }
  ]]};

  tg_(text, kb);
}

// ── Action handlers ───────────────────────────────────────────────────────────

function handleAction_(action) {
  var q = loadQueue_();
  if (!q.length) { tg_('Нет активных писем.'); return; }

  var cur = q[0];

  if (action === 'send') {
    try {
      emailer_({ action: 'reply', thread_id: cur.thread_id, inbox: cur.inbox, body: cur.draft });
      tg_('✅ Отправлено: ' + esc_(cur.subject));
    } catch (e) {
      tg_('❌ Ошибка отправки: ' + String(e.message));
    }
    advance_(q);
    return;
  }

  if (action === 'skip') {
    tg_('⏭ Пропущено: ' + esc_(cur.subject));
    advance_(q);
    return;
  }

  if (action === 'edit') {
    try {
      emailer_({ action: 'save_draft', thread_id: cur.thread_id, inbox: cur.inbox, body: cur.draft });
      tg_('📝 Черновик сохранён в Gmail Drafts: ' + esc_(cur.subject) + '\n\nОткрой Gmail → Черновики.');
    } catch (_) {
      // Emailer may not support save_draft — send text so user can copy
      tg_('📝 Черновик для: ' + esc_(cur.subject) + '\n\n<pre>' + esc_(cur.draft) + '</pre>\n\nСкопируй и вставь в Gmail.');
    }
    advance_(q);
  }
}

function advance_(q) {
  q.shift();
  saveQueue_(q);
  if (q.length) {
    Utilities.sleep(300);
    presentEmail_(q[0]);
  } else {
    tg_('✅ Все важные письма обработаны.');
  }
}

// ── Queue (Script Properties) ─────────────────────────────────────────────────

function loadQueue_() {
  var raw = prop_('_queue') || '[]';
  try { return JSON.parse(raw); } catch (_) { return []; }
}

function saveQueue_(q) {
  PropertiesService.getScriptProperties().setProperty('_queue', JSON.stringify(q));
}

// ── Email helpers ─────────────────────────────────────────────────────────────

function classify_(thread) {
  var snippet = (thread.snippet || '').substring(0, 300);
  var prompt  = 'From: ' + (thread.from || '') + '\nSubject: ' + (thread.subject || '') + '\n' + snippet;
  var system  = 'Classify email urgency. Reply with ONE word only: URGENT, HIGH, MEDIUM, LOW, or SKIP.\n' +
    'URGENT=needs action today (payment/complaint/contract/legal).\n' +
    'HIGH=important business email or B2B partner.\n' +
    'MEDIUM=general inquiry or existing customer.\n' +
    'LOW=newsletter/notification/automated.\n' +
    'SKIP=spam or read-receipts.';
  try {
    var label = claude_(system, prompt, MODEL_FAST_, 5).trim().toUpperCase().replace(/\W/g, '');
    return ['URGENT','HIGH','MEDIUM','LOW','SKIP'].indexOf(label) >= 0 ? label : 'MEDIUM';
  } catch (_) { return 'MEDIUM'; }
}

function getBody_(thread) {
  try {
    var res = emailer_({ action: 'get_thread', thread_id: thread.thread_id });
    var msg = (res.messages || [])[0] || {};
    return ((msg.body_plain || msg.snippet || '').substring(0, 500));
  } catch (_) { return thread.snippet || ''; }
}

function draft_(thread, body) {
  var system = 'You are a professional customer service writer for Das Experten oral care brand. ' +
    'Write a concise, helpful reply. Match the customer\'s language. ' +
    'Never fabricate product claims. Output ONLY the email body text, no subject.';
  var prompt = 'From: ' + (thread.from || '') + '\nSubject: ' + (thread.subject || '') +
    '\nInbox: ' + thread._inbox + '\n\n' + body;
  try { return claude_(system, prompt, MODEL_SMART_, 250); }
  catch (_) { return '(Не удалось создать черновик — напиши вручную)'; }
}

// ── Claude API ────────────────────────────────────────────────────────────────

function claude_(system, user, model, maxTokens) {
  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method:      'post',
    contentType: 'application/json',
    headers: {
      'x-api-key':         prop_('ANTHROPIC_API_KEY', true),
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify({
      model:      model || MODEL_FAST_,
      max_tokens: maxTokens || 100,
      system:     system,
      messages:   [{ role: 'user', content: user }]
    }),
    muteHttpExceptions: true
  });
  var data = JSON.parse(resp.getContentText());
  if (data.error) throw new Error(data.error.message);
  return (data.content && data.content[0] && data.content[0].text) || '';
}

// ── Emailer API ───────────────────────────────────────────────────────────────

function emailer_(payload) {
  var url  = prop_('EMAILER_EXEC_URL', true);
  var resp = UrlFetchApp.fetch(url, {
    method:           'post',
    contentType:      'application/json',
    payload:          JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var data = JSON.parse(resp.getContentText());
  if (data.error) throw new Error(data.error);
  return data;
}

// ── Telegram ──────────────────────────────────────────────────────────────────

function tg_(text, keyboard) {
  var token  = prop_('TELEGRAM_BOT_TOKEN', true);
  var chatId = prop_('ARAM_TELEGRAM_CHAT_ID', true);
  var body   = { chat_id: chatId, text: text, parse_mode: 'HTML' };
  if (keyboard) body.reply_markup = JSON.stringify(keyboard);
  UrlFetchApp.fetch(BOT_BASE_ + token + '/sendMessage', {
    method:           'post',
    contentType:      'application/json',
    payload:          JSON.stringify(body),
    muteHttpExceptions: true
  });
}

function answerCbq_(id) {
  var token = prop_('TELEGRAM_BOT_TOKEN', true);
  UrlFetchApp.fetch(BOT_BASE_ + token + '/answerCallbackQuery', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ callback_query_id: id }),
    muteHttpExceptions: true
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function prop_(name, required) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  if (required && !v) throw new Error('Missing Script Property: ' + name);
  return v || '';
}

function esc_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
