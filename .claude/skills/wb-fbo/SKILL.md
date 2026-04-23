---
name: wb-fbo
description: |
  Месячный калькулятор поставки на склады Wildberries FBO для продуктов Das Experten.
  Подтягивает остатки и продажи через WB Statistics + Analytics API, считает
  коэффициент K = stock/sales, классифицирует зоны 0.8/1.2, генерирует Excel
  с планом поставки по каждому складу с округлением до упаковки.
  Триггеры: "посчитай WB FBO", "план поставки WB", "остатки WB FBO", "wb-fbo",
  "wb fbo monthly", "wb поставка", "склады WB".
when_to_use: |
  - Запрос плана поставки на склады Wildberries FBO
  - Анализ остатков и продаж WB по кластерам
  - Работа с упаковками DE1##/DE2## для WB
user-invocable: false
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

- **`.claude/skills/ozon-skill/SKILL.md`** — общий Ozon API playbook.
  Полезно при расширении WB-FBO на async endpoints в будущем.

- **`.claude/skills/contacts/SKILL.md`** — маппинг warehouse_id → регион.
  Пока не используем, держим в курсе.

### Downstream (WB-FBO-план питает эти скиллы)

- **`.claude/skills/logist/SKILL.md`** — после WB-FBO плана logist создаёт shipment.
- **`.claude/skills/invoicer/SKILL.md`** — CI/PL на внутреннюю отгрузку на склад WB.

### Pattern source (код-паттерны, WB-FBO зеркалит эти модули)

- **`wb_seller/` (модуль в корне репо)** — reference для:
  - `client.py` — httpx-обвязка с JWT-авторизацией, 429/401 retry.
  - `db.py` — стиль SQLite-схемы, `ON CONFLICT DO UPDATE` upserts.
  - `etl.py` — оркестрация sync-ов с пагинацией.

  `wb_fbo/` зеркалит `wb_seller/` один-в-один. **Токен один и тот же**
  (`WB_FEEDBACKS_TOKEN`), разные scope.

### Global conventions

- **Root `CLAUDE.md`** — project-wide rules. Если что-то в этом SKILL.md
  конфликтует с root CLAUDE.md — **побеждает root CLAUDE.md**.

---

## Что за модуль

Месячный расчёт поставки по складам Wildberries FBO. Живёт рядом с `wb_seller/`
и использует **тот же** токен `WB_FEEDBACKS_TOKEN` — он универсальный.

**Что делает:** раз в месяц (1-е число 09:00 МСК = 06:00 UTC, либо вручную
через GitHub Actions → Run workflow) подтягивает остатки и продажи за 30 дней,
считает коэффициент `stock / sales`, классифицирует по зонам, генерит Excel
в `output/` и отправляет в Telegram как document + сохраняет как GH artifact
на 90 дней.

**Что НЕ делает:**
- Не работает с FBS.
- Не коммитит Excel в репо — только в `output/` (gitignored).
- Не меняет состояние в WB — только читает через API.

---

## Структура модуля (`wb_fbo/`)

```
wb_fbo/
  client.py     httpx с Authorization JWT, 429/401-retry,
                throttle 21 сек между страницами stocks
  api.py        Обёртки: ping, stocks_report (POST, offset-пагинация),
                sales_list (GET, dateFrom)
  db.py         Схема: fbo_stocks, fbo_sales, fbo_plans, fbo_runs
  etl.py        sync_stocks + sync_sales, окно 30 дней
  calc.py       Коэффициент, зоны 0.8/1.2, target × 1.5,
                packaging-round для DE1##/DE2##
  report.py     openpyxl Excel в output/, per-warehouse summary rows,
                bold column G, zone-colored cells
```

---

## Pipeline (9 шагов)

1. **Ping token** — `GET https://common-api.wildberries.ru/ping`.
   Если 401/403 → stop + Telegram-алерт.
2. **Sync stocks** — `POST /api/analytics/v1/stocks-report/wb-warehouses`
   (база `seller-analytics-api.wildberries.ru`). Throttle 21 сек между страницами.
   Stop когда страница вернула `< 250 000` строк.
3. **Sync sales** — `GET /api/v1/supplier/sales?dateFrom=<today-30d>`
   (база `statistics-api.wildberries.ru`). Одним запросом.
   **Фильтр:** `saleID` с `S` → продажа (учитываем), с `R` → возврат (исключаем).
4. **Aggregate & join:**
   ```
   stocks_agg:  GROUP BY (vendorCode, warehouseName) → SUM(quantity)
   sales_agg:   GROUP BY (supplierArticle, warehouseName) → COUNT(*) as sales_30d
   merged:      LEFT JOIN stocks_agg ← sales_agg on (sku, warehouse)
   ```
5. **Calculate:**
   ```
   K             = stock / sales_30d          (если sales_30d > 0, иначе "—")
   target_stock  = sales_30d × 1.5            (45 дней покрытия — hard-coded)
   to_ship_raw   = max(0, target_stock − stock)
   to_ship       = ROUNDUP(to_ship_raw / pack_size) × pack_size
   ```
6. **Классификация зон** (hard-coded):
   | K               | Zone       | Action                          |
   |-----------------|------------|---------------------------------|
   | `K < 0.8`       | DEFICIT    | `to_ship` по формуле            |
   | `0.8 ≤ K ≤ 1.2` | NORMAL     | `to_ship = 0`                   |
   | `K > 1.2`       | OVERSTOCK  | `to_ship = 0`                   |

7. **Packaging detection** (pack_size для ROUNDUP):
   | SKU паттерн                              | `pack_size` |
   |------------------------------------------|-------------|
   | `DE2##` (паста штучная)                  | 72          |
   | `DE2## AA` / `DE2## AAAA` / `*набор*`    | 36          |
   | `DE1##` штучные (не акс.)                | 288         |
   | `DE1## AA` / `DE1## AAAA`                | 144         |
   | `DE1##` аксессуары (111/112/115/125/126) | ask / flag  |
   | Неизвестный формат                       | ask / flag  |

8. **Edge-cases:**
   - `sales_30d = 0` → `K = "—"`, `to_ship = 0`, flag «Нет продаж за 30 дней»
   - `stock = 0 AND sales_30d > 0` → flag «🔴 Товар вышел», приоритет #1
   - `stock < 5 AND K < 0.2` → flag «⚠️ Возможен дефицит — проверь вручную»
   - Отрицательные значения → flag «⚠️ Некорректные данные», `to_ship = 0`

9. **Excel** (`output/wb_fbo_YYYY-MM-DD.xlsx`, **gitignored**):
   Колонки: `Склад | SKU | Остаток | Продажи | К | Зона | Поставка | Примечание`.

   - Колонка G (`Поставка`) — **жирная** везде.
   - Zone-fill по ячейке `Зона`: DEFICIT→FFE6E6, NORMAL→E6F4E6, OVERSTOCK→EEEEEE.
   - Per-warehouse summary row после последнего SKU каждого склада:
     - A = `ИТОГО <WAREHOUSE_UPPER>`; D = `Σ sales`; E = weighted-avg K; G = `Σ to_ship`
   - Сортировка: warehouse alpha, внутри — out-of-stock first, потом `to_ship DESC`, SKU alpha.
   - Если есть «🔴 Товар вышел»: шапка в row 1 `⚠️ N позиций в out-of-stock — приоритет отгрузки`.

---

## Delivery — два канала

**1. Telegram:** `sendDocument` с Excel + caption:
```
📦 WB-FBO план готов · YYYY-MM-DD

Обработано: N SKU × склад
К поставке: X позиций, Y шт. суммарно
В норме: Z позиций
Overstock (блок): W позиций
Out-of-stock (🔴): V позиций
Unknown pack (⚠️): U позиций
```

**2. GitHub Actions artifact:** `actions/upload-artifact@v4`, хранится 90 дней.

---

## Контракт WB Statistics + Analytics API

**Auth:** `Authorization: <WB_FEEDBACKS_TOKEN>` (без `Bearer`).

**ВАЖНО:** с 23 июня 2026 старый `GET /api/v1/supplier/stocks` отключён.
Использовать **только** `POST /api/analytics/v1/stocks-report/wb-warehouses`.

| Эндпоинт | Метод | База | Лимит |
|----------|-------|------|-------|
| `/api/analytics/v1/stocks-report/wb-warehouses` | POST | `seller-analytics-api.wildberries.ru` | 1 req / 20 sec |
| `/api/v1/supplier/sales` | GET | `statistics-api.wildberries.ru` | 1 req / 60 sec |
| `/ping` | GET | `common-api.wildberries.ru` | — |

### Stocks-report body:
```json
{"locale": "ru", "filter": {"offsetPaid": 0, "limit": 250000}}
```
Пагинация: `offsetPaid += limit`. Stop когда ответ < limit строк.

### Stocks-report ключевые поля:
- `nmId`, `vendorCode`, `warehouseId`, `warehouseName`, `region`, `quantity`

### Supplier/sales query params:
```
dateFrom=YYYY-MM-DDTHH:MM:SS  flag=0
```
Ключевые поля: `saleID` (S=продажа, R=возврат), `supplierArticle`, `nmId`, `warehouseName`, `forPay`

---

## Схема `wb_fbo.db`

```
fbo_stocks  PK (nm_id, warehouse_id, run_date)
fbo_sales   PK (sale_id)
fbo_plans   PK (sku, warehouse, run_date)
fbo_runs    PK run_id (auto-increment)
```

---

## CLI-шпаргалка

```bash
python cli.py ping-wb-fbo
python cli.py init-wb-fbo-db
python cli.py sync-wb-stocks
python cli.py sync-wb-sales --days 30
python cli.py calc-wb-fbo
python cli.py report-wb-fbo
python cli.py wb-fbo-monthly       # END-TO-END
```

---

## Критические напоминания

1. Зоны 0.8 / 1.2 — **hard-coded**.
2. `k_target = 1.5` (45 дней) — **hard-coded**.
3. Округление `to_ship` — **ТОЛЬКО вверх** (ROUNDUP).
4. Старый endpoint `GET /api/v1/supplier/stocks` **ЗАПРЕЩЁН** (отключён 23 июня 2026).
5. Возвраты (`saleID` с `R`) **НЕ учитываются** в `sales_30d`.
6. Excel — **только в `output/`** (gitignored).
7. Токен `WB_FEEDBACKS_TOKEN` **переиспользуется** — новый секрет не создавать.
8. **Never fabricate** поля API.

**END OF SKILL**
