# browser-run — Setup Notes

Where the Worker lives, how to authenticate to it, how to maintain the secret.

---

## Worker location

| Property | Value |
|---|---|
| Cloudflare account | `081ddb85cb399ad62a70210328d744fc` |
| Worker name | `browser-run-bridge` |
| Public URL | `https://browser-run-bridge.dasexperten.workers.dev` |
| Source code | `workers/browser-run-bridge/` (this repo, branch `main`) |

---

## Authentication

Caller must send:

```
Authorization: Bearer <BRIDGE_SECRET_BROWSER_RUN>
```

The literal value lives in **`Das-Secrets.md`** (Aram-maintained registry, never committed). Skills and tools reference it by name, never by literal value.

Wrong or missing secret → Worker returns HTTP 401 with `{"error":"unauthorized"}`.

---

## Worker secrets (server side)

The Worker holds two secrets internally (set as Cloudflare Worker secrets, not visible from outside):

| Secret name | Purpose |
|---|---|
| `BRIDGE_SECRET` | Auth token callers must present (matches `BRIDGE_SECRET_BROWSER_RUN` in Das-Secrets) |
| `CF_BROWSER_TOKEN` | Cloudflare API token with `Browser Rendering:Edit` scope — Worker uses this to call Browser Rendering REST internally |

These secrets are configured at deploy time via Cloudflare REST and never appear in source code.

---

## Bindings

Configured in `workers/browser-run-bridge/wrangler.toml` and at deploy:

| Binding | Type | Target |
|---|---|---|
| `OUTPUT` | R2 bucket | `browser-run-output` |
| `BRIDGE_SECRET` | secret | (text — auth token) |
| `CF_BROWSER_TOKEN` | secret | (text — Cloudflare API token) |

---

## How to rotate the bridge secret

This is operator-side work. Aram performs it; Claude assists when asked.

1. Generate new random secret (32-byte hex).
2. Update Worker secret `BRIDGE_SECRET` via Cloudflare REST.
3. Update `Das-Secrets.md` entry `BRIDGE_SECRET_BROWSER_RUN`.
4. Restart any long-running consumer that caches the secret (none currently).

---

## How to read Worker logs live

```bash
wrangler tail browser-run-bridge
```

Or via Cloudflare dashboard → Workers → `browser-run-bridge` → Logs.

---

## R2 storage maintenance

Bucket `browser-run-output` has lifecycle rule `delete-after-30-days` (2,592,000 seconds). All objects are deleted automatically after 30 days regardless of access.

If a screenshot must be preserved beyond 30 days:
- Copy the PNG bytes to a different bucket (e.g. into `emailer-attachments` under a clear key)
- Or download and store in Drive

The `browser-run-output` bucket is **ephemeral by design** — never store reference data here.

---

## Health check

Three quick curls to confirm Worker is alive:

```bash
# 1. Wrong method → expect 405
curl -s -o /dev/null -w "%{http_code}\n" \
  https://browser-run-bridge.dasexperten.workers.dev/

# 2. Wrong auth → expect 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Authorization: Bearer wrong" \
  -H "Content-Type: application/json" \
  -d '{"action":"screenshot","url":"https://example.com"}' \
  https://browser-run-bridge.dasexperten.workers.dev/

# 3. Live extract_text → expect 200 with text field
curl -s -X POST \
  -H "Authorization: Bearer $BRIDGE_SECRET_BROWSER_RUN" \
  -H "Content-Type: application/json" \
  -d '{"action":"extract_text","url":"https://example.com"}' \
  https://browser-run-bridge.dasexperten.workers.dev/
```

---

## Cross-references

- Worker source & deploy notes: `workers/browser-run-bridge/`
- Worker operations playbook: `workers/browser-run-bridge/OPERATIONS.md`
- Module client docs: `my-tools/browser-run/SKILL.md`, `actions.md`
- Secrets registry: `Das-Secrets.md` (Aram-maintained)
