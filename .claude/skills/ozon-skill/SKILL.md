---
name: ozon-skill
description: |
  Интеграция с Ozon Performance API (рекламный кабинет Ozon): OAuth2, асинхронные отчёты,
  парсинг CSV/ZIP, SQLite-ETL, KPI (ДРР, ROAS, CPO). Используй когда пользователь упоминает
  "Ozon Performance", "рекламный API Ozon", "статистика рекламных кампаний Ozon",
  "ДРР/ROAS Ozon", "API performance.ozon.ru", "кабинет Ozon Performance" или просит
  подключить/проанализировать рекламные данные Ozon.
when_to_use: |
  - Новая интеграция с Ozon Performance API с нуля
  - Отладка уже существующей интеграции (400/401/405/429 от Ozon)
  - Парсинг отчётов из `/api/client/statistics` (асинхронный флоу)
  - Работа с дневной статистикой через `/api/client/statistics/daily/json`
  - Вопросы про лимиты Ozon (100k/сутки), задержки данных, структуру полей
  - Любые KPI-метрики на рекламных данных: ДРР, ROAS, CPO, CTR, CR
user-invocable: true
---

# Ozon Performance API — playbook

Это playbook для интеграций с рекламным API Ozon. Все грабли ниже — уже
пройденные на проекте `dasexperten/arams-db`. Не надо наступать ещё раз.

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

## Credentials — строгая политика

- Локально: `.env` (в `.gitignore`). **Никогда** не коммить.
- Production: GitHub Secrets — `OZON_PERF_CLIENT_ID`, `OZON_PERF_CLIENT_SECRET`.
- Если пользователь делится ключами в чате — напомни перевыпустить после тестов.
- **Никогда** не клади реальные значения в `.env.example`, код, логи, скрины.

## Инфраструктурные ловушки

- **GitHub scheduled workflows** запускаются только с default-ветки (обычно `main`).
  На feature-ветке cron не сработает — либо мерджь в main, либо меняй default.
- Workflow, который коммитит сам себе — ловит race conditions. Перед push делай
  `git pull --rebase origin $GITHUB_REF_NAME`, retry 3-5 раз с backoff.
- `env.SECRET_NAME != ''` — удобный способ условно выполнять шаг только
  при наличии секрета (например, Telegram-нотификации).

## Готовая референс-реализация

Все грабли выше реализованы и протестированы в **`dasexperten/arams-db`**.
Читай там:
- `ozon_perf/client.py` — OAuth2 с кешем токена, retry, 401-refresh, 429-backoff
- `ozon_perf/api.py` — правильный формат параметров для всех эндпоинтов
- `ozon_perf/etl.py::_flatten_daily` — парсер плоского ответа + `_int`/`_float` с ру-запятой
- `ozon_perf/report.py` — универсальный парсер CSV/ZIP
- `ozon_perf/db.py` — идемпотентная схема с `ON CONFLICT DO UPDATE`
- `.github/workflows/sync-ozon.yml` — готовый cron + Telegram-нотификации
- `tests/` — моки httpx для контракта

Клонируй и адаптируй, а не пиши с нуля.

## Idea backlog (нерешённое)

- **Seller API** для честного ROI (реклама vs факт. продажи минус возвраты).
- Связка с 1С / ERP по SKU.
- Сравнение периодов (неделя к неделе) в дашборде.
- Алерты в Telegram при скачке ДРР / падении ROAS.
- Мульти-кабинетность (`account_id` в составной PK).
