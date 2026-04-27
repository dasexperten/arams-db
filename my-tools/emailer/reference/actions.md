# Actions — Operational Reference

**Source of truth:** `my-tools/emailer/backend/emailer-bundle.gs` (для actual schemas, return objects).
**Этот файл:** decision tree — **какой** action выбрать в каждой ситуации, **как** их комбинировать, **где** типичные ошибки.

emailer экспонирует **7 actions** через единый POST endpoint. Каждый запрос — это JSON с полем `action` + параметры.

---

## Карта 7 actions

| Action | Тип | Что делает | Reporter архивирует? |
|---|---|---|---|
| `send` | write | Отправляет новое исходящее письмо | Да (если не draft_only) |
| `reply` | write | Отвечает в существующем треде одному отправителю | Да (если не draft_only) |
| `reply_all` | write | Отвечает в треде всем (To + CC) | Да (если не draft_only) |
| `find` | read | Поиск писем по Gmail query | Нет |
| `get_thread` | read | Получает полную историю треда | Нет |
| `download_attachment` | read | Сохраняет вложение в Drive | Нет (но есть log) |
| `archive` | write | Пишет произвольный текст в Drive (для больших отчётов) | N/A (это и есть архив) |

**Универсальный флаг `draft_only:true`** — для `send` / `reply` / `reply_all` создаёт черновик в Gmail вместо отправки. Reporter НЕ вызывается (ничего ещё не отправлено).

---

## Decision tree — какой action использовать

```
Запрос пользователя
   │
   ├─ "Отправь / напиши / send письмо <получатель>"
   │     ├─ Без существующего треда → send
   │     ├─ "не отправляй пока", "покажи черновик" → send + draft_only:true
   │     └─ Если есть thread_id → переход к "Ответь"
   │
   ├─ "Ответь / reply на письмо"
   │     ├─ Только отправителю → reply
   │     ├─ Всем участникам (To + CC) → reply_all
   │     ├─ "не отправляй пока", "покажи черновик" → reply / reply_all + draft_only:true
   │     └─ Если нет thread_id, есть subject/sender → сначала find, потом reply
   │
   ├─ "Найди / search / search письма от X / по теме Y"
   │     └─ find
   │
   ├─ "Что было в этом треде", "покажи историю"
   │     ├─ Известен thread_id → get_thread
   │     └─ Неизвестен → сначала find, потом get_thread
   │
   ├─ "Скачай файл / вложение из письма"
   │     ├─ Известен message_id → download_attachment
   │     └─ Неизвестен → сначала find → get_thread (получить message_id) → download_attachment
   │
   └─ "Заархивируй этот текст / сохрани в Drive"
         (для большого текста, который превышает лимит Reporter — gmail-search транскрипты, аналитика, отчёты)
         └─ archive
```

---

## Action 1: `send` — новое исходящее письмо

### Когда использовать

- Cold outreach (первое письмо новому клиенту / партнёру / блогеру)
- Маркетинговая рассылка отдельному получателю
- Уведомление, не привязанное к существующей переписке
- Любое письмо, которое **не является ответом** на existing thread

### Required fields

```json
{
  "action": "send",
  "recipient": "buyer@example.com",
  "subject": "Subject line",
  "body_html": "<p>HTML body</p>",
  "body_plain": "Plain text body"
}
```

Минимум одно из `body_html` или `body_plain` обязательно. Лучше оба — `body_html` для визуала, `body_plain` для fallback.

### Optional fields

| Field | Назначение |
|---|---|
| `attachment_link` | Ссылка на Drive файл — добавится в конец письма как "Open attachment" |
| `context` | Caller-supplied контекст — попадёт в Reporter Doc как отдельная секция |
| `draft_only: true` | Создать черновик вместо отправки |

### Returns

```json
{
  "success": true,
  "action": "send",
  "mode": "new",
  "message_id": "...",
  "thread_id": "...",
  "archive_doc_link": "https://docs.google.com/...",
  "archive_doc_id": "...",
  "result_summary": "Email sent to buyer@example.com"
}
```

### Типичные ошибки

| Ошибка | Причина | Решение |
|---|---|---|
| `Missing required field: recipient` | Не указан адресат | Добавить `recipient` |
| `Missing required field: subject` | Письмо без темы | Subject обязателен — сгенерируй из контекста |
| `Missing required field: body_html or body_plain` | Пустое тело | Добавить хотя бы plain text |

---

## Action 2: `reply` — ответ внутри треда одному отправителю

### Когда использовать

- Клиент написал в одном из 4 inbox — отвечаем ему лично
- Один-на-один переписка с buyer / партнёром
- В треде нет CC или CC не нужно сохранять

### Required fields

```json
{
  "action": "reply",
  "thread_id": "...",
  "body_html": "<p>...</p>",
  "body_plain": "..."
}
```

### Optional fields

| Field | Назначение |
|---|---|
| `attachment_link` | Drive ссылка |
| `context` | Caller context для Reporter |
| `draft_only: true` | Черновик вместо отправки |
| `in_reply_to_message_id` | Информационно — Gmail сам выставит In-Reply-To header |

### Threading guarantee

Gmail автоматически выставляет In-Reply-To и References headers через `thread.reply()`. **Письмо никогда не станет orphan**.

### Returns

```json
{
  "success": true,
  "action": "reply",
  "mode": "reply",
  "message_id": "...",
  "thread_id": "...",
  "archive_doc_link": "..."
}
```

### Типичные ошибки

| Ошибка | Причина | Решение |
|---|---|---|
| `Invalid or inaccessible thread_id` | Тред не существует или нет доступа | Проверить thread_id через find |
| `Missing required field: thread_id` | Не указан тред | Найти через find |

---

## Action 3: `reply_all` — ответ всем в треде

### Когда использовать

- В треде несколько участников (фабрика + логист + Aram, например)
- Нужно сохранить CC список (юристы, финансисты, manager копией)
- Корпоративная коммуникация, где исключение участника = политическая ошибка

### Когда НЕ использовать

- Личный B2C ответ клиенту (используй `reply`)
- Когда CC список содержит ненужных получателей (используй `reply` и добавь CC вручную если нужно)

### Required / Optional fields

Идентично `reply`. Reporter в архиве "to" поле = comma-joined список всех To + CC.

### Self-exclusion logic

Backend автоматически:
- Удаляет email Aram из To и CC (чтобы он не получил копию своего же письма)
- Перемещает оригинального отправителя в начало To-списка
- Сохраняет всех остальных в CC

---

## Action 4: `find` — поиск писем по Gmail query

### Когда использовать

- "Найди письмо от Hryceva за последний месяц"
- "Найди письма с темой 'Invoice 2024'"
- "Покажи unread в inbox"
- Подготовка к reply / get_thread — нужно сначала получить thread_id

### Required fields

```json
{
  "action": "find",
  "query": "from:hryceva@example.com newer_than:30d"
}
```

### Optional fields

| Field | Default | Hard cap |
|---|---|---|
| `max_results` | 10 | 50 |

### Gmail query syntax (примеры)

| Запрос | Query |
|---|---|
| От конкретного отправителя | `from:user@example.com` |
| По теме | `subject:"Invoice 2024"` |
| За последние 7 дней | `newer_than:7d` |
| Непрочитанные в inbox | `is:unread in:inbox` |
| С вложениями | `has:attachment` |
| Конкретный inbox | `to:emea@dasexperten.de` |
| Комбинация | `from:hryceva@example.com newer_than:30d has:attachment` |

### Returns

```json
{
  "success": true,
  "action": "find",
  "query": "...",
  "total_found": 5,
  "threads": [
    {
      "thread_id": "...",
      "subject": "...",
      "last_message_from": "...",
      "last_message_snippet": "first 150 chars",
      "message_count": 3,
      "has_attachments": true,
      "last_message_date": "2026-04-25T14:30:00Z",
      "participants": ["..."]
    }
  ]
}
```

### Reporter не вызывается

`find` — read-only action. Никаких Drive Docs не создаётся.

---

## Action 5: `get_thread` — полная история треда

### Когда использовать

- После `find` — получить полное содержание найденного треда
- Прежде чем отвечать на длинную переписку — нужно понять весь контекст
- Анализ B2B-переговоров (с какого момента позиции разошлись)

### Required fields

```json
{
  "action": "get_thread",
  "thread_id": "..."
}
```

### Returns

```json
{
  "success": true,
  "action": "get_thread",
  "thread_id": "...",
  "subject": "...",
  "participants": ["..."],
  "message_count": 5,
  "messages": [
    {
      "message_id": "...",
      "from": "...",
      "to": ["..."],
      "cc": ["..."],
      "date": "2026-04-25T...",
      "body_plain": "full plain text",
      "has_attachments": true,
      "attachment_names": ["invoice.pdf", "specs.xlsx"]
    }
  ]
}
```

Сообщения возвращаются **chronologically (oldest first)**.

### Reporter не вызывается

`get_thread` — read-only. Если результат большой и нужно сохранить транскрипт в Drive — используй `archive` после `get_thread`.

---

## Action 6: `download_attachment` — сохранение вложения в Drive

### Когда использовать

- Клиент прислал invoice/contract — нужно сохранить в общий Drive
- Партнёр прислал спецификации фабрики — для дальнейшей работы
- Любое вложение, которое нужно архивировать или передать в другой workflow

### Required fields

Минимум один из двух:

```json
{
  "action": "download_attachment",
  "message_id": "...",
  "attachment_name": "invoice.pdf"
}
```

или

```json
{
  "action": "download_attachment",
  "message_id": "...",
  "attachment_index": 0
}
```

### Optional fields

| Field | Назначение |
|---|---|
| `target_subfolder_override` | Имя папки в Drive (default — per-sender subfolder в `INBOX_ATTACHMENTS_FOLDER_ID`) |

### Where it saves

Drive: `INBOX_ATTACHMENTS_FOLDER_ID/<sanitized_sender_email>/<filename>`

Sharing: anyone with link can view (для удобной передачи).

### Returns

```json
{
  "success": true,
  "action": "download_attachment",
  "file_id": "...",
  "file_name": "invoice.pdf",
  "file_link": "https://drive.google.com/...",
  "saved_to_folder": "Inbox Attachments / hryceva_example.com",
  "sender": "Hryceva LLC <hryceva@example.com>",
  "size_bytes": 524288,
  "mime_type": "application/pdf"
}
```

---

## Action 7: `archive` — большой текст в Drive

### Когда использовать

- Транскрипт `find` + `get_thread` слишком большой для Reporter Doc (>80KB) → используй `archive` вместо ручного сохранения
- Аналитический отчёт по перепискам за месяц
- Дамп gmail-search для одного клиента — для CRM-памяти
- Любой read-only output, который нужно сохранить как permanent trail в Drive

### Когда НЕ использовать

- Архив отправленного письма — это делает Reporter автоматически при send/reply/reply_all
- Маленькие тексты (<5 строк) — храни в логах, не плодите файлы

### Required fields

```json
{
  "action": "archive",
  "title": "Hryceva correspondence — April 2026",
  "body_plain": "Full text content here..."
}
```

или с HTML:

```json
{
  "action": "archive",
  "title": "...",
  "body_html": "<h1>...</h1><p>...</p>"
}
```

### Optional fields

| Field | Default | Назначение |
|---|---|---|
| `archive_label` | `system-archive` | Имя subfolder в `REPORTER_FOLDER_ID` (например, `gmail-search`) |
| `context` | — | Caller context — попадёт в header архивного файла |
| `mime_type` | `text/markdown` | Также `text/plain` |

### Where it saves

Drive: `REPORTER_FOLDER_ID/<archive_label>/<safe_title> — <timestamp>.md`

### Returns

```json
{
  "success": true,
  "action": "archive",
  "archive_doc_link": "https://drive.google.com/...",
  "archive_doc_id": "...",
  "archive_label": "gmail-search",
  "archive_filename": "Hryceva correspondence — April 2026 — 2026-04-27 15:30.md"
}
```

---

## Универсальный флаг: `draft_only: true`

Применим к `send`, `reply`, `reply_all`. Создаёт **Gmail draft** вместо отправки.

### Когда использовать

- Aram хочет вычитать письмо до отправки
- Чувствительная коммуникация (юристы, банки, переговоры)
- Тестовый прогон tool на новом сценарии

### Что меняется

- Reporter **НЕ** вызывается (ничего не отправлено)
- Returns содержит `draft_id` и `draft_link` вместо `message_id`
- В Gmail черновик появляется в папке Drafts

### Returns

```json
{
  "success": true,
  "action": "send",
  "mode": "draft",
  "draft_id": "...",
  "draft_link": "https://mail.google.com/mail/u/0/#drafts/...",
  "result_summary": "Draft created"
}
```

---

## Типичные комбинации (workflows)

### Workflow 1: Ответ на новое письмо клиента

```
1. find (query: "is:unread in:inbox")
2. get_thread (thread_id из step 1)
3. [персона генерирует ответ через Virtual_staff.md]
4. reply (thread_id + body)
```

### Workflow 2: Cold outreach новому buyer

```
1. [skill sales-hunter находит контакт]
2. [skill personizer пишет cold email]
3. send (recipient + subject + body)
```

### Workflow 3: Обработка контракта от партнёра

```
1. find (query: "subject:contract from:partner@example.com")
2. get_thread
3. download_attachment (message_id + attachment_name)
4. [skill legalizer анализирует]
5. reply (thread_id + ответ с правками)
```

### Workflow 4: Поиск + архивирование переписки за квартал

```
1. find (query: "to:hryceva@example.com newer_than:90d", max_results: 50)
2. Цикл get_thread по каждому thread_id
3. archive (title: "Hryceva Q1 2026 correspondence", body_plain: транскрипты)
```

### Workflow 5: Draft чувствительного письма

```
1. find (опционально, если ответ)
2. send + draft_only:true
3. Aram открывает Gmail Drafts, проверяет, отправляет вручную
```

---

## Anti-patterns — что НЕ делать

| Anti-pattern | Почему плохо | Правильно |
|---|---|---|
| `send` для ответа на existing thread | Создаст orphan-письмо без threading headers, ломает переписку | `reply` с thread_id |
| `reply_all` в B2C ответе клиенту | В B2C обычно один-на-один — reply_all создаст конфузный CC | `reply` |
| Отправлять письмо без `draft_only` для чувствительных кейсов | Нет шанса на review | `draft_only:true`, потом ручная отправка |
| `find` с пустым query | Вернёт первые 10 случайных писем — бесполезно | Конкретный query с from / subject / date |
| `get_thread` для каждого треда из find | Медленно если треды > 20 | Используй `find` summaries, get_thread только для нужных |
| `archive` для маленьких заметок | Захламляет Drive | Логи или комментарии в коде skill |
| Ручное копирование вложений вместо `download_attachment` | Не попадает в централизованный Drive структуру | `download_attachment` всегда |

---

## Error handling — что возвращает emailer

Все ошибки приходят в формате:

```json
{
  "success": false,
  "action": "<action>",
  "error": "Human-readable error message"
}
```

### Категории ошибок

| Категория | Пример | Реакция emailer |
|---|---|---|
| Validation | `Missing required field: recipient` | Tool останавливается, возвращает ошибку caller-у |
| Auth | `Cannot access thread XXX` | Возможно нет permissions на тред — проверить, что Aram = owner |
| Gmail API | `Service unavailable` | Retry через 30 секунд, если повторно — HALT |
| Drive (Reporter) | `archive_error: ...` | Письмо **отправлено**, но архив не создан — non-fatal, в логе будет archive_status: failed |
| Quota | `Daily quota exceeded` | HALT — Aram должен подождать сутки или поднять квоту |

### Reporter failures — non-fatal

Это критично: если Reporter не смог создать архив-Doc, **письмо всё равно отправлено**. В response будет:

```json
{
  "success": true,
  "message_id": "...",
  "archive_error": "Cannot access REPORTER_FOLDER_ID..."
}
```

Tool обрабатывает archive_error как warning, не как failure всей операции.

---

## Logging

Каждый action логируется в `LOG_SHEET_ID` (Script Property). Schema V3:

```
timestamp | action | mode | draft_only | recipient | thread_id | subject |
has_attachment | archive_status | archive_doc_link | archive_error |
result_summary | success | error
```

Aram может смотреть лог напрямую в Google Sheets для аудита.

---

**Версия:** 1.0 — initial
**Created:** 2026-04-27
