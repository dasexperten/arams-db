# CLAUDE.md

Контекст проекта для Claude. Читать в начале каждой сессии.

## Что за проект

ETL + аналитика для **двух API Ozon**:

1. **Performance API** (`api-performance.ozon.ru`) — реклама: кампании, статистика,
   KPI (ДРР, ROAS, CPO). Дашборд, Telegram-сводка, cron 02:00 МСК.
2. **Seller API** (`api-seller.ozon.ru`) — кабинет продавца: пока используется
   для выгрузки **отзывов** и последующих ответов на них. Требует Premium Plus
   для `/v1/review/*`.

Репозиторий: `dasexperten/arams-db` (раньше был `arams-product-placement`,
потом `arams-tutorial`, GitHub-редиректы работают).

**Полный playbook с граблями и контрактами обеих API — в
`.claude/skills/ozon-skill/SKILL.md`.** Подтягивается автоматически по триггерам.

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
cli.py          Точка входа (обе API)
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
```

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
