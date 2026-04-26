# SHIPMENT TIMELINE TEMPLATE — Das Experten Operational Tracker

> **Обязательный трекер прогресса для каждого Das Experten шипмента.** Создаётся на старте нового шипмента и обновляется по мере прохождения этапов. Это mandatory-артефакт — ни один шипмент не начинается без Timeline.

> **Правило использования:** при любом новом шипменте → logist генерирует Timeline по этому шаблону → сохраняет его (в чате или как отдельный файл) → обновляет статусы после каждой операционной новости (письмо Эллен, ответ Inter-Freight, платёж и т.д.).

---

## 🎯 ЗАЧЕМ НУЖЕН TIMELINE

1. **Предотвращает провалы памяти.** Шипмент длится 30-45 дней, за это время накапливаются десятки писем. Без живого трекера — теряются детали.
2. **Делает риски видимыми.** Когда документы маппятся на этапы, сразу видно: "ДС должны быть готовы до Step 5 — осталось 8 дней".
3. **Позволяет передать работу.** Мери, Aram или брокер открывают Timeline — и сразу понимают, на каком этапе груз, что сделано, что осталось.
4. **Исторический аудит.** Когда шипмент завершён — Timeline остаётся как запись, что и когда происходило.

---

## 📋 MANDATORY TRIGGER

Timeline создаётся ВСЕГДА при следующих сценариях:

| Триггер | Действие |
|---|---|
| Новый шипмент (любая схема A/B/C из DOCUMENT_CHECKLIST_reference.md) | Создать Timeline до генерации любого документа |
| Запрос пользователя: "покажи статус шипмента / где груз / что по TR....." | Если Timeline не существует — создать по текущим данным; если существует — открыть и обновить |
| Любая операционная новость (письмо, платёж, подтверждение) | Обновить соответствующий чекпоинт в существующем Timeline |

**Если logist начинает работу с шипментом и не видит существующего Timeline** — первое действие — создать его по данным из контекста. Никакой другой документ не генерируется до этого шага.

---

## 🛣️ ШАБЛОН TIMELINE

### Header-блок

```
=== SHIPMENT TIMELINE ===

Shipment ref: [booking # форвардера, напр. TR5093]
Invoice ref: [invoice фабрики, напр. HA26225]
Schema: [A — Pastes Honghui→DEE / B — Brushes Jinxia→DEI→DEE / C — International via DEI]
Route: [Origin → [Transit points] → Destination]
Transport: [авто / ж/д / море / авиа / мультимодал]
Incoterms: [EXW / FOB / CIF / CPT / DAP]
Estimated pickup date: [DD.MM.YYYY]
Estimated arrival date: [DD.MM.YYYY]
Cargo: [Total qty pcs / CTN count / Gross kg / CBM]
Goods: [краткое описание — e.g. "4 SKU зубной пасты"]
Coordinator: [кто ведёт — Aram / Мери]
```

### Parties-блок

```
=== PARTIES ===

Seller: [Legal name + entity slug для contacts gate]
Buyer: [Legal name + entity slug]
Forwarder: [Company + operator name + channel]
Customs broker: [Name + company]
Insurer: [Company]
```

### Timeline-таблица (основная)

| # | Checkpoint | ETA | Actual | Status | Docs required | Responsible |
|---|---|---|---|---|---|---|
| 1 | Booking placed with forwarder | — | [DD.MM.YYYY] | 🟢 Done | Booking confirmation | Forwarder |
| 2 | Payment to supplier | — | [DD.MM.YYYY] | 🟢 Done | Payment order, proforma | DEE / DEI |
| 3 | Factory QC completed | [DD.MM.YYYY] | [DD.MM.YYYY] | 🟢 Done | — | Factory |
| 4 | Cargo insured | [DD.MM.YYYY] | [DD.MM.YYYY] | 🟢 Done | Insurance policy | Forwarder |
| 5 | Pickup from factory | [DD.MM.YYYY] | [DD.MM.YYYY] | 🟢 Done | CMR/BoL, CI, PL | Carrier + Factory |
| 6 | In transit (origin country) | [DD.MM.YYYY — DD.MM.YYYY] | — | 🟡 In progress | — | Carrier |
| 7 | Border crossing / export declaration | [DD.MM.YYYY] | — | ⏳ Upcoming | Export declaration, CMR | Border agent |
| 8 | Transit through intermediate countries | [DD.MM.YYYY — DD.MM.YYYY] | — | ⏳ Upcoming | — | Carrier |
| 9 | Destination country customs clearance | [DD.MM.YYYY] | — | ⏳ Upcoming | CI, PL, IS, CO, DoC, MSDS, Export decl., Insurance, CMR | Customs broker |
| 10 | Delivery to warehouse | [DD.MM.YYYY] | — | ⏳ Upcoming | Delivery receipt | Carrier |
| 11 | Unloading & inventory check | [DD.MM.YYYY] | — | ⏳ Upcoming | Warehouse report | Warehouse team |
| 12 | Payment reconciliation (if balance due) | [DD.MM.YYYY] | — | ⏳ Upcoming | Final invoice | Accounting |

### Status-легенда

| Статус | Значение |
|---|---|
| 🟢 Done | Этап завершён, документы получены |
| 🟡 In progress | Этап в работе, идёт сейчас |
| ⏳ Upcoming | Этап впереди, ещё не начался |
| 🔴 Blocked | Этап заблокирован (нужно срочное действие) |
| ⚠️ Risk | Этап под риском (возможная задержка, неясность) |

### Document status-блок

Маппинг документов из DOCUMENT_CHECKLIST_reference.md — каждый документ со статусом:

```
=== DOCUMENT PACKAGE STATUS ===

[Scheme A / B / C] — [N of N] documents ready

1. [Doc name] — [🟢 Received / 🟡 In progress / ⏳ Not yet / 🔴 Missing] — [Source: who sends]
2. [Doc name] — [status] — [Source]
...
```

### Open tasks / Risks / Action items

```
=== OPEN TASKS ===

• [Task description] — Owner: [name] — Due: [date] — Priority: [🔴 Critical / 🟡 Important / 🟢 Normal]
• [Task description] — ...

=== RISKS ===

⚠️ [Risk description]
   → Mitigation: [planned action]
   → Escalation: [when to alert who]

=== RECENT ACTIVITY LOG ===

[DD.MM.YYYY HH:MM] — [Event description] — [Source: email/call/system]
[DD.MM.YYYY HH:MM] — ...
```

---

## 🎨 VISUAL RENDERING RULE

Когда logist показывает Timeline пользователю в чате — **предпочтительный формат: визуальный чекпоинт-трекер через `visualize` tool** (SVG-диаграмма с цветовыми кружками, checkpoint-карточками и блоком open tasks внизу).

**Обязательные элементы визуального трекера:**
1. Заголовок с shipment ref, маршрут, ключевые параметры (вес, объём)
2. Колонка из N чекпоинтов с цветовыми индикаторами (🟢🟡⏳🔴⚠️)
3. Для каждого чекпоинта — заголовок + краткое описание (5-10 слов) + дата
4. Блок "Open tasks" в конце — красный, со списком срочных действий

**Fallback:** если визуальный формат недоступен (или пользователь попросил текстовый вывод) — рендерить Timeline как markdown-таблицу.

---

## 📊 ПОЛНЫЕ ПРИМЕРЫ ЭТАПОВ ПО СХЕМАМ

### Scheme A — Pastes Honghui → DEE (авто, через Маньчжурию)

Типовой маршрут занимает 30-35 дней. Этапы:

| # | Checkpoint | Типичный день от пикапа | Документы на этом этапе |
|---|---|---|---|
| 1 | Booking placed | -14 / -7 | Booking confirmation |
| 2 | Proforma + payment | -14 / -7 | Proforma, заявление на перевод ВТБ (УНК 24080104) |
| 3 | Factory QC | -3 / -1 | Photo sample |
| 4 | Cargo insured | -1 | Страховой полис |
| 5 | Pickup (Guangzhou) | День 0 | CMR, инвойс фабрики, PL |
| 6 | In transit China | День 1-10 | — |
| 7 | Border crossing (Маньчжурия) | День 10-14 | Экспортная декларация Китая ✅ |
| 8 | Transit Russia | День 14-25 | — |
| 9 | RU customs clearance | День 25-28 | Пакет брокеру: CI + PL + IS + CO + ДС + MSDS + Exp. decl. + Insurance + CMR |
| 10 | Delivery (Люберцы) | День 28-32 | Delivery receipt |
| 11 | Unloading | День 32-33 | Warehouse report |
| 12 | Reconciliation | День 33-35 | Balance invoice |

### Scheme B — Brushes Jinxia → DEI → DEE

Аналогичная шкала, но с дополнительным leg'ом по документам (Jinxia→DEI CI + DEI→DEE CI параллельно). В Timeline — те же 12 чекпоинтов, но на чекпоинте 9 "RU customs clearance" документы идут по пакету IS Variant 1 (трёхсторонний).

### Scheme C — International via DEI

Маршрут сильно варьируется от назначения (EU, UAE, VN, USA). Структура Timeline та же (12 чекпоинтов), но этап 9 становится "destination country customs clearance" с сертификацией по местному регламенту (CPNP, FDA, MOH и т.д.).

---

## 🔄 ОБНОВЛЕНИЕ TIMELINE

Timeline — живой документ. Каждое обновление:

1. **Изменить статус чекпоинта** (⏳ → 🟡 → 🟢 или ⏳ → 🔴 если заблокирован).
2. **Добавить запись в Recent Activity Log** с датой, временем, описанием и источником.
3. **Обновить Open Tasks** — снять выполненные, добавить новые.
4. **Перерендерить визуальный трекер** если изменения существенные.

---

## ✅ ПРАВИЛО ЗАВЕРШЕНИЯ

Шипмент считается закрытым когда:
- Все 12 чекпоинтов в статусе 🟢 Done
- Document package status — 100%
- Open Tasks пуст
- Final reconciliation выполнен

После закрытия — Timeline архивируется (хранится для аудита, но не показывается по умолчанию).

---

**Last updated:** 21.04.2026
**Owner:** Aram Badalyan, General Manager
**Mandatory:** YES — for every Das Experten shipment without exception
