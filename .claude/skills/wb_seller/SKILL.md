---
name: wb-fbo
description: |
  Monthly supply planning calculator for Wildberries FBO. ALWAYS trigger this
  skill when Aram mentions any of: "посчитай WB", "WB-FBO", "план поставки WB",
  "WB поставка", "остатки WB", "wb fbo", "wb-fbo-monthly", "wb monthly",
  "wb план", "посчитай остатки WB", "calc WB FBO", or uploads/references any
  Wildberries stock/sales report that needs supply recommendations per cluster.
  Fires the full ETL pipeline: stocks API → sales API → coefficient calc →
  zone classification → Excel in output/ → Telegram document + GH artifact.
  Fire immediately — no confirmation needed.
---

# WB-FBO — Wildberries FBO Supply Planning Playbook

Standalone playbook для модуля `wb_fbo/` в монорепо `dasexperten/arams-db`.
Автоматически подтягивается Claude Code при любом WB-FBO-триггере.

**Owner:** Aram Badalyan. Уведомления идут напрямую ему в Telegram
(`TELEGRAM_CHAT_ID`), без посредников.

---

## Related skills & modules in this repo

WB-FBO не живёт в вакууме — он наследует паттерны из уже работающих скиллов
и модулей репозитория `dasexperten/arams-db`. При любых правках **сверяться
с источниками ниже в первую очередь**, прежде чем изобретать что-то своё.

### Canonical source (прямой аналог, WB-FBO наследует verbatim)

- **`.claude/skills/ozon-fbo-calculator/SKILL.md`** — **прямой близнец**
  WB-FBO для Ozon FBO. Canonical reference для:
  - Packaging detection (матрица DE1##/DE2## и unknown-SKU handling).
  - Логики коэффициента остатки/продажи и её интерпретации.
  - Формата Excel-вывода: per-cluster summary rows, weighted-avg K, bold
    Поставка, sort order, zone-colored cells.
  - Deficit warning flags (stock<5 + K<0.2, out-of-stock policy, отрицательные
    значения, missing sales data).

  **Правило:** при любом расхождении — WB-FBO подстраивается под
  ozon-fbo-calculator, не наоборот. Если туда добавили новый SKU-паттерн
  или флаг — пропагировать в `wb_fbo/calc.py` в том же PR.

### Upstream (WB-FBO читает оттуда данные / конвенции)

- **`.claude/skills/product-skill/SKILL.md`** — canonical SKU каталог
  Das Experten (vendor codes, линейки, packaging counts 72/36/288/144).
  `wb_fbo/calc.py` опирается на эту матрицу для packaging detection.

- **`.claude/skills/ozon-skill/SKILL.md`** — общий Ozon API playbook
  (Performance + Seller, обе API). Не прямой аналог, но даёт пример
  обработки асинхронных отчётов, 429-retry, token-refresh — полезно при
  расширении WB-FBO на async endpoints в будущем.

- **`.claude/skills/contacts/SKILL.md`** — если когда-то понадобится
  человекочитаемый маппинг warehouse_id → регион/клиентский менеджер.
  Пока не используем, но держим в курсе.

### Downstream (WB-FBO-план питает эти скиллы)

- **`.claude/skills/logist/SKILL.md`** — после того как WB-FBO выдал план,
  `logist` создаёт shipment: 9-warehouse network, Inter-Freight (Alisa,
  Denis, Alexander), маршрутизация. В будущем — автомат: план WB-FBO →
  inbound в `logist` → черновик отгрузки.

- **`.claude/skills/invoicer/SKILL.md`** — когда отгрузка создана,
  `invoicer` генерит Commercial Invoice + Packing List. Для FBO-поставок
  это CI/PL на внутреннюю отгрузку на склад WB.

### Pattern source (код-паттерны, WB-FBO зеркалит эти модули)

- **`wb_seller/` (модуль в корне репо)** — reference-имплементация для:
  - `client.py` — httpx-обвязка с JWT-авторизацией, 429/401 retry.
  - `db.py` — стиль SQLite-схемы, `ON CONFLICT DO UPDATE` upserts.
  - `etl.py` — оркестрация sync-ов с пагинацией.

  `wb_fbo/` зеркалит `wb_seller/` один-в-один, просто с другими endpoints
  и другой БД (`wb_fbo.db` вместо `wb_seller.db`). **Токен один и тот же**
  (`WB_FEEDBACKS_TOKEN`), разные scope.

- **`ozon_seller/` (модуль в корне репо)** — reference для пагинации
  (паттерн `last_id` / cursor-based pagination). Для WB-FBO stocks-report
  используется offset-пагинация (проще), но общий стиль цикла тот же.

### Global conventions

- **Root `CLAUDE.md`** — project-wide rules: нетехничный пользователь
  (терминала нет, всё через GitHub UI + Telegram), sandbox blocks outbound
  HTTP (тестируется только на GitHub-раннере), GitHub Secrets список,
  Telegram format с MSK-датами и HTML-escape. Если что-то в этом SKILL.md
  конфликтует с root CLAUDE.md — **побеждает root CLAUDE.md**.

---

## Что за модуль

Месячный расчёт поставки по кластерам Wildberries FBO. Живёт рядом с `wb_seller/`
(Feedbacks API для отзывов) и использует **тот же** токен `WB_FEEDBACKS_TOKEN` —
он универсальный, скоупы у него Feedbacks + Statistics + Analytics.

**Что делает:** раз в месяц (1-е число 09:00 МСК, либо вручную через GitHub
Actions → Run workflow) подтягивает остатки и продажи за 30 дней, считает
коэффициент `stock / sales`, классифицирует по зонам, генерит Excel в `output/`
и отправляет в Telegram как document + сохраняет как GH artifact на 90 дней.

**Что НЕ делает:**
- Не работает с FBS (собственные склады Das Experten в РФ — это отдельный
  будущий модуль `wb_fbs/`).
- Не коммитит Excel в репо — только в `output/` (gitignored).
- Не меняет состояние в WB — только читает через API.

---

## Структура модуля (`wb_fbo/`)

```
wb_fbo/
  client.py     httpx с Authorization JWT, 429/401-retry,
                throttle 20 сек для Analytics-endpoint
  api.py        Обёртки: stocks_report (POST, offset-пагинация),
                supplier/sales (GET, dateFrom)
  db.py         Схема: fbo_stocks, fbo_sales, fbo_plans, fbo_runs
  etl.py        sync_stocks + sync_sales, окно 30 дней
  calc.py       Коэффициент, зоны 0.8/1.2, target × 1.5,
                packaging-round для DE1##/DE2##
  report.py     openpyxl Excel в output/, per-warehouse summary rows,
                bold column G, zone-colored cells
```

CLI-точка: `cli.py cmd_wb_fbo_monthly` (END-TO-END), плюс отдельные команды
для отладки (см. раздел «CLI-шпаргалка» ниже).

**Паттерн-источник:** `wb_seller/` в корне репо. `wb_fbo/client.py` ↔
`wb_seller/client.py` отличаются только base URL и endpoints — вся
httpx-обвязка, retry-логика, token-ping идентичны. Если `wb_seller/`
получил fix (например, обработку нового кода ошибки) — propagate в
`wb_fbo/` в том же PR.

---

## Pipeline (9 шагов)

1. **Ping token** — `GET https://common-api.wildberries.ru/ping` с заголовком
   `Authorization: <WB_FEEDBACKS_TOKEN>`. Если 401/403 → stop + Telegram-алерт
   «WB-FBO: токен отклонён, проверь перевыпуск».
2. **Sync stocks** — `POST /api/analytics/v1/stocks-report/wb-warehouses`
   (база `seller-analytics-api.wildberries.ru`). Offset-пагинация, throttle
   21 сек между страницами (лимит 1 req / 20 sec, держим запас 1 сек),
   страница до 250 000 строк, stop когда страница вернула `< 250 000`.
   Upsert в `fbo_stocks` по `(nmId, warehouse_id, run_date)`.
3. **Sync sales** — `GET /api/v1/supplier/sales?dateFrom=<today-30d>`
   (база `statistics-api.wildberries.ru`). Одним запросом, 1 строка = 1
   продажа/возврат. **Фильтр на ETL:** `saleID` начинается с `S` → продажа
   (учитываем), с `R` → возврат (исключаем из подсчёта `sales_30d`).
   Upsert в `fbo_sales` по `sale_id`.
4. **Aggregate & join:**
   ```
   stocks_agg:  GROUP BY (vendorCode, warehouseName) → SUM(quantity)
   sales_agg:   GROUP BY (supplierArticle, warehouseName) → COUNT(*) as sales_30d
   merged:      LEFT JOIN stocks_agg ← sales_agg on (sku, warehouse)
   ```
   Строки stocks без sales → `sales_30d = 0`.
   Строки sales без stocks → `stock = 0`.
5. **Calculate:**
   ```
   K             = stock / sales_30d          (если sales_30d > 0, иначе "—")
   target_stock  = sales_30d × 1.5            (45 дней покрытия — hard-coded)
   to_ship_raw   = max(0, target_stock − stock)
   to_ship       = ROUNDUP(to_ship_raw / pack_size) × pack_size
   ```
   Результат пишется в `fbo_plans` по `(sku, warehouse, run_date)` — это
   история, сохраняется навсегда.
6. **Классификация зон** (hard-coded, не крутится):
   | K               | Zone       | Action                                |
   |-----------------|------------|---------------------------------------|
   | `K < 0.8`       | DEFICIT    | `to_ship` по формуле, поставка        |
   | `0.8 ≤ K ≤ 1.2` | NORMAL     | `to_ship = 0`, держим как есть        |
   | `K > 1.2`       | OVERSTOCK  | `to_ship = 0`, блок на поставку       |

   Блок снимается **автоматически** на следующем прогоне, если K вернулся
   в зону `≤ 1.2`. Состояние не хранится — просто пересчёт на свежих данных.
7. **Packaging detection** (pack_size для ROUNDUP):
   | SKU паттерн                              | `pack_size` |
   |------------------------------------------|-------------|
   | `DE2##` (паста штучная)                  | 72          |
   | `DE2## AA` / `DE2## AAAA` / `*набор*`    | 36          |
   | `DE1##` штучные (111/112/115/125/126)    | 288         |
   | `DE1## AA` / `DE1## AAAA`                | 144         |
   | Прочие `DE1##` (нити, ёршики, акс.)      | ask / flag  |
   | Неизвестный формат                       | ask / flag  |

   Для unknown — строка идёт в Excel с `to_ship = 0` и
   `Примечание = "⚠️ Unknown pack для SKU X"`, в Telegram-сводке отдельный
   счётчик.

   **Canonical source:** `.claude/skills/ozon-fbo-calculator/SKILL.md`
   (секция «SKU Packaging Detection»). Полная матрица упаковок + policy для
   неизвестных SKU живут там. WB-FBO `calc.py` копирует логику вербатим.
   Мастер-каталог vendor codes — `.claude/skills/product-skill/SKILL.md`.
   Если в любом из этих скиллов добавился новый SKU-паттерн (новая линейка,
   новый вариант набора) — **обязательно** пропагировать в `wb_fbo/calc.py`
   в том же PR.
8. **Edge-cases** (применяются до Excel):
   - `sales_30d = 0` → `K = "—"`, `to_ship = 0`, flag «Нет продаж за 30 дней»
   - `stock = 0 AND sales_30d > 0` → flag «🔴 Товар вышел», приоритет #1
     (строка закрепляется в топе Excel внутри своего склада)
   - `stock < 5 AND K < 0.2` → flag «⚠️ Возможен дефицит — проверь вручную»
     (продукт мог быть out-of-stock часть периода, реальный потенциал выше)
   - Отрицательные значения → flag «⚠️ Некорректные данные», строка
     включается в Excel, но `to_ship = 0`
9. **Excel** (`output/wb_fbo_YYYY-MM-DD.xlsx`, **gitignored**):
   Колонки: `Склад | SKU | Остаток | Продажи | К | Зона | Поставка | Примечание`.

   - Колонка G (`Поставка`) — **жирная** везде, и в data rows, и в summary.
   - Zone-fill по ячейке `Зона`:
     - DEFICIT → light-red (`FFE6E6`)
     - NORMAL → light-green (`E6F4E6`)
     - OVERSTOCK → light-gray (`EEEEEE`)
   - Per-warehouse summary row **после последнего SKU каждого склада**,
     вся строка жирная:
     - A (`Склад`) = `ИТОГО <WAREHOUSE_UPPER>`
     - D (`Продажи`) = `Σ sales` по складу
     - E (`К`) = weighted-avg: `Σ(K × sales) / Σ(sales)`, 2 знака
     - G (`Поставка`) = `Σ to_ship` по складу
     - Остальные колонки — пустые
   - Сортировка: warehouse alpha (русская локаль), внутри — `to_ship DESC`,
     потом SKU alpha.
   - Приоритетная шапка (frozen row 1), если есть хоть одна строка
     «🔴 Товар вышел»: `⚠️ N позиций в out-of-stock — приоритет отгрузки`.

---

## Delivery — два канала

**1. Telegram (основной):**
`POST /bot<TELEGRAM_BOT_TOKEN>/sendDocument` с файлом Excel + caption:

```
📦 WB-FBO план готов · YYYY-MM-DD

Обработано: N SKU × склад
К поставке: X позиций, Y шт. суммарно
В норме: Z позиций
Overstock (блок): W позиций
Out-of-stock (🔴): V позиций
Unknown pack (⚠️): U позиций
```

Отдельных per-item сообщений **нет** — по FBO-плану это 100+ строк, флуд.

**2. GitHub Actions artifact (fallback / история):**
`actions/upload-artifact@v4` с именем `wb-fbo-YYYY-MM-DD`, хранится 90 дней.
Скачивается из UI Actions → Runs → нужный прогон → Artifacts.

---

## Контракт WB Statistics + Analytics API

**Auth:** `Authorization: <WB_FEEDBACKS_TOKEN>` (без `Bearer`). Токен
**универсальный**, имя переменной историческое (изначально был только для
Feedbacks API в `wb_seller/`). Скоупы у него все: Feedbacks + Statistics +
Analytics. Живёт 180 дней.

**ВАЖНО:** с 23 июня 2026 старый `GET /api/v1/supplier/stocks` отключён.
Использовать **только** `POST /api/analytics/v1/stocks-report/wb-warehouses`.

| Эндпоинт | Метод | База | Scope | Лимит |
|----------|-------|------|-------|-------|
| `/api/analytics/v1/stocks-report/wb-warehouses` | POST | `seller-analytics-api.wildberries.ru` | Аналитика | 1 req / 20 sec |
| `/api/v1/supplier/sales` | GET | `statistics-api.wildberries.ru` | Статистика | 1 req / 60 sec |
| `/ping` | GET | `common-api.wildberries.ru` | любой | — |

### Stocks-report — request body

```json
{
  "locale": "ru",
  "filter": {
    "offsetPaid": 0,
    "limit": 250000
  }
}
```

Для пагинации — в следующем запросе `offsetPaid += limit`. Stop когда ответ
вернул `< limit` строк.

### Stocks-report — ключевые поля ответа

- `nmId` — int, WB internal ID. PK вместе с `warehouseId`.
- `vendorCode` — string, наш внутренний артикул (DE201 и т.п.). Мапится на
  `supplierArticle` из sales для join'а.
- `warehouseId` / `warehouseName` — ID и человекочитаемое имя склада.
- `region` — shipping region (Юг, Центр, и т.д.). Пишем в БД для истории,
  в расчёте не используем.
- `quantity` — доступно к продаже. **Это наш `stock`.**
- `inWayToClient` / `inWayFromClient` — в пути, игнорируем.

### Supplier/sales — query params

```
dateFrom=YYYY-MM-DDTHH:MM:SS  (ISO 8601, today − 30 days)
flag=0                         (0 = продажи за период, 1 = изменения за сутки)
```

### Supplier/sales — ключевые поля

- `saleID` — string. `S...` = продажа (учитываем), `R...` = возврат
  (исключаем из `sales_30d`). Фильтр применяется на ETL.
- `supplierArticle` — наш артикул, мапится на `vendorCode` из stocks.
- `nmId` — int, связка со stocks.
- `warehouseName` — склад отгрузки.
- `date` / `lastChangeDate` — ISO datetime.
- `forPay` — к выплате продавцу. В FBO-расчёте не используется, но сохраняем
  в `fbo_sales` для будущего ROI-модуля.

---

## Схема `wb_fbo.db`

```
fbo_stocks
  PK (nm_id, warehouse_id, run_date)
  vendor_code, warehouse_name, region,
  quantity, in_way_to_client, in_way_from_client,
  raw_payload JSON, synced_at TIMESTAMP

fbo_sales
  PK (sale_id)
  supplier_article, nm_id, warehouse_name,
  date, last_change_date, for_pay, is_return BOOL,
  raw_payload JSON, synced_at TIMESTAMP

fbo_plans
  PK (sku, warehouse, run_date)
  stock, sales_30d, k, zone,
  pack_size, to_ship, flag,
  created_at TIMESTAMP

fbo_runs
  PK run_id (auto-increment)
  run_date, stocks_pages, stocks_rows,
  sales_rows, plans_created, warnings,
  excel_path, artifact_uploaded BOOL,
  telegram_sent BOOL, exit_code,
  started_at TIMESTAMP, finished_at TIMESTAMP
```

Идемпотентность — через `ON CONFLICT DO UPDATE`. Повторный прогон за тот же
`run_date` перезапишет, не задублит. **История месяцев живёт в `fbo_plans`**
(Excel — разовый вывод, не история).

---

## CLI-шпаргалка

Добавляется в root `cli.py` (отдельными командами плюс END-TO-END):

```bash
# Проверка / отладка
python cli.py ping-wb-fbo                 # /ping с WB_FEEDBACKS_TOKEN
python cli.py sync-wb-stocks              # POST stocks-report, все страницы → SQLite
python cli.py sync-wb-sales --days 30     # GET supplier/sales за 30 дней → SQLite
python cli.py calc-wb-fbo                 # расчёт на последнем снимке → fbo_plans
python cli.py report-wb-fbo               # Excel в output/ (gitignored)

# END-TO-END (для cron и ручного запуска)
python cli.py wb-fbo-monthly              # ping → sync stocks → sync sales → calc → excel → artifact → telegram
```

---

## GitHub Actions workflow

Файл: `.github/workflows/wb-fbo-monthly.yml`.

Триггеры:
- Cron `0 6 1 * *` (1-е число месяца 09:00 МСК = 06:00 UTC).
- `workflow_dispatch` для ручного запуска.

Job steps:
1. Checkout + setup Python 3.11.
2. `pip install -r requirements.txt`.
3. `python cli.py init-wb-fbo-db` (idempotent создание `wb_fbo.db`).
4. `python cli.py wb-fbo-monthly` с env:
   - `WB_FEEDBACKS_TOKEN` (из secrets, уже есть)
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (уже есть)
5. `actions/upload-artifact@v4` с `output/wb_fbo_*.xlsx`, retention 90 days.
6. `continue-on-error: true` для Telegram-шага — если Telegram упал,
   artifact всё равно должен сохраниться.

Exit codes из `wb-fbo-monthly`:
- `0` — ок (всё прошло, Excel есть).
- `1` — partial (stocks ок, sales упали или наоборот).
- `2` — hard fail (токен, БД, Excel не создался).

---

## Secrets

**Новых секретов не добавляем.** Используется существующий `WB_FEEDBACKS_TOKEN`
(универсальный, все три категории).

> **Memo:** если когда-нибудь перевыпускать этот токен через
> seller.wildberries.ru → Настройки → Доступ к API — обязательно сохранить
> **все три категории**: Вопросы и отзывы + Статистика + Аналитика.
> Иначе либо `wb_seller/` (отзывы), либо `wb_fbo/` (остатки) отвалится.

---

## Тесты

Файл: `tests/test_wb_fbo.py`. Покрытие:

- `test_k_calculation_zones` — границы 0.8 и 1.2, попадание в правильную зону.
- `test_packaging_rounding` — DE201 → 72, `DE201 AA` → 36, DE119 → 288,
  `DE119 AAAA` → 144, unknown → flag.
- `test_edge_sales_zero` — K = "—", to_ship = 0, flag.
- `test_edge_stock_zero_sales_positive` — flag «Товар вышел», приоритет.
- `test_edge_hidden_deficit` — stock<5 + K<0.2 → flag.
- `test_aggregation_sku_warehouse` — дубликаты из API корректно суммируются.
- `test_weighted_avg_k` — summary row считает `Σ(K×sales)/Σ(sales)`.
- `test_return_filter` — `saleID` с `R` исключаются из `sales_30d`.
- `test_pagination_stop` — stop на странице < 250 000 строк.

Fixtures: `samples/wb_fbo_fixture.json` — две страницы stocks (первая 250 000,
вторая 10 000) + список sales с mix продаж и возвратов.

`httpx.MockTransport` для имитации WB API в тестах.

---

## Критические напоминания

1. **Зоны 0.8 / 1.2 — hard-coded.** Не крутятся, не настраиваются через env.
   Изменение требует явной инструкции от Арама.
2. **`k_target = 1.5` (45 дней) — hard-coded.** Аналогично.
3. **Округление `to_ship` — ТОЛЬКО вверх.** Никогда вниз. `ROUNDUP`.
4. **Old endpoint `GET /api/v1/supplier/stocks` ЗАПРЕЩЁН** (отключён 23 июня 2026).
   Использовать только `POST /api/analytics/v1/stocks-report/wb-warehouses`.
5. **Возвраты (`saleID` с `R`) НЕ учитываются** в `sales_30d`. Фильтр на ETL.
6. **Excel — только в `output/`** (gitignored). Никогда в `samples/` и не в коммиты.
7. **Состояние блока overstock не хранится** — просто пересчёт на свежих данных.
8. **Токен `WB_FEEDBACKS_TOKEN` переиспользуется** — новый секрет не создавать.
9. **Telegram-получатель — только Арам** (`TELEGRAM_CHAT_ID`). Посредников нет.
10. **Never fabricate** поля API. Если WB поменял ответ — stop + алерт,
    не угадывать структуру.
11. **Cross-skill sync:** packaging-логика, zone-классификация и deficit-flags
    синхронизированы с `.claude/skills/ozon-fbo-calculator/SKILL.md`.
    SKU-каталог — с `.claude/skills/product-skill/SKILL.md`. httpx/retry-
    обвязка — с модулем `wb_seller/`. При правках в любом из этих
    источников — пропагировать в `wb_fbo/` в том же PR.
12. **Downstream chain:** план из WB-FBO — это upstream для `logist`
    (создание shipment) и `invoicer` (CI/PL). В будущем автомат: план →
    inbound в logist → черновик отгрузки → invoice. Сейчас — ручной
    триггер оператора по Telegram-файлу.

---

**END OF SKILL**
