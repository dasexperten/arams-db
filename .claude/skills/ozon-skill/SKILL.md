---
name: ozon-skill
description: |
  Интеграции с двумя API Ozon: Performance (реклама — кампании, статистика, KPI ДРР/ROAS/CPO)
  и Seller (товары, заказы, **отзывы и ответы на них**, остатки). OAuth2 для Performance,
  `Client-Id` + `Api-Key` для Seller. Асинхронные отчёты, парсинг CSV/ZIP, SQLite-ETL, дашборды.
  Используй когда пользователь упоминает "Ozon Performance", "Ozon Seller",
  "рекламный API Ozon", "API селлера Ozon", "отзывы Ozon", "ответы на отзывы Ozon",
  "комментарии к отзывам", "ДРР/ROAS Ozon", "api-performance.ozon.ru", "api-seller.ozon.ru",
  "кабинет Ozon Performance", "кабинет продавца Ozon" или просит подключить/проанализировать
  любые данные из кабинета Ozon.
when_to_use: |
  - Новая интеграция с Ozon Performance или Seller API с нуля
  - Отладка существующей интеграции (400/401/403/405/429 от Ozon)
  - Парсинг async-отчётов из `/api/client/statistics` (Performance)
  - Работа с дневной статистикой через `/api/client/statistics/daily/json`
  - **Забор отзывов и ответы на них** через `/v1/review/*` и `/v1/review/comment/*` (Seller, требует Premium Plus)
  - Вопросы про лимиты Ozon (100k/сутки Performance; отдельные лимиты Seller), задержки данных
  - Любые KPI-метрики: ДРР, ROAS, CPO, CTR, CR (реклама) или рейтинг/оборачиваемость отзывов (Seller)
  - Решения, какое из двух API использовать под задачу
user-invocable: true
---

# Ozon API — playbook (Performance + Seller)

Это playbook для интеграций с публичными API Ozon. Все грабли ниже —
пройдены на проекте `dasexperten/arams-db`. Не наступай ещё раз.

## Две API, которые легко перепутать

| | **Performance API** | **Seller API** |
|---|---|---|
| Хост | `https://api-performance.ozon.ru` | `https://api-seller.ozon.ru` |
| Что там | Реклама: кампании, ставки, статистика | Кабинет продавца: товары, заказы, отзывы, остатки, цены, FBO/FBS |
| Авторизация | OAuth2 `client_credentials` → Bearer токен (~30 мин) | Постоянные заголовки `Client-Id` + `Api-Key` |
| Лимит | 100 000 запросов/сутки на аккаунт | Эндпоинтные лимиты (см. ниже), без суточного потолка |
| Доступ | Нужен рекламный кабинет | Нужен селлерский кабинет; для `/v1/review/*` — **подписка Premium Plus** |
| Секреты в GH | `OZON_PERF_CLIENT_ID`, `OZON_PERF_CLIENT_SECRET` | `OZON_SELLER_CLIENT_ID`, `OZON_SELLER_API_KEY` |

**Правило выбора:** всё, что про рекламу — Performance. Всё остальное (и в т.ч.
отзывы) — Seller. Эти API не пересекаются, один ключ **не** работает в другом.

# Performance API — реклама

## Первый шаг: убедиться в контракте

Перед любой интеграцией запусти `debug`-команду (или аналог через `curl`)
и посмотри сырые ответы — **формат менялся, и будет меняться**. То, что
описано ниже, актуально на апрель 2026.

## База и аутентификация

- **Base URL:** `https://api-performance.ozon.ru`
  (старый `performance.ozon.ru` выведен 15 января 2025 — на него не пиши).
- Эндпоинт токена: `POST /api/client/token`
  ```json
  {"client_id": "...", "client_secret": "...", "grant_type": "client_credentials"}
  ```
- Ответ: `{"access_token": "...", "expires_in": 1800, "token_type": "Bearer"}`
- **Токен живёт ~30 минут.** Кешируй, обновляй за минуту до истечения.
- Формат `client_id` сервисного аккаунта:
  `{account_id}-{subid}@advertising.performance.ozon.ru` (email-подобный).
  `client_secret` — длинный base64-подобный токен.
- На `401` **единоразово** перезапроси токен и повтори запрос. Без бесконечного цикла.

## Лимиты

- **100 000 запросов/сутки** на аккаунт Performance.
- На `429` читай заголовок `Retry-After`, спи указанное время. **НЕ** долбись.

## Эндпоинты и методы — главные грабли

| Эндпоинт | Метод | Особенности |
|---|---|---|
| `/api/client/campaign` | GET | Ответ: `{"list":[...]}` |
| `/api/client/campaign/{id}/objects` | GET | SKU/креативы внутри кампании |
| `/api/client/statistics/daily/json` | **GET** | **НЕ POST** (вернёт 405). Параметры — в **query string** |
| `/api/client/statistics` | POST | Асинхронный отчёт. Ответ: `{"UUID": "..."}` (заглавное!) |
| `/api/client/statistics/{uuid}` | GET | Статус отчёта |
| `/api/client/statistics/report?UUID=...` | GET | Скачать готовый отчёт (CSV или ZIP) |

### Snake_case параметры (вторая главная грабля)

Для `/statistics/daily/json` названия параметров — **snake_case**:

```
?campaign_ids=1&campaign_ids=2&date_from=2026-04-01&date_to=2026-04-19
```

- **НЕ** `campaignIds` / `dateFrom` / `dateTo` — Ozon возвращает 400.
- Список `campaign_ids` передаётся **повторяющимися параметрами**,
  **не запятой**. Иначе: `parsing list "campaign_ids": strconv.ParseUint: invalid syntax`.
- В Python с `httpx`: передавай list — библиотека сама сделает repeated params.
  ```python
  client.get("/api/client/statistics/daily/json", params={
      "campaign_ids": ["123", "456"],
      "date_from": "2026-04-01",
      "date_to": "2026-04-19",
  })
  ```

## Формат ответов

### Кампании `/api/client/campaign`

```json
{"list":[{
  "id":"24016755",
  "title":"Детство",
  "state":"CAMPAIGN_STATE_INACTIVE",
  "advObjectType":"BANNER",
  "fromDate":"2026-03-21","toDate":"",
  "dailyBudget":"1000000000",
  "budget":"0",
  "placement":[],
  "PaymentType":"CPM",
  "expenseStrategy":"DAILY_BUDGET",
  "weeklyBudget":"0",
  "budgetType":"PRODUCT_CAMPAIGN_BUDGET_TYPE_DAILY",
  "autostopStatus":"AUTOSTOP_STATUS_NONE"
}]}
```

- Тип кампании — **`advObjectType`**, не `advertisingObjectType`/`advertisingType`.
  Значения: `BANNER`, `SKU`, `SEARCH_PROMO`, `VIDEO_BANNER`, `REF_VK` и др.
- **`PaymentType`** — нестандартная капитализация (именно так, с заглавной).
- Бюджеты — **строки**, могут быть "0", "1000000000", с запятой.
- `dailyBudget` в копейках × 100? Не подтверждено — **валидируй на боевых данных**,
  прежде чем делить.

### Дневная статистика `/api/client/statistics/daily/json`

**Плоский список**, не вложенный в кампании:

```json
{"rows":[
  {"id":"24000043","title":"Эволюция Рекалдент","date":"2026-04-13",
   "views":"0","clicks":"0","moneySpent":"0,00","orders":"0","ordersMoney":"0,00"},
  {"id":"24000043","title":"Эволюция Рекалдент","date":"2026-04-16",
   "views":"0","clicks":"132","moneySpent":"3523,86","orders":"0","ordersMoney":"0,00"}
]}
```

**Четыре главных грабли:**
1. **Плоско, не вложенно.** Каждая строка — это день × кампания. Не ищи `rows` внутри кампаний.
2. **Числа — строки.** `"views":"132"`, `"clicks":"158"`. Парсер обязан `int()`-ить.
3. **Русская запятая в деньгах.** `"moneySpent":"3523,86"`, `"ordersMoney":"598,00"`.
   Парсер должен заменить `,` → `.`, убрать `\xa0` (non-breaking space) и обычные пробелы-разделители тысяч.
4. **Поля переименованы:** `ordersMoney` вместо `revenue`, `moneySpent` вместо `cost`.

### Async-отчёты (для SKU-уровня)

Нужны для глубокой аналитики (`groupBy=PLACEMENT` / `DATE` / `NO_GROUP_BY`).

```python
# 1. Submit
POST /api/client/statistics
{"campaigns":["id1","id2"], "from":"2026-04-01", "to":"2026-04-19", "groupBy":"DATE"}
# → {"UUID": "abc-123"}  ⚠ заглавное UUID, не uuid

# 2. Poll каждые 5 сек
GET /api/client/statistics/abc-123
# → {"state": "IN_PROGRESS"} ... → {"state": "OK" | "DONE" | "SUCCESS"} | "ERROR" | "FAILED"

# 3. Download
GET /api/client/statistics/report?UUID=abc-123
# → CSV или ZIP с CSV внутри
```

**Парсер отчёта должен уметь:**
- ZIP и plain CSV (проверяй magic bytes `PK`)
- Разделители `;`, `,`, `\t` (автоопределение через `csv.Sniffer`)
- Кодировки UTF-8-BOM, UTF-8, CP1251
- Русские заголовки: `Дата`, `SKU`, `Показы`, `Клики`, `Заказы`, `Выручка`, `Расход`
- И английские: `date`, `sku`, `views`, `clicks`, `orders`, `revenue`, `money_spent`
- Те же грабли с числами: `"3 523,86"` → `3523.86`

## Задержки данных

- **Сегодня:** данные неполные, меняются в течение дня.
- **Вчера:** финализируется через 1–3 часа после полуночи МСК, стабильно — к утру.
- **ETL по умолчанию:** `date_to = today - 1 day`. Не тяни за сегодня без оснований.

## Типичная архитектура проекта

```
<project>/
  ozon_perf/                    # пакет клиента и ETL
    client.py                   # OAuth2 + retry/401/429
    api.py                      # обёртки эндпоинтов
    report.py                   # парсер CSV/ZIP (RU/EN)
    db.py                       # схема + upsert (ON CONFLICT DO UPDATE)
    etl.py                      # оркестрация
    analyze.py                  # SQL-агрегации KPI
    dashboard.py                # генератор HTML (Chart.js via CDN)
  cli.py                        # точка входа: init/ping/sync-*/kpi/dashboard/notify-telegram/debug
  tests/                        # pytest + httpx.MockTransport
  .github/workflows/sync-ozon.yml  # cron 02:00 МСК + workflow_dispatch
  samples/                      # dashboard.html (live), dashboard_demo.html (fake)
```

## KPI — формулы

- **CTR** = clicks / views
- **CR** = orders / clicks
- **CPO** (стоимость заказа) = money_spent / orders
- **ДРР** (доля рекламных расходов) = money_spent / revenue
- **ROAS** = revenue / money_spent

**Порог тревоги:** ДРР > 30% — окрашивать красным, триггерить алерт.

# Seller API — товары, заказы, отзывы

## База и аутентификация

- **Base URL:** `https://api-seller.ozon.ru`
- **Нет OAuth.** На каждый запрос — два заголовка:
  ```
  Client-Id: 12345            # числовой ID кабинета, не email
  Api-Key: 11111111-2222-...  # long-lived UUID, выпускается в разделе "Настройки → API-ключи"
  ```
- `Content-Type: application/json` обязателен даже для пустых POST.
- Ответы обёрнуты: `{"result": {...}}` или `{"reviews": [...], "has_next": true, "last_id": "..."}`.
  Всегда смотри в сырой JSON — обёртка зависит от эндпоинта.
- Ошибки приходят как `{"code": 7, "message": "...", "details": [...]}` c HTTP 4xx/5xx.

## Премиум-гейты — важно

Часть эндпоинтов доступны **только по подписке Premium Plus**:
- `/v1/review/*` — отзывы
- `/v1/review/comment/*` — ответы на отзывы
- `/v1/posting/fbo/*` с расширенными фильтрами (в некоторых версиях)

Без подписки вернётся `403` с текстом про права доступа. **Первая проверка
при 403 — не код, а тариф кабинета.**

## Лимиты

- Нет общего суточного потолка как у Performance.
- Эндпоинтные лимиты: обычно **60 RPS на метод** на `Client-Id`, но для
  `/v1/review/*` часто **жёстче** (порядок — десятки запросов в минуту).
  Официальная цифра плавает — проверяй на боевых данных через 429.
- На `429` читай `Retry-After` (в секундах), спи, повторяй. Не долбись.
- На `503`/`504` от балансера — экспоненциальный backoff (1, 2, 4, 8 сек),
  макс 5 попыток.

## Эндпоинты — отзывы

| Эндпоинт | Метод | Что делает |
|---|---|---|
| `/v1/review/count` | POST | Счётчики: `processed` / `unprocessed` / `total` |
| `/v1/review/list` | POST | Список отзывов с фильтром по статусу, пагинация по `last_id` |
| `/v1/review/info` | POST | Детали одного отзыва по `review_id` |
| `/v1/review/change-status` | POST | Массово пометить отзывы `PROCESSED` / `UNPROCESSED` |

### `/v1/review/list`

**Запрос:**
```json
{
  "limit": 100,                 // max 100
  "sort_dir": "DESC",           // ASC/DESC по published_at
  "status": "UNPROCESSED",      // UNPROCESSED | PROCESSED | ALL
  "last_id": ""                 // пусто в первом запросе, дальше — из ответа
}
```

**Ответ:**
```json
{
  "reviews": [{
    "id": "abc-123-uuid",
    "sku": 123456789,
    "text": "Норм товар",
    "rating": 5,
    "published_at": "2026-04-18T10:30:00.000Z",
    "status": "UNPROCESSED",
    "order_status": "DELIVERED",
    "is_rating_participant": true,
    "photos_amount": 2,
    "videos_amount": 0,
    "comments_amount": 0
  }],
  "has_next": true,
  "last_id": "xyz-456"
}
```

**Грабли:**
- Пагинация **cursor-based** через `last_id`, не `page`/`offset`. Пустая строка = с начала.
- `has_next` — единственный честный сигнал дочитанности. Не полагайся на `len(reviews) < limit`.
- `sku` — число, но в ответах других эндпоинтов может прийти строкой. Приводи к строке при хранении.
- `rating` — 1–5, `int`.
- `published_at` — ISO-8601 с миллисекундами и `Z` (UTC). Парсь через `datetime.fromisoformat`
  с заменой `Z` на `+00:00`.

### `/v1/review/info`

**Запрос:** `{"review_id": "abc-123-uuid"}`

**Ответ** — расширенная версия записи из списка, плюс:
- `photos: [{"url": "...", "width": ..., "height": ...}]` — до 10
- `videos: [{"link": "...", "preview": "..."}]`
- Поля от покупателя: `name` (может быть пустым/маскированным).

### `/v1/review/change-status`

```json
{
  "review_ids": ["id1", "id2", "id3"],  // max 100 за раз
  "status": "PROCESSED"                  // PROCESSED | UNPROCESSED
}
```

Возврат: `{"result": "ok"}`. Идемпотентно.

## Эндпоинты — ответы на отзывы

| Эндпоинт | Метод | Что делает |
|---|---|---|
| `/v1/review/comment/list` | POST | Список комментариев (твои и покупательские) по `review_id` |
| `/v1/review/comment/create` | POST | Создать комментарий/ответ |
| `/v1/review/comment/delete` | POST | Удалить свой комментарий |

### `/v1/review/comment/create` — **самый опасный эндпоинт**

```json
{
  "review_id": "abc-123-uuid",
  "text": "Спасибо за отзыв! ...",
  "mark_review_as_processed": true,
  "parent_comment_id": 0            // 0 = ответ на отзыв; иначе = ответ на комментарий
}
```

Возврат: `{"comment_id": 987654321}`.

**Жёсткие правила перед вызовом:**
1. **Ответ публичный.** Покупатель и любой посетитель карточки товара увидят его.
   Отправил ерунду → репутационный урон, deletion не спасёт (могли уже прочитать
   и сделать скриншот).
2. **Редактировать нельзя.** Только удалить и создать новый — и у нового будет
   другая дата публикации.
3. **От имени какого магазина отвечаем** определяется по `Client-Id` заголовка.
   В теле запроса магазин не указывается — один ключ = один кабинет.
4. **LLM-генерация без модерации — запрещено.** Всегда human-in-the-loop:
   черновик от модели → показать пользователю → явное подтверждение → только
   потом POST.
5. **Длина текста:** ограничение около 1000 символов (плавает). Если сомнения —
   триммить до 800 и показывать пользователю.
6. **Запрещённый контент:** ссылки, контактные данные, названия конкурентов,
   мат — Ozon может скрыть комментарий. Проверяй в модели-валидаторе или
   простыми regex-ами до отправки.

### `/v1/review/comment/list`

```json
{
  "review_id": "abc-123-uuid",
  "limit": 100,
  "offset": 0,
  "sort_dir": "ASC"
}
```

Ответ:
```json
{
  "comments": [{
    "id": 987654321,
    "text": "...",
    "published_at": "2026-04-19T09:00:00.000Z",
    "is_owner": true,             // true = наш комментарий, false = покупатель
    "parent_comment_id": 0
  }],
  "offset": 0
}
```

### `/v1/review/comment/delete`

`{"comment_id": 987654321}` → `{"result": "ok"}`.

Удаляет **только свой** комментарий (`is_owner: true`). Чужой — 403.

## Типичная архитектура `ozon_seller/`

Зеркалит `ozon_perf/`, но со своими особенностями:

```
ozon_seller/
  client.py       # httpx.Client с Client-Id+Api-Key headers, 429/503 retry
  api.py          # обёртки: reviews_list/info/count/change_status,
                  #         comments_list/create/delete
  db.py           # схема: reviews, review_comments, review_sync_runs
  etl.py          # sync_reviews: paginate по last_id, upsert в SQLite
  analyze.py      # KPI отзывов: средний рейтинг, SLA ответа (median hours),
                  #              % с ответом, топ жалобных SKU
  replier.py      # safe-reply pipeline: draft (LLM) → validate → confirm → POST
```

**Схема SQLite (эскиз):**

```sql
CREATE TABLE reviews (
  review_id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  rating INTEGER NOT NULL,
  text TEXT,
  status TEXT,                    -- UNPROCESSED | PROCESSED
  order_status TEXT,
  photos_amount INTEGER DEFAULT 0,
  videos_amount INTEGER DEFAULT 0,
  comments_amount INTEGER DEFAULT 0,
  published_at TEXT NOT NULL,     -- ISO-8601 UTC
  fetched_at TEXT NOT NULL
);

CREATE TABLE review_comments (
  comment_id INTEGER PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(review_id),
  text TEXT NOT NULL,
  is_owner INTEGER NOT NULL,      -- 0/1
  parent_comment_id INTEGER,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE INDEX idx_reviews_status ON reviews(status, published_at);
CREATE INDEX idx_reviews_rating ON reviews(rating);
```

Upsert через `ON CONFLICT(review_id) DO UPDATE` — те же принципы, что
у Performance-части.

## Задержки данных Seller API

- Отзывы появляются в `/v1/review/list` в течение **минут** после публикации на карточке.
- Счётчик `/v1/review/count` может отставать на 1–2 минуты — не использовать
  как источник истины для алертов «0 непрочитанных».
- Комментарий, созданный через `/v1/review/comment/create`, виден в
  `/v1/review/comment/list` сразу; на карточке товара — до нескольких минут.

## KPI отзывов

- **Средний рейтинг** = `AVG(rating)` за период.
- **% с ответом** = `COUNT(reviews JOIN comments WHERE is_owner=1) / COUNT(reviews)`.
- **SLA ответа (медиана)** = медиана `(first_owner_comment.published_at - review.published_at)`
  в часах. Цель обычно ≤ 24ч.
- **Доля низких отзывов** = `COUNT(rating <= 3) / COUNT(*)`. Алерт при > 10%.
- **Топ-жалобных SKU** — `GROUP BY sku ORDER BY AVG(rating) ASC` с минимум N отзывов.

# Общее: креды, инфра, реализация

## Credentials — строгая политика

- Локально: `.env` (в `.gitignore`). **Никогда** не коммить.
- Production — GitHub Secrets:
  - Performance: `OZON_PERF_CLIENT_ID`, `OZON_PERF_CLIENT_SECRET`
  - Seller: `OZON_SELLER_CLIENT_ID` (число), `OZON_SELLER_API_KEY` (UUID)
- Performance и Seller ключи **не взаимозаменяемы** — это разные выпуски в
  разных кабинетах. Не пытайся использовать один для другого.
- Если пользователь делится ключами в чате — напомни перевыпустить после тестов.
- **Никогда** не клади реальные значения в `.env.example`, код, логи, скрины.
- При добавлении новых секретов: обнови `.env.example` с плейсхолдерами
  и workflow с `env:` блоком.

## Инфраструктурные ловушки

- **GitHub scheduled workflows** запускаются только с default-ветки (обычно `main`).
  На feature-ветке cron не сработает — либо мерджь в main, либо меняй default.
- Workflow, который коммитит сам себе — ловит race conditions. Перед push делай
  `git pull --rebase origin $GITHUB_REF_NAME`, retry 3-5 раз с backoff.
- `env.SECRET_NAME != ''` — удобный способ условно выполнять шаг только
  при наличии секрета (например, Telegram-нотификации).

## Готовая референс-реализация

Все грабли Performance-части реализованы и протестированы в **`dasexperten/arams-db`**.
Читай и переиспользуй, а не пиши с нуля.

**Performance (готово):**
- `ozon_perf/client.py` — OAuth2 с кешем токена, retry, 401-refresh, 429-backoff
- `ozon_perf/api.py` — правильный формат параметров для всех эндпоинтов
- `ozon_perf/etl.py::_flatten_daily` — парсер плоского ответа + `_int`/`_float` с ру-запятой
- `ozon_perf/report.py` — универсальный парсер CSV/ZIP
- `ozon_perf/db.py` — идемпотентная схема с `ON CONFLICT DO UPDATE`
- `.github/workflows/sync-ozon.yml` — готовый cron + Telegram-нотификации
- `tests/` — моки httpx для контракта

**Seller (в разработке, ветка `claude/ozon-review-reply-feature-*`):**
- `ozon_seller/` — зеркальная структура под Client-Id + Api-Key
- Переиспользуй паттерн клиента из `ozon_perf/client.py` (retry/backoff),
  только выкинь OAuth и добавь два заголовка.

## Связанные скиллы — когда что подтягивать

В этом репо доступны другие скиллы. При работе над Ozon **обязательно**
подтягивай их в нужный момент — не дублируй чужой playbook руками:

| Скилл | Когда подтягивать в контексте Ozon-задач |
|---|---|
| `claude-api` | Любая работа с LLM: `replier.py` (черновики ответов на отзывы), суммаризация отзывов, классификация рейтингов. Включает prompt caching, миграции моделей. |
| `update-config` | Настройка хуков (`SessionStart`, `PreToolUse`), прав в `.claude/settings.json`, env-переменных для сессии. |
| `session-start-hook` | Настройка SessionStart-хука для Claude Code на вебе (чтобы тесты/линтеры гарантированно запускались). |
| `fewer-permission-prompts` | Уменьшить число permission-запросов в сессии — просканировать транскрипты и добавить allowlist. |
| `init` | Инициализация/обновление `CLAUDE.md` после крупных изменений в структуре проекта. |
| `review` | Ревью PR перед мерджем ветки Ozon-фичи в main. |
| `security-review` | Обязательно перед мерджем фичи, трогающей креды или публичные эндпоинты (ответы на отзывы — публичный writing-path!). |

**Правило вызова:** если задача явно триггерит скилл по его `description` —
вызывай через `Skill` tool, не пиши вручную то, что скилл уже знает.

## Idea backlog (нерешённое)

- **Seller API: товары и заказы** (сверх отзывов) — для честного ROI:
  реклама Performance vs факт. продажи и возвраты Seller.
- **Auto-reply draft** через Claude API с обязательной модерацией пользователем
  (черновик в Telegram → approve/edit/reject → POST).
- **Алерт на отзыв с rating ≤ 3** — моментальный пуш в Telegram с deeplink
  на карточку товара.
- **SLA-дашборд ответов:** сколько отзывов без ответа > 24ч, распределение.
- Связка с 1С / ERP по SKU.
- Сравнение периодов (неделя к неделе) в дашборде Performance.
- Алерты в Telegram при скачке ДРР / падении ROAS.
- Мульти-кабинетность (`account_id` в составной PK обеих БД).
