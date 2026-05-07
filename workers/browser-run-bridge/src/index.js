// browser-run-bridge — Cloudflare Browser Run gateway for Das Experten
// Action-based dispatcher. Auth: Bearer BRIDGE_SECRET.
// Actions: screenshot, extract_text

import puppeteer from "@cloudflare/puppeteer";

const PUBLIC_R2_BASE = "https://pub-6cf4bb0064824477882515a6afa6e43f.r2.dev";
const MAX_WAIT_MS = 10000;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const auth = request.headers.get("Authorization") || "";
    if (auth !== `Bearer ${env.BRIDGE_SECRET}`) {
      return json({ error: "unauthorized" }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad_request", detail: "invalid_json" }, 400);
    }

    const { action, url, options } = body || {};
    if (!action) return json({ error: "bad_request", detail: "missing_action" }, 400);
    if (!url) return json({ error: "bad_request", detail: "missing_url" }, 400);
    if (!isValidUrl(url)) return json({ error: "bad_request", detail: "invalid_url" }, 400);

    const opts = sanitizeOptions(options);

    try {
      if (action === "screenshot") return await doScreenshot(env, url, opts);
      if (action === "extract_text") return await doExtractText(env, url, opts);
      return json({ error: "bad_request", detail: `unknown_action:${action}` }, 400);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const isBrowserErr = /browser|navigation|timeout|net::/i.test(msg);
      return json(
        { error: isBrowserErr ? "browser_failed" : "internal", detail: msg },
        isBrowserErr ? 502 : 500
      );
    }
  }
};

async function doScreenshot(env, url, opts) {
  const browser = await puppeteer.launch(env.BROWSER);
  const t0 = Date.now();
  try {
    const page = await browser.newPage();
    await page.setViewport(opts.viewport);
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    if (opts.wait_ms > 0) await sleep(opts.wait_ms);

    const png = await page.screenshot({ fullPage: true, type: "png" });
    const key = buildKey("screenshot", url, "png");
    await env.OUTPUT.put(key, png, {
      httpMetadata: { contentType: "image/png" }
    });

    return json({
      ok: true,
      action: "screenshot",
      url: `${PUBLIC_R2_BASE}/${key}`,
      key,
      size_bytes: png.byteLength,
      browser_ms_used: Date.now() - t0
    });
  } finally {
    await browser.close();
  }
}

async function doExtractText(env, url, opts) {
  const browser = await puppeteer.launch(env.BROWSER);
  const t0 = Date.now();
  try {
    const page = await browser.newPage();
    await page.setViewport(opts.viewport);
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    if (opts.wait_ms > 0) await sleep(opts.wait_ms);

    const text = await page.evaluate(() => document.body ? document.body.innerText : "");

    return json({
      ok: true,
      action: "extract_text",
      url,
      text,
      char_count: text.length,
      browser_ms_used: Date.now() - t0
    });
  } finally {
    await browser.close();
  }
}

function sanitizeOptions(o) {
  const out = { viewport: { ...DEFAULT_VIEWPORT }, wait_ms: 0 };
  if (o && typeof o === "object") {
    if (o.viewport && typeof o.viewport === "object") {
      const w = Number(o.viewport.width);
      const h = Number(o.viewport.height);
      if (Number.isFinite(w) && w > 0 && w <= 3840) out.viewport.width = Math.floor(w);
      if (Number.isFinite(h) && h > 0 && h <= 2160) out.viewport.height = Math.floor(h);
    }
    const wait = Number(o.wait_ms);
    if (Number.isFinite(wait) && wait > 0) out.wait_ms = Math.min(MAX_WAIT_MS, Math.floor(wait));
  }
  return out;
}

function buildKey(prefix, url, ext) {
  const date = new Date().toISOString().slice(0, 10);
  const hash = simpleHash(url);
  const ts = Date.now();
  return `${prefix}/${date}/${hash}-${ts}.${ext}`;
}

function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).padStart(8, "0");
}

function isValidUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
