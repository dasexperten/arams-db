/**
 * orchestrator-bundle.gs — Das Experten Orchestrator v3
 *
 * Flows:
 *   1. "найди <запрос>" → search emails → analyzeEmail_ (skill routing) → auto-send → report
 *   2. "удали <запрос>" → translate NL → Gmail-query → preview → confirm → trash_threads
 *   3. "утренняя почта" → scan inbox → classify → draft → Telegram buttons
 *   4. Clarification inline keyboard → pick option → draft with context → auto-send → report
 *
 * Script Properties required:
 *   TELEGRAM_BOT_TOKEN       — from @BotFather
 *   ARAM_TELEGRAM_CHAT_ID    — your Telegram chat ID
 *   ANTHROPIC_API_KEY        — Claude API key
 *   EMAILER_EXEC_URL         — emailer Web App URL
 *   ORCHESTRATOR_EXEC_URL    — this Web App URL (for registerWebhook)
 */

// ── Config ────────────────────────────────────────────────────────────────────

var BOT_BASE_   = 'https://api.telegram.org/bot';
var MODEL_FAST_ = 'claude-haiku-4-5-20251001';
var MODEL_MAIN_ = 'claude-sonnet-4-6';
var MAX_EMAILS_ = 5;
var LOOKBACK_H_ = 24;

// ── Skills registry ───────────────────────────────────────────────────────────

var SKILLS_ = {
  LEGALIZER:  { icon: '⚖️',  name: 'Юрист',        desc: 'Претензии, договоры, правовые вопросы' },
  MARKETOLOG: { icon: '📢',  name: 'Маркетолог',   desc: 'Акции, отзывы, продвижение' },
  LOGIST:     { icon: '🚚',  name: 'Логист',       desc: 'Доставка, возвраты, трекинг' },
  PRODUCT:    { icon: '🦷',  name: 'Продуктолог',  desc: 'Вопросы о товаре, состав, применение' },
  PARTNER:    { icon: '🤝',  name: 'Партнёр',      desc: 'B2B, дистрибуция, опт' },
  SUPPORT:    { icon: '💬',  name: 'Поддержка',    desc: 'Общие вопросы покупателей' },
  DEFAULT:    { icon: '📧',  name: 'Общий',        desc: 'Не подходит ни под одну категорию' }
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

// ── doPost — synchronous, dedup via update_id ─────────────────────────────────

function doPost(e) {
  var raw = (e && e.postData && e.postData.contents) || '{}';
  var EMPTY = ContentService.createTextOutput('{}').setMimeType(ContentService.MimeType.JSON);
  var upd;
  try { upd = JSON.parse(raw); } catch (_) { return EMPTY; }
  var uid = String(upd.update_id || '');

  // Atomic check-set under lock prevents concurrent executions racing on _uid
  var lock = LockService.getScriptLock();
  try { lock.waitLock(3000); } catch (_) { return EMPTY; }
  try {
    var props = PropertiesService.getScriptProperties();
    if (uid && props.getProperty('_uid') === uid) return EMPTY;
    if (uid) props.setProperty('_uid', uid);
  } finally {
    lock.releaseLock();
  }

  try { dispatch_(upd); }
  catch (err) {
    try {
      var msg = String(err.message || err).replace(/bot\d+:[A-Za-z0-9_-]+\//g, 'bot<token>/');
      tg_('⚠️ ' + msg);
    } catch (_) {}
  }
  return EMPTY;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

function dispatch_(upd) {
  var myChat = prop_('ARAM_TELEGRAM_CHAT_ID');

  // DIAG: log every incoming update so we can spot phantom traffic
  var diagSrc =
    (upd.message && upd.message.chat && upd.message.chat.id) ||
    (upd.edited_message && upd.edited_message.chat && upd.edited_message.chat.id) ||
    (upd.callback_query && upd.callback_query.message && upd.callback_query.message.chat && upd.callback_query.message.chat.id) ||
    (upd.channel_post && upd.channel_post.chat && upd.channel_post.chat.id) ||
    '?';
  var diagFrom =
    (upd.message && upd.message.from && (upd.message.from.username || upd.message.from.id)) ||
    (upd.callback_query && upd.callback_query.from && (upd.callback_query.from.username || upd.callback_query.from.id)) ||
    '?';
  var diagText =
    (upd.message && upd.message.text) ||
    (upd.callback_query && ('cbq:' + upd.callback_query.data)) ||
    (upd.edited_message && ('edit:' + upd.edited_message.text)) ||
    (upd.channel_post && ('channel:' + upd.channel_post.text)) ||
    Object.keys(upd).filter(function(k){ return k !== 'update_id'; }).join(',');
  console.log('dispatch_ src=' + diagSrc + ' (mine=' + myChat + ') from=' + diagFrom + ' kind=' + String(diagText).substring(0, 200));

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
  console.log('handleText_: ' + text);
  if (/^пинг$|^ping$/i.test(text)) { tg_('понг v4 ✅'); return; }

  if (/^тест$|^test$/i.test(text)) {
    tg_('⚙️ Шаг 1: tg_ OK. Проверяю emailer…');
    try {
      var r = emailer_({ action: 'find', query: 'test', max_results: 1 });
      tg_('⚙️ Шаг 2: emailer OK (' + (r.total_found || 0) + ' писем). Проверяю Claude…');
    } catch (e) {
      tg_('❌ Emailer ERROR: ' + String(e.message));
      return;
    }
    try {
      var ans = claude_('Reply with one word: OK', 'ping', MODEL_FAST_, 5);
      tg_('⚙️ Шаг 3: Claude OK («' + ans.trim() + '»). Всё работает ✅');
    } catch (e) {
      tg_('❌ Claude ERROR: ' + String(e.message));
    }
    return;
  }

  var searchMatch = text.match(/^найди\s+(.+)$/iu);
  if (searchMatch) { runSearch_(searchMatch[1].trim()); return; }
  var trashMatch = text.match(/^удали\s+(.+)$/iu);
  if (trashMatch) { runTrash_(trashMatch[1].trim()); return; }
  if (/почта|triage|inbox|письм|mail|сканир/iu.test(text)) { runTriage_(); return; }
  tg_('Привет. Команды:\n• <b>найди [запрос]</b> — поиск письма\n• <b>удали [запрос]</b> — переместить в корзину (с подтверждением)\n• <b>утренняя почта</b> — разобрать inbox\n• <b>пинг</b> — проверка связи\n• <b>тест</b> — диагностика');
}

// ── Search flow ───────────────────────────────────────────────────────────────

function runSearch_(query) {
  tg_('🔍 Ищу письма «' + esc_(query) + '»…');
  var res;
  try {
    res = emailer_({ action: 'find', query: query, max_results: 10 });
  } catch (e) {
    tg_('❌ Ошибка поиска: ' + String(e.message));
    return;
  }
  var threads = res.threads || [];
  if (!threads.length) { tg_('Писем не найдено.'); return; }
  tg_('📬 Найдено: ' + threads.length + ' письма. Анализирую…');
  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var body = getBody_(thread);
    var analysis = analyzeEmail_(thread, body);
    if (analysis.needs_clarification) {
      askClarification_(thread, analysis);
    } else {
      autoSendAndReport_(thread, analysis.skill, analysis.draft);
    }
    if (i < threads.length - 1) Utilities.sleep(300);
  }
}

// ── Skill routing — one Sonnet call returns JSON ──────────────────────────────

function analyzeEmail_(thread, body) {
  var skillList = Object.keys(SKILLS_).map(function(k) {
    return k + ' — ' + SKILLS_[k].desc;
  }).join('\n');

  var system =
    'Ты — оркестратор почты Das Experten (бренд средств гигиены полости рта).\n' +
    'Прочитай письмо и верни ТОЛЬКО JSON (без markdown, без пояснений):\n\n' +
    'Если ответ очевиден:\n' +
    '{"skill":"КОД","needs_clarification":false,"draft":"текст ответа на языке отправителя"}\n\n' +
    'Если без уточнения нельзя ответить правильно:\n' +
    '{"skill":"КОД","needs_clarification":true,"question":"вопрос","options":["Вариант А","Вариант Б"]}\n\n' +
    'Навыки:\n' + skillList + '\n\n' +
    'Правила:\n' +
    '- draft: только тело письма, без темы, профессиональный тон\n' +
    '- needs_clarification=true ТОЛЬКО если информации реально недостаточно\n' +
    '- options: 2-3 конкретных взаимоисключающих варианта';

  var user = 'От: ' + f_(thread, 'last_message_from', 'from') +
    '\nТема: ' + f_(thread, 'subject') + '\n\n' + body;

  try {
    var raw = claude_(system, user, MODEL_MAIN_, 600);
    var cleanJson = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    return { skill: 'DEFAULT', needs_clarification: false,
      draft: '(Ошибка анализа — ответьте вручную: ' + String(e.message) + ')' };
  }
}

// ── Auto-send and report ──────────────────────────────────────────────────────

function autoSendAndReport_(thread, skillCode, draft) {
  var skill   = SKILLS_[skillCode] || SKILLS_.DEFAULT;
  var subject = f_(thread, 'subject').substring(0, 100) || '(без темы)';
  var from    = f_(thread, 'last_message_from', 'from').substring(0, 80) || '?';
  try {
    emailer_({ action: 'reply', thread_id: thread.thread_id, body_plain: draft });
  } catch (e) {
    tg_('❌ Не удалось отправить «' + esc_(subject) + '»: ' + String(e.message));
    return;
  }
  var summary = '';
  try {
    summary = claude_(
      'One sentence summary in Russian of what was replied.',
      'Subject: ' + subject + '\nReply: ' + draft.substring(0, 300),
      MODEL_FAST_, 80
    ).trim();
  } catch (_) {}
  tg_('✅ Отправлено\n' +
    '👤 ' + esc_(from) + '\n' +
    '📧 ' + esc_(subject) + '\n' +
    skill.icon + ' ' + skill.name +
    (summary ? '\n📝 ' + esc_(summary) : ''));
}

// ── Clarification flow ────────────────────────────────────────────────────────

function askClarification_(thread, analysis) {
  var threadId = thread.thread_id;
  var subject  = f_(thread, 'subject').substring(0, 100) || '(без темы)';
  var from     = f_(thread, 'last_message_from', 'from').substring(0, 80) || '?';
  var skill    = SKILLS_[analysis.skill] || SKILLS_.DEFAULT;
  var options  = analysis.options || ['Да', 'Нет'];

  PropertiesService.getScriptProperties().setProperty(
    '_q_' + threadId,
    JSON.stringify({ subject: subject, from: from, skill: analysis.skill,
      body: (getBody_(thread) || '').substring(0, 400), options: options })
  );

  var buttons = options.map(function(opt, idx) {
    return [{ text: opt, callback_data: 'q|' + threadId + '|' + idx }];
  });

  tg_(skill.icon + ' <b>' + esc_(subject) + '</b>\nОт: ' + esc_(from) +
    '\n\n❓ ' + esc_(analysis.question), { inline_keyboard: buttons });
}

function handleClarification_(threadId, optionIdx) {
  var raw = PropertiesService.getScriptProperties().getProperty('_q_' + threadId);
  if (!raw) { tg_('Контекст устарел, начни поиск заново.'); return; }
  var state;
  try { state = JSON.parse(raw); } catch (_) { tg_('Ошибка чтения контекста.'); return; }
  PropertiesService.getScriptProperties().deleteProperty('_q_' + threadId);

  var chosen   = (state.options || [])[optionIdx] || 'неизвестно';
  var skillList = Object.keys(SKILLS_).map(function(k) {
    return k + ' — ' + SKILLS_[k].desc;
  }).join('\n');

  var system =
    'Ты — оркестратор почты Das Experten. Пользователь уточнил контекст.\n' +
    'Напиши финальный ответ на письмо. Только тело письма, без темы.\n' +
    'Навыки: ' + skillList;
  var user = 'От: ' + esc_(state.from) + '\nТема: ' + esc_(state.subject) +
    '\n\nКонтекст письма: ' + (state.body || '') +
    '\n\nПользователь выбрал: ' + chosen;

  var draft;
  try { draft = claude_(system, user, MODEL_MAIN_, 400); }
  catch (e) { tg_('❌ Ошибка генерации ответа: ' + String(e.message)); return; }

  var fakeThread = { thread_id: threadId, subject: state.subject, last_message_from: state.from };
  autoSendAndReport_(fakeThread, state.skill, draft);
}

// ── Button handlers (s=send, d=draft, q=clarification) ────────────────────────

function handleAction_(data) {
  var parts    = data.split('|');
  var action   = parts[0];
  var threadId = parts[1] || '';

  if (action === 'q') {
    handleClarification_(threadId, parseInt(parts[2] || '0', 10));
    return;
  }

  if (action === 't') {
    handleTrash_(threadId, parts[2] || 'n');
    return;
  }

  var d = loadDraft_(threadId);
  if (!d) { tg_('Это письмо уже обработано.'); return; }

  if (action === 's') {
    try {
      emailer_({ action: 'reply', thread_id: threadId, body_plain: d.draft });
      tg_('✅ Отправлено: <b>' + esc_(d.subject) + '</b>');
    } catch (e) { tg_('❌ Ошибка отправки: ' + String(e.message)); }
    deleteDraft_(threadId);
    return;
  }

  if (action === 'd') {
    try {
      emailer_({ action: 'reply', thread_id: threadId, body_plain: d.draft, draft_only: true });
      tg_('📝 Сохранено в Gmail Drafts:\n<b>' + esc_(d.subject) + '</b>\n\nОткрой Gmail → Черновики.');
    } catch (_) {
      tg_('📝 <b>' + esc_(d.subject) + '</b>\n\n<pre>' + esc_(d.draft) + '</pre>');
    }
    deleteDraft_(threadId);
  }
}

// ── Trash flow ────────────────────────────────────────────────────────────────
//
// Requires emailer Web App to support:
//   { action: 'trash_threads', thread_ids: ['t1','t2',...] }
//   → moves all threads to Gmail Trash (recoverable for 30 days).
//   Returns: { trashed: <int>, failed: [<thread_id>...] }

function runTrash_(natural) {
  tg_('🔍 Ищу что удалить: «' + esc_(natural) + '»…');
  var gmailQuery = translateQuery_(natural);
  var res;
  try {
    res = emailer_({ action: 'find', query: gmailQuery, max_results: 50 });
  } catch (e) {
    tg_('❌ Ошибка поиска: ' + String(e.message));
    return;
  }
  var threads = res.threads || [];
  if (!threads.length) {
    tg_('Ничего не найдено по запросу <code>' + esc_(gmailQuery) + '</code>');
    return;
  }

  var ids   = threads.map(function(t) { return t.thread_id; });
  var token = Utilities.getUuid().substring(0, 8);
  PropertiesService.getScriptProperties().setProperty(
    '_t_' + token,
    JSON.stringify({ ids: ids, query: gmailQuery, natural: natural })
  );

  var preview = threads.slice(0, 8).map(function(t, i) {
    var subj = (f_(t, 'subject') || '(без темы)').substring(0, 70);
    var from = f_(t, 'last_message_from', 'from').substring(0, 40);
    return (i + 1) + '. <b>' + esc_(subj) + '</b>\n   ' + esc_(from);
  }).join('\n');
  var more = threads.length > 8 ? '\n…и ещё ' + (threads.length - 8) : '';

  tg_(
    '🗑 Найдено <b>' + threads.length + '</b> писем по запросу:\n' +
    '<code>' + esc_(gmailQuery) + '</code>\n\n' +
    preview + more + '\n\nПереместить все в Корзину?',
    { inline_keyboard: [[
      { text: '🗑 Удалить ' + threads.length, callback_data: 't|' + token + '|y' },
      { text: '✖ Отмена',                     callback_data: 't|' + token + '|n' }
    ]] }
  );
}

function handleTrash_(token, decision) {
  var key = '_t_' + token;
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) { tg_('Запрос на удаление устарел.'); return; }
  PropertiesService.getScriptProperties().deleteProperty(key);

  if (decision !== 'y') { tg_('✖ Отменено. Ничего не удалено.'); return; }

  var state;
  try { state = JSON.parse(raw); } catch (_) { tg_('Ошибка чтения контекста.'); return; }

  try {
    var resp = emailer_({ action: 'trash_threads', thread_ids: state.ids });
    var ok   = (resp && typeof resp.trashed === 'number') ? resp.trashed : state.ids.length;
    var fail = (resp && resp.failed && resp.failed.length) || 0;
    tg_('✅ В корзину отправлено <b>' + ok + '</b> писем.' +
        (fail ? '\n⚠️ Не удалось: ' + fail : '') +
        '\nВосстановить в Gmail → Корзина (30 дней).');
  } catch (e) {
    tg_('❌ Ошибка удаления: ' + String(e.message));
  }
}

// ── NL → Gmail query translator ──────────────────────────────────────────────

function translateQuery_(natural) {
  var system =
    'Ты переводишь русский/английский натуральный запрос в Gmail-search синтаксис. ' +
    'Верни ТОЛЬКО строку запроса. Без кавычек, без markdown, без пояснений. ' +
    'Используй from:, subject:, has:attachment, filename:, newer_than:, OR, скобки. ' +
    'Если запрос про "рассылки/newsletter/promo/spam" — добавь (list:* OR unsubscribe). ' +
    'Если запрос про конкретного отправителя или организацию — используй from:(вариант1 OR вариант2_транслит). ' +
    'Если временной диапазон не указан явно — НЕ добавляй newer_than, чтобы не отрезать старое.';
  try {
    var q = claude_(system, natural, MODEL_FAST_, 100).trim()
      .replace(/^["'`]+|["'`]+$/g, '').replace(/\s*\n+\s*/g, ' ');
    return q || natural;
  } catch (_) { return natural; }
}

// ── Inbox triage ──────────────────────────────────────────────────────────────

function runTriage_() {
  tg_('📬 Сканирую inbox за последние ' + LOOKBACK_H_ + ' ч…');
  var res;
  try {
    res = emailer_({
      action: 'find', query: 'is:unread newer_than:' + LOOKBACK_H_ + 'h',
      max_results: 30, filter_junk: true
    });
  } catch (e) {
    tg_('❌ Ошибка поиска писем: ' + String(e.message));
    return;
  }
  var threads = res.threads || [];
  if (res.filtered_count) console.log('emailer pre-filtered ' + res.filtered_count + ' junk threads');
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
    (counts.URGENT ? '🔴 Срочные: '     + counts.URGENT + '\n' : '') +
    (counts.HIGH   ? '🟠 Важные: '      + counts.HIGH   + '\n' : '') +
    (counts.MEDIUM ? '🟡 Обычные: '     + counts.MEDIUM + '\n' : '') +
    (counts.LOW    ? '⚪ Уведомления: '  + counts.LOW    + '\n' : ''));

  if (!important.length) { tg_('Срочных писем нет.'); return; }

  tg_('✍️ Готовлю черновики для ' + important.length + ' письма…');
  for (var k = 0; k < important.length; k++) {
    var email = important[k];
    var body  = getBody_(email);
    var draft = makeDraft_(email, body);
    storeDraft_(email.thread_id, {
      subject: f_(email, 'subject').substring(0, 100) || '(без темы)',
      from:    f_(email, 'last_message_from', 'from').substring(0, 80) || '?',
      urgency: email._urgency,
      draft:   draft.substring(0, 600)
    });
    presentEmail_(email.thread_id);
    if (k < important.length - 1) Utilities.sleep(400);
  }
}

// ── Present one triage email with send/draft buttons ──────────────────────────

function presentEmail_(threadId) {
  var d = loadDraft_(threadId);
  if (!d) return;
  var icon = d.urgency === 'URGENT' ? '🔴' : '🟠';
  tg_(icon + ' <b>' + esc_(d.subject) + '</b>\nОт: ' + esc_(d.from) +
    '\n\n<b>Черновик:</b>\n' + esc_(d.draft),
    { inline_keyboard: [[
      { text: '✅ Отправить',    callback_data: 's|' + threadId },
      { text: '📝 В черновики', callback_data: 'd|' + threadId }
    ]]});
}

// ── Draft storage (Script Properties) ────────────────────────────────────────

function storeDraft_(threadId, data) {
  PropertiesService.getScriptProperties().setProperty('_d_' + threadId, JSON.stringify(data));
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
    'URGENT=action needed today. HIGH=important business. MEDIUM=general. LOW=newsletter. SKIP=spam.';
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

function makeDraft_(thread, body) {
  var system = 'You are a customer service writer for Das Experten oral care brand. ' +
    'Write a concise professional reply. Match the customer\'s language. ' +
    'Never fabricate product claims. Output ONLY the email body, no subject line.';
  try {
    return claude_(system,
      'From: ' + f_(thread, 'last_message_from', 'from') +
      '\nSubject: ' + f_(thread, 'subject') + '\n\n' + body,
      MODEL_MAIN_, 250);
  } catch (_) { return '(Черновик недоступен — напиши вручную)'; }
}

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
  var props  = PropertiesService.getScriptProperties();
  var token  = props.getProperty('TELEGRAM_BOT_TOKEN')  || '';
  var chatId = props.getProperty('ARAM_TELEGRAM_CHAT_ID') || '';
  if (!token || !chatId) { console.warn('tg_: missing token or chatId'); return; }
  var body = { chat_id: chatId, text: String(text || '').substring(0, 4090), parse_mode: 'HTML' };
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
