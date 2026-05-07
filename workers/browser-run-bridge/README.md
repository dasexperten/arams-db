# browser-run-bridge

Cloudflare Browser Run gateway for Das Experten skills. Action-based dispatcher.

**URL:** `https://browser-run-bridge.dasexperten.workers.dev`
**Auth:** `Authorization: Bearer <BRIDGE_SECRET>`
**Storage:** R2 bucket `browser-run-output` (public domain `pub-6cf4bb0064824477882515a6afa6e43f.r2.dev`)

## Actions

### `screenshot`

Open URL in headless Chrome, capture full-page PNG, upload to R2, return public URL.

```bash
curl -X POST https://browser-run-bridge.dasexperten.workers.dev/ \
  -H "Authorization: Bearer $BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "screenshot",
    "url": "https://example.com",
    "options": { "viewport": { "width": 1280, "height": 800 }, "wait_ms": 0 }
  }'
```

Response:
```json
{
  "ok": true,
  "action": "screenshot",
  "url": "https://pub-6cf4bb0064824477882515a6afa6e43f.r2.dev/screenshot/2026-05-07/abc123-1715000000.png",
  "key": "screenshot/2026-05-07/abc123-1715000000.png",
  "size_bytes": 45821,
  "browser_ms_used": 2340
}
```

### `extract_text`

Open URL, render fully, return visible text (innerText of body).

```bash
curl -X POST https://browser-run-bridge.dasexperten.workers.dev/ \
  -H "Authorization: Bearer $BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "extract_text",
    "url": "https://example.com"
  }'
```

Response:
```json
{
  "ok": true,
  "action": "extract_text",
  "url": "https://example.com",
  "text": "Example Domain\n\nThis domain is for use...",
  "char_count": 184,
  "browser_ms_used": 1820
}
```

## Options (both actions)

| Field | Type | Default | Limit |
|---|---|---|---|
| `viewport.width` | number | 1280 | 1–3840 |
| `viewport.height` | number | 800 | 1–2160 |
| `wait_ms` | number | 0 | 0–10000 |

## Errors

| Status | Body | Cause |
|---|---|---|
| 401 | `{"error":"unauthorized"}` | Wrong or missing `Authorization` header |
| 400 | `{"error":"bad_request","detail":"..."}` | Invalid JSON, missing action/url, unknown action |
| 405 | `{"error":"method_not_allowed"}` | Non-POST request |
| 500 | `{"error":"internal","detail":"..."}` | Internal Worker failure |
| 502 | `{"error":"browser_failed","detail":"..."}` | Browser Run navigation/timeout failure |

## Cost tracking

Every successful response includes `browser_ms_used` — milliseconds of Browser Run time billed by Cloudflare. Aggregate this for cost monitoring (10 included hours/month on Workers Paid, then $0.09/hour).

## Deployed

- **Cloudflare account:** 081ddb85cb399ad62a70210328d744fc
- **R2 bucket:** browser-run-output
- **Bindings:** `BROWSER` (Browser Run), `OUTPUT` (R2), `BRIDGE_SECRET` (env secret)
