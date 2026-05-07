---
name: browser-run
description: |
  Das Experten universal browser-based scraping and rendering gate. Routes calls to the browser-run-bridge Cloudflare Worker, which uses Cloudflare Browser Rendering REST API to open URLs in headless Chrome on Cloudflare's infrastructure. Use this skill whenever any task needs to capture a screenshot of a public web page, or extract clean visible text from a JavaScript-rendered page that plain HTTP fetch cannot read, or systematically scrape data from public web sources without using Apify or paid scraping services. Triggers immediately on phrases including "screenshot a page", "сделай скриншот сайта", "захвати страницу", "render this URL", "snapshot the page", "scrape via browser", "headless chrome", "extract text from", "pull the visible text", "render JS-heavy site", "capture web page", "monitor page changes", "найди компании в", "find companies in", "соберём контакты", "scrape competitor data", "research distributors", "find clinics", "find dentists", "find buyers", "discover B2B", "B2B research", "scrape без Apify", "browser scraping", or any inter-skill call via [[GATE: browser-run]]. Fire immediately on trigger — no confirmation needed for read-only browser operations. When the task requires choosing among public data sources by region, category, or type (registries, maps, marketplaces, social), consult the data-sources.md reference file before choosing a URL.
---

# browser-run — Cloudflare Browser Rendering gate

Universal Das Experten skill for browser-based page capture and structured public-web data collection. Single entry point to Cloudflare Browser Rendering REST API via the deployed `browser-run-bridge` Worker.

---

## Two actions exposed

🔵 **`screenshot`** — open URL in headless Chrome → render fully → upload PNG to R2 → return public URL + cost-tracking ms.

🔵 **`extract_text`** — open URL → render JS → return clean visible text (innerText of body, HTML stripped, entities decoded, whitespace collapsed).

For full schemas, request/response examples, error tables, and edge cases, see [`actions.md`](./actions.md).

---

## Trigger discipline

🟢 **Fire immediately when triggered** — read-only browser operations need no confirmation. Just go.

🟢 **One URL per call.** No batch action. Caller orchestrates the loop.

🟢 **Min 11 second pause between calls** — Cloudflare Browser Rendering free tier allows 1 request per 10 seconds. Going faster returns 429.

🟢 **Mobile viewport first for social** — when scraping VK, Twitter, Facebook, use `viewport: {width: 390, height: 844}` and the mobile subdomain (`m.vk.com`, `mobile.twitter.com`, etc.). Mobile versions skip login walls more often.

🟢 **DDG `site:` first for discovery** — before fetching URLs blindly, use DuckDuckGo `site:<domain>` queries to confirm the target indexes the entity. Saves wasted fetches.

🔴 **Do NOT fire when:** static HTML page where plain `fetch` works (faster, free), page requires login/cookies (skill has no session), page is behind WAF/CAPTCHA, internal Das Experten resources already accessible via API.

---

## Source-selection gate (lazy-load protocol)

When the task requires choosing **which public web source** to scrape — by region, country, language, vertical, or data type — **read the reference file** [`references/data-sources.md`](./references/data-sources.md) before forming the URL.

### When to read `data-sources.md`

🔵 Operator names a country, region, or language ("найди в Дубае", "Юго-Восточная Азия", "African distributors", "немецкие сети")
🔵 Operator names a vertical ("стоматологи", "косметические дистрибьюторы", "блогеры", "оптовики", "клиники")
🔵 Operator asks to discover entities ("найди 20 …", "собери список …", "find companies that …")
🔵 Inter-skill gate `[[GATE: browser-run?region=<X>&category=<Y>]]` from sales-hunter, ugc-master, contacts, legalizer, or any skill needing structured public data
🔵 Operator says "use only Browser Run", "no Apify", "free sources only" — implies systematic source discovery

### When NOT to read it

🔴 Operator gives a specific URL ("сделай скрин этой ссылки", "extract text from this page")
🔴 Source is already obvious from prior turn (continuation of an active scrape)
🔴 Task is one-off `screenshot` of a known site

### What to do after reading

1. Identify the **region** + **category** in the task
2. From `data-sources.md`, pick the **top 1-3 sources** for that combination, ordered by trust: official registry → vertical aggregator → maps → general search → social
3. Form the URL pattern from the catalog (each source entry has a working URL pattern)
4. Execute the call(s) — respect 11s pause
5. If the first source returns sparse or blocked data, fall through to the next listed alternative
6. Report which sources were used and which yielded data, so the operator sees the trail

---

## Output handling

- `screenshot` → public R2 URL. Forward the URL to whatever consumer needs the image (presentation, email attachment, archive index).
- `extract_text` → plain text. Hand off to downstream skill (price-monitor, review-master, sales-hunter, ugc-master, legalizer) for further processing.

---

## Cost discipline

🟢 Free tier comfortably covers Das Experten realistic usage (hundreds of captures per day on Workers Paid plan).
🟢 R2 lifecycle rule auto-deletes screenshots after 30 days — no archive bloat.
🟢 If a screenshot must outlive 30 days, copy bytes to a different R2 bucket or Drive folder before expiry. The `browser-run-output` bucket is **ephemeral by design** — never store reference data here.

---

## Hard constraints

- One URL per call. No internal batching. No retries inside the Worker.
- `wait_ms` capped at 10000 (10 seconds).
- Viewport capped at 3840×2160.
- No proxy or region selection — Cloudflare picks the datacenter.
- No JS evaluation, no form filling, no clicks, no scroll. Future actions may add these.
- No persistent session, no cookie carry-over between calls. Each call is fresh.

If a task fundamentally requires capabilities outside this list (login session, multi-step navigation, scroll-and-load), the skill **escalates** rather than fabricates: report the limitation, propose extending Browser Run with a new action, or propose Apify if an actor exists.

**Never invent data when scraping returns empty.** Empty is honest. Fabricated contacts are a brand risk.

---

## Cross-references

- **Reference catalog of public sources:** [`references/data-sources.md`](./references/data-sources.md) (lazy-load — only read when source-selection gate fires)
- **Action schemas:** [`actions.md`](./actions.md)
- **Setup, secrets, health checks:** [`SETUP_NOTES.md`](./SETUP_NOTES.md)
- **Worker source code & ops docs:** `../../workers/browser-run-bridge/`
- **Sibling tools:** `../emailer/`, `../telegramer/`
- **Secrets registry:** `Das-Secrets.md` (operator-maintained)
