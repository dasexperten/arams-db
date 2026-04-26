---
name: invoicer
description: "Das Experten document generation skill for commercial invoices, packing lists, and shipping documents. TRIGGER on ANY of these words or phrases (in any language): \"invoice\", \"invoicer\", \"CI\", \"commercial invoice\", \"packing list\", \"PL\", \"инвойс\", \"счёт\", \"счёт-фактура\", \"упаковочный лист\", \"упаковочный\", \"сопроводительные документы\", \"make invoice\", \"create invoice\", \"generate invoice\", \"make CI\", \"make PL\", \"make packing list\", \"выставить счёт\", \"сделать инвойс\", \"документы для отгрузки\", \"shipping docs\", \"отгрузочные документы\", or when user asks to prepare documents for a buyer/client/клиент. Fire immediately — no permission needed."
---

# INVOICER — Das Experten Commercial Documentation Engine

Generates professional **Commercial Invoices** and **Packing Lists** (.docx) for all Das Experten entities (DEI, DEE, DEASEAN, DEC). Handles EN/RU/bilingual output, multi-currency, Incoterms logic, and auto-routes through **legalizer** gate for compliance verification.

---

## MANDATORY EXECUTION RULES

**NEVER skip steps. Wait for user input after each step that requires it.**

**Core Principles:**
- ALWAYS generate actual .docx files — never templates or "fill this in yourself" instructions
- ALWAYS use correct entity bank details based on buyer jurisdiction and contract terms
- Output language: match user's message language; document defaults to English unless buyer requires Russian
- For multi-SKU invoices: always itemized line-item breakdowns with per-unit pricing
- ALWAYS include HS codes, country of origin, net/gross weight, package count in packing lists
- ALWAYS route through **legalizer** gate when buyer or terms trigger compliance flags

---

## STEP 1 — PARAMETER COLLECTION

On trigger, check which parameters are already stated in user's message or current conversation:

| Parameter | Default if not stated |
|-----------|----------------------|
| **Seller entity** | **DEI** (Das Experten International LLC) |
| **Buyer** | ASK via widget |
| **Products / quantities** | ASK or show SKU selector |
| **Invoice language** | **English** (unless buyer requires Russian) |
| **Delivery terms (Incoterms)** | **FCA Moscow** for Russia buyers; **FOB Guangzhou** for international |
| **Payment terms** | Per buyer contract (see Buyer Reference) |
| **Invoice number** | Format: `XX-MM-YY` (sequential-month-year) — ASK |
| **Contract number** | Per buyer contract — ASK if unknown |
| **Currency** | **Auto-select based on seller + buyer jurisdiction** (see Currency Logic below) |

**Currency Logic:**
- **DEE (Russia) → Russia buyer:** RUB (use Russia distributor pricing ex VAT)
- **DEE (Russia) → International buyer:** USD (use FOB Guangzhou pricing)
- **DEI (UAE) → Any buyer:** USD (use FOB Guangzhou pricing)
- **DEASEAN (Vietnam) → Any buyer:** USD (use FOB Guangzhou pricing)
- **DEC (Seychelles) → Any buyer:** USD (use FOB Guangzhou pricing)

**VAT handling (Russia only):**
- If buyer requires VAT invoice: apply 20% to RUB prices
- If buyer is export/VAT-exempt: use ex VAT prices
- Ask user: "Include VAT (20%)?" when generating DEE → Russia invoice

**Missing parameters trigger:** Show selection widget with buyer roster + product SKU list.

**If user uploads .xlsx order file:** Parse automatically and pre-fill product list.

---

## STEP 2 — LEGALIZER GATE ROUTING

**CRITICAL: Call `[[GATE: legalizer-compliance]]` BEFORE generating invoice when:**
- Buyer jurisdiction is sanctioned/restricted (Iran, DPRK, Syria, etc.)
- Buyer is филиал (branch) structure — requires correct КПП routing
- Payment terms are non-standard (deferred, consignment, barter)
- Credit note or dispute language detected in user message
- Governing law clause present in buyer PO or framework agreement
- Entity mismatch flagged (e.g., DEI selling to Russian buyer without proper structure)

**How to call legalizer-compliance:**

Pause workflow, then send this formal gate invocation:
```
[[GATE: legalizer-compliance]]
Seller: [DEE / DEI / DEASEAN / DEC]
Buyer: [full legal name + jurisdiction]
Products: [SKU list]
Terms: [INCOTERMS] | [payment terms] | [contract no if applicable]
Context: Generating Commercial Invoice
Flags: [detected risk triggers from the list above]
```

**Legalizer returns one of three signals:**
- ✅ `LEGALIZER-COMPLIANCE GATE: CLEARED` — proceed to Step 2.5
- ⚠️ `LEGALIZER-COMPLIANCE GATE: PROCEED WITH CAUTION` — proceed to Step 2.5, append specified clause/disclaimer to final invoice
- 🔴 `LEGALIZER-COMPLIANCE GATE: BLOCKED` — do not generate; flag to user; escalate to full legalizer REVIEW mode

After gate returns, resume from Step 2.5.

---

## STEP 2.5 — CONTACTS GATE ROUTING

**MANDATORY: Resolve ALL counterparty reqs from `contacts` skill BEFORE drafting any document.**

This gate fires AFTER legalizer cleared and BEFORE pricer / document generation. It is the single source of truth for all counterparty identifiers.

**What to resolve:**

For EVERY invoice — call `contacts` for:
- **Seller entity** (one of: `dei`, `dee`, `deasean`, `dec`)
- **Buyer** (e.g., `tori-georgia`, `tama-trade`, `arvitpharm`, `vip-sales`)
- **Ship-from manufacturer** (when manufacturer appears on document: `guangzhou-honghui`, `yangzhou-jinxia`, `meizhiyuan`, `wdaa`)

**How to call contacts:**

```
[[GATE: contacts?entity=<seller-slug>&fields=legal-name-full,registered-address,tax-id,bank-name,bank-address,account-holder,iban,swift,currency&purpose=invoicer-commercial-invoice]]

[[GATE: contacts?entity=<buyer-slug>&fields=legal-name-full,registered-address,tax-id,primary-contract-no,contract-date&purpose=invoicer-commercial-invoice]]
```

**⚠️ DUAL-ROUTE BANKING — mandatory `payer` parameter for Chinese manufacturers:**

When pulling banking fields from a dual-route entity (`guangzhou-honghui`, `yangzhou-jinxia`), you MUST include `&payer=<seller-slug>` so contacts can auto-select the correct route:

```
[[GATE: contacts?entity=guangzhou-honghui&fields=bank-name,iban,swift,bank-address,account-holder&payer=dee&purpose=invoicer-commercial-invoice]]
```

- `payer=dee` → Route A (VTB Shanghai, RU/CIS only)
- `payer=dei` | `payer=deasean` | `payer=dec` → Route B (international)

If `payer` is omitted against a dual-route entity, contacts returns `ROUTE_REQUIRED` hard stop. Invoice generation halts until call is re-issued with `payer` specified.

**HARD STOP fields — invoice generation HALTS if ANY missing:**
- `legal-name-full`
- `iban`
- `swift`
- `bank-name`
- `account-holder`
- `tax-id`
- `registration-no`

**If `NOT_FOUND`, `INCOMPLETE`, or `ROUTE_REQUIRED` response from contacts:**

Do NOT draft partial document. Do NOT substitute placeholders. Do NOT pull from prior conversation memory.

On `NOT_FOUND` / `INCOMPLETE`:
```
⛔ CONTACTS HARD STOP — cannot generate invoice.
Entity: [slug]
Missing: [field list]
Required action: Please provide missing details (or confirm slug) so contacts/ can be updated and invoice drafted.
```

On `ROUTE_REQUIRED`:
```
⛔ CONTACTS ROUTE_REQUIRED — cannot generate invoice.
Entity: [slug] has dual banking routes.
Required action: Confirm paying Das Experten entity (DEE / DEI / DEASEAN / DEC) so correct banking route (A = RU/CIS via VTB; B = International) is selected.
```
Wait for user to confirm payer before re-issuing the call.

**STALE warning (>365 days since last_verified):**
```
⚠️ [slug] last verified YYYY-MM-DD. Invoice is a binding payment instrument.
Please confirm these reqs are still current before I generate the document.
```
Wait for explicit confirmation.

**No fabrication rule:**

Invoicer NEVER:
- Generates IBANs or SWIFT codes from memory
- Fills tax IDs from "similar" entities
- Uses prior conversation context as source of truth
- Substitutes a "typical" address if `registered-address` missing
- Picks a banking route without confirmation on dual-route entities

If contacts does not have it, the invoice does not exist yet. Period.

---

## STEP 2B — PRICER GATE ROUTING

**MANDATORY: Resolve unit prices BEFORE generating any invoice line items.**

Do NOT use hardcoded prices from this skill's product database for invoice line items.

**How to get prices:**

1. Call `pricer` skill
2. Follow its Currency Logic: identify seller entity + buyer → determines price list
3. Look up each SKU → get unit price + currency
4. Insert prices into invoice line items and continue

**Exception:** Invoice-Specification (IS) for China→Russia shipments uses CNY purchasing prices — load `PL-PRCH_CNY.md` directly.

**If any SKU is not listed in the price file** → stop and ask user to provide price manually. Never invent.

---

## STEP 3 — DOCUMENT FORMAT SELECTION

**Three output formats available:**

1. **CI (Commercial Invoice)** — standalone invoice document (English or Russian)
2. **PL (Packing List)** — standalone packing list (English or Russian)
3. **IS (Invoice-Specification / Счет-Спецификация)** — combined invoice + packing list in single bilingual document (EN/RU)

**Default routing:**
- **China → Russia shipments (Yangzhou/Guangzhou → DEE):** Use **IS format** (Russian customs standard)
- **International shipments (DEI → non-Russia):** Use separate **CI + PL**
- **Russia domestic (DEE → Russia buyer):** Use **CI in Russian**

**If user specifies format explicitly**, use that format regardless of default routing.

---

## STEP 4 — INVOICE GENERATION

Load **docx** skill and generate:

### A) COMMERCIAL INVOICE (.docx)

**Header section:**
```
COMMERCIAL INVOICE
Invoice No: [XX-MM-YY]
Date: [DD.MM.YYYY]
Contract No: [if applicable]
```

**Seller block:**
```
SELLER:
[Entity legal name]
[Full address]
[Country]
Tax ID / INN / Trade License: [per entity]
Bank: [per entity — see Bank Details Reference]
IBAN / Account: [per entity]
SWIFT/BIC: [per entity]
```

**Consignee/Buyer block:**
```
CONSIGNEE / BUYER:
[Buyer legal name]
[Full address]
[Country]
[Tax ID / INN if Russia]
[КПП if филиал structure]
```

**Delivery terms:**
```
Delivery Terms: [INCOTERMS + LOCATION]
Payment Terms: [per buyer contract]
Currency: [USD / RUB / EUR]
```

**Product table:**
| No. | Description | HS Code | Origin | Qty | Unit | Unit Price | Total |
|-----|-------------|---------|--------|-----|------|-----------|-------|
| 1 | DE206 SYMBIOS Enzyme Toothpaste 70ml | 3306.10 | China | 720 pcs | pcs | $1.25 | $900.00 |

**Totals section:**
```
Subtotal: [amount]
[+ Freight if CIF/CIP]
[+ Insurance if CIF/CIP]
TOTAL: [amount] [CURRENCY]
```

**Footer:**
```
Authorized Signatory:
_______________________
[Name], General Manager
Das Experten [Entity]

[Stamp/Seal if available]
```

---

### B) PACKING LIST (.docx)

**Header:**
```
PACKING LIST
Ref: [Invoice No]
Date: [DD.MM.YYYY]
```

**Shipment details:**
```
From: [Factory/Warehouse]
To: [Destination]
Total Packages: [CTN count]
Total Net Weight: [kg]
Total Gross Weight: [kg]
Total Volume: [m³]
```

**Packing table:**
| CTN No. | Product Code | Description | Qty per CTN | Total Qty | Net Wt (kg) | Gross Wt (kg) |
|---------|--------------|-------------|-------------|-----------|-------------|---------------|
| 1-10 | DE206 | SYMBIOS 70ml | 72 pcs | 720 pcs | 5.04 kg | 5.5 kg |

**Calculation notes:**
- Net weight = (unit weight × qty)
- Gross weight = Net weight + packaging (typically +8-10%)
- Volume = (carton L × W × H in cm) / 1,000,000

---

### C) INVOICE-SPECIFICATION / СЧЕТ-СПЕЦИФИКАЦИЯ (.docx)

**When to use:** China → Russia shipments (Yangzhou/Guangzhou factory → Das Experten Eurasia LLC)

**Format:** Bilingual (EN/RU) combined document — invoice + packing list in single table

**TWO VARIANTS:**

---

#### **VARIANT 1: TOOTHBRUSHES (Yangzhou Jinxia)**

**Header:**
```
INVOICE-SPECIFICATION / Счет-СПЕЦИФИКАЦИЯ

Договор №: [Contract No.] | №: [Invoice No.] | Date / Дата: [DD.MM.YYYY]

Получатель по ст - [Consignee details — logistics operator at destination station]
(e.g., OOO СТС-ЛОГИСТИКА, 143345, МОСКОВСКАЯ ОБЛАСТЬ, Наро-фоминск, рп Селятино, Вокзальная - стр.2А - комн.52, ИНН 5030091396, КПП 503001001; ОГРН 1175074009351)
```

**Three-column party block:**

| **Отправитель/Shipper** | **Покупатель** | **Buyer** |
|------------------------|---------------|-----------|
| **YANGZHOU JINXIA PLASTIC PRODUCTS&RUBBER CO., LTD**<br>ADD:NO.40WEIYE ROAD HANGJI INDUSTRIAL PARK YANGZHOU CITY CHINA<br>TEL:86+0514-87271306<br><br>Компания с ограниченной ответственностью Янчжоу Цзинься Пластик Продактс энд Раббер.<br>Китай, Янчжоу, Ханцзи Индастриал Парк, ул. Вэйе 40<br>Тел. : 86+0514-87271306 | | **DAS EXPERTEN EURASIA LLC**<br>REPUBLIC OF MORDOVIA, SARANSK STREET 1-I INDUSTRIAL, BUILDING 23, OFFICE 4, RUSSIAN FEDERATION<br>INN 9704117379<br><br>ООО "ДАС ЭКСПЕРТЕН ЕВРАЗИЯ"<br>РОССИЯ, РФ, РЕСПУБЛИКА МОРДОВИЯ, САРАНСК, УЛИЦА 1-Я ПРОМЫШЛЕННАЯ, ДОМ 23, ОФИС 4<br>ИНН 9704117379 |

| **Продавец/Seller** |
|---------------------|
| **DAS EXPERTEN INTERNATIONAL LLC**<br>Sharjah Media City Free Zone, Al Messaned, Sharjah, UAE<br>Registration No: 2221260<br><br>ООО «ДАС ЭКСПЕРТЕН ИНТЕРНЭШНЛ»<br>Свободная зона Sharjah Media City, Аль-Мессанед, Шарджа, ОАЭ<br>Регистрационный номер: 2221260 |

**Delivery terms row:**
```
Terms of delivery / Условия поставки: [FOB Shanghai / FOB Guangzhou]
Container / Контейнер: [leave blank or fill if known]

Страна назначения: РФ
Станция назначения: [Селятино / Moscow / other]
```

**Product table (bilingual):**

| No. | HS Code / Код ТН ВЭД ТС | Страна происхождения товара | Описание товаров/description of goods | Qty of pcs / Кол-во штук | Qty of packages, cartons /Кол-во мест, коробок | Net weight kg / Вес нетто кг | Gross weight kg / Вес брутто кг | Price per pcs / Цена за штуку, USD | Amount / Общая стоимость, USD |
|-----|------------------------|------------------------------|----------------------------------------|--------------------------|------------------------------------------------|------------------------------|----------------------------------|-------------------------------------|-------------------------------|
| 1 | 9603210000 | China/Китай | Das Experten GROSSE toothbrush / Зубная щётка Das Experten GROSSE | 12672 | 44 | 290.50 | 317.00 | 0.14 | 1774.08 |
| 2 | 3306200000 | China/Китай | Das Experten Dental Floss WAXED MINT / Зубная нить Das Experten Dental Floss WAXED MINT | 5184 | 18 | 175.00 | 193.00 | 0.41 | 2125.44 |
| **Total** | | | | **74304** | **258** | **1834.30** | **2012.30** | | **14783.04** |

---

#### **VARIANT 2: TOOTHPASTES (Guangzhou Honghui)**

**Header:**
```
Счет фактура -Упаковочный лист – Спецификация/ INVOICE -PACKING LIST-SPECIFICATION

Договор №: [Contract No. from DD.MM.YYYY] | №: [Invoice No.] | Date / Дата: [YYYY年MM月DD日]
合同号 | 发票-明细单号 | 日期
```

**Simplified two-block party structure:**

```
Shipper/Отправитель (same as smgs'shipper): GUANGZHOU HONGHUI DAILY TECHNOLOGY CO.,LTD.
Получатель/ consignee(same as smgs'consignee): LIMITED LIABILITY COMPANY DAS EXPERTEN EURASIA

Продавец GUANGZHOU HONGHUI DAILY TECHNOLOGY CO.,LTD.
Add: Room 107,B building,No.337 Baiyundadaobei,Baiyun District,Guangzhou City,post code 510000,China 91440101MA5AM6CU3M

GUANGZHOU HONGHUI DAILY TECHNOLOGY CO., LTD.
Адрес: Китай, г. Гуанчжоу, район Байюнь, ул. Байюнь Дадаобэй, № 337, здание B, комната 107, почтовый индекс 510000.
Регистрационный номер: 91440101MA5AM6CU3M

Seller | 发货人/卖方

Покупатель LIMITED LIABILITY COMPANY DAS EXPERTEN EURASIA. 430034, Russian Federation, Republic of Mordovia, Saransk, ul. Promyshlennaya 1-YA, building 23, premises 4. TIN: 9704117379

ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ДАС ЭКСПЕРТЕН ЕВРАЗИЯ". 430034, Российская Федерация, Республика Мордовия, г. Саранск, ул. 1-я Промышленная, д. 23, помещ. 4. ИНН: 9704117379 КПП: 130001001.

Buyer | 收货人/买方
```

**Delivery terms:**
```
Terms of delivery / Условия поставки: 必填 CNF
Container / Контейнер: [blank]

Страна назначения: РФ
Станция назначения: [Электроугли / Селятино / Moscow]
```

**Simplified product table:**

| No. | HS Code / Код ТН ВЭД ТС<br>必填（目的港 hs必须完整） | Страна происхождения товара货源国<br>必填 | Описание товаров/description of goods货物说明<br>俄文+英文（需翻译一致）最好附带中文的货物名称 | Qty pcs / Кол-во шт数量 | Qty of packages/Кол-во мест包裹件数<br>件数报关一致 | Type of package/Вид упаковки<br>包装种类<br>报关一致 | Net weight kg / Вес нетто кг净重<br>报关一致 | Gross weight kg / Вес брутто кг毛重<br>报关一致 | Price per pcs / Цена за шт单价<br>必填 | Amount / Общая стоимость总价<br>CNY |
|-----|------------------------|------------------------------|----------------------------------------|--------------------------|------------------------------------------------|------------------------------|----------------------------------|-------------------------------------|-------------------------------|
| 1 | 3306100000 | CHINA/Китай | DAS EXPERTEN GINGER FORCE 70ML TOOTHPASTE / ЗУБНАЯ ПАСТА | 20016 | 278 | CARTONS/КАРТОН. | 1601.28 | 2168.4 | 2.396 | 47958.336 |
| 2 | 3306100000 | CHINA/Китай | DAS EXPERTEN SYMBIOS 70ML TOOTHPASTE / ЗУБНАЯ ПАСТА | 20016 | 278 | CARTONS/КАРТОН. | 1601.28 | 2168.4 | 3.246 | 64971.936 |
| **total** | | | | **105120** | **1460** | | **8409.6** | **11388** | | **307248.57** |

**Safety declarations (mandatory footer):**
```
Не содержит средств криптографии и шифрования.
Не содержит озоноразрушающие вещества
Товары не являются опасными отходами, не применяются в военных целях и не контактируют с пищевыми продуктами/водой
该货物不是危险废物，不用于军事目的，也不与食物/水接触；不包含密码和加密工具；不包含消耗臭氧层的物质。
```

**Signature block:**
```
CEO / Генеральный Директор
盖章

[Company stamp/seal]
```

---

**Key differences between variants:**
- **Variant 1 (Brushes):** Three-party structure (Shipper + Seller + Buyer + Consignee), FOB terms, detailed inner box breakdown
- **Variant 2 (Pastes):** Two-party structure (Shipper=Seller, Consignee=Buyer), CNF terms, simplified packaging, mandatory safety declarations, trilingual headers (RU/EN/CN)

---

## STEP 5 — FILE DELIVERY

Generate both files in `/home/claude/`, then move to `/mnt/user-data/outputs/`:

```bash
mv /home/claude/Commercial_Invoice_[BUYER]_[DATE].docx /mnt/user-data/outputs/
mv /home/claude/Packing_List_[BUYER]_[DATE].docx /mnt/user-data/outputs/
```

Present files to user via **present_files** tool with brief summary:

**For separate CI + PL:**
```
✅ Документы готовы:
📄 Commercial Invoice — [BUYER] — [AMOUNT] [CURRENCY]
📦 Packing List — [TOTAL QTY] pcs in [CTN COUNT] cartons
```

**For IS (Invoice-Specification):**
```
✅ Счет-Спецификация готов:
📋 Invoice-Specification №[INV_NO] — [BUYER] — [AMOUNT] USD
📦 [TOTAL QTY] pcs in [CTN COUNT] cartons | [NET_WT] kg net / [GROSS_WT] kg gross
```

**Do NOT write extensive explanations** — user can view files themselves.

---

## ENTITY BANK DETAILS REFERENCE

> ⚠️ **LEGACY SECTION — BEING MIGRATED TO `contacts` SKILL**
>
> The bank details below remain as fallback while contacts/ registry is being populated. Once all 4 entities (DEI, DEE, DEASEAN, DEC) have full records in `contacts/das-group/`, this section will be removed entirely. Invoicer MUST pull reqs from contacts via STEP 2.5 — this block is reference only, not authoritative. On conflict between this block and contacts/ record, contacts/ WINS.

### **DEI — Das Experten International LLC (UAE)**

**For USD transactions:**
```
Beneficiary: Das Experten International LLC
Bank: Wio Bank PJSC
Address: Etihad Airways Centre, 5th Floor, Abu Dhabi, UAE
IBAN: AE350860000009191889772
SWIFT/BIC: WIOBAEADXXX
Currency: USD
Trade License: 1305803 (Sharjah Media City Free Zone)
```

---

### **DEE — Das Experten Eurasia LLC (Russia)**

**PRIMARY BANK — используется по умолчанию для всех invoices:**

```
Получатель / Beneficiary: ООО «Дас Экспертен Евразия»
Банк / Bank: ФИЛИАЛ "ЦЕНТРАЛЬНЫЙ" БАНКА ВТБ (ПАО) / VTB Bank (PJSC) (TSENTRALNYI BRANCH, MOSCOW)
БИК / BIC: 044525411
Корр. счёт / Correspondent account: 30101810145250000411
SWIFT: VTBRRUM2MS2
ИНН / INN: 9704117379
КПП / KPP: 130001001
ОГРН / OGRN: 1227700061313
Юр. адрес / Legal address: 430034, Россия, Республика Мордовия, г. Саранск, ул. 1-я Промышленная, д. 23, пом. 4
Email: eurasia@dasexperten.de
```

**Счёт RUB (расчётный):**
```
Расчётный счёт: 40702810024370000534
```

**Счёт CNY/USD (юаневый — основной для платежей из Китая):**
```
Текущий счёт: 40702156600340000037
```

> ⚠️ **ПРАВИЛО ВЫБОРА СЧЁТА:**
> - Платежи из Китая (Honghui, Jinxia) → использовать **юаневый счёт 40702156600340000037**
> - Платежи от российских покупателей (RUB) → использовать **расчётный счёт 40702810024370000534**
> - По умолчанию в invoice header: указывать **оба счёта** с пометкой валюты

**УНК по контрактам DEE (валютный контроль ВТБ):**

| Контракт | Контрагент | УНК | Действует до |
|---|---|---|---|
| № 06062022 от 06.06.2022 | Das Experten International LLC (UAE / DEI) | **22110206/1927/0006/2/1** | 31.12.2028 |
| № MF01-DEA/YZ от 01.01.2025 | YANGZHOU JINXIA PLASTIC PRODUCTS & RUBBER CO., LTD (Китай) | **25010525/1000/0081/2/1** | 31.12.2029 |
| № 080824 от 09.04.2024 | Guangzhou Honghui Daily Technology Company Limited (Китай) | **24080104/1927/0006/2/1** | 31.12.2027 |

---

### **DEASEAN — Das Experten ASEAN Co. Ltd. (Vietnam)**

```
Beneficiary: Das Experten ASEAN Co. Ltd.
Bank: [PENDING — request from user if needed]
Address: Vietnam
Tax Code: [PENDING]
```

---

### **DEC — Das Experten Corporation (Seychelles)**

```
Beneficiary: Das Experten Corporation
Registration: [PENDING]
Bank: [PENDING]
Address: Seychelles
Purpose: IP holding (WIPO trademarks IR 1550919, IR 1675375)
```

---

## BUYER ROSTER REFERENCE

> ⚠️ **LEGACY SECTION — BEING MIGRATED TO `contacts` SKILL**
>
> The buyer list below remains as fallback while contacts/buyers/ is being populated. Once all active buyers have records in `contacts/buyers/<country>/`, this section will be removed entirely. Invoicer MUST pull buyer reqs from contacts via STEP 2.5 — this block is reference only, not authoritative. On conflict, contacts/ WINS.

**Russia/CIS:**
- **TAMA Trade LLC** (ООО «ТАМА Трейд») — Саратовская обл., г. Энгельс, Director: Черкашина Светлана Александровна
- **Torwey Trade LLC** (ООО «Торвей Трейд») — Саратовская обл., г. Энгельс, Director: Черкашина Светлана Александровна
- **RUSH LLC EVA** (ООО «РАШ ЕВА») — Ukraine, FCA Illichivsk
- **Hryceva LLC** (ООО «Грицева») — Ukraine, FOB Gdansk
- **ITER 7 LLC** (ООО «ИТЕР 7») — Ukraine
- **ArvitPharm LLC** (ООО «АрвитФарм») — Belarus, 2%/month penalty clause
- **Zapadny Dvor LLC** (ООО «Западный Двор») — Belarus, DDP Minsk
- **Das Beste Produkt LLC** (ООО «Дас Бесте Продукт») — Uzbekistan, FCA Moscow
- **JV Natusana LLC** (СП ООО «Натусана») — Moldova, FCA Illichivsk
- **IP Ratiya B.A.** (ИП Ратия Б.А.) — Abkhazia

**International:**
- **TORI-GEORGIA LLC** (ООО «ТОРИ-ДЖОРДЖИЯ») — Georgia, DEI contract
- **DASEX GROUP LLC** (ООО «ДАСЭКС ГРУП») — Armenia, Director: Smbat Martirosyan

**Default payment terms:**
- Russia domestic (DEE): 100% prepayment or 50/50 split
- International (DEI): 100% prepayment unless long-term contract specifies otherwise
- TORI-GEORGIA: Per DEI contract (net 30 days)
- ArvitPharm: 2% per month penalty on overdue payments

---

## PRODUCT DATABASE REFERENCE (CORE SKUs)

> Prices are NOT stored here. All prices via Pricer Gate — see STEP 2B.

### Toothpastes

| SKU   | Product Name            | Barcode       | CTN Qty | CTN Weight (kg) | CTN Dims (cm) | HS Code |
|-------|-------------------------|---------------|---------|-----------------|---------------|---------|
| DE201 | SCHWARZ Charcoal 70ml   | 4270001210609 | 72 pcs  | 7.6             | 35.5×32×19    | 3306.10 |
| DE202 | DETOX 70ml              | 4270001210623 | 72 pcs  | 7.6             | 35.5×32×19    | 3306.10 |
| DE203 | GINGER FORCE 70ml       | 4270001210630 | 72 pcs  | 7.6             | 35.5×32×19    | 3306.10 |
| DE204 | AKTIV forte 70ml        | 4270002725294 | 72 pcs  | 7.6             | 35.5×32×19    | 3306.10 |
| DE205 | COCOCANNABIS 70ml       | 4270001210647 | 72 pcs  | 7.6             | 35.5×32×19    | 3306.10 |
| DE206 | SYMBIOS 70ml            | 4270001210654 | 72 pcs  | 7.6             | 35.5×32×19    | 3306.10 |
| DE207 | BUDDY MICROBIES 0+ 50ml | 4270002725218 | 72 pcs  | 7.6             | 35.5×32×19    | 3306.10 |
| DE208 | EVOLUTION 5+ 50ml       | 4270002725232 | 72 pcs  | 7.6             | 35.5×32×19    | 3306.10 |
| DE209 | THERMO 39° 70ml         | 6971663564649 | 72 pcs  | 7.6             | 35.5×32×19    | 3306.10 |
| DE210 | INNOWEISS 70ml          | 4270001210609 | 72 pcs  | 7.6             | 35.5×32×19    | 3306.10 |

### Toothbrushes

| SKU   | Product Name         | Barcode       | CTN Qty | CTN Weight (kg) | CTN Dims (cm) | HS Code |
|-------|----------------------|---------------|---------|-----------------|---------------|---------|
| DE101 | ETALON               | 6913362820022 | 288 pcs | 9.0             | 41×38×25      | 9603.21 |
| DE105 | SCHWARZ brush        | 6913362825898 | 288 pcs | 8.5             | 41×38×25      | 9603.21 |
| DE106 | SENSITIV             | 6913362824808 | 288 pcs | 8.5             | 41×38×25      | 9603.21 |
| DE107 | MITTEL               | 6913362825584 | 288 pcs | 8.5             | 41×38×25      | 9603.21 |
| DE108 | KINDER 3+            | 6913362824280 | 288 pcs | 8.0             | 44×37.5×26    | 9603.21 |
| DE109 | UNI SOFT             | 6913362752361 | 288 pcs | 6.5             | 41×38×25      | 9603.21 |
| DE110 | UNI MEDIUM           | 6913362821760 | 288 pcs | 6.5             | 41×38×25      | 9603.21 |
| DE116 | KRAFT                | 6913362750084 | 288 pcs | 6.5             | 41×38×25      | 9603.21 |
| DE117 | ZERO                 | 6913362829025 | 288 pcs | —               | —             | 9603.21 |
| DE118 | DOLPHIN KINDER 1+    | 6913362821371 | 288 pcs | 8.0             | 44×37.5×26    | 9603.21 |
| DE119 | GROSSE               | 6913362829803 | 288 pcs | 9.0             | 41×38×25      | 9603.21 |
| DE120 | NANO MASSAGE         | 6913362825935 | 288 pcs | 9.0             | 41×38×25      | 9603.21 |
| DE121 | 2-PACK DOPPEL AKTION | 6913362822316 | 288 pcs | 10.0            | 56×50×27      | 9603.21 |
| DE122 | AKTIV brush          | 6913362825126 | 288 pcs | 7.0             | 41×38×25      | 9603.21 |
| DE123 | BIO                  | 6913362820107 | 288 pcs | 9.0             | 41×38×25      | 9603.21 |
| DE130 | INTENSIV             | 6913362829087 | 288 pcs | 9.0             | 41×38×26      | 9603.21 |
| DE131 | 3D                   | 6913362820374 | 288 pcs | —               | —             | 9603.21 |

### Dental Floss

| SKU   | Product            | Barcode       | CTN Qty | CTN Weight (kg) | CTN Dims (cm) | HS Code |
|-------|--------------------|---------------|---------|-----------------|---------------|---------|
| DE111 | WAXED MINT 100m    | 6913362750060 | 288 pcs | 8.0             | 34×31.5×43    | 3306.20 |
| DE112 | EXPANDING 100m     | 6913362823450 | 288 pcs | 8.0             | 34×31.5×43    | 3306.20 |
| DE115 | SCHWARZ floss 100m | 6913362825119 | 288 pcs | 8.0             | 34×31.5×43    | 3306.20 |

### Interdental Brushes

| SKU   | Product         | Barcode       | CTN Qty | CTN Weight (kg) | CTN Dims (cm) | HS Code    |
|-------|-----------------|---------------|---------|-----------------|---------------|------------|
| DE125 | Small size 7 pc | 6913362827671 | 288 pcs | 8.0             | 34×31.5×43    | 9603.29.80 |
| DE126 | Medium size 7pc | 6913362827670 | 288 pcs | 8.0             | 34×31.5×43    | 9603.29.80 |

### Tongue Scraper

| SKU   | Product    | Barcode       | CTN Qty | CTN Weight (kg) | CTN Dims (cm) | HS Code    |
|-------|------------|---------------|---------|-----------------|---------------|------------|
| DE114 | ZUNGER 1pc | 6913362826000 | 288 pcs | 9.0             | 41×38×25      | 9603.29.80 |

**Country of Origin:**
- Toothpastes (CIS markets): China — Guangzhou Honghui
- Toothpastes (International): China — Guangzhou MEIZHIYUAN
- Brushes / Floss / Interdentals (all markets): China — Yangzhou Jinxia

**Standard CTN packaging:**
- Toothpastes: 72 pcs/CTN (6 boxes × 12 tubes)
- Brushes: 288 pcs/CTN (12 boxes × 24 brushes)
- Floss / Interdentals / Tongue scrapers: 288 pcs/CTN

---

## WEIGHT/VOLUME CALCULATIONS

**Unit weights (from FOB Guangzhou price list):**

**Toothpastes (70ml):**
- Net weight per tube: ~70g
- Gross weight per tube: ~75g
- CTN weight (72 pcs): 7.6 kg gross
- CTN dims: 35.5 × 32 × 19 cm
- CTN volume: 0.0216 m³

**Toothpastes (50ml kids):**
- Net weight per tube: ~50g
- Gross weight per tube: ~55g
- CTN weight (72 pcs): 7.6 kg gross
- CTN dims: 35.5 × 32 × 19 cm

**Toothbrushes (standard):**
- Net weight per brush: ~18-22g
- Gross weight per brush: ~20-25g
- CTN weight (288 pcs): 6.5-10 kg (varies by model)
- Standard CTN dims: 41 × 38 × 25 cm
- Kids brush CTN dims: 44 × 37.5 × 26 cm
- 2-PACK CTN dims: 56 × 50 × 27 cm

**Dental Floss / Interdentals:**
- CTN weight (288 pcs): 8.0 kg
- CTN dims: 34 × 31.5 × 43 cm

**Tongue Scraper:**
- CTN weight (288 pcs): 9.0 kg
- CTN dims: 41 × 38 × 25 cm

**Calculation formula:**
```
Net Weight (kg) = (Unit Net Weight × Qty) / 1000
Gross Weight (kg) = Per actual CTN weight from price list
Volume (m³) = (L × W × H in cm) / 1,000,000
```

**Example calculation for DE206 SYMBIOS:**
```
Order: 720 pcs (10 CTN)
Per CTN: 72 pcs | 7.6 kg | 35.5×32×19 cm

Total Net Weight: (70g × 720) / 1000 = 50.4 kg
Total Gross Weight: 7.6 kg × 10 CTN = 76.0 kg
Total Volume: (0.355 × 0.32 × 0.19) × 10 = 0.216 m³
```

---

## INCOTERMS LOGIC

**Default routing:**
- **Russia domestic (DEE seller):** FCA Moscow or EXW Saransk
- **International (DEI seller):** FOB Guangzhou or FCA Guangzhou
- **Georgia (TORI):** CIF Tbilisi (per contract)
- **Ukraine/Moldova:** FCA Illichivsk or FOB Gdansk
- **Belarus:** DDP Minsk (Zapadny Dvor only)
- **Uzbekistan/Central Asia:** FCA Moscow

**Freight/Insurance inclusion:**
- **EXW/FCA:** Buyer arranges transport — no freight line in invoice
- **FOB:** Freight to port included — add line item
- **CIF/CIP:** Freight + Insurance included — add separate line items
- **DDP:** All costs to destination included — add comprehensive freight line

---

## SPECIAL HANDLING RULES

### **Invoice-Specification (IS) Format**

**Mandatory use for:**
- China → Russia shipments (Yangzhou Jinxia → DEE or Guangzhou → DEE)
- Any shipment where Russian customs requires combined invoice + packing list

**TWO VARIANTS — auto-select based on product category:**

**VARIANT 1 — TOOTHBRUSHES/FLOSS/INTERDENTALS (Yangzhou Jinxia):**
- Three-party structure (Shipper + Seller + Buyer + Consignee)
- Incoterms: FOB Shanghai
- Detailed inner box breakdown in table
- Products: brushes, dental floss, interdentals, tongue scrapers

**VARIANT 2 — TOOTHPASTES (Guangzhou Honghui):**
- Two-party structure (Shipper=Seller, Consignee=Buyer)
- Incoterms: CNF Guangzhou
- Simplified packaging table (no inner box detail)
- Mandatory safety declarations footer (RU + CN)
- Products: all toothpastes (70ml, 50ml, kids)

**Auto-selection logic:**
```
IF product list contains ANY toothpaste SKU (DE201-DE210):
  → Use VARIANT 2 (Guangzhou/toothpaste format)
ELSE:
  → Use VARIANT 1 (Yangzhou/brush format)
```

**Critical rules (both variants):**
- All product descriptions **must be bilingual** (EN / RU)
- HS codes in **10-digit format** (Russian standard)
- Currency always **USD** for international shipments
- No bank details required (shipping doc only)
- Stamp/seal mandatory
- CEO signature: "Aram Badalyan, General Manager / Генеральный Директор"

### **Филиал (Branch) Buyers**

If buyer structure includes "филиал" or branch office:
- Use **head office КПП** for invoice legal block
- Use **branch office КПП** for consignee/delivery address
- Flag this in legalizer gate before generating

### **Credit Notes**

If user requests credit note:
- Generate separate "CREDIT NOTE" document (not invoice)
- Reference original invoice number
- Negative amounts in red
- Include reason for credit (return, damage, price adjustment, etc.)

### **Proforma Invoices**

If user says "proforma" or "PI":
- Mark document header as **PROFORMA INVOICE**
- Add disclaimer: "This is not a tax invoice. For estimation purposes only."
- No signatures/stamps required

### **Multi-Currency Invoices**

If buyer requires dual currency (e.g., USD + RUB equivalent):
- Show both currencies in separate columns
- State exchange rate and date
- Total in primary currency only

---

## INTER-SKILL ROUTING

**Always call:**
- **das-experten-expert** — for SKU translation, product specs, HS codes
- **legalizer** — when buyer jurisdiction, terms, or structure triggers compliance flags

**Never call:**
- **das-presenter** — different purpose (B2B presentations, not invoices)
- **bannerizer** — visual prompts, not documents

---

## ERROR HANDLING

**If user uploads .xlsx file but it's malformed:**
- Parse available columns
- Ask user to clarify missing data
- Do NOT guess quantities or prices

**If buyer not in roster:**
- Ask for full legal details:
  - Legal name
  - Address
  - Tax ID / INN / Registration number
  - Bank details (if prepayment required)

**If SKU unknown:**
- Route to **das-experten-expert** for lookup
- If still not found, ask user for: product name, HS code, unit weight, packaging

---

## OUTPUT LANGUAGE RULES

**Document language defaults:**
- **English:** All international buyers (DEI seller)
- **Russian:** Russia/CIS buyers (DEE seller) — unless buyer explicitly requests English
- **Bilingual (EN + RU):** When buyer requests or when required by customs (e.g., China → Russia shipments)

**User message language:**
- If user writes in Russian → respond in Russian
- If user writes in English → respond in English
- If user writes in Armenian → respond in Russian (per standing rule)

---

## CRITICAL REMINDERS

✅ **Generate actual .docx files — not templates**  
✅ **Always route through legalizer gate when compliance flags detected**  
✅ **Use correct entity bank details based on seller + currency**  
✅ **Include HS codes, origin, weights in packing lists**  
✅ **Wait for user confirmation at each parameter collection step**  
✅ **Present files via present_files tool — no long explanations**

---

## END OF SKILL