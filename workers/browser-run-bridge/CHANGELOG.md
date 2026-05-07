# Changelog

All notable changes to `browser-run-bridge` documentation are recorded here.

This project uses the Keep a Changelog format. Version `1.0.0` is the documentation baseline for the already-deployed Worker inspected on `2026-05-07`; no Worker source code was changed in this entry.

## [1.0.0] - 2026-05-07

### Added

- Documented the deployed `browser-run-bridge` Worker, public workers.dev URL, Cloudflare account ID, live compatibility date, and deployment timestamp.
- Documented the live action dispatcher contract for `screenshot` and `extract_text`.
- Documented the `OUTPUT`, `BRIDGE_SECRET`, and `CF_BROWSER_TOKEN` live bindings returned by Cloudflare Worker settings.
- Documented R2 bucket `browser-run-output`, managed public domain `pub-6cf4bb0064824477882515a6afa6e43f.r2.dev`, and the enabled `delete-after-30-days` lifecycle rule with `maxAge` `2592000` seconds.
- Added live smoke-test examples for method rejection, authentication rejection, unknown action validation, text extraction, screenshot storage, R2 public PNG verification, Browser Run rate limiting, and browser/DNS failure classification.
- Added operations guidance for REST metadata inspection, R2 inspection, secret rotation, tail logs, REST multipart redeploy, temporary disable options, and common failure modes.

### Verified

- `GET /` returned `405` with `{"error":"method_not_allowed"}`.
- `POST /` with wrong bearer token returned `401` with `{"error":"unauthorized"}`.
- `POST /` with `{"action":"foo","url":"https://example.com"}` returned `400` with `{"error":"bad_request","detail":"unknown_action:foo"}`.
- `POST /` with `extract_text` for `https://example.com` returned `200`, `char_count` `144`, and `browser_ms_used` `191` in the final captured smoke-test run.
- `POST /` with `screenshot` for `https://example.com` first returned `429` Browser Run code `2001`, then succeeded after a 60-second retry with `browser_ms_used` `335`; the returned R2 object was reachable and began with PNG signature `89504e47`.