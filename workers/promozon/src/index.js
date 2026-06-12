// promozon — Ozon Performance bid-guard agent (Das Experten)
// Scenario 1: zero-bid-restore — if a product in SEARCH_PROMO boosting has bid 0, restore to target_bid.
// Cron: every 4 hours. Endpoints: /status /actions /run /config (Bearer PROMOZON_AUTH).

const OZON_BASE = "https://api-performance.ozon.ru";

// ---------- Ozon Performance API client ----------

async function ozonToken(env) {
  const r = await fetch(`${OZON_BASE}/api/client/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.OZON_PERF_CLIENT_ID,
      client_secret: env.OZON_PERF_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

async function listSearchPromoProducts(token) {
  const all = [];
  let page = 1;
  for (;;) {
    const r = await fetch(`${OZON_BASE}/api/client/campaign/search_promo/v2/products`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ page, pageSize: 100 }),
    });
    if (!r.ok) throw new Error(`products p${page} ${r.status}: ${await r.text()}`);
    const d = await r.json();
    const prods = d.products || [];
    all.push(...prods);
    const total = Number(d.total || 0);
    if (all.length >= total || prods.length === 0) break;
    page += 1;
    if (page > 50) break; // hard stop, safety
  }
  return all;
}

async function setBids(token, bids) {
  // bids: [{sku: "123", bid: 29}]
  const r = await fetch(`${OZON_BASE}/api/client/campaign/search_promo/v2/bids/set`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ bids }),
  });
  if (!r.ok) throw new Error(`bids/set ${r.status}: ${await r.text()}`);
  return (await r.json()).response || [];
}

// ---------- config ----------

async function getConfig(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM config").all();
  const c = {};
  for (const row of results) c[row.key] = row.value;
  return {
    targetBid: Number(c.target_bid ?? 29),
    dryRun: c.dry_run !== "0",
    enabled: c.enabled !== "0",
  };
}

// ---------- scenario 1: zero-bid-restore ----------

async function scenarioZeroBidRestore(env, token, cfg, runId) {
  const products = await listSearchPromoProducts(token);
  const zeros = products.filter((p) => Number(p.bid) === 0);
  let actionsTaken = 0;

  if (zeros.length > 0) {
    let setResults = new Map();
    if (!cfg.dryRun) {
      const resp = await setBids(token, zeros.map((p) => ({ sku: String(p.sku), bid: cfg.targetBid })));
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
      return stmt.bind(runId, "zero-bid-restore", String(p.sku), p.sourceSku || "", p.title || "", Number(p.bid), cfg.targetBid, cfg.dryRun ? 1 : 0, res, now);
    });
    await env.DB.batch(batch);
    actionsTaken = cfg.dryRun ? 0 : zeros.filter((p) => setResults.get(String(p.sku))?.updated).length;
  }
  return { productsChecked: products.length, zeroBids: zeros.length, actionsTaken };
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
    const token = await ozonToken(env);
    const s1 = await scenarioZeroBidRestore(env, token, cfg, runId);
    await env.DB.prepare(
      "UPDATE runs SET finished_at=?, products_checked=?, zero_bids=?, actions_taken=?, status=? WHERE id=?"
    ).bind(new Date().toISOString(), s1.productsChecked, s1.zeroBids, s1.actionsTaken, "ok", runId).run();
    return { runId, dryRun: cfg.dryRun, ...s1 };
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
  const h = req.headers.get("Authorization") || "";
  return h === `Bearer ${env.PROMOZON_AUTH}`;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCheck(env, "cron").catch(() => {}));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/") {
      return json({ service: "promozon", scenarios: ["zero-bid-restore"], cron: "every 4h" });
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
        const result = await runCheck(env, "manual");
        return json(result);
      } catch (e) {
        return json({ error: String(e.message || e) }, 500);
      }
    }
    if (url.pathname === "/config" && req.method === "POST") {
      const body = await req.json();
      const allowed = ["target_bid", "dry_run", "enabled"];
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
