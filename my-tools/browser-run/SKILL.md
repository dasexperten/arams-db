---
name: browser-run
description: |
  Das Experten universal browser-based scraping and rendering gate. Routes calls to the browser-run-bridge Cloudflare Worker, which uses Cloudflare Browser Rendering REST API to open URLs in headless Chrome on Cloudflare's infrastructure. Use this whenever any skill needs to capture a screenshot of a public web page, or extract clean visible text from a JavaScript-rendered page that plain HTTP `fetch` cannot read. Triggers on: "screenshot a page", "сделай скриншот сайта", "захвати страницу", "render this URL", "snapshot the page", "scrape via browser", "headless chrome", "extract text from", "pull the visible text", "render JS-heavy site", "capture web page", "monitor page changes", or any inter-skill call via `[[GATE: browser-run]]`. Fire immediately on trigger — no confirmation needed for read-only browser operations.
---

# browser-run — Cloudflare Browser Rendering gate

Universal Das Experten skill for browser-based page capture. Single entry point to Cloudflare Browser Rendering REST API via the deployed `browser-run-bridge` Worker.

## When to fire this skill

🟢 Aram says: "screenshot the page", "сделай скриншот", "захвати страницу", "render the URL", "сними страницу"
🟢 Aram says: "extract text from", "вытащи текст со страницы", "дай чистый текст с сайта", "что написано на странице"
🟢 Another skill needs visual or text content from a public web page that plain `fetch` cannot read (JS-rendered, SPA, infinite scroll, dynamic content)
🟢 Inter-skill gate `[[GATE: browser-run?action=screenshot&url=...]]` or `[[GATE: browser-run?action=extract_text&url=...]]`
🟢 Monitoring tasks — periodic snapshots of competitor product pages, marketplace listings, news pages, blogger profiles

## When NOT to fire

🔴 Static HTML page where plain HTTP `fetch` works (faster and free)
🔴 Page requires login/cookies (browser-run-bridge has no session/auth — call escalates to operator)
🔴 Page is behind WAF or CAPTCHA (Browser Rendering does not bypass these)
🔴 PDF or binary file URL — use direct download
🔴 Internal Das Experten resources already accessible via API (Gmail, Drive, etc.)

## Two actions

### `screenshot`
Open URL in headless Chrome → capture full-page PNG → upload to R2 → return public URL.

Use for: visual archive, before/after comparison, marketplace listing snapshots, blogger profile captures.

### `extract_text`
Open URL → render JS fully → return clean visible text (innerText of body with HTML stripped).

Use for: scraping prices, descriptions, reviews, blog posts, news articles, anything where you want the *rendered* text not raw HTML.

## How to call

See [`actions.md`](./actions.md) for full schema. Quick form:

```bash
curl -X POST https://browser-run-bridge.dasexperten.workers.dev/ \
  -H "Authorization: Bearer $BRIDGE_SECRET_BROWSER_RUN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "screenshot",
    "url": "https://example.com",
    "options": { "viewport": { "width": 1280, "height": 800 }, "wait_ms": 0 }
  }'
```

`$BRIDGE_SECRET_BROWSER_RUN` lives in `Das-Secrets.md`. Never inline the literal value into any committed file or external system.

## Output handling

- `screenshot` → returns public R2 URL. Pass that URL onward to whatever consumer needs the image (presentation, email attachment, archive index).
- `extract_text` → returns plain text. Pass to downstream skill (price-monitor, review-master, content-analyzer) for further processing.

## Cost discipline

🟢 Free tier comfortably covers Das Experten realistic usage (hundreds of captures per day).
🟢 R2 lifecycle rule auto-deletes screenshots after 30 days — no archive bloat.
🟢 If a screenshot must be preserved beyond 30 days, copy its bytes into a different R2 bucket or Drive folder. The `browser-run-output` bucket is ephemeral by design.

## Constraints

- One URL per call. No batch action — caller orchestrates the loop.
- No retry inside the Worker. If 429 or 502 returned, caller waits and retries.
- `wait_ms` capped at 10000 (10 seconds).
- Viewport capped at 3840×2160.
- No proxy / region selection — Cloudflare picks the datacenter.
- No JS evaluation, no form filling, no clicks (yet — candidates for future actions).

## Cross-references

- **Worker source:** `workers/browser-run-bridge/` in this repo
- **Worker docs:** `workers/browser-run-bridge/README.md`, `ACTIONS.md`, `OPERATIONS.md`
- **Sibling tools:** `my-tools/emailer/`, `my-tools/telegramer/`
- **Secrets:** `Das-Secrets.md` (Aram-maintained)
