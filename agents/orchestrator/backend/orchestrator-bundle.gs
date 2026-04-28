/**
 * orchestrator-bundle.gs — Das Experten Orchestrator v2
 *
 * Commands:
 *   "утренняя почта"   → triage unread 24h, manual confirm
 *   "найди [запрос]"   → search 90d, analyze, auto-send or ask
 *
 * Script Properties:
 *   TELEGRAM_BOT_TOKEN, ARAM_TELEGRAM_CHAT_ID, ANTHROPIC_API_KEY,
 *   EMAILER_EXEC_URL, ORCHESTRATOR_EXEC_URL
 */

// ── Config ────────────────────────────────────────────────────────────────────

var BOT_BASE_   = 'https://api.telegram.org/bot';
var MODEL_FAST_ = 'claude-haiku-4-5-20251001';
var MODEL_MAIN_ = 'claude-sonnet-4-6';
var MAX_EMAILS_ = 5;
var LOOKBACK_H_ = 24;

// ── Skill registry ────────────────────────────────────────────────────────────

var SKILLS_ = {
  LEGALIZER:  { icon: '⚖️',  name: 'Легалайзер',   desc: 'contracts, invoices, legal, compliance, GDPR, disputes' },
  MARKETOLOG: { icon: '📣',  name: 'Маркетолог',   desc: 'campaigns, brand, creative, media, promotions' },
  LOGIST:     { icon: '🚚',  name: 'Логист',        desc: 'shipments, freight, customs, warehouse, delivery, tracking' },
  PRODUCT:    { icon: '🦷',  name: 'Продукт',       desc: 'ingredients, formulas, clinical data, product questions' },
  PARTNER:    { icon: '🤝',  name: 'B2B менеджер',  desc: 'distributors, wholesale, exhibitions, B2B cooperation' },
  SUPPORT:    { icon: '💬',  name: 'Поддержка',     desc: 'orders, returns, complaints, customer service' },
  DEFAULT:    { icon: '✉️',  name: 'Общий',         desc: 'everything else' }
};

var SKILL_LIST_ = (function() {
  return Object.keys(SKILLS_).map(function(k) { return k + ' — ' + SKILLS_[k].desc; }).join('\n');
})();

// ── analyzeEmail_() — one Sonnet call → JSON ──────────────────────────────────

function analyzeEmail_(thread, body) {
  var system =
    'You are the AI orchestrator for Das Experten GmbH (premium oral care brand, Germany).\n' +
    'Read the email and respond with a JSON object only — no markdown, no extra text.\n\n' +
    'Available skills:\n' + SKILL_LIST_ + '\n\n' +
    'Rules:\n' +
    '1. Choose the single most relevant skill.\n' +
    '2. Adopt that skill\'s persona when writing the draft.\n' +
    '3. If you have enough context → needs_clarification: false, include full draft.\n' +
    '4. If a critical business decision is needed → needs_clarification: true, question + 2-4 short options (each ≤ 30 chars).\n' +
    '5. Reply language MUST match the original email.\n' +
    '6. Sign as "Das Experten Team".\n\n' +
    'Format A: {"skill":"PARTNER","needs_clarification":false,"draft":"Dear ...,\\n\\n..."}\n' +
    'Format B: {"skill":"LEGALIZER","needs_clarification":true,"question":"Offer discount?","options":["Yes 10%","No","Need details"]}';

  var user =
    'From: '     + f_(thread, 'last_message_from', 'from') +
    '\nSubject: ' + f_(thread, 'subject') +
    '\n\n'        + (body || '').substring(0, 800);

  try {
    var raw = claude_(system, user, MODEL_MAIN_, 700);
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    var parsed = JSON.parse(raw);
    if (!parsed.skill || !SKILLS_[parsed.skill]) parsed.skill = 'DEFAULT';
    return parsed;
  } catch (_) {
    return { skill: 'DEFAULT', needs_clarification: false, draft: '(Черновик недоступен — напиши вручную)' };
  }
}

// ── Search: find → analyze → auto-send OR ask ────────────────────────────────

function runSearch_(hint) {
  var label = hint ? '«' + hint + '»' : 'за 90 дней';
  tg_('🔍 Ищу письма ' + esc_(label) + '…');

  var res;
  try {
    res = emailer_({ action: 'find', query: 'newer_than:90d' + (hint ? ' ' + hint : ''), max_results: 3, filter_junk: true });
  } catch (e) { tg_('❌ Поиск: ' + String(e.message)); return; }

  var threads = res.threads || [];
  if (!threads.length) { tg_('Ничего не найдено по запросу ' + esc_(label)); return; }
  tg_('📬 Найдено: ' + threads.length + ' ' + (threads.length === 1 ? 'письмо' : 'письма') + '. Анализирую…');

  for (var k = 0; k < threads.length; k++) {
    var thread = threads[k];
    var body   = getBody_(thread);
    var result = analyzeEmail_(thread, body);

    if (result.needs_clarification) {
      askClarification_(thread, body, result);
    } else {
      autoSendAndReport_(thread, result);
    }
    if (k < threads.length - 1) Utilities.sleep(500);
  }
}

// ── Auto-send + Telegram report ──────────────────────────────────────────────

function autoSendAndReport_(thread, result) {
  var subject = f_(thread, 'subject').substring(0, 80)             || '(без темы)';
  var from    = f_(thread, 'last_message_from', 'from').substring(0, 60) || '?';
  var skill   = SKILLS_[result.skill] || SKILLS_.DEFAULT;

  try {
    emailer_({ action: 'reply', thread_id: thread.thread_id, body: result.draft });
  } catch (e) {
    tg_('❌ Не удалось отправить «' + esc_(subject) + '»: ' + String(e.message));
    return;
  }

  var summary = '';
  try {
    summary = claude_('Summarize this email reply in 1 short sentence in Russian.',
      result.draft, MODEL_FAST_, 60).trim();
  } catch (_) {}

  tg_('✅ <b>Отправлено</b>\n' +
      '👤 ' + esc_(from)    + '\n' +
      '📧 ' + esc_(subject) + '\n' +
      skill.icon + ' ' + esc_(skill.name) +
      (summary ? '\n\n📝 ' + esc_(summary) : ''));
}

// ── Clarification flow ────────────────────────────────────────────────────────

function askClarification_(thread, body, result) {
  var subject = f_(thread, 'subject').substring(0, 80)             || '(без темы)';
  var from    = f_(thread, 'last_message_from', 'from').substring(0, 60) || '?';
  var skill   = SKILLS_[result.skill] || SKILLS_.DEFAULT;
  var options = (result.options || ['Да','Нет','Пропустить']).slice(0, 4);

  storePending_(thread.thread_id, {
    from:    from,
    subject: subject,
    body:    (body || '').substring(0, 500),
    skill:   result.skill,
    options: options
  });

  var buttons = options.map(function(opt, i) {
    return { text: opt.substring(0, 30), callback_data: 'q|' + thread.thread_id + '|' + i };
  });

  tg_('❓ <b>' + esc_(subject) + '</b>\n' +
      '👤 ' + esc_(from) + '\n' +
      skill.icon + ' ' + esc_(skill.name) + '\n\n' +
      esc_(result.question || 'Нужно уточнение'),
      { inline_keyboard: [buttons] });
}

function handleClarification_(threadId, optionIdx) {
  var pending = loadPending_(threadId);
  if (!pending) { tg_('Контекст устарел.'); return; }

  var chosen = (pending.options || [])[optionIdx] || '?';
  var skill  = SKILLS_[pending.skill] || SKILLS_.DEFAULT;
  tg_('⏳ Готовлю ответ с учётом: <b>' + esc_(chosen) + '</b>…');

  var system = 'You are Das Experten ' + skill.name + '. ' +
    'Write a professional email reply incorporating this management decision: "' + chosen + '". ' +
    'Match the email language. Output ONLY the email body. Sign as "Das Experten Team".';
  var user = 'From: ' + pending.from + '\nSubject: ' + pending.subject + '\n\n' + pending.body;

  var draft;
  try { draft = claude_(system, user, MODEL_MAIN_, 400); }
  catch (e) { tg_('❌ Генерация: ' + String(e.message)); deletePending_(threadId); return; }

  try {
    emailer_({ action: 'reply', thread_id: threadId, body: draft });
  } catch (e) {
    tg_('❌ Отправка: ' + String(e.message));
    deletePending_(threadId);
    return;
  }

  var summary = '';
  try {
    summary = claude_('Summarize this email reply in 1 short sentence in Russian.',
      draft, MODEL_FAST_, 60).trim();
  } catch (_) {}

  tg_('✅ <b>Отправлено</b>\n' +
      '👤 ' + esc_(pending.from)    + '\n' +
      '📧 ' + esc_(pending.subject) + '\n' +
      skill.icon + ' ' + esc_(skill.name) + ' · решение: <i>' + esc_(chosen) + '</i>' +
      (summary ? '\n\n📝 ' + esc_(summary) : ''));

  deletePending_(threadId);
}

function storePending_(id, data) {
  PropertiesService.getScriptProperties().setProperty('_q_' + id, JSON.stringify(data));
}
function loadPending_(id) {
  var r = PropertiesService.getScriptProperties().getProperty('_q_' + id);
  return r ? (function() { try { return JSON.parse(r); } catch(_) { return null; } })() : null;
}
function deletePending_(id) {
  PropertiesService.getScriptProperties().deleteProperty('_q_' + id);
}

// ── One-time setup ────────────────────────────────────────────────────────────

function authorize() {
  PropertiesService.getScriptProperties().getProperties();
  UrlFetchApp.fetch('https://api.telegram.org/', { muteHttpExceptions: true });
  console.log('authorize OK');
}

function registerWebhook() {
  var token = prop_('TELEGRAM_BOT_TOKEN', true);
  var url   = prop_('ORCHESTRATOR_EXEC_URL', true);
  var r = UrlFetchApp.fetch(
    BOT_BASE_ + token + '/setWebhook?url=' + encodeURIComponent(url) +
    '&drop_pending_updates=true'
  );
  console.log(r.getContentText());
}

function testConfig() {
  var keys = ['TELEGRAM_BOT_TOKEN','ARAM_TELEGRAM_CHAT_ID','ANTHROPIC_API_KEY','EMAILER_EXEC_URL'];
  keys.forEach(function(k) { console.log(k + ': ' + (prop_(k) ? 'OK' : 'MISSING')); });
}

// ── doPost — process synchronously, dedup via update_id ──────────────────────

function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) || '{}';
  var EMPTY = ContentService.createTextOutput('{}').setMimeType(ContentService.MimeType.JSON);
  var upd;
  try { upd = JSON.parse(raw); } catch (_) { return EMPTY; }

  var uid = String(upd.update_id || '');
  var props = PropertiesService.getScriptProperties();
  if (uid && props.getProperty('_uid') === uid) return EMPTY;
  if (uid) props.setProperty('_uid', uid);

  try { dispatch_(upd); }
  catch (err) { try { tg_('⚠️ ' + String(err.message || err)); } catch (_) {} }

  return EMPTY;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

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

// ── Text handler ──────────────────────────────────────────────────────────────

function handleText_(text) {
  if (/почта|triage|inbox|письм|mail|сканир/i.test(text)) { runTriage_(); return; }
  var m = text.match(/^(?:найди|поиск|search|старо[ея]?)\s*(.*)/i);
  if (m) { runSearch_(m[1].trim()); return; }
  tg_('Команды:\n• <b>утренняя почта</b> — разобрать inbox\n• <b>найди [запрос]</b> — письма за 90 дней');
}

// ── Triage (unread 24h, manual confirm) ──────────────────────────────────────

function runTriage_() {
  tg_('📬 Сканирую inbox за последние ' + LOOKBACK_H_ + ' ч…');
  var res;
  try {
    res = emailer_({ action: 'find', query: 'is:unread newer_than:' + LOOKBACK_H_ + 'h', max_results: 30, filter_junk: true });
  } catch (e) { tg_('❌ ' + String(e.message)); return; }

  var threads = res.threads || [];
  if (!threads.length) { tg_('✅ Новых писем нет.'); return; }

  var counts = {}, important = [];
  for (var j = 0; j < threads.length; j++) {
    var t = threads[j];
    var label = classify_(t);
    t._urgency = label;
    counts[label] = (counts[label] || 0) + 1;
    if ((label === 'URGENT' || label === 'HIGH') && important.length < MAX_EMAILS_) important.push(t);
  }

  tg_('📊 <b>Inbox — ' + threads.length + ' писем</b>\n' +
    (counts.URGENT ? '🔴 Срочные: '    + counts.URGENT + '\n' : '') +
    (counts.HIGH   ? '🟠 Важные: '     + counts.HIGH   + '\n' : '') +
    (counts.MEDIUM ? '🟡 Обычные: '    + counts.MEDIUM + '\n' : '') +
    (counts.LOW    ? '⚪ Уведомления: ' + counts.LOW    + '\n' : ''));

  if (!important.length) { tg_('Срочных писем нет.'); return; }
  tg_('✍️ Готовлю черновики…');
  for (var k = 0; k < important.length; k++) {
    var email  = important[k];
    var body   = getBody_(email);
    var result = analyzeEmail_(email, body);
    presentWithDraftManual_(email, result);
    if (k < important.length - 1) Utilities.sleep(400);
  }
}

function presentWithDraftManual_(thread, result) {
  storeDraft_(thread.thread_id, {
    subject: f_(thread, 'subject').substring(0, 100)              || '(без темы)',
    from:    f_(thread, 'last_message_from', 'from').substring(0, 80) || '?',
    urgency: thread._urgency || 'HIGH',
    skill:   result.skill,
    draft:   (result.draft || '').substring(0, 600)
  });
  presentEmail_(thread.thread_id);
}

// ── Present email with manual [Send] [Draft] buttons ─────────────────────────

function presentEmail_(threadId) {
  var d = loadDraft_(threadId);
  if (!d) return;
  var skill = SKILLS_[d.skill] || SKILLS_.DEFAULT;
  var icon  = d.urgency === 'URGENT' ? '🔴' : '🟠';
  var text  = icon + ' <b>' + esc_(d.subject) + '</b> · ' + skill.icon + ' ' + esc_(skill.name) + '\n' +
    'От: ' + esc_(d.from) + '\n\n' +
    '<b>Черновик:</b>\n' + esc_(d.draft);
  tg_(text, { inline_keyboard: [[
    { text: '✅ Отправить',   callback_data: 's|' + threadId },
    { text: '📝 В черновики', callback_data: 'd|' + threadId }
  ]]});
}

// ── Button handlers (s, d, q) ────────────────────────────────────────────────

function handleAction_(data) {
  var parts    = data.split('|');
  var action   = parts[0];
  var threadId = parts[1] || '';

  if (action === 'q') {
    handleClarification_(threadId, parseInt(parts[2] || '0', 10));
    return;
  }

  var d = loadDraft_(threadId);
  if (!d) { tg_('Это письмо уже обработано.'); return; }

  if (action === 's') {
    try {
      emailer_({ action: 'reply', thread_id: threadId, body: d.draft });
      tg_('✅ Отправлено: <b>' + esc_(d.subject) + '</b>');
    } catch (e) { tg_('❌ ' + String(e.message)); }
    deleteDraft_(threadId);
    return;
  }
  if (action === 'd') {
    try {
      emailer_({ action: 'reply', thread_id: threadId, body: d.draft, draft_only: true });
      tg_('📝 В Gmail Drafts: <b>' + esc_(d.subject) + '</b>');
    } catch (_) {
      tg_('📝 <b>' + esc_(d.subject) + '</b>\n\n<pre>' + esc_(d.draft) + '</pre>');
    }
    deleteDraft_(threadId);
  }
}

// ── Draft storage ─────────────────────────────────────────────────────────────

function storeDraft_(id, data) {
  PropertiesService.getScriptProperties().setProperty('_d_' + id, JSON.stringify(data));
}
function loadDraft_(id) {
  var r = PropertiesService.getScriptProperties().getProperty('_d_' + id);
  return r ? (function() { try { return JSON.parse(r); } catch(_) { return null; } })() : null;
}
function deleteDraft_(id) {
  PropertiesService.getScriptProperties().deleteProperty('_d_' + id);
}

// ── Email helpers ─────────────────────────────────────────────────────────────

function classify_(thread) {
  try {
    var label = claude_(
      'Classify email urgency. Reply ONE word: URGENT HIGH MEDIUM LOW SKIP.',
      'From: ' + f_(thread, 'last_message_from', 'from') +
      '\nSubject: ' + f_(thread, 'subject') + '\n' +
      f_(thread, 'last_message_snippet', 'snippet').substring(0, 300),
      MODEL_FAST_, 5).trim().toUpperCase().replace(/\W/g, '');
    return ['URGENT','HIGH','MEDIUM','LOW','SKIP'].indexOf(label) >= 0 ? label : 'MEDIUM';
  } catch (_) { return 'MEDIUM'; }
}

function getBody_(thread) {
  try {
    var res = emailer_({ action: 'get_thread', thread_id: thread.thread_id });
    var msg = (res.messages || [])[0] || {};
    return (msg.body_plain || msg.snippet || '').substring(0, 800);
  } catch (_) { return f_(thread, 'last_message_snippet', 'snippet'); }
}

// ── Field helper ──────────────────────────────────────────────────────────────

function f_(obj, k1, k2, k3) {
  var v = obj[k1]; if (v) return String(v);
  if (k2) { v = obj[k2]; if (v) return String(v); }
  if (k3) { v = obj[k3]; if (v) return String(v); }
  return '';
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
  var body   = { chat_id: chatId, text: text.substring(0, 4090), parse_mode: 'HTML' };
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
