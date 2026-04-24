# CLAUDE.md

Контекст проекта для Claude. Читать в начале каждой сессии.

## Что за проект

ETL + аналитика для **двух API Ozon** и **Feedbacks API Wildberries**:

1. **Ozon Performance API** (`api-performance.ozon.ru`) — реклама: кампании,
   статистика, KPI (ДРР, ROAS, CPO). Дашборд, Telegram-сводка, cron 02:00 МСК.
2. **Ozon Seller API** (`api-seller.ozon.ru`) — кабинет продавца: отзывы и
   ответы на них. Требует Premium Plus для `/v1/review/*`.
3. **Wildberries Feedbacks API** (`feedbacks-api.wildberries.ru`) — отзывы
   (и позже вопросы) с WB. Один JWT-токен на категорию «Вопросы и отзывы».
   Зеркало Ozon auto-reply: свой workflow, свой cron, свой Telegram-пинг.

Репозиторий: `dasexperten/arams-db` (раньше был `arams-product-placement`,
потом `arams-tutorial`, GitHub-редиректы работают).

**Полный playbook с граблями и контрактами обеих API — в
`.claude/skills/ozon-skill/SKILL.md`.** Подтягивается автоматически по триггерам.
**WB FBO калькулятор поставки — в `.claude/skills/wb-fbo/SKILL.md`** (зеркало `.claude/skills/ozon-fbo-calculator/SKILL.md` для WB).

## Структура

```
ozon_perf/                        # Performance API (реклама)
  client.py     OAuth2 (client_credentials), retry, 429/401
  api.py        Обёртки над эндпоинтами
  report.py     Парсер CSV/ZIP-отчётов (RU/EN заголовки, ; и ,)
  db.py         SQLite-схема, upsert-лоадеры
  etl.py        Оркестрация выгрузки
  analyze.py    SQL-агрегаты KPI
  dashboard.py  Генератор self-contained HTML (Chart.js via CDN)
ozon_seller/                      # Seller API (отзывы, позже — товары/заказы)
  client.py     httpx с Client-Id + Api-Key headers, 429-retry
  api.py        Обёртки: reviews_list/info/count/change-status, comments_list
  db.py         Схема: reviews, review_comments, seller_runs
  etl.py       sync_reviews (пагинация last_id) + опциональные комментарии
wb_seller/                        # Wildberries Feedbacks API
  client.py     httpx с Authorization JWT, 429/401-retry
  api.py        Обёртки: count-unanswered, feedbacks/list (take+skip),
                /feedbacks/answer (POST), /feedbacks (PATCH для edit)
  db.py         Схема: feedbacks, wb_seller_runs
  etl.py       sync_feedbacks (пагинация skip/take, upsert по id)
  replier.py    Claude-драфтер под формат WB (pros/cons/text + productDetails)
cli.py          Точка входа (все три API)
.github/workflows/sync-ozon.yml   cron + push + workflow_dispatch
tests/          pytest + httpx.MockTransport
samples/        dashboard.html (live) + dashboard_demo.html (fake)
```

## Ozon Performance API — нюансы, за которые уже заплачено

**База:** `https://api-performance.ozon.ru`. Старый хост `performance.ozon.ru`
выведен из эксплуатации 15 января 2025.

### Аутентификация

- `POST /api/client/token` с `{client_id, client_secret, grant_type: "client_credentials"}`
- Токен живёт **~30 минут** → кешировать и обновлять.
- На `401` нужно **один раз** перезапросить токен и повторить запрос.
- Формат `client_id` для сервисных аккаунтов:
  `{account_id}-{subid}@advertising.performance.ozon.ru` (email-подобный).
- `client_secret` — длинный base64-подобный токен.

### Лимиты

- **100 000 запросов/сутки** на аккаунт.
- На `429` — читать `Retry-After` и спать, НЕ долбить.

### Эндпоинты — ловушки

| Эндпоинт | Метод | Нюанс |
|---|---|---|
| `/api/client/campaign` | GET | Отдаёт `{"list":[...]}` |
| `/api/client/statistics` | POST | Асинхронный отчёт, возвращает UUID |
| `/api/client/statistics/{uuid}` | GET | Статус отчёта |
| `/api/client/statistics/report?UUID=...` | GET | Скачать готовый отчёт (CSV/ZIP) |
| `/api/client/statistics/daily/json` | **GET** | **НЕ POST, вернёт 405**. Параметры — в query string |

### Параметры — главные грабли

- Названия параметров для `statistics/daily/json` — **snake_case**:
  `campaign_ids`, `date_from`, `date_to`. НЕ `campaignIds`.
- Список `campaign_ids` передаётся **повторяющимися параметрами**,
  не запятой: `?campaign_ids=1&campaign_ids=2`. Иначе Ozon вернёт 400:
  `parsing list "campaign_ids": strconv.ParseUint: ... invalid syntax`.
- `httpx` делает это автоматически, если передать список.

### Формат ответа `statistics/daily/json`

**Плоский** список, не вложенный:
```json
{"rows":[
  {"id":"24000043","date":"2026-04-13","views":"0","clicks":"0",
   "moneySpent":"0,00","orders":"0","ordersMoney":"0,00"},
  ...
]}
```

Что запомнить:
- Числа приходят **строками**: `"views":"132"`, `"clicks":"158"`.
- Деньги — с **русской запятой**: `"moneySpent":"3523,86"`. Парсер обязан
  поменять `,` на `.` и убрать `\xa0`/пробелы-разделители тысяч.
- Нет вложенных `rows` по дням внутри кампании — всё плоско, `id` на каждой
  строке. Наш парсер умеет обе формы, но реальность — плоская.
- Вместо `revenue` — поле `ordersMoney`. Вместо `cost` — `moneySpent`.

### Формат ответа `/api/client/campaign`

```json
{"list":[
  {"id":"24016755","title":"Детство","state":"CAMPAIGN_STATE_INACTIVE",
   "advObjectType":"BANNER","fromDate":"2026-03-21","toDate":"",
   "dailyBudget":"1000000000","placement":[],"budget":"0",
   "PaymentType":"CPM","expenseStrategy":"DAILY_BUDGET",
   "weeklyBudget":"0","budgetType":"PRODUCT_CAMPAIGN_BUDGET_TYPE_DAILY",
   "autostopStatus":"AUTOSTOP_STATUS_NONE",...}
]}
```

- Тип кампании — `advObjectType`, НЕ `advertisingObjectType` и не
  `advertisingType`. Возможные значения: `BANNER`, `SKU`, `SEARCH_PROMO`,
  `VIDEO_BANNER`, `REF_VK`, и др.
- `PaymentType` — капитализация нестандартная (именно так).
- Бюджеты — строки, могут быть с нулями или с запятой.
- `dailyBudget` — в копейках × 100? Не до конца проверено, **проверять на
  боевых данных**, прежде чем делить на 100.

### Статистика — задержки

- Текущий день — данные неполные.
- Предыдущий день — стабилизируется через 1-3 часа, финализируется обычно
  к утру следующего дня. **Дефолт ETL: `date_to = today - 1 day`**.

### Async-отчёты (`POST /statistics` + poll)

Нужны для SKU-уровня (`groupBy=PLACEMENT`/`DATE`/`NO_GROUP_BY`).

Тело POST:
```json
{"campaigns":["id1","id2"],"from":"2026-04-01","to":"2026-04-19","groupBy":"DATE"}
```

Возврат: `{"UUID":"..."}` (ВНИМАНИЕ — заглавное `UUID`, не `uuid`).
Клиент принимает оба варианта через `data.get("UUID") or data.get("uuid")`.

Статусы: `OK`/`DONE`/`SUCCESS` → качаем; `ERROR`/`FAILED`/`CANCELLED` → падаем.

Отчёт приходит CSV или ZIP с CSV внутри. Разделитель обычно `;`, заголовки
русские (`Дата`, `SKU`, `Показы`, `Клики`, `Заказы`, `Выручка`, `Расход`).
Парсер в `report.py` умеет обе локали и оба разделителя.

## Infrastructure lessons learned

### GitHub

- **Scheduled workflows запускаются только с default-ветки**. Нельзя
  оставлять всё на feature-ветке и ждать что cron сработает.
- Workflow, который коммитит сам себе (refresh dashboard), ловит
  race conditions. Обязательно `git pull --rebase` + retry перед push.
- Secrets передаются в env джобы; если секрета нет, `env.VAR != ''` = false —
  удобно для опциональных шагов (например Telegram).
- `continue-on-error: true` нужен для debug-шагов и best-effort синков.

### Sandbox Claude Code

- Прямой outbound HTTP из sandbox **заблокирован** (все внешние хосты → 403
  "Host not in allowlist"). Реальные вызовы Ozon API тестируются только на
  GitHub-раннере.
- Локальный `git push` бывает нестабилен (`HTTP 503 send-pack`). Надёжный
  фоллбек — `mcp__github__push_files` / `create_or_update_file`.
- MCP GitHub-скоуп жёстко привязан к одному repo name на уровне системы.
  Если репо переименовали — GitHub-редирект работает прозрачно через API,
  но в параметрах `owner/repo` надо указывать старое имя.

## Credentials и безопасность

- Локально: `.env` (в `.gitignore`, никогда не коммитится).
- Production: **GitHub Secrets** (`OZON_PERF_CLIENT_ID`,
  `OZON_PERF_CLIENT_SECRET`, `OZON_SELLER_CLIENT_ID`, `OZON_SELLER_API_KEY`,
  `WB_FEEDBACKS_TOKEN`, `ANTHROPIC_API_KEY`,
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`).
- **Никогда** не клади креденшлы ни в `.env.example`, ни в код, ни в логи.
- Если пользователь делится секретами в чате — после запуска напомни
  перевыпустить, так как история чата сохраняется.

## Пользователь

- Нетехнический, терминала избегает. Все решения должны быть такими,
  чтобы не нужно было ставить Python / запускать команды локально.
- Интерфейсы: GitHub UI, Telegram, браузер с дашбордом через raw.githack.
- Общение на русском. KPI на русском (ДРР, ROAS, CTR, CR, CPO).

## CLI-шпаргалка

```bash
# Базовое / Performance
python cli.py init              # создать SQLite (обе БД)
python cli.py ping              # проверить Performance credentials
python cli.py debug             # сырые ответы Performance в stdout
python cli.py sync-campaigns    # только каталог
python cli.py sync-daily --days 7
python cli.py sync-sku --days 7           # async-отчёт CSV → sku_daily_stats
python cli.py sync-all --days 30          # кампании + дневные за 30 дней
python cli.py kpi --days 30 [--sku]
python cli.py dashboard --days 30 --out samples/dashboard.html
python cli.py dashboard --demo            # без БД, для превью
python cli.py notify-telegram --status success --days 7

# Seller (отзывы)
python cli.py ping-seller                 # проверить Seller credentials (счётчики отзывов)
python cli.py sync-reviews                # все отзывы, пагинация last_id
python cli.py sync-reviews --status UNPROCESSED --with-comments
python cli.py sync-reviews --max 50       # только первые 50 (для теста)
python cli.py mark-reviews --status PROCESSED rev-id-1 rev-id-2
python cli.py draft-reply <review_id>     # черновик Claude в stdout (без POST)
python cli.py post-reply <id> "<text>" --confirm YES    # ручной POST ответа
python cli.py auto-reply [--max-replies 1]              # END-TO-END: один отзыв за прогон → Claude → POST

# Wildberries (Feedbacks API)
python cli.py ping-wb                     # проверить WB token (/feedbacks/count-unanswered)
python cli.py debug-wb-feedback           # сырой JSON первого неотвеченного отзыва
python cli.py sync-wb-feedbacks           # все неотвеченные отзывы в SQLite
python cli.py sync-wb-feedbacks --answered --max 500    # бэкфилл отвеченных
python cli.py list-wb-recent --count 20   # последние неотвеченные (id + превью)
python cli.py draft-wb-reply <feedback_id>              # черновик Claude в stdout (без POST)
python cli.py post-wb-reply <id> "<text>" --confirm YES # ручной POST
python cli.py auto-reply-wb [--max-replies 1]           # END-TO-END: WB отзыв → Claude → POST
```

## Ozon Auto-Reply (полная автоматика)

Workflow `.github/workflows/auto-reply.yml` — каждый час 09:00–21:00 МСК
плюс кнопка в Actions. Модель **«один прогон = один ответ»**.

Алгоритм (`cmd_auto_reply` в cli.py):

1. Стримит `UNPROCESSED` через `reviews_iter(status="UNPROCESSED")`.
2. Отзыв без текста (только звёзды) — `change_status(..., PROCESSED)`
   и идём к следующему (не тратит лимит на ответы).
3. Отзыв с текстом:
   - Claude пишет ответ (`replier.draft_reply`, system-prompt закеширован).
   - `comment_create(..., mark_review_as_processed=True)` — Ozon публикует
     ответ и атомарно помечает отзыв PROCESSED.
4. Останавливаемся, когда отвечено `--max-replies` раз (по умолчанию `1`).
   Хвост остаётся UNPROCESSED для следующего прогона.

Таким образом дефолтный cron каждый час = 1 ответ в час (до 13 в день в
окне 09–21 МСК). Чтобы разгрести накопленный backlog — вручную дёрнуть
`Run workflow` с `max_replies=50` (или сколько нужно).

Telegram:
- Одно сводочное сообщение: отвечено `X из N лимита` / без текста `K` /
  ошибок `L` + первые 3 ошибки с `review_id` и стадией
  (`draft` / `post` / `mark_no_text`).
- После сводки — отдельное сообщение на **каждый** отвеченный отзыв
  с парой «отзыв + наш ответ» (★рейтинг, автор, SKU, escaped HTML,
  обрезка по 1500 символов).

Exit codes: `0` — всё ок, `1` — partial (были per-review ошибки).

Тесты: `tests/test_auto_reply.py` — normal path (с/без текста),
стоп после `max_replies`, дефолт = 1, фейл Claude не ломает остальное.

## Wildberries Auto-Reply

Workflow `.github/workflows/auto-reply-wb.yml` — каждые 10 минут 24/7
плюс кнопка в Actions. Та же модель «один прогон = один ответ» по дефолту.

Алгоритм (`cmd_auto_reply_wb` в cli.py):

1. Стримит unanswered через `feedbacks_iter(is_answered=False)` (пагинация
   take/skip, page_size=1000).
2. Отзыв с пустыми `text`, `pros` И `cons` (только рейтинг) — пропускается.
   У WB нет "mark as processed" API, так что rating-only просто остаются
   в списке; но обычно это 5-звёздочные без комментария и отдельного разгрёба
   не требуют.
3. Отзыв с текстом (в любом из трёх полей `text`/`pros`/`cons`):
   - Claude пишет ответ (`wb_seller.replier.draft_reply`, system-prompt
     закеширован).
   - `answer_create(feedback_id, text)` → `POST /api/v1/feedbacks/answer`
     → WB ставит отзыв в очередь модерации, через минуты он публикуется.
4. Останавливаемся, когда отвечено `--max-replies` раз (дефолт `1`).

10-минутный cron = до 6 ответов в час при полном окне. Для backlog-а —
вручную `Run workflow` с `max_replies=50`.

Telegram:
- Одно сводочное сообщение: отвечено `X из N лимита` / без текста `K` /
  ошибок `L`.
- После сводки — отдельное сообщение на каждый отвеченный отзыв с парой
  «отзыв + наш ответ» (звёзды, nmId/product, MSK-дата, escape HTML,
  обрезка по 1500 символов). Текст WB-отзыва — это конкатенация
  основного `text` + секций `[Достоинства]` + `[Недостатки]`.

Exit codes: `0` — ok, `1` — partial.

Тесты: `tests/test_wb_auto_reply.py` — те же сценарии что у Ozon + тест
что pros/cons без `text` всё равно считаются содержательным отзывом.

### Контракт WB Feedbacks API — за что уже заплачено

**База:** `https://feedbacks-api.wildberries.ru`.
**Auth:** `Authorization: <JWT-token>` (без `Bearer`). Токен создаётся на
seller.wildberries.ru → Настройки → Доступ к API, категория
«Вопросы и отзывы». Живёт 180 дней по умолчанию.

| Эндпоинт | Метод | Что |
|---|---|---|
| `/api/v1/feedbacks/count-unanswered` | GET | total + за сегодня |
| `/api/v1/feedbacks/count` | GET | по фильтру `isAnswered`/`nmId`/даты |
| `/api/v1/feedbacks` | GET | список: `isAnswered` (bool как строка `true`/`false`), `take` 1..5000, `skip` 0..200000, `order` `dateAsc`/`dateDesc` |
| `/api/v1/feedbacks/answer` | POST | `{id, text}` — опубликовать ответ |
| `/api/v1/feedbacks` | PATCH | `{id, text}` — отредактировать (пока `answer.editable=true`) |

Ключевые поля отзыва:
- `id` — строка, PK.
- `text`, `pros`, `cons` — три поля с пользовательским текстом. Парсер
  и драфтер учитывают все три, т.к. покупатель может оставить только
  Достоинства/Недостатки без общего комментария.
- `productValuation` — 1..5.
- `createdDate` — ISO datetime.
- `productDetails.nmId` / `supplierArticle` / `productName` / `brandName`.
- `answer` — `null` пока не ответили, потом `{text, state, editable}`.
- `state` — `"none"` | `"reviewRequired"` | и др.

## Схема SQLite

**`ozon_performance.db` (Performance):**
- `campaigns` (PK `campaign_id`) — каталог, upsert
- `campaign_daily_stats` (PK `campaign_id + date`) — дневная статистика, upsert
- `sku_daily_stats` (PK `campaign_id + sku + date`) — SKU-уровень, upsert
- `etl_runs` — журнал синков

**`ozon_seller.db` (Seller, пока только отзывы):**
- `reviews` (PK `review_id`) — отзывы, upsert
- `review_comments` (PK `comment_id`) — комментарии (и наши, и покупательские)
- `seller_runs` — журнал синков Seller-ETL

**`wb_seller.db` (Wildberries Feedbacks):**
- `feedbacks` (PK `feedback_id`) — отзывы WB, upsert.
  Рейтинг в `rating` (маппится из `productValuation`), текст в `text`,
  плюс `pros`/`cons`, `nm_id`/`supplier_article`/`product_name`/`brand_name`,
  `is_answered`/`answer_text`/`answer_state`, прикрепления.
- `wb_seller_runs` — журнал синков WB-ETL

Идемпотентность — через `ON CONFLICT DO UPDATE`. Повторный прогон за тот же
день перезапишет, не задублит.

## KPI-формулы

- **CTR** = clicks / views
- **CR** = orders / clicks
- **CPO** = spent / orders
- **ДРР** = spent / revenue
- **ROAS** = revenue / spent

Порог «тревоги» в дашборде и Telegram — ДРР > 30% (красный).

## Куда двигаться дальше (idea backlog)

- **Seller API** для честного ROI (реклама vs факт. продажи/возвраты).
- Связка с 1С / ERP на уровне SKU.
- Сравнение периодов (неделя к неделе) в дашборде.
- Алерты в Telegram при резком скачке ДРР / падении ROAS.
- Несколько кабинетов Performance в одной БД (добавить `account_id` в PK).

---

## General LLM Coding Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
