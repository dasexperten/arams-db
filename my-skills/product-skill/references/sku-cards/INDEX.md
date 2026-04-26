# SKU Cards Index

Полный реестр всех Das Experten SKU. Каждая запись ссылается на отдельную карточку с физической спецификацией (фасовка, габариты, веса, штрихкоды, производитель, юр. продавец).

## Toothpastes — Honghui (CIS markets)

| SKU | Trade name | File | Inner | Master | Status |
|---|---|---|---|---|---|
| DE201 | SCHWARZ | `DE201-schwarz.md` | 72 | 288 | active |
| DE202 | DETOX | `DE202-detox.md` | 72 | 288 | active |
| DE203 | GINGER FORCE | `DE203-ginger-force.md` | 72 | 288 | active |
| DE204 | AKTIV forte | `DE204-aktiv-forte.md` | 72 | 288 | active |
| DE205 | COCOCANNABIS | `DE205-cococannabis.md` | 72 | 288 | active |
| DE206 | SYMBIOS | `DE206-symbios.md` | 72 | 288 | active |
| DE209 | THERMO 39° | `DE209-thermo-39.md` | 72 | 288 | active |
| DE210 | INNOWEISS | `DE210-innoweiss.md` | 72 | 288 | active |

## Toothpastes — Children (Honghui, CIS)

| SKU | Trade name | File | Inner | Master | Status |
|---|---|---|---|---|---|
| DE207 | BUDDY MICROBIES 0+ | `DE207-buddy-microbies.md` | 12 | 12 | active |
| DE208 | EVOLUTION 5+ | `DE208-evolution-kids.md` | 12 | 12 | active |

## Toothbrushes — Jinxia (all markets, sold by DEI)

| SKU | Trade name | File | Inner | Master | Status |
|---|---|---|---|---|---|
| DE105 | SCHWARZ brush | `DE105-schwarz-brush.md` | 12 | 288 | active |
| DE106 | SENSITIV | `DE106-sensitiv.md` | 12 | 288 | active |
| DE107 | MITTEL | `DE107-mittel.md` | 12 | 288 | active |
| DE108 | KINDER 3+ | `DE108-kinder-3plus.md` | 12 | 288 | active |
| DE109 | UNI SOFT | `DE109-uni-soft.md` | 12 | 288 | active |
| DE110 | UNI MEDIUM | `DE110-uni-medium.md` | 12 | 288 | active |
| DE116 | KRAFT | `DE116-kraft.md` | 12 | 288 | active |
| DE118 | DOLPHIN KINDER 1+ | `DE118-dolphin-kinder.md` | 12 | 288 | active |
| DE119 | GROSSE | `DE119-grosse.md` | 12 | 288 | active |
| DE120 | NANO MASSAGE | `DE120-nano-massage.md` | 12 | 288 | active |
| DE121 | 2-PACK DOPPEL AKTION | `DE121-2pack-doppel.md` | 12 | 288 | active |
| DE122 | AKTIV | `DE122-aktiv.md` | 12 | 288 | active |
| DE123 | BIO | `DE123-bio.md` | 12 | 288 | active |
| DE130 | INTENSIV | `DE130-intensiv.md` | 12 | 288 | active |

## Floss — Jinxia

| SKU | Trade name | File | Inner | Master | Status |
|---|---|---|---|---|---|
| DE111 | WAXED MINT | `DE111-waxed-mint-floss.md` | 12 | 288 | active |
| DE112 | EXPANDING | `DE112-expanding-floss.md` | 12 | 288 | active |
| DE115 | SCHWARZ floss | `DE115-schwarz-floss.md` | 12 | 288 | active |

## Interdental — Jinxia

| SKU | Trade name | File | Inner | Master | Status |
|---|---|---|---|---|---|
| DE125 | INTERDENTAL Small | `DE125-interdental-s.md` | 12 | 288 | active |
| DE126 | INTERDENTAL Medium | `DE126-interdental-m.md` | 12 | 288 | active |

## Tongue scraper — Jinxia

| SKU | Trade name | File | Inner | Master | Status |
|---|---|---|---|---|---|
| DE114 | ZUNGER | `DE114-zunger.md` | 12 | 288 | active |

---

## How to add a new SKU
1. Copy `product-specs.md` → `sku-cards/DE{number}-{slug}.md`
2. Fill all available fields. Mark missing as `not available` — NEVER fabricate.
3. Add row to this INDEX in the correct category section.
4. Update `last_verified` date.

## How to use this index
- **Invoicer / packing list / customs declaration**: open the SKU card → take fasovka, weight, HS, barcode.
- **Logist quote**: total partia weight = sum of (units / inner_per_master × master_weight) across all SKUs in shipment.
- **Marketplace listing**: open SKU card → take dimensions for product card; combine with `sku-data.md` for clinical/positioning copy.
- **Compliance / legalizer**: open SKU card → check Certificates / DoC field; if `not available`, halt and request from Aram.

## Open data gaps (across all cards)
Most cards currently lack:
- Net product weight (g)
- Shelf life (months)
- Certificates / DoC numbers and validity
- Inner-box and master-carton weights for many SKUs

These should be filled progressively when fresh packing data arrives from Honghui (Ellen Wei) and Jinxia (Mia / Coco).
