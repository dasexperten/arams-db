# browser-run-bridge operations playbook

This playbook describes how to inspect, debug, rotate secrets for, and redeploy the already-live `browser-run-bridge` Worker. The live system was inspected on `2026-05-07`.

Use variables in shells and terminals. Never paste literal token or secret values into committed files.

```bash
export ACCOUNT_ID=081ddb85cb399ad62a70210328d744fc
export WORKER_NAME=browser-run-bridge
export BUCKET_NAME=browser-run-output
export CF_API_TOKEN=$CF_API_TOKEN
export BRIDGE_SECRET=$BRIDGE_SECRET
export CF_BROWSER_TOKEN=$CF_BROWSER_TOKEN
```

## Read live Worker metadata via REST

Fetch the deployed module bundle:

```bash
curl -sS \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME" \
  -H "Authorization: Bearer $CF_API_TOKEN"
```

Observed response content type was `multipart/form-data` with a module part named `index.js`.

Fetch live settings, including compatibility date and bindings:

```bash
curl -sS \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME/settings" \
  -H "Authorization: Bearer $CF_API_TOKEN"
```

Observed live settings:

```json
{"compatibility_date":"2026-05-01","compatibility_flags":[],"usage_model":"standard","logpush":false,"bindings":[{"name":"BRIDGE_SECRET","type":"secret_text"},{"name":"CF_BROWSER_TOKEN","type":"secret_text"},{"bucket_name":"browser-run-output","name":"OUTPUT","type":"r2_bucket"}]}
```

Fetch the workers.dev subdomain setting:

```bash
curl -sS \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME/subdomain" \
  -H "Authorization: Bearer $CF_API_TOKEN"
```

Observed result:

```json
{"enabled":true,"previews_enabled":true}
```

Fetch production environment metadata:

```bash
curl -sS \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/services/$WORKER_NAME/environments/production" \
  -H "Authorization: Bearer $CF_API_TOKEN"
```

Observed deployment metadata:

```json
{"environment":"production","created_on":"2026-05-07T10:31:47.525Z","modified_on":"2026-05-07T10:37:09.764678Z","script":{"id":"browser-run-bridge","tag":"3e2983c3c3124cab88e5b0b0557c9241","last_deployed_from":"api","compatibility_date":"2026-05-01","usage_model":"standard","handlers":["fetch"],"has_modules":true,"has_assets":false}}
```

## Read R2 bucket state via REST

Fetch bucket metadata:

```bash
curl -sS \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/$BUCKET_NAME" \
  -H "Authorization: Bearer $CF_API_TOKEN"
```

Observed result:

```json
{"name":"browser-run-output","creation_date":"2026-05-07T10:27:24.871Z","location":"ENAM","storage_class":"Standard","jurisdiction":"default"}
```

Fetch lifecycle rules:

```bash
curl -sS \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/$BUCKET_NAME/lifecycle" \
  -H "Authorization: Bearer $CF_API_TOKEN"
```

Observed lifecycle result:

```json
{"rules":[{"id":"delete-after-30-days","enabled":true,"conditions":{"prefix":""},"deleteObjectsTransition":{"condition":{"type":"Age","maxAge":2592000}}}]}
```

Fetch managed public-domain status:

```bash
curl -sS \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/$BUCKET_NAME/domains/managed" \
  -H "Authorization: Bearer $CF_API_TOKEN"
```

Observed result:

```json
{"enabled":true,"bucketId":"6cf4bb0064824477882515a6afa6e43f","domain":"pub-6cf4bb0064824477882515a6afa6e43f.r2.dev"}
```

## Rotate `BRIDGE_SECRET`

Rotation is a write operation. Do it deliberately, announce the cutover window to callers, and never store the literal value in this repository.

1. Generate a new high-entropy secret outside the repo.
2. Update the secret in Cloudflare:

```bash
curl -sS -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME/secrets" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary '{"name":"BRIDGE_SECRET","text":"'$BRIDGE_SECRET'","type":"secret_text"}'
```

3. Update the owner-designated secret inventory, `secrets-and-tokens.md`. That file was not present in the GitHub `main` tree during inspection.
4. Update every caller to send `Authorization: Bearer $BRIDGE_SECRET` with the new value.
5. Run the successful `extract_text` smoke check below.
6. Revoke the old value from any external secret stores that kept it.

Smoke check after rotation:

```bash
curl -sS -X POST "https://browser-run-bridge.dasexperten.workers.dev/" \
  -H "Authorization: Bearer $BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  --data-binary '{"action":"extract_text","url":"https://example.com"}'
```

Expected: `200` and `{"ok":true,"action":"extract_text",...}`.

## Rotate `CF_BROWSER_TOKEN`

`CF_BROWSER_TOKEN` is the secret used by the Worker to call Cloudflare Browser Run REST endpoints. Rotate it like `BRIDGE_SECRET`, but set `name` to `CF_BROWSER_TOKEN` and use a Cloudflare API token that has the Browser Run permissions needed by this Worker.

```bash
curl -sS -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME/secrets" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary '{"name":"CF_BROWSER_TOKEN","text":"'$CF_BROWSER_TOKEN'","type":"secret_text"}'
```

After rotation, run both `extract_text` and `screenshot` checks. A bad Browser token generally surfaces as a `502 browser_failed` or `500 internal` depending on the upstream error message text.

## Inspect tail logs

Use Wrangler tail for live request logs:

```bash
wrangler tail browser-run-bridge
```

For JSON logs, if needed:

```bash
wrangler tail browser-run-bridge --format=json
```

The current source does not call `console.log`, so tail output is mainly useful for platform request/error visibility unless future code adds explicit logs.

## Redeploy through REST multipart upload

This is the same upload pattern documented in `README.md`. Run from the repository root after setting shell variables.

```bash
METADATA=$(cat <<JSON
{"main_module":"index.js","compatibility_date":"2026-05-01","bindings":[{"type":"secret_text","name":"BRIDGE_SECRET","text":"$BRIDGE_SECRET"},{"type":"secret_text","name":"CF_BROWSER_TOKEN","text":"$CF_BROWSER_TOKEN"},{"type":"r2_bucket","name":"OUTPUT","bucket_name":"browser-run-output"}]}
JSON
)

curl -sS -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -F "metadata=$METADATA;type=application/json" \
  -F "index.js=@workers/browser-run-bridge/src/index.js;type=application/javascript+module"
```

Post-deploy checks:

1. Re-fetch Worker settings and confirm bindings: `BRIDGE_SECRET`, `CF_BROWSER_TOKEN`, `OUTPUT`.
2. Re-fetch production environment metadata and confirm `modified_on` advanced.
3. Run `GET /` and expect 405.
4. Run wrong-auth `POST /` and expect 401.
5. Run authenticated `extract_text` and expect 200.
6. Run authenticated `screenshot`, then fetch the returned R2 URL and confirm PNG signature `89504e47`.

## Disable the Worker temporarily

This section describes intended operations only. No disable operation was performed during documentation.

Observed public exposure is the workers.dev subdomain: `https://browser-run-bridge.dasexperten.workers.dev`, with subdomain setting `enabled: true`. No custom route binding was observed in the metadata fetched during inspection.

Options:

- Disable or delete the workers.dev subdomain for `browser-run-bridge` in the Cloudflare dashboard/API. This removes the observed public entrypoint.
- If a future deployment adds a route, disable that route or point it away from the Worker.
- For a reversible soft stop without changing public routing, rotate `BRIDGE_SECRET` and withhold the new value from callers. This keeps the Worker reachable but makes all existing callers receive 401.

After disabling, verify with:

```bash
curl -i "https://browser-run-bridge.dasexperten.workers.dev/"
```

Expected result depends on the disable method. For a secret-only soft stop, the URL still reaches the Worker and `GET /` still returns 405.

## Common failure modes

| Symptom | Likely area | Where to look first |
|---|---|---|
| `401 {"error":"unauthorized"}` | Caller auth | Confirm exact header format `Authorization: Bearer $BRIDGE_SECRET`; rotate or resync caller secret if needed. |
| `400 invalid_json` | Caller request encoding | Check shell/client quoting. In Windows PowerShell, passing JSON to native `curl.exe` as an argv value can strip quotes; pipe JSON to `--data-binary @-` or use `Invoke-RestMethod`. |
| `400 missing_action`, `missing_url`, `invalid_url`, `unknown_action` | Caller payload | Compare payload to `ACTIONS.md`. Only `http:` and `https:` URLs are accepted. |
| `429 rate_limited` | Browser Run limit | Wait and retry. During docs, one screenshot attempt returned Browser Run code `2001` with message `Rate limit exceeded`, then succeeded after 60 seconds. Check Cloudflare Browser Run limits for the account plan. |
| `502 browser_failed` with DNS detail | Target URL or Browser Run navigation | Re-test the target in a browser, check DNS, redirects, TLS, robots/access behavior, and target availability. |
| `502 browser_failed` with timeout wording | Target performance or wait strategy | Try lower complexity pages first. The Worker has no selector wait or retry. `wait_ms` only waits after navigation and caps at 10000. |
| `500 internal` | Unexpected Worker/R2/runtime failure | Check `wrangler tail`, Worker settings, R2 bucket availability, and recent deploy changes. A safe live 500 trigger was not available during documentation. |
| Screenshot URL returns 404 after earlier success | R2 lifecycle | Objects are deleted by the enabled 30-day lifecycle rule applying to the empty prefix. |
| Screenshot action succeeds but output should be private | R2 public-domain design | The live R2 managed public domain is enabled. Change the storage/publication model before using for sensitive screenshots. |
| Local `wrangler dev` fails on secrets | Local environment | Create `.dev.vars` with `BRIDGE_SECRET=$BRIDGE_SECRET` and `CF_BROWSER_TOKEN=$CF_BROWSER_TOKEN`; do not commit it. |

## Smoke-test commands

Wrong method:

```bash
curl -sS -X GET "https://browser-run-bridge.dasexperten.workers.dev/"
```

Wrong auth:

```bash
curl -sS -X POST "https://browser-run-bridge.dasexperten.workers.dev/" \
  -H "Authorization: Bearer wrong" \
  -H "Content-Type: application/json" \
  --data-binary '{"action":"extract_text","url":"https://example.com"}'
```

Unknown action:

```bash
curl -sS -X POST "https://browser-run-bridge.dasexperten.workers.dev/" \
  -H "Authorization: Bearer $BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  --data-binary '{"action":"foo","url":"https://example.com"}'
```

Extract text:

```bash
curl -sS -X POST "https://browser-run-bridge.dasexperten.workers.dev/" \
  -H "Authorization: Bearer $BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  --data-binary '{"action":"extract_text","url":"https://example.com"}'
```

Screenshot:

```bash
curl -sS -X POST "https://browser-run-bridge.dasexperten.workers.dev/" \
  -H "Authorization: Bearer $BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  --data-binary '{"action":"screenshot","url":"https://example.com"}'
```

Verify the returned PNG URL without writing a local file:

```bash
python - <<'PY'
import os, urllib.request
url = os.environ['SCREENSHOT_URL']
with urllib.request.urlopen(url) as r:
    print(r.status, r.headers.get('content-type'), r.read(4).hex())
PY
```

Expected signature: `89504e47`.