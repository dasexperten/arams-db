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

**Owner:** Aram Badalyan.

---

## Что за модуль

Месячный расчёт поставки по складам Wildberries FBO. Живёт рядом с `wb_seller/`
и использует **тот же** токен `WB_FEEDBACKS_TOKEN`.

---

## Pipeline

1. **Ping token** — `GET https://common-api.wildberries.ru/ping`
2. **Sync stocks** — `POST /api/analytics/v1/stocks-report/wb-warehouses` (throttle 21с)
3. **Sync sales** — `GET /api/v1/supplier/sales?dateFrom=<today-30d>`
4. **Aggregate & join** по (vendorCode, warehouseName)
5. **Calculate** K = stock/sales, to_ship = ROUNDUP(max(0, sales*1.5 - stock), pack_size)
6. **Зоны:** K<0.8=DEFICIT, 0.8≤1.2=NORMAL, >1.2=OVERSTOCK
7. **Packaging:** DE2## → 72/36, DE1## brush → 288/144, DE1## акс. → flag
8. **Excel** `output/wb_fbo_YYYY-MM-DD.xlsx` (gitignored)
9. **Telegram** sendDocument + caption с покластерной бреакдауном

---

## Контракт WB API

| Эндпоинт | Метод | База |
|---|---|---|
| `/api/analytics/v1/stocks-report/wb-warehouses` | POST | `seller-analytics-api.wildberries.ru` |
| `/api/v1/supplier/sales` | GET | `statistics-api.wildberries.ru` |
| `/ping` | GET | `common-api.wildberries.ru` |

**Auth:** `Authorization: <WB_FEEDBACKS_TOKEN>` (без Bearer).
Старый `GET /api/v1/supplier/stocks` запрещён (отключён 23.06.2026).

---

## Схема `wb_fbo.db`

```
fbo_stocks  PK (nm_id, warehouse_id, run_date)
fbo_sales   PK (sale_id)
fbo_plans   PK (sku, warehouse, run_date)
fbo_runs    PK run_id (auto-increment)
```

---

## CLI

```bash
python cli.py ping-wb-fbo
python cli.py init-wb-fbo-db
python cli.py sync-wb-stocks
python cli.py sync-wb-sales --days 30
python cli.py calc-wb-fbo
python cli.py report-wb-fbo
python cli.py wb-fbo-monthly
```

---

## Критические правила

1. Зоны 0.8/1.2 — **hard-coded**.
2. `k_target = 1.5` (45 дней) — **hard-coded**.
3. Округление `to_ship` — **ТОЛЬКО вверх** (ROUNDUP).
4. Возвраты (`saleID` с `R`) **НЕ учитываются** в `sales_30d`.
5. Excel — **только в `output/`** (gitignored).
6. Токен `WB_FEEDBACKS_TOKEN` **переиспользуется** — новый секрет не создавать.

**END OF SKILL**
