# Arams Product Placement — Ozon Performance

ETL и аналитика для рекламного кабинета Ozon через **Performance API**
(`api-performance.ozon.ru`). Забирает кампании и дневную статистику,
складывает в SQLite и считает KPI (ДРР, ROAS, CPO, CTR, CR).

## Структура

```
ozon_perf/
  client.py     OAuth2 (client_credentials), retry, 429/401 handling
  api.py        Обёртки над /api/client/campaign, /api/client/statistics
  report.py     Парсер CSV/ZIP-отчётов (RU/EN заголовки, ; и , разделители)
  db.py         SQLite-схема и upsert-лоадеры
  etl.py        Оркестрация выгрузки
  analyze.py    SQL-агрегации для KPI
  dashboard.py  Генератор HTML-дашборда (Chart.js, self-contained)
cli.py          Точка входа: init / ping / sync-* / kpi / dashboard
tests/          pytest + httpx MockTransport
samples/        Демо-дашборд со синтетическими данными
```

## Посмотреть дашборд прямо сейчас

Открой `samples/dashboard_demo.html` в браузере двойным кликом — никаких
запусков и установок не нужно, там зашиты синтетические данные для превью.

## Автоматическая выгрузка через GitHub Actions

Настроен workflow `.github/workflows/sync-ozon.yml`, который каждую ночь
подтягивает данные из Ozon Performance API и обновляет
`samples/dashboard.html`. Без локального Python.

**Разовая настройка (≈1 минута):**

1. Открой репо на github.com → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**.
2. Добавь два секрета:
   - `OZON_PERF_CLIENT_ID` — `94071772-1776699682393@advertising.performance.ozon.ru`
   - `OZON_PERF_CLIENT_SECRET` — длинный токен из кабинета Performance
3. Перейди во вкладку **Actions** → слева выбери **Sync Ozon Performance** →
   справа **Run workflow** → **Run workflow**. Первый запуск — руками.
4. Через 2-3 минуты job завершится. Открой
   `samples/dashboard.html` через raw.githack.com — там уже реальные данные.

Дальше каждый день в 08:00 МСК GitHub сам всё обновит.

**Если upstream упадёт с 401/403** — значит ключи невалидны: перевыпусти их
в кабинете Performance и обнови оба секрета.

## Установка

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# заполнить OZON_PERF_CLIENT_ID и OZON_PERF_CLIENT_SECRET
```

Ключи берутся в кабинете Ozon Performance: **Настройки → API-ключи**.

## Использование

```bash
python cli.py init                       # создать SQLite-схему
python cli.py ping                       # проверить credentials
python cli.py sync-all --days 30         # кампании + статистика за 30 дней
python cli.py sync-campaigns             # только каталог кампаний
python cli.py sync-daily --days 7        # дневная статистика за 7 дней
python cli.py sync-daily --from 2026-04-01 --to 2026-04-15
python cli.py sync-sku --days 7          # SKU-level через async-отчёт
python cli.py kpi --days 30              # дашборд в консоли
python cli.py kpi --from 2026-04-01 --to 2026-04-15 --sku
python cli.py dashboard --days 30           # HTML из SQLite
python cli.py dashboard --demo --out demo.html  # демо без БД
```

## Тесты

```bash
pip install pytest
python -m pytest tests/ -v
```

12 тестов покрывают: OAuth-флоу, refresh по 401, обработку ошибок, async-отчёт,
парсинг CSV/ZIP с русскими и английскими заголовками, идемпотентность ETL,
вычисление KPI.

## Схема БД

| таблица                | смысл                                         |
|------------------------|-----------------------------------------------|
| `campaigns`            | каталог кампаний, upsert по `campaign_id`     |
| `campaign_daily_stats` | дневная статистика по кампании (PK день+id)   |
| `sku_daily_stats`      | дневная статистика по SKU (заготовка)         |
| `etl_runs`             | журнал запусков ETL                           |

Re-run за тот же день **идемпотентен** — данные переписываются.

## Что считается в `kpi`

- **CTR** = clicks / views
- **CR** = orders / clicks
- **CPO** = spent / orders
- **ДРР** = spent / revenue
- **ROAS** = revenue / spent

## Ограничения и нюансы

- Токен живёт ~30 минут, клиент кеширует и обновляет автоматически.
- Лимит — 100 000 запросов/сутки на аккаунт Performance.
- Статистика за текущий день неполная; ETL по умолчанию идёт по «вчера».
- SKU-уровень: `sync-sku` делает async-отчёт (`POST /api/client/statistics` →
  poll → download), парсер `report.py` понимает CSV/ZIP и разные разделители.
- Без реальных `client_id` / `client_secret` проверено только на моках;
  первый запуск с боевыми ключами лучше делать с коротким окном (`--days 1`).

## Дальше

- Связка с Seller API (заказы/возвраты) для честного ROI.
- Выгрузка в Google Sheets / BigQuery, когда определимся с целевым DWH.
