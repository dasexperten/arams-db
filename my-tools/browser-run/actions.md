# browser-run — Actions Reference

Two actions exposed by the `browser-run-bridge` Worker. Both are `POST /` with a JSON body and `Authorization: Bearer $BRIDGE_SECRET_BROWSER_RUN`.

---

## Action: `screenshot`

Open URL in headless Chrome, render fully, capture full-page PNG, upload to R2, return public URL.

### Request

```json
{
  "action": "screenshot",
  "url": "https://example.com",
  "options": {
    "viewport": { "width": 1280, "height": 800 },
    "wait_ms": 0
  }
}
```

| Field | Type | Required | Default | Range |
|---|---|---|---|---|
| `action` | string | ✅ | — | must be `"screenshot"` |
| `url` | string | ✅ | — | valid `http://` or `https://` URL |
| `options.viewport.width` | number | ⚪ | 1280 | 1–3840 |
| `options.viewport.height` | number | ⚪ | 800 | 1–2160 |
| `options.wait_ms` | number | ⚪ | 0 | 0–10000 (post-load delay) |

### Success response (HTTP 200)

```json
{
  "ok": true,
  "action": "screenshot",
  "url": "https://pub-6cf4bb0064824477882515a6afa6e43f.r2.dev/screenshot/2026-05-07/abc123-1715000000.png",
  "key": "screenshot/2026-05-07/abc123-1715000000.png",
  "size_bytes": 19303,
  "browser_ms_used": 191
}
```

| Field | Meaning |
|---|---|
| `ok` | Always `true` on success |
| `action` | Echo of requested action |
| `url` | Public R2 URL — directly viewable in browser, share with anyone |
| `key` | R2 object key (for direct R2 manipulation if needed) |
| `size_bytes` | PNG file size |
| `browser_ms_used` | Cloudflare-billed Browser Rendering time for this call |

### R2 storage layout

`screenshot/YYYY-MM-DD/<8-hex-hash-of-url>-<unix-ms-timestamp>.png`

- Folder per day for easy listing/cleanup.
- Hash of URL + timestamp ensures uniqueness even for repeated captures of the same page.
- Lifecycle rule `delete-after-30-days` removes objects older than 30 days automatically.

### Edge cases

| Case | Behavior |
|---|---|
| Page returns 404 | Browser still renders the 404 page — screenshot taken normally |
| Page redirect chain | Followed automatically up to 30s timeout |
| Page never finishes loading (`networkidle0` never reached) | 30s timeout → error 502 `browser_failed: timeout` |
| Page taller than 100k pixels | Cloudflare caps full-page height — top portion captured |
| Cookie banner overlay | Captured as-is; no auto-dismiss |
| Login wall | Login page captured — no auth bypass |

---

## Action: `extract_text`

Open URL in headless Chrome, render fully (including JS), strip all HTML and return clean visible text.

### Request

```json
{
  "action": "extract_text",
  "url": "https://example.com",
  "options": {
    "viewport": { "width": 1280, "height": 800 },
    "wait_ms": 0
  }
}
```

Same field shape as `screenshot`. Viewport affects responsive layout (mobile vs desktop text); `wait_ms` is useful when content loads after initial render.

### Success response (HTTP 200)

```json
{
  "ok": true,
  "action": "extract_text",
  "url": "https://example.com",
  "text": "Example Domain Example Domain\n This domain is for use in documentation examples without needing permission. Avoid use in operations.\n Learn more",
  "char_count": 144,
  "browser_ms_used": 117
}
```

| Field | Meaning |
|---|---|
| `text` | Cleaned visible text — `<script>`, `<style>` removed, block tags converted to newlines, entities decoded, whitespace collapsed |
| `char_count` | Length of `text` |
| `browser_ms_used` | Cloudflare-billed Browser Rendering time |

### Cleaning rules applied

1. `<script>...</script>` and `<style>...</style>` blocks deleted entirely
2. `<br>` and closing block tags (`</p>`, `</div>`, `</li>`, `</tr>`, `</h1-6>`, `</article>`, `</section>`) → newline
3. All remaining tags stripped
4. Common entities decoded: `&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`
5. Multiple spaces/tabs collapsed; max 2 consecutive newlines

### When to prefer `extract_text` over plain `fetch`

✅ Use `extract_text` when:
- Page is a SPA (React/Vue/Angular) — content rendered by JS after page load
- Content appears via XHR/fetch after initial HTML
- Page uses Cloudflare bot challenge (Browser Rendering passes its own checks)
- You want innerText, not raw HTML

🔴 Don't use when:
- Plain HTTP `fetch` already returns the data (server-rendered HTML)
- You need structured data (JSON, RSS) — use `fetch` directly
- Page is behind login

---

## Errors (both actions)

| HTTP | Body | Cause | What to do |
|---|---|---|---|
| 401 | `{"error":"unauthorized"}` | Wrong/missing `Authorization` header | Check secret value |
| 400 | `{"error":"bad_request","detail":"missing_action"}` | No `action` field | Fix request |
| 400 | `{"error":"bad_request","detail":"missing_url"}` | No `url` field | Fix request |
| 400 | `{"error":"bad_request","detail":"invalid_url"}` | URL not http/https or malformed | Fix request |
| 400 | `{"error":"bad_request","detail":"unknown_action:<x>"}` | Action not `screenshot` or `extract_text` | Fix request |
| 405 | `{"error":"method_not_allowed"}` | Non-POST request | Use POST |
| 429 | `{"error":"rate_limited","detail":"..."}` | Cloudflare Browser Rendering rate limit | Wait 10–60s, retry |
| 502 | `{"error":"browser_failed","detail":"..."}` | Browser navigation/timeout/crash | Retry once, then escalate |
| 500 | `{"error":"internal","detail":"..."}` | Worker code error or R2 failure | Check Worker logs (`wrangler tail`) |

---

## Cost tracking

Every successful response carries `browser_ms_used`. Aggregate across calls to monitor monthly Browser Rendering consumption. Cloudflare Workers Paid plan ($5/mo) includes generous Browser Rendering allowance — track to know when paid-tier limits approach.

---

## Future actions (candidates)

Not yet implemented. Add as needs arise:

- `pdf` — render page as PDF
- `extract_links` — return all `<a href>` from page
- `wait_for_selector` — wait until specific DOM element appears before capture
- `evaluate_js` — run custom JS in page context, return result
- `region_select` — choose Cloudflare datacenter region
- `screenshot_archive` — same as `screenshot` but lands in archive/ prefix exempt from 30-day delete
