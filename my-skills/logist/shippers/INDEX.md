# Shippers Index

Единый реестр логистов Das Experten. При запросе квоты — фильтруй по маршруту, открывай карточки, отправляй унифицированный текст в нужный канал каждому контакту.

## Active shippers — China → Russia route

| Slug | Trade name | Modes | Status with DE | Last verified |
|------|-----------|-------|----------------|---------------|
| `inter-freight` | Inter-Freight LTD | Rail (primary) | **Established partner** — 3+ shipments | 2026-04-20 |
| `trans-imperial` | Trans Imperial | Multimodal | Cold lead — proposal received 20.04 | 2026-04-20 |
| `dd-logistics` | DD Logistics | Sea + rail (Far East) | Cold lead — rate sheet on file 07.04 | 2026-04-20 |
| `neptune-logistics` | Neptune Logistics (NEP) | Rail | Cold lead — outreach 01.04 | 2026-04-20 |
| `avis-trans` | Avis-Trans | TBC | Warm lead — presentation received 23.03 | 2026-04-20 |

## Quote distribution rule

When a new shipment is in the pipeline:
1. **Always send RFQ to Inter-Freight + at least 3 alternatives in parallel** (no exclusive booking).
2. Compare on: total cost, transit time, slot availability, payment terms.
3. Use lowest-cost alternative as leverage in negotiations with Inter-Freight if needed.
4. Update each shipper card after every interaction (rate, transit, issues).

## How to add a new shipper
1. Copy `_TEMPLATE.md` → `shippers/new-slug.md`
2. Fill all available fields; mark missing data as "not available" (NEVER fabricate)
3. Add row to this INDEX
4. Update `last_verified` date

## How to use this index
- **Quote request**: filter by route → open candidate cards → send unified quote text via the channel each contact prefers.
- **Active shipment lookup**: open the shipper card → "History" section → find reference number.
- **Negotiation leverage**: pull all shippers on the same route → request parallel quotes → compare.
