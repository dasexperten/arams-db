// promozon — Ozon promo-guard agent (Das Experten)
// Scenario "elastic-stock-guard" (PRIMARY): in elastic boosting action (Seller API),
//   when a product's promo stock reaches 0 → re-activate with target_stock (default 29).
// Scenario "zero-bid-restore" (OFF by default): Performance API SEARCH_PROMO,
//   bid 0 → restore to target_bid.
// Cron: every 4 hours. Endpoints: /status /actions /run /config (Bearer PROMOZON_AUTH).

const PERF_BASE = "https://api-performance.ozon.ru";
const SELLER_BASE = "https://api-seller.ozon.ru";

// ---------- Performance API ----------

async function perfToken(env) {
  const r = await fetch(`${PERF_BASE}/api/client/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.OZON_PERF_CLIENT_ID,
      client_secret: env.OZON_PERF_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!r.ok) throw new Error(`perf token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

async function perfListProducts(token) {
  const all = [];
  let page = 1;
  for (;;) {
    const r = await fetch(`${PERF_BASE}/api/client/campaign/search_promo/v2/products`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ page, pageSize: 100 }),
    });
    if (!r.ok) throw new Error(`perf products p${page} ${r.status}: ${await r.text()}`);
    const d = await r.json();
    const prods = d.products || [];
    all.push(...prods);
    if (all.length >= Number(d.total || 0) || prods.length === 0 || page > 50) break;
    page += 1;
  }
  return all;
}

async function perfSetBids(token, bids) {
  const r = await fetch(`${PERF_BASE}/api/client/campaign/search_promo/v2/bids/set`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ bids }),
  });
  if (!r.ok) throw new Error(`perf bids/set ${r.status}: ${await r.text()}`);
  return (await r.json()).response || [];
}

// ---------- Seller API ----------

function sellerHeaders(env) {
  return {
    "Client-Id": env.OZON_SELLER_CLIENT_ID,
    "Api-Key": env.OZON_SELLER_API_KEY,
    "Content-Type": "application/json",
  };
}

async function sellerActionProducts(env, actionId) {
  const all = [];
  let offset = 0;
  for (;;) {
    const r = await fetch(`${SELLER_BASE}/v1/actions/products`, {
      method: "POST",
      headers: sellerHeaders(env),
      body: JSON.stringify({ action_id: actionId, limit: 100, offset }),
    });
    if (!r.ok) throw new Error(`actions/products ${r.status}: ${await r.text()}`);
    const res = (await r.json()).result || {};
    const prods = res.products || [];
    all.push(...prods);
    if (all.length >= Number(res.total || 0) || prods.length === 0 || offset > 5000) break;
    offset += prods.length;
  }
  return all;
}

async function sellerActionCandidates(env, actionId) {
  // Products eligible for the elastic-boost action but NOT currently participating.
  // A product lands here once its promo sales-plan ("Осталось продать") hits 0 and it
  // drops out of active boosting — i.e. the "finished candidates". stock===0 for all of them.
  const all = [];
  let offset = 0;
  for (;;) {
    const r = await fetch(`${SELLER_BASE}/v1/actions/candidates`, {
      method: "POST",
      headers: sellerHeaders(env),
      body: JSON.stringify({ action_id: actionId, limit: 100, offset }),
    });
    if (!r.ok) throw new Error(`actions/candidates ${r.status}: ${await r.text()}`);
    const res = (await r.json()).result || {};
    const prods = res.products || [];
    all.push(...prods);
    if (all.length >= Number(res.total || 0) || prods.length === 0 || offset > 5000) break;
    offset += prods.length;
  }
  return all;
}

async function sellerProductNames(env, productIds) {
  const map = new Map();
  if (productIds.length === 0) return map;
  try {
    const r = await fetch(`${SELLER_BASE}/v3/product/info/list`, {
      method: "POST",
      headers: sellerHeaders(env),
      body: JSON.stringify({ product_id: productIds.map(String) }),
    });
    if (r.ok) {
      const d = await r.json();
      const items = d.items || d.result?.items || [];
      for (const it of items) map.set(String(it.id), { offerId: it.offer_id || "", name: it.name || "" });
    }
  } catch (_) { /* names are nice-to-have */ }
  return map;
}

async function sellerActivate(env, actionId, products) {
  // products: [{product_id, action_price, stock}]
  const r = await fetch(`${SELLER_BASE}/v1/actions/products/activate`, {
    method: "POST",
    headers: sellerHeaders(env),
    body: JSON.stringify({ action_id: actionId, products }),
  });
  if (!r.ok) throw new Error(`activate ${r.status}: ${await r.text()}`);
  return (await r.json()).result || {};
}

// ---------- config ----------

async function getConfig(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM config").all();
  const c = {};
  for (const row of results) c[row.key] = row.value;
  return {
    dryRun: c.dry_run !== "0",
    enabled: c.enabled !== "0",
    // elastic-stock-guard
    stockGuardEnabled: c.stock_guard_enabled !== "0",
    candidateRestoreEnabled: c.candidate_restore_enabled !== "0",
    actionId: Number(c.action_id ?? 1977747),
    targetStock: Number(c.target_stock ?? 29),
    // zero-bid-restore (Performance)
    bidRestoreEnabled: c.bid_restore_enabled === "1",
    targetBid: Number(c.target_bid ?? 29),
  };
}

// ---------- scenario: elastic-stock-guard (Seller API) ----------

// Pick a valid elastic promo price for activation. Active dropouts already carry a good
// action_price; finished candidates come back with action_price=0, so fall back to the
// least-discount end of the elastic band (max_action_price / price_min_elastic).
function activationPrice(p) {
  const cand = [Number(p.action_price), Number(p.max_action_price), Number(p.price_min_elastic)];
  for (const v of cand) if (Number.isFinite(v) && v > 0) return v;
  return 0;
}

async function scenarioElasticStockGuard(env, cfg, runId) {
  // Two populations share one trigger: "Осталось продать" (the action `stock` field) === 0.
  //   [A] ACTIVE products still in the action whose plan is exhausted (stock===0).
  //   [B] FINISHED CANDIDATES — products that already dropped OUT of boosting because their
  //       plan hit 0; they live in /candidates (stock===0 for all). Previously invisible.
  const active = await sellerActionProducts(env, cfg.actionId);
  const activeZeros = active.filter((p) => Number(p.stock) === 0).map((p) => ({ ...p, _src: "active" }));

  let candidates = [];
  if (cfg.candidateRestoreEnabled) {
    candidates = (await sellerActionCandidates(env, cfg.actionId))
      .filter((p) => Number(p.stock) === 0)
      .map((p) => ({ ...p, _src: "candidate" }));
  }

  const targets = [...activeZeros, ...candidates];
  let actionsTaken = 0;

  if (targets.length > 0) {
    const names = await sellerProductNames(env, targets.map((p) => p.id));
    let activated = { product_ids: [], rejected: { product_ids: [] } };
    if (!cfg.dryRun) {
      activated = await sellerActivate(
        env,
        cfg.actionId,
        targets.map((p) => ({ product_id: p.id, action_price: activationPrice(p), stock: cfg.targetStock }))
      );
    }
    const okSet = new Set((activated.product_ids || []).map(String));
    const now = new Date().toISOString();
    const stmt = env.DB.prepare(
      "INSERT INTO actions(run_id, scenario, sku, source_sku, title, old_bid, new_bid, dry_run, result, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    );
    const batch = targets.map((p) => {
      const n = names.get(String(p.id)) || {};
      const tag = p._src === "candidate" ? "FINISHED-CANDIDATE" : "ACTIVE";
      const res = cfg.dryRun
        ? `DRY_RUN[${tag}]: would re-activate at stock ${cfg.targetStock} @ price ${activationPrice(p)}`
        : okSet.has(String(p.id)) ? `activated[${tag}]` : `rejected[${tag}]`;
      return stmt.bind(runId, "elastic-stock-guard", String(p.id), n.offerId || "", n.name || "", 0, cfg.targetStock, cfg.dryRun ? 1 : 0, res, now);
    });
    await env.DB.batch(batch);
    actionsTaken = cfg.dryRun ? 0 : okSet.size;
  }
  return {
    scenario: "elastic-stock-guard",
    productsChecked: active.length + candidates.length,
    activeZeros: activeZeros.length,
    finishedCandidates: candidates.length,
    zeros: targets.length,
    actionsTaken,
  };
}

// ---------- scenario: zero-bid-restore (Performance API) ----------

async function scenarioZeroBidRestore(env, cfg, runId) {
  const token = await perfToken(env);
  const products = await perfListProducts(token);
  // "Осталось продать" exhausted → Ozon auto-drops the elastic boost bid to 0 and the product
  // stops being promoted. Restore bid→target, but ONLY for products still promotable
  // (isSearchPromoAvailable); bid=0 + not-available = out of stock / ineligible → skip.
  const zeros = products.filter((p) => Number(p.bid) === 0 && p.isSearchPromoAvailable);
  let actionsTaken = 0;

  if (zeros.length > 0) {
    let setResults = new Map();
    if (!cfg.dryRun) {
      const resp = await perfSetBids(token, zeros.map((p) => ({ sku: String(p.sku), bid: cfg.targetBid })));
      for (const r of resp) setResults.set(String(r.sku), r);
    }
    const now = new Date().toISOString();
    const stmt = env.DB.prepare(
      "INSERT INTO actions(run_id, scenario, sku, source_sku, title, old_bid, new_bid, dry_run, result, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    );
    const batch = zeros.map((p) => {
      const res = cfg.dryRun
        ? "DRY_RUN: would set bid"
        : JSON.stringify(setResults.get(String(p.sku)) ?? { updated: "unknown" });
      const prevBid = Number(p.previousBid?.bid ?? 0);
      return stmt.bind(runId, "zero-bid-restore", String(p.sku), p.sourceSku || "", p.title || "", prevBid, cfg.targetBid, cfg.dryRun ? 1 : 0, res, now);
    });
    await env.DB.batch(batch);
    actionsTaken = cfg.dryRun ? 0 : zeros.filter((p) => setResults.get(String(p.sku))?.updated).length;
  }
  return { scenario: "zero-bid-restore", productsChecked: products.length, zeros: zeros.length, actionsTaken };
}

// ---------- run orchestrator ----------

async function runCheck(env, triggerSrc) {
  const startedAt = new Date().toISOString();
  const cfg = await getConfig(env);
  const ins = await env.DB.prepare(
    "INSERT INTO runs(started_at, trigger_src, dry_run, status) VALUES (?,?,?,?) RETURNING id"
  ).bind(startedAt, triggerSrc, cfg.dryRun ? 1 : 0, "running").first();
  const runId = ins.id;

  try {
    if (!cfg.enabled) {
      await env.DB.prepare("UPDATE runs SET finished_at=?, status=? WHERE id=?")
        .bind(new Date().toISOString(), "skipped: disabled", runId).run();
      return { runId, skipped: true };
    }
    const results = [];
    if (cfg.stockGuardEnabled) results.push(await scenarioElasticStockGuard(env, cfg, runId));
    if (cfg.bidRestoreEnabled) results.push(await scenarioZeroBidRestore(env, cfg, runId));

    const sum = (k) => results.reduce((a, r) => a + (r[k] || 0), 0);
    await env.DB.prepare(
      "UPDATE runs SET finished_at=?, products_checked=?, zero_bids=?, actions_taken=?, status=? WHERE id=?"
    ).bind(new Date().toISOString(), sum("productsChecked"), sum("zeros"), sum("actionsTaken"), "ok", runId).run();
    return { runId, dryRun: cfg.dryRun, scenarios: results };
  } catch (e) {
    await env.DB.prepare("UPDATE runs SET finished_at=?, status=?, error=? WHERE id=?")
      .bind(new Date().toISOString(), "error", String(e.message || e).slice(0, 500), runId).run();
    throw e;
  }
}

// ---------- HTTP ----------

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authorized(req, env) {
  return (req.headers.get("Authorization") || "") === `Bearer ${env.PROMOZON_AUTH}`;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCheck(env, "cron").catch(() => {}));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/") {
      return json({ service: "promozon", scenarios: ["elastic-stock-guard", "zero-bid-restore"], cron: "every 4h" });
    }
    if (!authorized(req, env)) return json({ error: "unauthorized" }, 401);

    if (url.pathname === "/status" && req.method === "GET") {
      const cfg = await getConfig(env);
      const last = await env.DB.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 5").all();
      return json({ config: cfg, lastRuns: last.results });
    }
    if (url.pathname === "/actions" && req.method === "GET") {
      const limit = Math.min(Number(url.searchParams.get("limit") || 50), 500);
      const rows = await env.DB.prepare("SELECT * FROM actions ORDER BY id DESC LIMIT ?").bind(limit).all();
      return json({ actions: rows.results });
    }
    if (url.pathname === "/run" && req.method === "POST") {
      try {
        return json(await runCheck(env, "manual"));
      } catch (e) {
        return json({ error: String(e.message || e) }, 500);
      }
    }
    if (url.pathname === "/config" && req.method === "POST") {
      const body = await req.json();
      const allowed = ["dry_run", "enabled", "stock_guard_enabled", "candidate_restore_enabled", "action_id", "target_stock", "bid_restore_enabled", "target_bid"];
      const updated = {};
      for (const k of allowed) {
        if (body[k] !== undefined) {
          await env.DB.prepare(
            "INSERT INTO config(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
          ).bind(k, String(body[k])).run();
          updated[k] = String(body[k]);
        }
      }
      return json({ updated, config: await getConfig(env) });
    }
    return json({ error: "not found" }, 404);
  },
};
