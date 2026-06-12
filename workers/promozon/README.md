# promozon — Ozon Performance bid-guard

Cloudflare Worker, cron every 4h. Watches Das Experten SEARCH_PROMO boosting (Оплата за заказ) via Ozon Performance API.

**Scenario 1 — zero-bid-restore:** any product with bid = 0 gets restored to target_bid (default 29%). Never raises above target, never touches non-zero bids.

## Endpoints (Bearer PROMOZON_AUTH, see SECRETS/ozon-performance.md)
- GET  /            — service info (public)
- GET  /status      — config + last 5 runs
- GET  /actions     — recent bid actions (?limit=)
- POST /run         — force check now
- POST /config      — {"dry_run":"0"|"1", "target_bid":"29", "enabled":"0"|"1"}

## Infra
- Worker: promozon.dasexperten.workers.dev
- D1: promozon_db (f36a8f2b-99b9-49b8-9dc4-fb98181f23c2), tables: runs / actions / config
- API map: SECRETS/ozon-performance.md

## Adding scenarios
Each scenario is a function (env, token, cfg, runId) → {productsChecked, zeroBids, actionsTaken} called from runCheck. Add to the chain there.
