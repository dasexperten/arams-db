# browser-run-bridge actions

This file is the long-form action contract for the deployed `browser-run-bridge` Worker. It is based on `src/index.js`, live Cloudflare Worker settings, and live smoke tests performed on `2026-05-07`.

## Dispatcher contract shared by all actions

Only `POST /` is accepted. The caller must send JSON and must authenticate with:

```http
Authorization: Bearer $BRIDGE_SECRET
Content-Type: application/json
```

The Worker parses `request.json()` before dispatch. Invalid JSON fails before action validation.

Shared request envelope:

```yaml
type: object
required:
  - action
  - url
properties:
  action:
    type: string
    enum:
      - screenshot
      - extract_text
  url:
    type: string
    description: Must parse as a URL with protocol http: or https:.
  options:
    type: object
    required: []
    properties:
      viewport:
        type: object
        required: []
        properties:
          width:
            type: number
            default: 1280
            minimum_exclusive: 0
            maximum: 3840
            description: Coerced with Number(), floored, and ignored if invalid.
          height:
            type: number
            default: 800
            minimum_exclusive: 0
            maximum: 2160
            description: Coerced with Number(), floored, and ignored if invalid.
      wait_ms:
        type: number
        default: 0
        minimum_exclusive: 0
        maximum_after_sanitization: 10000
        description: Coerced with Number(), floored, capped at 10000, and ignored if invalid.
additionalProperties: true
```

Shared validation behavior:

| Condition | Response |
|---|---|
| Method is not `POST` | `405 {"error":"method_not_allowed"}` |
| `Authorization` is not exactly `Bearer ${env.BRIDGE_SECRET}` | `401 {"error":"unauthorized"}` |
| JSON parsing throws | `400 {"error":"bad_request","detail":"invalid_json"}` |
| `action` missing | `400 {"error":"bad_request","detail":"missing_action"}` |
| `url` missing | `400 {"error":"bad_request","detail":"missing_url"}` |
| `url` is not `http:` or `https:` | `400 {"error":"bad_request","detail":"invalid_url"}` |
| action is unknown | `400 {"error":"bad_request","detail":"unknown_action:<action>"}` |

`<action>` above describes the source-code string interpolation. The live smoke-test body for `foo` was `{"error":"bad_request","detail":"unknown_action:foo"}`.

## Action: `screenshot`

### Purpose

Render a URL using Cloudflare Browser Run Quick Actions, capture a full-page PNG, store the PNG in the `browser-run-output` R2 bucket through binding `OUTPUT`, and return the public R2 URL.

### Request schema

```yaml
type: object
required:
  - action
  - url
properties:
  action:
    type: string
    enum: [screenshot]
  url:
    type: string
    format: uri
    pattern: ^https?://
  options:
    type: object
    properties:
      viewport:
        type: object
        properties:
          width:
            type: number
            default: 1280
            minimum_exclusive: 0
            maximum: 3840
          height:
            type: number
            default: 800
            minimum_exclusive: 0
            maximum: 2160
      wait_ms:
        type: number
        default: 0
        maximum_after_sanitization: 10000
additionalProperties: true
```

Browser Run payload built by the Worker:

```json
{"url":"$REQUEST_URL","viewport":{"width":1280,"height":800},"screenshotOptions":{"fullPage":true,"type":"png"}}
```

If `wait_ms > 0`, the Worker adds:

```json
{"waitForTimeout":1000}
```

### Success response schema

```yaml
type: object
required:
  - ok
  - action
  - url
  - key
  - size_bytes
  - browser_ms_used
properties:
  ok:
    type: boolean
    const: true
  action:
    type: string
    const: screenshot
  url:
    type: string
    description: Public R2 URL built from PUBLIC_R2_BASE plus key.
  key:
    type: string
    pattern: ^screenshot/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f]{8}-[0-9]+\.png$
  size_bytes:
    type: integer
    minimum: 0
  browser_ms_used:
    type: integer
    minimum: 0
```

Live success response captured on `2026-05-07`:

```json
{"ok":true,"action":"screenshot","url":"https://pub-6cf4bb0064824477882515a6afa6e43f.r2.dev/screenshot/2026-05-07/25b884ce-1778161624333.png","key":"screenshot/2026-05-07/25b884ce-1778161624333.png","size_bytes":19303,"browser_ms_used":335}
```

### Internal flow

1. Reject non-`POST` requests.
2. Compare `Authorization` to `Bearer ${env.BRIDGE_SECRET}`.
3. Parse JSON.
4. Validate `action`, `url`, and protocol.
5. Sanitize `options` into `viewport` and `wait_ms`.
6. Build Browser Run `/screenshot` payload with `fullPage: true` and PNG type.
7. Add `waitForTimeout` only when sanitized `wait_ms` is greater than zero.
8. `POST` to `https://api.cloudflare.com/client/v4/accounts/081ddb85cb399ad62a70210328d744fc/browser-rendering/screenshot` with `Authorization: Bearer ${env.CF_BROWSER_TOKEN}`.
9. Read `X-Browser-Ms-Used`; if absent or not parseable, fall back to elapsed Worker wall-clock time.
10. If Browser Run response is not OK, throw `browser_render_<status>: <first 300 chars of response body>`.
11. Read PNG bytes into a `Uint8Array`.
12. Generate R2 key as `screenshot/YYYY-MM-DD/<simpleHash(url)>-<Date.now()>.png`.
13. Store bytes in `env.OUTPUT.put(key, png, { httpMetadata: { contentType: "image/png" } })`.
14. Return JSON with `ok`, `action`, public URL, key, size, and browser milliseconds.

### Edge cases

| Case | Observed or source-defined behavior |
|---|---|
| Empty page | Not live-tested. Source behavior would still store the PNG returned by Browser Run and return its byte length. |
| Redirect chains | Not live-tested. Source returns the original request URL only indirectly through the R2 hash; it does not expose final URL. |
| Slow-loading SPA | Caller can set `options.wait_ms`, but the Worker caps it at `10000`. There is no selector wait or network-idle option. |
| Oversized screenshot | Not live-tested. Source has no explicit size cap before `OUTPUT.put`; failures would be returned as `500 internal` unless the message matches browser failure regex. |
| Browser Run rate limit | Observed: first screenshot attempt returned `429 {"error":"rate_limited","detail":"browser_render_429: {\"success\":false,\"errors\":[{\"code\":2001,\"message\":\"Rate limit exceeded\"}]}"}`. Retrying after 60 seconds succeeded. |
| Network or DNS failure | Use `extract_text` 502 example below; screenshot uses the same catch classifier. |
| R2 write failure | Not live-tested because it would require changing live infrastructure or exhausting a live limit. Source catch would normally return `500 internal` unless the thrown message matches browser-related regex. |

## Action: `extract_text`

### Purpose

Render a URL using Cloudflare Browser Run `/content`, convert the returned HTML to text using the Worker's regex-based stripper, and return the text directly. This action does not write to R2.

### Request schema

```yaml
type: object
required:
  - action
  - url
properties:
  action:
    type: string
    enum: [extract_text]
  url:
    type: string
    format: uri
    pattern: ^https?://
  options:
    type: object
    properties:
      viewport:
        type: object
        properties:
          width:
            type: number
            default: 1280
            minimum_exclusive: 0
            maximum: 3840
          height:
            type: number
            default: 800
            minimum_exclusive: 0
            maximum: 2160
      wait_ms:
        type: number
        default: 0
        maximum_after_sanitization: 10000
additionalProperties: true
```

Browser Run payload built by the Worker:

```json
{"url":"$REQUEST_URL","viewport":{"width":1280,"height":800}}
```

If `wait_ms > 0`, the Worker adds:

```json
{"waitForTimeout":1000}
```

### Success response schema

```yaml
type: object
required:
  - ok
  - action
  - url
  - text
  - char_count
  - browser_ms_used
properties:
  ok:
    type: boolean
    const: true
  action:
    type: string
    const: extract_text
  url:
    type: string
    description: Original requested URL.
  text:
    type: string
    description: HTML after script/style removal, simple block line breaks, tag stripping, limited entity decoding, whitespace collapse, and trim.
  char_count:
    type: integer
    minimum: 0
    description: JavaScript string length of text.
  browser_ms_used:
    type: integer
    minimum: 0
```

Live success response captured on `2026-05-07`:

```json
{"ok":true,"action":"extract_text","url":"https://example.com","text":"Example Domain Example Domain\n This domain is for use in documentation examples without needing permission. Avoid use in operations.\n Learn more","char_count":144,"browser_ms_used":191}
```

### Internal flow

1. Reject non-`POST` requests.
2. Compare `Authorization` to `Bearer ${env.BRIDGE_SECRET}`.
3. Parse JSON.
4. Validate `action`, `url`, and protocol.
5. Sanitize `options` into `viewport` and `wait_ms`.
6. Build Browser Run `/content` payload.
7. Add `waitForTimeout` only when sanitized `wait_ms` is greater than zero.
8. `POST` to `https://api.cloudflare.com/client/v4/accounts/081ddb85cb399ad62a70210328d744fc/browser-rendering/content` with `Authorization: Bearer ${env.CF_BROWSER_TOKEN}`.
9. Read `X-Browser-Ms-Used`; if absent or not parseable, fall back to elapsed Worker wall-clock time.
10. If Browser Run response is not OK, throw `browser_render_<status>: <first 300 chars of response body>`.
11. If `Content-Type` includes `application/json`, parse JSON and require an envelope where `success` is truthy and `result` is a string.
12. Otherwise read the response as raw text.
13. Convert HTML to text with `htmlToText()`.
14. Return JSON with `ok`, `action`, original URL, text, character count, and browser milliseconds.

### `htmlToText()` behavior

The stripper performs these transformations in order:

1. Replace `<script>...</script>` blocks with a space.
2. Replace `<style>...</style>` blocks with a space.
3. Convert `<br>` tags to newline.
4. Convert closing `p`, `div`, `li`, `tr`, `h1` through `h6`, `article`, and `section` tags to newline.
5. Replace all remaining tags with a space.
6. Decode only `&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`, and `&#39;`.
7. Collapse spaces and tabs to one space.
8. Collapse three or more newlines to two newlines.
9. Trim leading and trailing whitespace.

This is not equivalent to browser `innerText`, Readability, Markdown extraction, or semantic content extraction.

### Edge cases

| Case | Observed or source-defined behavior |
|---|---|
| Empty page | Not live-tested. Source behavior would return `text: ""` and `char_count: 0` if Browser Run returns an empty HTML string. |
| Redirect chains | Not live-tested. Source returns the original requested URL, not the final URL after redirects. |
| Slow-loading SPA | Caller can set `options.wait_ms`, capped at `10000`; there is no selector wait, network-idle wait, or custom evaluation. |
| Oversized response | Not live-tested. Source has no explicit text-size cap and returns the full stripped string unless Worker/runtime limits are hit. |
| Browser Run JSON envelope mismatch | Source throws `browser_render_envelope: <first 300 chars>`. Because that message contains `browser` and `render`, the response is classified as `502 browser_failed`. |
| Network or DNS failure | Observed with `.invalid` host: `502 {"error":"browser_failed","detail":"browser_render_422: {\"success\":false,\"errors\":[{\"code\":5006,\"message\":\"Network connection closed.\",\"detail\":\"Can also happen due to failure to resolve DNS.\"}]}"}`. |
| HTML entities outside the hard-coded list | Source leaves them as-is. |
| Target page status code | Source does not return target HTTP status or headers. Browser Run behavior for target status was not separately probed. |

## Error classifier

The catch block classifies thrown errors by message text:

```text
/rate.?limit|429/i       -> 429 rate_limited
/browser|navigation|timeout|net::|render/i -> 502 browser_failed
anything else            -> 500 internal
```

Because classification is regex-based, an internal failure whose message contains `browser`, `navigation`, `timeout`, `net::`, or `render` can be returned as `502` even if the root cause is not the remote browser.