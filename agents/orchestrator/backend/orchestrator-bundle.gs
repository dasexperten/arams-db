/**
 * orchestrator-bundle.gs — Das Experten Orchestrator v2
 *
 * Commands:
 *   "утренняя почта"       → triage unread last 24h
 *   "найди <запрос>"       → search last 90 days, skill-routed reply
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
var MAX_EMAILS_ = 5;
var LOOKBACK_H_ = 24;

// ── Skills ────────────────────────────────────────────────────────────────────

var SKILLS_ = {
  LEGAL: {
    icon:   '⚖️',
    name:   'Юрист',
    re:     /invoice|contract|legal|compliance|gdpr|lawsuit|claim|dispute|termination|rechnun|vertrag|счёт|договор|претензия|расторж/i,
    prompt: 'You are a corporate lawyer advising Das Experten GmbH on business correspondence. ' +
            'Write a careful, professional reply. If there are any legal risks or obligations, flag them briefly at the end in brackets. ' +
            'Match the language of the original email. Output ONLY the email body.'
  },
  PARTNER: {
    icon:   '🤝',
    name:   'B2B менеджер',
    re:     /partner|distribut|wholesale|dealer|resell|agency|cooperat|exhibition|trade.?show|partner|дилер|оптов|сотрудниче|выставк|партнёр/i,
    prompt: 'You are a B2B sales manager at Das Experten, a premium oral care brand. ' +
            'Write a warm, professional reply that encourages the partnership. ' +
            'Match the language of the original email. Output ONLY the email body.'
  },
  SUPPORT: {
    icon:   '💬',
    name:   'Поддержка',
    re:     /order|return|refund|delivery|shipping|complaint|broken|damaged|заказ|возврат|доставк|жалоб|рекламац/i,
    prompt: 'You are a customer support specialist at Das Experten oral care brand. ' +
            'Write an empathetic, solution-focused reply. Offer a concrete next step. ' +
            'Match the language of the original email. Output ONLY the email body.'
  }
};

function detectSkill_(thread) {
  var text = f_(thread, 'last_message_from', 'from') + ' ' + f_(thread, 'subject');
  var keys = Object.keys(SKILLS_);
  for (var i = 0; i < keys.length; i++) {
    if (SKILLS_[keys[i]].re.test(text)) return keys[i];
  }
  return 'DEFAULT';
}

// ── One-time setup (run from Apps Script editor) ──────────────────────────────

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

// ── doPost — returns 200 immediately, processes async ────────────────────────

function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) || '{}';
  var EMPTY = ContentService.createTextOutput('{}').setMimeType(ContentService.MimeType.JSON);
  try {
    var upd = JSON.parse(raw);
    var uid = String(upd.update_id || '');
    var props = PropertiesService.getScriptProperties();
    if (uid) {
      if (props.getProperty('_uid') === uid) return EMPTY;
      props.setProperty('_uid', uid);
    }
    props.setProperty('_upd', raw);
    ScriptApp.getProjectTriggers()
      .filter(function(t) { return t.getHandlerFunction() === 'processUpdate_'; })
      .forEach(function(t) { ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('processUpdate_').timeBased().after(1000).create();
  } catch (_) {
    try { dispatch_(JSON.parse(raw)); } catch (__) {}
  }
  return EMPTY;
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
  // "найди <запрос>" or "старое письмо" or "поиск <запрос>"
  var searchMatch = text.match(/^(?:найди|поиск|search|старо[ея]?)\s*(.*)/i);
  if (searchMatch) {
    runSearch_(searchMatch[1].trim());
    return;
  }
  tg_('Привет. Команды:\n' +
      '• <b>утренняя почта</b> — разобрать inbox\n' +
      '• <b>найди [запрос]</b> — найти письмо за 90 дней');
}

// ── Inbox triage (unread last 24h) ────────────────────────────────────────────

function runTriage_() {
  tg_('📬 Сканирую inbox за последние ' + LOOKBACK_H_ + ' ч…');

  var res;
  try {
    res = emailer_({
      action:      'find',
      query:       'is:unread newer_than:' + LOOKBACK_H_ + 'h',
      max_results: 30,
      filter_junk: true
    });
  } catch (e) {
    tg_('❌ Ошибка поиска писем: ' + String(e.message));
    return;
  }

  var threads = res.threads || [];
  if (res.filtered_count) {
    console.log('emailer pre-filtered ' + res.filtered_count + ' junk threads');
  }
  if (!threads.length) { tg_('✅ Новых писем нет.'); return; }

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

  tg_('📊 <b>Inbox — ' + threads.length + ' писем</b>\n' +
    (counts.URGENT ? '🔴 Срочные: '    + counts.URGENT + '\n' : '') +
    (counts.HIGH   ? '🟠 Важные: '     + counts.HIGH   + '\n' : '') +
    (counts.MEDIUM ? '🟡 Обычные: '    + counts.MEDIUM + '\n' : '') +
    (counts.LOW    ? '⚪ Уведомления: ' + counts.LOW    + '\n' : ''));

  if (!important.length) { tg_('Срочных писем нет.'); return; }

  tg_('✍️ Готовлю черновики для ' + important.length + ' письма…');
  for (var k = 0; k < important.length; k++) {
    presentWithDraft_(important[k], important[k]._urgency);
    if (k < important.length - 1) Utilities.sleep(400);
  }
}

// ── Search (last 90 days, any read status) ────────────────────────────────────

function runSearch_(hint) {
  var label = hint ? '«' + hint + '»' : 'за 90 дней';
  tg_('🔍 Ищу письма ' + esc_(label) + '…');

  var query = 'newer_than:90d' + (hint ? ' ' + hint : '');
  var res;
  try {
    res = emailer_({ action: 'find', query: query, max_results: 3, filter_junk: true });
  } catch (e) {
    tg_('❌ Ошибка поиска: ' + String(e.message));
    return;
  }

  var threads = res.threads || [];
  if (!threads.length) { tg_('Ничего не найдено по запросу ' + esc_(label)); return; }

  tg_('📬 Найдено: ' + threads.length + ' ' + (threads.length === 1 ? 'письмо' : 'письма'));

  for (var k = 0; k < threads.length; k++) {
    presentWithDraft_(threads[k], 'HIGH');
    if (k < threads.length - 1) Utilities.sleep(400);
  }
}

// ── Shared: fetch body, detect skill, draft, store, present ──────────────────

function presentWithDraft_(thread, urgency) {
  var body  = getBody_(thread);
  var skill = detectSkill_(thread);
  var draft = makeDraftWithSkill_(thread, body, skill);
  storeDraft_(thread.thread_id, {
    subject: f_(thread, 'subject').substring(0, 100) || '(без темы)',
    from:    f_(thread, 'last_message_from', 'from').substring(0, 80) || '?',
    urgency: urgency,
    skill:   skill,
    draft:   draft.substring(0, 600)
  });
  presentEmail_(thread.thread_id);
}

// ── Present one email with buttons ────────────────────────────────────────────

function presentEmail_(threadId) {
  var d = loadDraft_(threadId);
  if (!d) return;
  var urgencyIcon = d.urgency === 'URGENT' ? '🔴' : '🟠';
  var skillLabel  = d.skill && d.skill !== 'DEFAULT' && SKILLS_[d.skill]
    ? ' · ' + SKILLS_[d.skill].icon + ' ' + SKILLS_[d.skill].name
    : '';
  var text = urgencyIcon + ' <b>' + esc_(d.subject) + '</b>' + esc_(skillLabel) + '\n' +
    'От: ' + esc_(d.from) + '\n\n' +
    '<b>Черновик:</b>\n' + esc_(d.draft);
  var kb = { inline_keyboard: [[
    { text: '✅ Отправить',   callback_data: 's|' + threadId },
    { text: '📝 В черновики', callback_data: 'd|' + threadId }
  ]]};
  tg_(text, kb);
}

// ── Button handlers ───────────────────────────────────────────────────────────

function handleAction_(data) {
  var sep      = data.indexOf('|');
  var action   = sep >= 0 ? data.substring(0, sep) : data;
  var threadId = sep >= 0 ? data.substring(sep + 1) : '';
  var d = loadDraft_(threadId);
  if (!d) { tg_('Это письмо уже обработано.'); return; }

  if (action === 's') {
    try {
      emailer_({ action: 'reply', thread_id: threadId, body: d.draft });
      tg_('✅ Отправлено: <b>' + esc_(d.subject) + '</b>');
    } catch (e) { tg_('❌ Ошибка отправки: ' + String(e.message)); }
    deleteDraft_(threadId);
    return;
  }

  if (action === 'd') {
    try {
      emailer_({ action: 'reply', thread_id: threadId, body: d.draft, draft_only: true });
      tg_('📝 Сохранено в Gmail Drafts:\n<b>' + esc_(d.subject) + '</b>\n\nОткрой Gmail → Черновики.');
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
  var snippet = f_(thread, 'last_message_snippet', 'snippet').substring(0, 300);
  var system = 'Classify email urgency. Reply ONE word: URGENT, HIGH, MEDIUM, LOW, or SKIP.\n' +
    'URGENT=action needed today (payment/complaint/contract/legal termination).\n' +
    'HIGH=important business or B2B partner email.\n' +
    'MEDIUM=general inquiry. LOW=newsletter/notification. SKIP=spam/auto.';
  try {
    var label = claude_(system,
      'From: ' + f_(thread, 'last_message_from', 'from') +
      '\nSubject: ' + f_(thread, 'subject') + '\n' + snippet,
      MODEL_FAST_, 5).trim().toUpperCase().replace(/\W/g, '');
    return ['URGENT','HIGH','MEDIUM','LOW','SKIP'].indexOf(label) >= 0 ? label : 'MEDIUM';
  } catch (_) { return 'MEDIUM'; }
}

function getBody_(thread) {
  try {
    var res = emailer_({ action: 'get_thread', thread_id: thread.thread_id });
    var msg = (res.messages || [])[0] || {};
    return (msg.body_plain || msg.snippet || '').substring(0, 500);
  } catch (_) { return f_(thread, 'last_message_snippet', 'snippet'); }
}

function makeDraftWithSkill_(thread, body, skill) {
  var system = (skill && skill !== 'DEFAULT' && SKILLS_[skill])
    ? SKILLS_[skill].prompt
    : 'You are a customer service writer for Das Experten oral care brand. ' +
      'Write a concise professional reply. Match the customer\'s language. ' +
      'Never fabricate product claims. Output ONLY the email body, no subject line.';
  try {
    return claude_(system,
      'From: ' + f_(thread, 'last_message_from', 'from') +
      '\nSubject: ' + f_(thread, 'subject') +
      '\n\n' + body, MODEL_MAIN_, 300);
  } catch (_) { return '(Черновик недоступен — напиши вручную)'; }
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
