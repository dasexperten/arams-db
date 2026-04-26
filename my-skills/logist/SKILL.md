---
name: logist
description: Das Experten Logistics Command Center — warehouse management, shipment preparation, freight forwarding automation
---

# LOGIST — Das Experten Logistics Command Center

## ⛔ ЖЕЛЕЗНОЕ ПРАВИЛО — НИКАКОЙ ВЫДУМКИ

> Claude генерирует документы **ТОЛЬКО на основе данных, которые у него есть** — из этого skill, invoicer, legalizer, Drive, или сообщений пользователя.
> 
> Claude **НИКОГДА не выдумывает, не предполагает, не заполняет пропуски** по собственному усмотрению:
> - Никаких реквизитов "на глаз"
> - Никаких сумм, весов, количеств без источника
> - Никаких дат, номеров документов, контрактов без подтверждения
> - Никаких банковских данных, ИНН, SWIFT, счетов без явного источника
>
> Если данных нет — Claude **останавливается и запрашивает** конкретно недостающий параметр. Никогда не продолжает с пустыми или выдуманными полями.

---

## 🎯 SELLER ROUTING — ПРАВИЛО МАРШРУТИЗАЦИИ ПРОДАВЦА

> **Это первое решение на любом новом шипменте.** До генерации любых документов logist определяет схему по двум осям: (1) категория товара (паста / щётка), (2) рынок назначения (RU/CIS / международка).

| Товар | Рынок | Продавец | Покупатель | Контракт | IS Variant |
|---|---|---|---|---|---|
| **Пасты** (Honghui) | RU/CIS | **Guangzhou Honghui** | DEE напрямую | № 080824 от 09.04.2024 (УНК 24080104/1927/0006/2/1) | **Variant 2** |
| **Щётки/флоссы** (Jinxia) | RU/CIS | **DEI (UAE)** | DEE через перепродажу | № MF01-DEA/YZ от 01.01.2025 (УНК 25010525/1000/0081/2/1) + DEI→DEE № 06062022 (УНК 22110206/1927/0006/2/1) | **Variant 1** |
| **Пасты или щётки** | Международка (не-СНГ) | **DEI (UAE)** | Международный покупатель | DE-0125 от 28.12.2025 + Суппл. №1 от 15.01.2026 (до 31.12.2028) | По согласованию с покупателем |

**HARD RULES:**
- Не путать продавца и физического отправителя. Для пасты RU/CIS физический отправитель и продавец совпадают (Honghui). Для щёток RU/CIS физический отправитель Jinxia, но продавец DEI (трёхсторонняя структура в Variant 1 IS).
- Не использовать схему DEI для пастового шипмента в RU/CIS. Контракт DE-0125 для этого не задействуется — пасты идут напрямую Honghui→DEE.
- Не использовать схему Honghui→DEE для международных рынков. Honghui не имеет контракта с дистрибьюторами вне CIS — продавцом всегда выступает DEI.
- Полная матрица документов на каждую схему — в `references/DOCUMENT_CHECKLIST_reference.md` (Scheme A / B / C).

---

## ⏱️ MANDATORY SHIPMENT TIMELINE

> **Никакой шипмент не начинается без Timeline.** Это первый артефакт, который logist создаёт при любой работе с грузом — до генерации документов, до писем, до чего бы то ни было.

**Mandatory triggers:**

| Триггер | Действие |
|---|---|
| Новый шипмент (любая схема A/B/C) | Создать Timeline ДО любых документов |
| Запрос пользователя: "статус шипмента / где груз / что по [ref]" | Если Timeline не существует — создать по контексту; если существует — открыть и обновить |
| Любая операционная новость (письмо, платёж, подтверждение) | Обновить соответствующий чекпоинт в существующем Timeline |

**Полный шаблон, статусы, процедура обновления и правило визуального рендеринга** — в `references/SHIPMENT_TIMELINE_TEMPLATE.md`.

**Обязательный формат рендеринга в чате:** SVG-чекпоинт-трекер через `visualize` tool (12 чекпоинтов с цветовыми индикаторами + блок Open Tasks внизу). Markdown-таблица — только fallback при технической невозможности SVG.

---

## MANDATORY CROSS-REFERENCE RULE

> ⚠️ **ЕСЛИ В LOGIST SKILL НЕТ НУЖНЫХ ДАННЫХ — ВСЕГДА СМОТРЕТЬ В ПЕРВУЮ ОЧЕРЕДЬ:**

| Тип данных | Где искать |
|---|---|
| **Цены для коммерческих инвойсов (CI)** | **pricer** skill → Price Gate (PL-INT_USD / PL-DISTR_RF) |
| **Закупочные цены для таможенных IS-документов** | **pricer** skill → Price Gate (PL-PRCH_CNY) |
| **Банковские реквизиты DEE, DEI, DEASEAN, DEC** | **contacts** skill → `contacts?entity=<slug>` (das-group/) |
| **Реквизиты покупателей / дистрибьюторов** | **contacts** skill → `contacts?entity=<slug>` (buyers/) |
| **Реквизиты поставщиков (`guangzhou-honghui`, `yangzhou-jinxia`, `meizhiyuan`, `wdaa`)** | **contacts** skill → `contacts?entity=<slug>` (manufacturers/). ⚠️ Для банковских полей Honghui и Jinxia — обязательно `&payer=<our-entity-slug>` (Route A = DEE/RU-CIS; Route B = DEI/DEASEAN/DEC). |
| **Реквизиты логистических подрядчиков (Inter-Freight и др.)** | **contacts** skill → `contacts?entity=<slug>` (logistics/) |
| Юридические реквизиты DEE в правовом контексте (для контрактов, annexes) | **legalizer** skill (работает через contacts, но добавляет правовую обёртку) |
| Сертификаты СГР, декларации соответствия (ДС), MSDS — статус и валидность по SKU | **legalizer** skill → `[[GATE: legalizer?section=certifications&sku=<SKU>]]` (см. CERTIFICATIONS GATE раздел). Возвращает status / certificate # / expiry / blocking flag. |
| Условия контрактов с покупателями (тело договора, annexes) | **legalizer** skill → Google Drive папка agreements |
| Документы по оплате (заявления на перевод ВТБ) | **legalizer** skill → раздел "Документы по оплате за товар" |
| УНК / ВБК по контрактам DEE | **legalizer** skill → раздел "УНК / Ведомость банковского контроля" |
| ВЭД контракт DEI→DEE, допсоглашения, DE-0125 | **legalizer** skill → Google Drive папка agreements (ID: `1izCzMpgaRU2BcQLqnbj7aIOZ_FeVRY_b`) |
| Характеристики продуктов, SKU, состав | **product-skill** skill |

**ПРАВИЛО:** Logist НЕ дублирует данные других skills.
- Реквизиты любого контрагента (наши entities, buyers, manufacturers, logistics) → **contacts**
- Цены → **pricer**
- Правовая обёртка, клаузы, контракты → **legalizer**
- Продуктовые характеристики → **product-skill**

Обращайся в соответствующий skill **автоматически**, без запроса у пользователя.

---

## 👥 LOGISTICS COORDINATOR — DEE OPERATIONS

> Операционную логистику DEE (отгрузки, переписка с форвардером, координация таможенного оформления) ведёт **Мери Ахвердян**. Aram (General Manager) утверждает решения, Мери исполняет.

**Реквизиты:**
- Имя: Мери Ахвердян (Mery Hakhverdyan)
- Email: merydasexperten@mail.ru
- Телефон: +374 94-88-34-94
- Подпись в письмах: "Мери Ахвердян, ООО Дас Экспертен"
- Язык переписки по умолчанию: русский

**Зона ответственности:**
- Прямая переписка с Inter-Freight, Inter-Vostok и другими форвардерами
- Координация забора груза с фабрик (Honghui, Jinxia)
- Контроль транзита, реакция на инциденты в пути
- Сбор и передача документов брокеру (Денис Панченко)
- Подтверждение приёмки на складе

**Правило копирования (CC) в исходящих письмах logist:**
- Если письмо от Aram → форвардер/брокер по операционке шипмента → **Мери в CC обязательно** (merydasexperten@mail.ru)
- Если письмо от Мери (она сама использует logist) → подпись её, не Aram
- Если письмо стратегическое (контракты, переговоры с фабрикой) → подпись Aram, Мери может быть в CC по усмотрению

---

## PRICER GATE — INTER-SKILL PRICE EXCHANGE

Logist вызывает pricer в двух случаях:

| Ситуация | Какой прайс-лист | Валюта |
|---|---|---|
| Расчёт инвойсной стоимости для коммерческого инвойса (CI) | `PL-INT_USD` или `PL-DISTR_RF` — в зависимости от продавца и покупателя | USD или RUB |
| Расчёт таможенной стоимости для Invoice-Specification (IS) | `PL-PRCH_CNY` | CNY |

**Как вызвать pricer:**

1. Вызови `pricer` skill
2. Следуй его инструкциям: определи продавца, покупателя, нужный прайс-лист
3. Получи цены → вставь в документ → продолжи logist workflow

После получения цен:
> "↩️ Pricer complete — resuming Logist workflow."

---

## 💴 BANKING ROUTING — DEE → CHINA PAYMENTS

> **Любой платёж от DEE на китайскую фабрику (Honghui по № 080824 или Jinxia по № MF01-DEA/YZ) идёт ТОЛЬКО с юаневого счёта DEE.** Использование рублёвого счёта для международных платежей — критическая ошибка (приведёт к отказу платежа банком-корреспондентом).

**Юаневый счёт DEE:**
- Текущий счёт (CNY/USD): **40702156600340000037**
- Банк: ВТБ (ПАО)
- БИК: 044525411
- SWIFT: VTBRRUM2MS2
- Корр. счёт: 30101810145250000411

**Рублёвый счёт DEE (для расчётов внутри РФ — НЕ использовать для Китая):**
- Расчётный счёт: 40702810024370000534

**Маршрут банковский:**
- DEE → Honghui (контракт № 080824) → Route A — VTB Shanghai (санкционный, только RU/CIS → Китай)
- DEE → Jinxia (контракт № MF01-DEA/YZ) → Route A — VTB Shanghai
- DEI → Honghui или DEI → Jinxia → Route B (международный, ICBC или другой)

**УНК для валютного контроля ВТБ:**
- Контракт DEE ↔ Honghui № 080824 → УНК **24080104/1927/0006/2/1** (до 31.12.2027)
- Контракт DEE ↔ Jinxia № MF01-DEA/YZ → УНК **25010525/1000/0081/2/1** (до 31.12.2029)
- Контракт DEE ↔ DEI № 06062022 → УНК **22110206/1927/0006/2/1** (до 31.12.2028)

**При вызове contacts gate** для банковских реквизитов фабрик ВСЕГДА передавать `&payer=<our-entity-slug>`:
- `payer=dee` → contacts вернёт Route A (VTB Shanghai)
- `payer=dei` / `payer=deasean` / `payer=dec` → contacts вернёт Route B (международный)

Без `payer` contacts вернёт `ROUTE_REQUIRED` hard stop.

---

## CONTACTS GATE — INTER-SKILL COUNTERPARTY DATA EXCHANGE

Logist вызывает `contacts` каждый раз, когда готовит документ с реквизитами любого контрагента. Это касается:

- HBL / MBL (shipper, consignee, notify party)
- Инвойсы-спецификации (IS) — реквизиты отправителя/получателя
- Упаковочные листы — юридическое имя отправителя
- Инструкции форвардеру — реквизиты нашей entity + реквизиты завода
- Заявления на перевод — реквизиты получателя платежа (manufacturer)

### Инвокация

```
[[GATE: contacts?entity=<slug>&fields=<fields>&purpose=logist-<task>]]
```

**Канонические slugs производителей:** `guangzhou-honghui`, `yangzhou-jinxia`, `meizhiyuan`, `wdaa`. Устаревшие формы (`honghui`, `jinxia`, `wda`) — НЕ использовать.

**Примеры:**

```
# HBL — нужны shipper и consignee
[[GATE: contacts?entity=yangzhou-jinxia&fields=legal-name-full,operating-address&purpose=logist-hbl-shipper]]
[[GATE: contacts?entity=dee&fields=legal-name-full,registered-address,tax-id&purpose=logist-hbl-consignee]]

# Заявление на перевод ВТБ (DEE → Honghui, Route A)
[[GATE: contacts?entity=guangzhou-honghui&fields=legal-name-full,bank-name,iban,swift,bank-address&payer=dee&purpose=logist-payment-instruction]]

# Заявление на перевод (DEI → Jinxia, Route B / ICBC)
[[GATE: contacts?entity=yangzhou-jinxia&fields=legal-name-full,bank-name,iban,swift,bank-address&payer=dei&purpose=logist-payment-instruction]]

# Freight forwarder instructions
[[GATE: contacts?entity=inter-freight&fields=contacts,operating-address&purpose=logist-forwarder-instruction]]
```

### ⚠️ DUAL-ROUTE BANKING — обязательный параметр `payer`

Для dual-route производителей (`guangzhou-honghui`, `yangzhou-jinxia`) при запросе банковских полей ОБЯЗАТЕЛЬНО передавать `&payer=<our-entity-slug>`:

- `payer=dee` → Route A (VTB Shanghai — только RU/CIS, санкционный маршрут)
- `payer=dei` | `payer=deasean` | `payer=dec` → Route B (международный)

Без `payer` contacts вернёт `ROUTE_REQUIRED` hard stop. Неправильный маршрут = банк-корреспондент отклонит перевод.

### HARD STOP правила

Поля, при отсутствии которых — остановка:
- `legal-name-full` (отправитель, получатель)
- `iban`, `swift`, `bank-name` (для платёжных инструкций)
- `operating-address` (для shipper в HBL — критично для таможни)

Если поле не найдено:
```
⛔ CONTACTS HARD STOP — cannot complete [task].
Entity: [slug]
Missing: [fields]
Required action: provide missing data for contacts/ update.
```

На ответ `ROUTE_REQUIRED` (dual-route banking без payer):
```
⛔ CONTACTS ROUTE_REQUIRED — cannot complete [task].
Entity: [slug] имеет два банковских маршрута (A = RU/CIS via VTB; B = International).
Required action: уточнить у Aram, какое наше юрлицо платит (DEE / DEI / DEASEAN / DEC), чтобы выбрать правильный маршрут.
```
Ждать уточнения payer до повторного вызова.

### Железное правило

Logist уже работает под строгим правилом "НИКАКОЙ ВЫДУМКИ" (см. начало SKILL.md). CONTACTS GATE — техническая реализация этого правила: вся counterparty data идёт только из contacts/, нигде иначе. Ни из памяти, ни из "похожих прошлых отгрузок", ни из переписки выше в чате.

После завершения запроса к contacts:

> "↩️ Contacts complete — resuming Logist workflow."

---

## CERTIFICATIONS GATE — INTER-SKILL CERTIFICATION CHECK

Logist вызывает `legalizer` через certifications gate **на Step 0 каждого нового шипмента** — для каждого SKU в грузе. Без этой проверки ни один документ не генерируется и Timeline не формируется.

### Инвокация

```
[[GATE: legalizer?section=certifications&sku=<SKU>&market=<ru-cis|international>&purpose=shipment-<ref>]]
```

**Примеры:**
```
# Проверка одного SKU перед стартом шипмента TR5093
[[GATE: legalizer?section=certifications&sku=DE206&market=ru-cis&purpose=shipment-tr5093]]

# Batch-проверка всех SKU в грузе HA26225
[[GATE: legalizer?section=certifications&sku=DE203&market=ru-cis&purpose=shipment-ha26225]]
[[GATE: legalizer?section=certifications&sku=DE205&market=ru-cis&purpose=shipment-ha26225]]
[[GATE: legalizer?section=certifications&sku=DE202&market=ru-cis&purpose=shipment-ha26225]]
[[GATE: legalizer?section=certifications&sku=DE206&market=ru-cis&purpose=shipment-ha26225]]
```

### Обработка ответа

Legalizer возвращает блок с `Blocking flag`:

| Flag | Значение | Действие logist |
|---|---|---|
| `NONE` | ACTIVE — документ валиден | Продолжать |
| `HOLD` | EXPIRING / PENDING / TO VERIFY | Продолжать с предупреждением — добавить риск в Timeline (раздел Risks), флагнуть в Open Tasks |
| `BLOCK` | EXPIRED / ARCHIVED / NOT_IN_REGISTRY | **Halt logist workflow.** Вывести: `⛔ CERTIFICATIONS GATE: SHIPMENT BLOCKED — SKU [code] не имеет валидной сертификации для [market]. Шипмент не может стартовать до разрешения. Required action: [конкретный шаг].` Ждать подтверждения пользователя. |

### Mandatory checkpoint

CERTIFICATIONS GATE — это **обязательный gate перед SELLER ROUTING и MANDATORY SHIPMENT TIMELINE**. Логика:

1. Получаем SKU list из контекста шипмента
2. Для каждого SKU → CERTIFICATIONS GATE
3. Собираем результаты в матрицу `SKU × Status`
4. Если есть BLOCK → halt, request action from user
5. Если все NONE/HOLD → переходим к SELLER ROUTING и Timeline

После завершения проверки:

> "↩️ Certifications check complete — resuming Logist workflow."

---

## Overview
Core logistics operations skill for Das Experten multi-entity operations. Manages warehouse inventory, shipment documentation, freight forwarding integration, and compliance verification.

---

## УЧЁТНЫЕ ЦЕНЫ ПОСТАВЩИКОВ

> Цены хранятся в **pricer** skill — единственный источник истины.
> Logist не держит цены локально. При любом запросе цены — вызывать Pricer Gate (см. раздел выше).
>
> Нужна закупочная цена в CNY → `PL-PRCH_CNY`
> Нужна закупочная цена в USD → `PL-PRCH_USD`

---

## ДОКУМЕНТЫ СО СТОРОНЫ ЗАВОДА (FACTORY-SIDE DOCUMENTS)

Следующие документы **предоставляет завод** — запрашиваются у Эллен Вэй (GZH/Honghui) или Lois Guan (YZH/Jinxia) при каждой отгрузке:

| Документ | Кто выдаёт | Когда запрашивать | Когда физически появляется |
|---|---|---|---|
| Commercial Invoice (фабричный) | Завод | После подтверждения отгрузки | За 1-3 дня до пикапа |
| Packing List (фабричный) | Завод | После подтверждения отгрузки | За 1-3 дня до пикапа |
| Certificate of Origin (CCPIT) | Завод через CCPIT | После пикапа | Через 5-10 дней после пикапа |
| MSDS / Safety Data Sheet | Завод (для пасты) | По запросу | Один раз на каждый SKU, актуализируется при изменении формулы |
| Экспортная декларация Китая | Китайская таможня (через агента форвардера, не через завод напрямую) | См. процедуру ниже | После пересечения границы Китая (~день 10-14 авто-маршрута) |

---

### 🇨🇳 КИТАЙСКАЯ ЭКСПОРТНАЯ ДЕКЛАРАЦИЯ — ПРОЦЕДУРА

> **Ключевое правило:** экспортную декларацию Китая выдаёт **китайская таможня в точке выхода** (граница, морской порт, аэропорт), а не завод и не Эллен/Lois напрямую. Документ оформляет **агент форвардера** (например, Manzhouli Springway для авто через Маньчжурию).

**Этапы появления документа:**

1. **Пикап с фабрики (День 0).** Декларации ещё нет. Существуют только: фабричный инвойс, PL, контракт.
2. **Транзит по Китаю (День 1-10).** Декларации ещё нет. Груз едет к точке выхода.
3. **Подача в китайскую таможню (День 10-12).** Агент форвардера подаёт декларацию от имени экспортёра. Экспортёр в декларации = фабрика (не DEI и не DEE при EXW), потому что это EXW-схема. Для подачи агент получает от фабрики: инвойс, PL, контракт с покупателем, HS-коды, экспортную лицензию (для пасты обычно не требуется).
4. **Таможенное оформление вывоза (День 12-14).** Китайская таможня проверяет, выпускает, ставит штамп. Агент получает заверенную копию декларации со штампом.
5. **Пересечение границы (День 14-15).** Груз переходит на сторону страны назначения с готовой экспортной декларацией.

**Где запрашивать копию:**

- **Не у завода.** Эллен/Lois видят документ только в копии после оформления, и не всегда.
- **У форвардера (Inter-Freight) или напрямую у его агента в точке выхода.** Например, для авто через Маньчжурию — у Manzhouli Springway (Song Jia, songjia@rueyy.com).
- Inter-Freight передаёт копию по запросу, обычно через 1-3 дня после выпуска.

**Приоритет передачи брокеру РФ:** копия экспортной декларации Китая должна быть у Дениса Панченко (брокер) **до прибытия груза на российскую границу** — иначе растаможка зависнет.

---

### 📧 ШАБЛОН ПИСЬМА ЭЛЛЕН (GZH — запрос документов для таможенного оформления)

**To:** hh0025@honghui88.com.cn (Ellen Wei)

> ⚠️ **КРИТИЧЕСКОЕ ПРАВИЛО — КОНТРАКТ В ПИСЬМЕ:**
> - Продавец = Honghui → контракт **№ 080824**
> - Продавец = DEI → контракт **№ 06062022 от 06.06.2022**
> НИКОГДА не писать контракт с заводом если продавец DEI. Контракт = контракт продавца с покупателем.

**Subject:** Documents required for upcoming shipment — Contract № [ВЫБРАТЬ ПО ПРОДАВЦУ]

```
Hi Ellen,

We are preparing the upcoming shipment and need the following documents from your side for customs clearance in Russia:

1. Export Declaration (country of origin)
2. Certificate of Origin

Please send to: eurasia@dasexperten.de

Kindly confirm receipt and advise estimated readiness.

Thank you.

Best regards,
Aram Badalyan
Das Experten Eurasia LLC
```

---

### 📧 ШАБЛОН ПИСЬМА LOIS (YZH — запрос документов для таможенного оформления)

**To:** sg2186@vip.163.com (Lois Guan)

> ⚠️ **КРИТИЧЕСКОЕ ПРАВИЛО — КОНТРАКТ В ПИСЬМЕ:**
> - Продавец = Jinxia → контракт **№ MF01-DEA/YZ**
> - Продавец = DEI → контракт **№ 06062022 от 06.06.2022**
> НИКОГДА не писать контракт с заводом если продавец DEI. Контракт = контракт продавца с покупателем.

> ⚠️ **ПРИОРИТЕТ ОПЕРАЦИЙ:** Письмо заводу пишется ПЕРВЫМ — до всех других документов. Завод отвечает дольше всего.

**Subject:** Documents required for upcoming shipment — Contract № [ВЫБРАТЬ ПО ПРОДАВЦУ]

```
Hi Lois,

We are preparing the upcoming shipment and need the following documents from your side for customs clearance in Russia:

1. Export Declaration (country of origin)
2. Certificate of Origin

Please send to: eurasia@dasexperten.de

Kindly confirm receipt and advise estimated readiness.

Thank you.

Best regards,
Aram Badalyan
Das Experten Eurasia LLC
```

---

**Триггер:** пользователь говорит "прайс-лист поставщика", "supplier price list", "прайс для брокера", "прайс Honghui", "прайс Jinxia"

---

> ⚠️ **КРИТИЧЕСКОЕ ПРАВИЛО — КТО УКАЗЫВАЕТСЯ В ПРАЙС-ЛИСТЕ:**
>
> **Поставщик (продавец) ≠ Завод (производитель)**
>
> | Продавец | Что писать в шапке | Производитель (отдельной строкой) |
> |---|---|---|
> | DEI (Das Experten International LLC) | **DAS EXPERTEN INTERNATIONAL LLC, UAE, Sharjah Media City Freezone** | Указать завод отдельной строкой курсивом |
> | Honghui напрямую | GUANGZHOU HONGHUI DAILY TECHNOLOGY COMPANY LIMITED | — |
> | Jinxia напрямую | YANGZHOU JINXIA PLASTIC PRODUCTS AND RUBBER CO., LTD. | — |
>
> **Контракт в прайс-листе = контракт продавца с покупателем:**
> - Продавец DEI → **№ 06062022 от 06.06.2022**
> - Продавец Honghui → **№ 080824 от 09.04.2024**
> - Продавец Jinxia → **№ MF01-DEA/YZ от 01.01.2025**

**Правило выбора завода (производителя):**
- Пасты + ополаскиватель → завод **Guangzhou Honghui Daily Technology Company Limited**
- Щётки + флоссы + интердентальные → завод **YANGZHOU JINXIA PLASTIC PRODUCTS AND RUBBER CO., LTD.**

**Формат документа — Word (.docx), книжный A4, на русском языке:**

```
ПРАЙС-ЛИСТ ПОСТАВЩИКА

Поставщик: [DEI / Honghui / Jinxia — полное наименование ПРОДАВЦА]
Адрес: [адрес ПРОДАВЦА]
Производитель: [наименование завода — только если продавец DEI, курсивом]
Дата: [текущая дата]
Контракт: [№ контракта ПРОДАВЦА с покупателем]
Валюта: [USD если DEI / CNY если завод напрямую]

№ | Артикул | Наименование товара | Ед. изм. | Кол-во в кор. | Цена за ед.
--|---------|---------------------|----------|---------------|------------
[строки из базы — по запросу: конкретные SKU или все позиции завода без наборов]

Подпись поставщика: _______________
Дата: _______________
```

**Правила генерации:**
1. **Продавец в шапке = тот кто указан продавцом в отгрузке** — НИКОГДА не путать с заводом
2. Если продавец DEI — завод указывать отдельной строкой "Производитель:" курсивом
3. Цены брать **строго из pricer** (PL-PRCH_CNY для CNY / PL-PRCH_USD для USD) — не из invoicer FOB цен
4. **ВАЛЮТА — определяется по контракту продавца:**
   - Продавец DEI → контракт в USD → **одна колонка: Цена за ед. (USD)** — CNY не указывать вообще
   - Продавец Honghui/Jinxia напрямую → **две колонки: CNY основная + USD справочно**
5. Наименование товара: на русском языке
6. Формат: книжный A4 (.docx через docx skill)
7. Подпись: оставлять пустой (заполняет продавец/завод)
8. **Колонка "№" — достаточно широкая для двузначных чисел (минимум 600 DXA)** — номера строк никогда не должны переноситься вертикально, только горизонтально в одну строку
9. **Фиксированная высота строк** — использовать `height: { value: 400, rule: 'exact' }` чтобы строки не растягивались

**Delegates marketplace analysis to:**
- **wb-skill** — for Wildberries FBS analysis
- **ozon-skill** — for Ozon FBO analysis

---

## Trigger Words
Fire **immediately** on ANY of these exact words or close variants:
- **logist**
- **shipper**
- **логистика**
- **логист**
- **транспорт**
- **доставка**
- **склад**
- **остатки**
- **stocks**
- **warehouse**

---

## Core Functions

### 1. Warehouse Management
Track inventory across Das Experten warehouse network:
- **YZH** (Yangzhou) — brushes/floss manufacturing
- **GZH** (Guangzhou) — toothpaste manufacturing
- **LBR** (Lyubertsi) — main Russia warehouse
- **SRN** (Saransk) — long-term storage
- **FLP** (FlyPost) — Ozon fulfillment partner


### 2. Shipment Documentation
Generates complete shipment packages via **invoicer** skill:
- Commercial Invoice (English)
- Packing List (English/Russian)
- Invoice-Specification (Russian customs, Variant 1 brushes / Variant 2 pastes)

> Logist passes seller, buyer, SKU list, and quantities to **invoicer**. Invoicer handles document generation and internally routes through **legalizer** gate for compliance verification.

### 3. Freight Forwarding
Auto-fills Inter-Freight shipping applications with:
- Factory contact info (Lois Guan / Ellen Wei)
- Product specifications
- Weight/volume calculations
- HS codes
- Route selection
- Lead time estimates

**Multi-shipper RFQ rule:** For every new shipment, RFQ goes to Inter-Freight + minimum 3 alternative shippers in parallel. Never depend on a single carrier. Full shipper directory lives in `shippers/` — see lazy-load block below.

### 4. Compliance Verification
Routes to **legalizer** skill for:
- SGR (State Registration) validity
- Declaration of Conformity validity
- Export/import regulations
- Labeling requirements (GOST, Honest Sign)

---

## Marketplace Analysis Delegation

**When user mentions WB/Wildberries:**
→ Call **wb-skill** skill

**When user mentions Ozon:**
→ Call **ozon-skill** skill

---

## Inter-Skill Routing

**Always call:**
- `invoicer` — all shipment documentation (CI, PL, IS); invoicer internally calls legalizer gate
- `pricer` — all pricing data (via Price Gate)
- `das-experten-expert` — SKU translation, product specs

**Conditional calls:**
- `wb-skill` — Wildberries analysis
- `ozon-skill` — Ozon analysis

---

## WAREHOUSE DATABASE — LAZY LOAD

**Do NOT load by default.** Load `references/WAREHOUSE_reference.md` only when the user mentions:
- `warehouse`, `склад`, `FBO`, `3PL`, `fulfillment`, `фулфилмент`, `warehouse code`, `код склада`, `lead time`, `срок доставки`, `logistics flow`, `маршрут отгрузки`, `capacity`, `ёмкость склада`

When triggered, read the file and follow the warehouse routing logic inside it.
After completing, signal: `↩️ WAREHOUSE_reference loaded — resuming main workflow.`

---

## FREIGHT FORWARDER & LOGISTICS OPERATORS — LAZY LOAD

**Do NOT load by default.** Load `references/FREIGHT_FORWARDER_reference.md` only when the user mentions:
- `freight`, `forwarder`, `фрахт`, `экспедитор`, `RFQ`, `Inter-Freight`, `Интер-Фрейт`, `заявка на фрахт`, `shipment booking`, `бронирование отгрузки`, `application form`, `заявка`, `форвардер`

When triggered, read the file and follow the workflow inside it.
After completing, signal: `↩️ FREIGHT_FORWARDER_reference loaded — resuming main workflow.`

---

## SHIPPERS DIRECTORY — LAZY LOAD

**Do NOT load by default.** Load `shippers/INDEX.md` first, then individual shipper cards from `shippers/{slug}.md` only when the user mentions:
- `shipper`, `шиппер`, `логист`, `логистическая компания`, `carrier`, `перевозчик`, `quote`, `квота`, `ставка`, `RFQ`, `parallel quote`, `альтернативный логист`, `сравнить логистов`, `compare shippers`, `who else can ship`, `ещё логистам`
- A specific shipper name: `Inter-Freight`, `Интер-Фрейт`, `Trans Imperial`, `DD Logistics`, `Neptune`, `NEP`, `Avis-Trans`
- A specific contact name from any shipper card: `Алиса Журавская`, `Алина Сотвалдиева`, `Александр Драчинский`, `Денис Панченко`, `Мария Варакса`, `Бучнев`, `Даниил`, `Xyla`, `Сила`

### Workflow when triggered

1. **Open `shippers/INDEX.md`** — get the full list of active shippers and their routes.
2. **Open individual cards** (`shippers/{slug}.md`) for the relevant shippers — read identity, contacts, history, last quote.
3. **For RFQ generation** — pull pickup address from manufacturer card (via `[[GATE: contacts?entity={mfr-slug}]]`), shipper contact info from `shippers/{slug}.md`, and use unified RFQ template with shipment specs.
4. **For each contact** — note the preferred channel (Email / WhatsApp / Telegram / WeChat / Phone) from the card and adapt delivery method accordingly.
5. **After every interaction** — update the relevant shipper card with: new rate, new contact, new shipment ref, new issue/note, new `last_verified` date.

### Hard rules

- **NEVER fabricate** shipper contacts, rates, or banking. If a field is `not available`, say so and request from Aram.
- **Always use INDEX first** — never load all shipper cards at once. Filter by route/relevance, then open only those needed.
- **Adding a new shipper** — copy `_TEMPLATE.md` to `shippers/new-slug.md`, fill all available fields, add row to `INDEX.md`.
- **Multi-RFQ rule** — for any new shipment, send RFQ to Inter-Freight + at least 3 alternatives in parallel.

After completing, signal: `↩️ SHIPPERS DIRECTORY loaded — resuming main workflow.`

---

## DOCUMENT CHECKLIST — LAZY LOAD

**Do NOT load by default.** Load `references/DOCUMENT_CHECKLIST_reference.md` only when the user mentions:
- `checklist`, `document checklist`, `пакет документов`, `документы для таможни`, `таможенное оформление`, `матрица отгрузок`, `мастер-чеклист`, `Denis Panchenko`, `брокер`
- Или когда стартует новый шипмент (правило SELLER ROUTING требует определить схему A/B/C — для этого нужна матрица из этого файла)

When triggered, read the file and use the matrix to determine the correct document package for the shipment.
After completing, signal: `↩️ DOCUMENT_CHECKLIST_reference loaded — resuming main workflow.`

---

## SHIPMENT TIMELINE TEMPLATE — MANDATORY LOAD

**ALWAYS load** `references/SHIPMENT_TIMELINE_TEMPLATE.md` when:
- Новый шипмент стартует (правило MANDATORY SHIPMENT TIMELINE)
- Пользователь спрашивает статус/местонахождение груза
- Любая операционная новость требует обновления существующего Timeline
- Пользователь просит визуальный трекер или чекпоинт-карту

**Это НЕ lazy-load в обычном смысле** — Timeline-template обязателен при работе с шипментом, а не "по запросу ключевых слов". Ключевые слова `timeline`, `трекер`, `статус шипмента`, `где груз`, `чекпоинт`, `прогресс шипмента` — лишь явные триггеры, но фактическая загрузка происходит автоматически на старте любого шипмента.

When loaded, follow the rendering rule: SVG-чекпоинт-трекер через `visualize` tool.
After loading, signal: `↩️ SHIPMENT_TIMELINE_TEMPLATE loaded — resuming main workflow.`

---

**END OF SKILL**