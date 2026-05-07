# browser-run (Claude module)

Das Experten skill module that exposes the `browser-run-bridge` Cloudflare Worker to all skills. This is the **Claude-side interface** — when any skill needs to capture a screenshot or extract text from a public web page, it routes through this module.

Worker source code lives in `workers/browser-run-bridge/`. This folder is the **client-side documentation** that tells Claude how to call the Worker and what to do with the results.

---

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | Triggers, when to fire, when not to fire — read by Claude when deciding to load this skill |
| `actions.md` | Full schema reference for `screenshot` and `extract_text` actions |
| `SETUP_NOTES.md` | Where the Worker lives, how auth works, how to rotate the bridge secret |
| `README.md` | This file |

---

## At a glance

| Property | Value |
|---|---|
| **Module name** | `browser-run` |
| **Worker URL** | `https://browser-run-bridge.dasexperten.workers.dev` |
| **Worker source** | `workers/browser-run-bridge/` (same repo) |
| **Auth** | `Authorization: Bearer $BRIDGE_SECRET_BROWSER_RUN` |
| **Output storage** | R2 bucket `browser-run-output` (public domain `pub-6cf4bb0064824477882515a6afa6e43f.r2.dev`) |
| **Storage policy** | All objects auto-deleted after 30 days |
| **Actions** | `screenshot`, `extract_text` |

---

## Position in Das Experten architecture

This module is **passive delivery infrastructure** — like `emailer` and `telegramer`. It does not generate content; it only delivers and retrieves. Skills that produce content (price-monitor, sales-hunter, ugc-master, review-master, blog-writer, daily-digest, etc.) call browser-run when they need a browser-rendered view of a public page.

**Browser-Run is a candidate to gradually replace HTTP-API-based scraping for Das Experten use cases.** API-based scraping (Apify, third-party scrapers) tends to be expensive and opaque; browser-based capture is transparent (you see exactly what a real browser sees) and predictable in cost.

---

## Cross-references

- **Worker side:** `workers/browser-run-bridge/README.md`, `ACTIONS.md`, `OPERATIONS.md`, `CHANGELOG.md`
- **Sibling modules:** `my-tools/emailer/`, `my-tools/telegramer/`
- **Aram-maintained secrets registry:** `Das-Secrets.md`
