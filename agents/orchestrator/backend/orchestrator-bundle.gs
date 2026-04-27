/**
 * orchestrator-bundle.gs — Das Experten Orchestrator v2
 *
 * Flow:
 *   "утренняя почта" → scan inboxes → classify → draft replies →
 *   each email = one Telegram message with [Send] [Drafts] buttons.
 *   Ignored messages stay ignored — no queue, no revisiting.
 *
 * Script Properties required:
 *   TELEGRAM_BOT_TOKEN       — from @BotFather
 *   ARAM_TELEGRAM_CHAT_ID    — your Telegram chat ID
 *   ANTHROPIC_API_KEY        — Claude API key
 *   EMAILER_EXEC_URL         — emailer Web App URL
 *   ORCHESTRATOR_EXEC_URL    — this Web App URL (for registerWebhook)
 */

// ── Config ───────────────────────────────────────────────────────────────────

var BOT_BASE_   = 'https://api.telegram.org/bot';
var MODEL_FAST_ = 'claude-haiku-4-5-20251001';
var MODEL_MAIN_ = 'claude-sonnet-4-6';
var MAX_EMAILS_ = 5;   // max important emails per triage
var LOOKBACK_H_ = 24;  // hours to look back

var INBOXES_ = {
  eurasia:   'eurasia@dasexperten.de',
  emea:      'emea@dasexperten.de',
  export:    'export@dasexperten.de',
  marketing: 'marketing@dasexperten.de'
};

// ── One-time setup (run from Apps Script editor) ──────────────────────────────

function authorize() {
  PropertiesService.getScriptProperties().getProperties();
  UrlFetchApp.fetch('https://api.telegram.org/', { muteHttpExceptions: true });
  console.log('authorize OK');
}

function registerWebhook() {
  var token = prop_('TELEGRAM_BOT_TOKEN', true);
  var url   = prop_('ORCHESTRATOR_EXEC_URL', true);
  var r = UrlFetchApp.fetch(BOT_BASE_ + token + '/setWebhook?url=' + encodeURIComponent(url));
  console.log(r.getContentText());
}

function testConfig() {
  var keys = ['TELEGRAM_BOT_TOKEN','ARAM_TELEGRAM_CHAT_ID','ANTHROPIC_API_KEY','EMAILER_EXEC_URL'];
  keys.forEach(function(k) { console.log(k + ': ' + (prop_(k) ? 'OK' : 'MISSING')); });
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
  } catch (_) {
    try { dispatch_(JSON.parse(raw)); } catch (__) {}
  }
  return ContentService.createTextOutput('{}').setMimeType(ContentService.MimeType.JSON);
}

function processUpdate_() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'processUpdate_'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
  var raw = prop_('_upd') || '{}';
  PropertiesService.getScriptProperties().deleteProperty('_upd');
  var upd; try { upd = JSON.parse(raw); } catch (_) { return; }
  try { dispatch_(upd); } catch (err) { tg_('⚠️ ' + String(err.message || err)); }
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

function dispatch_(upd) {
  var myChat = prop_('ARAM_TELEGRAM_CHAT_ID');

  if (upd.callback_query) {
    var cbq = upd.callback_query;
    answerCbq_(cbq.id);
    if (String((cbq.message && cbq.message.chat && cbq.message.chat.id) || '') !== myChat) return;
    handleAction_(String(cbq.data || ''));
    return;
  }

  if (upd.message && upd.message.text) {
    if (String(upd.message.chat.id) !== myChat) return;
    handleText_(upd.message.text.trim());
  }
}

// ── Text handler ─────────────────────────────────────────────────────────────

function handleText_(text) {
  if (/почта|triage|inbox|письм|mail|сканир/i.test(text)) {
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
  var names = Object.keys(INBOXES_);
  for (var i = 0; i < names.length; i++) {
    var addr = INBOXES_[names[i]];
    try {
      var res = emailer_({ action: 'find',
        query: 'is:unread newer_than:' + LOOKBACK_H_ + 'h',
        inbox: addr, max_results: 30 });
      (res.threads || []).forEach(function(t) { t._inbox = addr; });
      threads = threads.concat(res.threads || []);
    } catch (e) { console.warn('find ' + addr + ': ' + e.message); }
  }

  if (!threads.length) { tg_('✅ Новых писем нет.'); return; }

  // 2. Classify
  var counts = {}, important = [];
  for (var j = 0; j < threads.length; j++) {
    var t = threads[j];
    var label = classify_(t);
    t._urgency = label;
    counts[label] = (counts[label] || 0) + 1;
    if ((label === 'URGENT' || label === 'HIGH') && important.length < MAX_EMAILS_) {
      important.push(t);
    }
  }

  // 3. Summary
  tg_('📊 <b>Inbox — ' + threads.length + ' писем</b>\n' +
    (counts.URGENT ? '🔴 Срочные: '    + counts.URGENT + '\n' : '') +
    (counts.HIGH   ? '🟠 Важные: '     + counts.HIGH   + '\n' : '') +
    (counts.MEDIUM ? '🟡 Обычные: '    + counts.MEDIUM + '\n' : '') +
    (counts.LOW    ? '⚪ Уведомления: ' + counts.LOW    + '\n' : ''));

  if (!important.length) { tg_('Срочных писем нет.'); return; }

  // 4. Draft and present each important email independently
  tg_('✍️ Готовлю черновики для ' + important.length + ' письма…');
  for (var k = 0; k < important.length; k++) {
    var email = important[k];
    var body  = getBody_(email);
    var draft = makeDraft_(email, body);
    // Store draft in Script Properties keyed by thread_id
    storeDraft_(email.thread_id, {
      inbox:   email._inbox,
      subject: (email.subject || '(без темы)').substring(0, 100),
      from:    (email.from || '?').substring(0, 80),
      urgency: email._urgency,
      draft:   draft.substring(0, 600)
    });
    presentEmail_(email.thread_id);
    if (k < important.length - 1) Utilities.sleep(400);
  }
}

// ── Present one email with buttons ────────────────────────────────────────────

function presentEmail_(threadId) {
  var d = loadDraft_(threadId);
  if (!d) return;
  var icon = d.urgency === 'URGENT' ? '🔴' : '🟠';
  var text = icon + ' <b>' + esc_(d.subject) + '</b>\n' +
    'От: ' + esc_(d.from) + '\n\n' +
    '<b>Черновик:</b>\n' + esc_(d.draft);
  // Encode thread_id in callback_data: "s|<id>" = send, "d|<id>" = save to Drafts
  var kb = { inline_keyboard: [[
    { text: '✅ Отправить', callback_data: 's|' + threadId },
    { text: '📝 Черновики', callback_data: 'd|' + threadId }
  ]]};
  tg_(text, kb);
}

// ── Action handlers ───────────────────────────────────────────────────────────

function handleAction_(data) {
  var sep     = data.indexOf('|');
  var action  = sep >= 0 ? data.substring(0, sep) : data;
  var threadId = sep >= 0 ? data.substring(sep + 1) : '';
  var d = loadDraft_(threadId);
  if (!d) { tg_('Это письмо уже обработано.'); return; }

  if (action === 's') {
    try {
      emailer_({ action: 'reply', thread_id: threadId, inbox: d.inbox, body: d.draft });
      tg_('✅ Отправлено:\n' + esc_(d.subject));
    } catch (e) { tg_('❌ Ошибка отправки: ' + String(e.message)); }
    deleteDraft_(threadId);
    return;
  }

  if (action === 'd') {
    try {
      emailer_({ action: 'save_draft', thread_id: threadId, inbox: d.inbox, body: d.draft });
      tg_('📝 Сохранено в Gmail Drafts:\n' + esc_(d.subject) + '\n\nОткрой Gmail → Черновики.');
    } catch (_) {
      tg_('📝 <b>' + esc_(d.subject) + '</b>\n\n<pre>' + esc_(d.draft) + '</pre>');
    }
    deleteDraft_(threadId);
  }
}

// ── Draft storage (Script Properties) ────────────────────────────────────────

function storeDraft_(threadId, data) {
  PropertiesService.getScriptProperties()
    .setProperty('_d_' + threadId, JSON.stringify(data));
}

function loadDraft_(threadId) {
  var raw = PropertiesService.getScriptProperties().getProperty('_d_' + threadId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function deleteDraft_(threadId) {
  PropertiesService.getScriptProperties().deleteProperty('_d_' + threadId);
}

// ── Email helpers ─────────────────────────────────────────────────────────────

function classify_(thread) {
  var snippet = (thread.snippet || '').substring(0, 300);
  var system = 'Classify email urgency. Reply ONE word: URGENT, HIGH, MEDIUM, LOW, or SKIP.\n' +
    'URGENT=action needed today (payment/complaint/contract/legal termination).\n' +
    'HIGH=important business or B2B partner email.\n' +
    'MEDIUM=general inquiry. LOW=newsletter/notification. SKIP=spam/auto.';
  try {
    var label = claude_(system,
      'From: ' + (thread.from || '') + '\nSubject: ' + (thread.subject || '') + '\n' + snippet,
      MODEL_FAST_, 5).trim().toUpperCase().replace(/\W/g, '');
    return ['URGENT','HIGH','MEDIUM','LOW','SKIP'].indexOf(label) >= 0 ? label : 'MEDIUM';
  } catch (_) { return 'MEDIUM'; }
}

function getBody_(thread) {
  try {
    var res = emailer_({ action: 'get_thread', thread_id: thread.thread_id });
    var msg = (res.messages || [])[0] || {};
    return (msg.body_plain || msg.snippet || '').substring(0, 500);
  } catch (_) { return thread.snippet || ''; }
}

function makeDraft_(thread, body) {
  var system = 'You are a customer service writer for Das Experten oral care brand. ' +
    'Write a concise professional reply. Match the customer\'s language. ' +
    'Never fabricate product claims. Output ONLY the email body, no subject line.';
  try { return claude_(system,
    'From: ' + (thread.from || '') + '\nSubject: ' + (thread.subject || '') +
    '\nInbox: ' + thread._inbox + '\n\n' + body, MODEL_MAIN_, 250); }
  catch (_) { return '(Черновик недоступен — напиши вручную)'; }
}

// ── Claude API ────────────────────────────────────────────────────────────────

function claude_(system, user, model, maxTokens) {
  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json',
    headers: { 'x-api-key': prop_('ANTHROPIC_API_KEY', true), 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: model, max_tokens: maxTokens,
      system: system, messages: [{ role: 'user', content: user }] }),
    muteHttpExceptions: true
  });
  var d = JSON.parse(resp.getContentText());
  if (d.error) throw new Error(d.error.message);
  return (d.content && d.content[0] && d.content[0].text) || '';
}

// ── Emailer API ───────────────────────────────────────────────────────────────

function emailer_(payload) {
  var resp = UrlFetchApp.fetch(prop_('EMAILER_EXEC_URL', true), {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var d = JSON.parse(resp.getContentText());
  if (d.error) throw new Error(d.error);
  return d;
}

// ── Telegram ──────────────────────────────────────────────────────────────────

function tg_(text, keyboard) {
  var token  = prop_('TELEGRAM_BOT_TOKEN', true);
  var chatId = prop_('ARAM_TELEGRAM_CHAT_ID', true);
  var body   = { chat_id: chatId, text: text, parse_mode: 'HTML' };
  if (keyboard) body.reply_markup = JSON.stringify(keyboard);
  UrlFetchApp.fetch(BOT_BASE_ + token + '/sendMessage', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(body), muteHttpExceptions: true
  });
}

function answerCbq_(id) {
  UrlFetchApp.fetch(BOT_BASE_ + prop_('TELEGRAM_BOT_TOKEN', true) + '/answerCallbackQuery', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ callback_query_id: id }), muteHttpExceptions: true
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function prop_(name, required) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  if (required && !v) throw new Error('Missing Script Property: ' + name);
  return v || '';
}

function esc_(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
