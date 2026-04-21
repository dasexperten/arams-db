---
name: ozon-fbo-calculator
description: |
  Расчёт поставок на склады Ozon FBO для продуктов Das Experten. На вход —
  Excel-отчёт из кабинета Ozon (колонки Артикул, Кластер, Остатки, Продажи
  за 30 дней) + опциональный список SKU на платном хранении. На выход —
  Excel с рекомендациями к поставке по каждому кластеру, с округлением до
  упаковки (пасты 72/36, щётки 288/144), исключениями для медленных
  кластеров и платного хранения, автоматическим флагом дефицита.
  Используй когда пользователь загружает Excel-отчёт Ozon FBO, просит
  посчитать план поставки, упоминает "поставка Ozon", "остатки на складах
  Ozon", "кластеры FBO", "платное хранение Ozon", "план поставки Das
  Experten", "DE2##/DE1## упаковки".
when_to_use: |
  - Пользователь загружает Excel из Ozon Seller → Аналитика → «Продажи со
    склада / Управление остатками»
  - Запрос «посчитай сколько поставить на Ozon FBO», «план поставки»
  - Работа с кластерами FBO (Москва / СПб / Казань / Краснодар / …)
  - Упаковки Das Experten: пасты DE2## (72 шт или 36 шт для наборов),
    щётки DE1## (288 шт или 144 шт для наборов)
  - Исключения по платному размещению (вторым файлом)
  - Флаг возможного дефицита при низких остатках + низком коэффициенте
user-invocable: true
---

# Ozon FBO Stock Allocation Calculator

Full-cycle stock allocation engine for Das Experten products on Ozon FBO.
Takes Ozon sales/inventory reports + paid storage exclusions → outputs
Excel table with supply recommendations per cluster.

> **Связанные скиллы.** Перед работой с API-данными Ozon (если пользователь
> захочет тянуть эти же данные напрямую из API вместо ручной выгрузки
> Excel) — подтяни `ozon-skill`: там контракт Seller API (`api-seller.ozon.ru`)
> и готовый пакет `ozon_seller/`. Этот скилл — про Excel-in / Excel-out.

## Core Function

**INPUT:**

- Ozon report (Excel) — columns: Артикул, Кластер, Остатки на складе, Продажи (last 30 days)
- Paid storage list (Excel) — columns: Артикул (SKUs with paid storage fees → exclude from supply)

**OUTPUT:**

Excel table with columns:

- Артикул
- Кластер
- Остатки
- Продажи (30 дней)
- Коэффициент (Остатки / Продажи)
- Рекомендация
- Флаг дефицита

## Workflow — Step by Step

### Step 1: File Validation

When user uploads a file, IMMEDIATELY check.

**Required columns in Ozon report:**

- Артикул OR SKU OR Article
- Кластер OR Cluster
- Остатки OR Остатки на складе OR Stock
- Продажи OR Sales OR any column with 30-day sales data

If ANY required column is missing:

```
❌ Файл не подходит.

Ожидаемые колонки:
- Артикул / SKU
- Кластер / Cluster
- Остатки / Stock
- Продажи за 30 дней / Sales

Проверь, что это отчёт "Продажи со склада / Управление остатками" из Ozon Seller → Аналитика → Отчёты.
```

If paid storage file is uploaded but column Артикул is missing:

```
❌ Файл с платным размещением должен содержать колонку "Артикул".
```

If files are valid → proceed to Step 1B.

### Step 1B: Data Aggregation

**CRITICAL:** Before any calculations, aggregate data by (Артикул + Кластер).

**Why:** Ozon report may contain the same SKU multiple times per cluster
(different warehouses within one cluster). All data must be summed first.

**Aggregation logic:**

```
GROUP BY: (Артикул, Кластер)
SUM: Остатки, Продажи
```

Example:

```
Input (raw Ozon data):
DE201 | Москва | Склад А | Остатки: 30 | Продажи: 70
DE201 | Москва | Склад Б | Остатки: 20 | Продажи: 50

After aggregation:
DE201 | Москва | Остатки: 50 | Продажи: 120
```

After aggregation → proceed to Step 2.

### Step 2: SKU Packaging Detection

For EVERY SKU in the report, detect packaging size using this logic:

**Toothpastes (SKU format: DE2##):**

- Single-unit (no suffix) → упаковка **72 шт**
  - Examples: `DE201`, `DE206`, `DE210`
- Dual-pack / набор (suffix `AA`, `AAAA`, or contains `"набор"`) → упаковка **36 шт**
  - Examples: `DE201 AA`, `DE206 AAAA`, `DE210 набор`

**Brushes (SKU format: DE1##):**

- Single-unit (no suffix) → упаковка **288 шт**
  - Examples: `DE101`, `DE105`, `DE117`, `DE119`
- Sets / наборы (suffix `AA`, `AAAA`, or contains `"набор"`) → упаковка **144 шт**
  - Examples: `DE101 AA`, `DE119 набор`

**Floss / Interdentals / Other accessories:**

- If SKU starts with `DE1##` but not in brush catalog (`DE111`, `DE112`,
  `DE115`, `DE125`, `DE126`) → skip from calculation (or ask user for
  packaging size if needed).

### Step 3: Coefficient Calculation

For each row (Артикул + Кластер):

```
Коэффициент = Остатки / Продажи за 30 дней
```

**Interpretation:**

- `< 1` → продажи быстрее остатков → нужна поставка
- `≈ 1` → баланс
- `> 1` → товар лежит дольше → медленный кластер

### Step 4: Supply Recommendation Logic

For each SKU + Cluster combination:

**RULE 1: Exclude if paid storage**

```
IF Артикул IN paid_storage_list:
  Рекомендация = 0
  Примечание = "🛑 Платное хранение"
  SKIP to next row
```

**RULE 2: Exclude if coefficient ≥ 1**

```
IF Коэффициент ≥ 1:
  Рекомендация = 0
  SKIP to next row
```

**RULE 3: Calculate supply quantity if coefficient < 1**

```
Целевой запас = Продажи за 30 дней  # месячный запас
Нужно поставить = max(0, Целевой запас − Остатки)

# Округлить вверх до кратного упаковке
IF Нужно поставить > 0:
  Рекомендация = ROUNDUP(Нужно поставить / Упаковка) × Упаковка
ELSE:
  Рекомендация = 0
```

**Example:**

- SKU: `DE201` (паста одноштучная, упаковка = 72)
- Остатки: 50
- Продажи: 120

→ Целевой запас = 120
→ Нужно поставить = 120 − 50 = 70
→ Округляем до 72 → **Рекомендация: 72**

**Output format:**

- `Рекомендация = 72` (just the number, no text)
- For exclusions: `Рекомендация = 0` (if paid storage or slow cluster)

### Step 5: Deficit Warning Flag

**CRITICAL AUTO-CHECK:**

For EVERY row where:

```
Остатки < 5  AND  Коэффициент < 0.2
```

→ Add warning flag:

```
Флаг дефицита = "⚠️ Возможен дефицит — проверь вручную"
```

**Reason:** Low stock + very low coefficient suggests the product was out
of stock during the 30-day period → actual sales potential may be higher
→ manual review needed.

If no deficit warning applies:

```
Флаг дефицита = ""
```

### Step 6: Generate Output Excel

Create Excel file with these columns (Russian headers):

| Регион | SKU | Остаток | Продажи | Остатки (коэфф.) | Поставка | Примечание |
|---|---|---|---|---|---|---|
| Екатеринбург | DE202 | 150 | 100 | 1.50 | 0 | 🛑 Платное хранение |
| **ЕКАТЕРИНБУРГ** | | | **100** | **1.50** | **0** | |
| Казань | DE210 AA | 20 | 80 | 0.25 | 72 | |
| **КАЗАНЬ** | | | **80** | **0.25** | **72** | |
| Краснодар | DE117 | 200 | 50 | 4.00 | 0 | 🛑 Платное хранение |
| **КРАСНОДАР** | | | **50** | **4.00** | **0** | |
| Москва | DE101 | 100 | 300 | 0.33 | 288 | |
| Москва | DE201 | 50 | 120 | 0.42 | 72 | |
| Москва | DE206 | 40 | 80 | 0.50 | 72 | |
| **МОСКВА** | | | **500** | **0.38** | **432** | |
| Новосибирск | DE119 AA | 50 | 100 | 0.50 | 144 | |
| **НОВОСИБИРСК** | | | **100** | **0.50** | **144** | |
| Ростов-на-Дону | DE105 | 500 | 200 | 2.50 | 0 | |
| **РОСТОВ-НА-ДОНУ** | | | **200** | **2.50** | **0** | |
| Санкт-Петербург | DE201 | 80 | 100 | 0.80 | 72 | |
| Санкт-Петербург | DE206 | 3 | 80 | 0.04 | 144 | ⚠️ Возможен дефицит — проверь вручную |
| **САНКТ-ПЕТЕРБУРГ** | | | **180** | **0.42** | **216** | |

Note: Column F (Поставка) is always bold.

**Column mapping (internal → display):**

- Кластер → Регион
- Артикул → SKU
- Остатки → Остаток
- Продажи → Продажи
- Коэффициент → Остатки (coefficient column)
- Рекомендация → Поставка (entire column in bold)
- Флаг дефицита → Примечание

**Column F (Поставка):** Entire column should be bold (both data rows and summary rows).

**Примечание column values:**

- `"⚠️ Возможен дефицит — проверь вручную"` (when stock < 5 AND coefficient < 0.2)
- `"🛑 Платное хранение"` (when SKU is on paid storage list)
- Empty (for normal cases)

**CRITICAL:** Insert bold summary row after each cluster group.

**Summary row format:**

- Column A (Регион): `CLUSTER_NAME` (in caps, bold)
- Column D (Продажи): `[total_sales]` (bold, number only)
- Column E (Остатки): `[weighted_avg_coefficient]` (bold, number only, rounded to 2 decimals)
  - Formula: `Σ(Коэфф × Продажи) / Σ(Продажи)` — weighted average
    accounting for sales volume of each SKU
- Column F (Поставка): `[total_supply]` (bold, sum of all recommendations for this cluster)
- All other columns: empty

**Sort order:**

1. By Cluster (alphabetical)
2. Within cluster: by SKU (alphabetical)
3. Bold summary row after last SKU in each cluster

**File naming:**

```
Ozon_FBO_План_Поставки_[YYYY-MM-DD].xlsx
```

## Edge Cases & Error Handling

**1. Missing sales data (Продажи = 0 or empty):**

```
IF Продажи == 0 or NULL:
  Коэффициент = "—"
  Рекомендация = 0
  Флаг дефицита = "⚠️ Нет данных о продажах"
```

**2. Unknown SKU format:**

```
IF SKU does not match DE1## or DE2## pattern:
  Flag as "⚠️ Неизвестный формат SKU — укажи упаковку вручную"
  Ask user: "Для SKU [X] не найдена упаковка. Это паста или щётка? Сколько штук в коробке?"
```

**3. Negative stock or sales:**

```
IF Остатки < 0 or Продажи < 0:
  Flag row as "⚠️ Проверь данные — отрицательные значения"
```

**4. Paid storage file not provided:**

- Proceed without exclusions
- Note at the top of the output file:
  `"⚠️ Файл с платным размещением не предоставлен — проверь вручную перед поставкой"`

## Communication Rules

**After processing:**

If file validation fails → show error message + stop (as per Step 1).

If processing succeeds:

```
✅ Расчёт завершён.

Обработано: [X] строк
Рекомендовано к поставке: [Y] SKU × кластер
Исключено (медленные/платные): [Z] SKU × кластер
Предупреждений о дефиците: [N]

Файл готов: [filename].xlsx
```

No long explanations — just link the file and summary stats.

If deficit warnings exist:

```
⚠️ Обнаружено [N] позиций с возможным дефицитом — проверь вручную перед финальным решением.
```

## Examples

### Example 1: Standard workflow

User uploads:

- `ozon_report_2026-04-10.xlsx` (columns: Артикул, Кластер, Остатки, Продажи)
- `paid_storage.xlsx` (columns: Артикул)

Claude processes:

1. Validates both files → ✅
2. Detects packaging for all SKUs
3. Calculates coefficients
4. Generates recommendations
5. Outputs: `Ozon_FBO_План_Поставки_2026-04-10.xlsx`

Output message:

```
✅ Расчёт завершён.

Обработано: 120 строк
Рекомендовано к поставке: 45 SKU × кластер
Исключено (медленные/платные): 75 SKU × кластер
Предупреждений о дефиците: 3

⚠️ Обнаружено 3 позиций с возможным дефицитом — проверь вручную.

Файл готов: Ozon_FBO_План_Поставки_2026-04-10.xlsx
```

### Example 2: Missing column error

User uploads:

- File with columns: `SKU`, `Region`, `Stock` (missing Продажи)

Claude response:

```
❌ Файл не подходит.

Ожидаемые колонки:
- Артикул / SKU ✅
- Кластер / Cluster (найдено: Region) ✅
- Остатки / Stock ✅
- Продажи за 30 дней / Sales ❌ ОТСУТСТВУЕТ

Проверь, что это отчёт "Продажи со склада / Управление остатками" из Ozon Seller → Аналитика → Отчёты.
```

### Example 3: Unknown SKU format

User uploads file with SKU `XYZ-500`

Claude response during processing:

```
⚠️ Для SKU "XYZ-500" не найдена упаковка.

Это паста или щётка? Сколько штук в коробке?
```

User replies: «Это паста одноштучная, 72 шт»

Claude: `✅ Принято. Продолжаю расчёт...`

## Critical Reminders

1. **NEVER** skip file validation — always check columns before processing
2. **ALWAYS** apply deficit warning logic — it's automatic, no user input needed
3. **ALWAYS** round UP to nearest packaging multiple — never down
4. **Paid storage takes precedence** — even if coefficient < 1, if SKU is
   in paid list → exclude
5. **Coefficient ≥ 1 = exclude** — no exceptions
6. **Default period = 30 days** — unless user explicitly requests different timeframe
7. **Sort output** by recommendation type first (supply needed → excluded),
   then by cluster + SKU

## Response Language

- File uploaded in Russian context → respond in Russian
- File uploaded in English context → respond in English
- Mixed → follow user's last message language
