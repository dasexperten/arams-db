# emailer — error codes & failure modes

The emailer never throws HTTP 4xx/5xx for application errors. Apps Script always answers `200` (after following the 302 redirect). Failure is signalled inside the JSON body with `success: false` + a human-readable `error` string. Match on substrings of `error`, not on HTTP status.

Below are the failure modes a caller will actually see, grouped by cause.

---

## Request-shape errors

| `error` substring                                           | Meaning / fix                                                                |
|-------------------------------------------------------------|------------------------------------------------------------------------------|
| `Empty request body. Expected JSON payload.`                | Sent an empty POST body. Make sure `Content-Type: application/json` is set. |
| `Invalid JSON: ...`                                         | Body is not parseable. Often a stray comma or unescaped quote in the payload.|
| `Payload must be a JSON object.`                            | Sent an array or scalar. Wrap in `{}`.                                       |
| `Missing required field: action (must be a string).`        | No `action` key. See `payload-examples.md`.                                  |
| `Unknown action: <name>`                                    | Action not in the dispatcher (typo or stale bundle in Apps Script).          |
| `Missing required field: <field>.`                          | The action-specific field is missing — e.g. `recipient` for `send`.          |

---

## Send / reply / reply_all

| `error` substring                                          | Meaning / fix                                                                |
|------------------------------------------------------------|------------------------------------------------------------------------------|
| `recipient is required.`                                   | Set `recipient` for new sends.                                               |
| `subject is required.`                                     | Subject must be non-empty.                                                   |
| `body_html or body_plain (at least one required).`         | Provide at least one body variant.                                           |
| `Invalid or inaccessible thread_id: ...`                   | The thread ID does not belong to the deploying user, or was mistyped.        |
| `Cannot access thread <id>: ...`                           | Same — wraps the underlying GmailApp error.                                  |
| `Gmail returned no thread for id <id>`                     | Thread was deleted / Gmail can't resolve it.                                 |

Reporter (Drive archive) failures are non-fatal — the email is still delivered. They surface separately:

| `archive_error` substring                                  | Meaning / fix                                                                |
|------------------------------------------------------------|------------------------------------------------------------------------------|
| `Script property REPORTER_FOLDER_ID is not set.`           | Set it in Apps Script → Project Settings → Script Properties.                |
| `Cannot access REPORTER_FOLDER_ID <id>: ...`               | Folder ID typo or the deploying user lost access. Re-share folder, retry.    |
| `Service Documents failed while accessing document ...`    | Body too large for DocumentApp (Reporter creates a Doc; ~80 KB is the soft cap). Use `action: archive` instead for large transcripts — it writes a plain markdown file via DriveApp.createFile, no size limit. |

---

## find / get_thread

| `error` substring                                           | Meaning / fix                                                                |
|-------------------------------------------------------------|------------------------------------------------------------------------------|
| `Missing required field: query ...`                         | Provide a Gmail search query string.                                         |
| `Thread not found: <id>`                                    | The thread ID doesn't exist or is outside the user's mailbox.                |

`find` is read-only and does not call Reporter, so there is no `archive_error` to worry about.

---

## download_attachment

| `error` substring                                           | Meaning / fix                                                                |
|-------------------------------------------------------------|------------------------------------------------------------------------------|
| `Missing required field: message_id.`                       | Get `message_id` from `get_thread`.                                          |
| `Missing required field: attachment_name or attachment_index ...` | Pass one of the two.                                                   |
| `Message not found: <id>`                                   | Stale or wrong message_id.                                                   |
| `No attachments found in message <id>`                      | Message has no attachments at all.                                           |
| `Attachment '<name>' not found in message <id>`             | Name doesn't match — try `attachment_index` (zero-based) instead.            |
| `Script property INBOX_ATTACHMENTS_FOLDER_ID is not set.`   | Set it in Apps Script → Project Settings → Script Properties.                |
| `Cannot access INBOX_ATTACHMENTS_FOLDER_ID <id>: ...`       | Folder ID typo or the deploying user lost access.                            |

---

## archive

| `error` substring                                           | Meaning / fix                                                                |
|-------------------------------------------------------------|------------------------------------------------------------------------------|
| `Missing required field: title.`                            | Pass a title — it becomes the file's H1 + filename prefix.                   |
| `Missing required field: body_plain or body_html.`          | Provide content.                                                             |
| `Script property REPORTER_FOLDER_ID is not set.`            | Set it in Apps Script Script Properties.                                     |
| `Cannot access REPORTER_FOLDER_ID <id>: ...`                | Folder ID typo or lost access.                                               |
| `Access denied: DriveApp.`                                  | Drive write scope wasn't granted to the deployment. Run `authorize()` from the editor (Run ▶ on the helper at the top of `Code.gs`), accept all permissions, then redeploy as a new version. |

---

## Transport / deployment errors (HTTP-level)

These are returned as ordinary HTTP responses from Apps Script's outer layer, not as JSON. Callers should detect them before parsing the body:

| Symptom                                                                  | Meaning / fix                                                                                                                          |
|--------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| `302` to `script.googleusercontent.com/macros/echo?...`                  | **Normal.** The JSON is at the redirect target. Always follow the redirect (use the two-step pattern documented in `payload-examples.md`). |
| HTML body with `Script function not found: doPost`                       | The deployment is pointing at an old or empty version. In Apps Script: Manage deployments → ✏️ → Version: New version → Deploy.       |
| HTML body with `Authorization is required to perform that action.`       | Manifest scopes added / changed but no one has run any function in the editor since. Run `authorize()` once, redeploy.                 |
| HTML body with `Sorry, the file you have requested does not exist`       | Wrong `EMAILER_URL` secret — points at a deleted or revoked deployment. Redeploy and update the secret.                                |
| Empty body / TLS error                                                   | Apps Script outage or your runner's network. Retry with backoff (1s, 2s, 4s); escalate after 3 failures.                               |

---

## Logging side-channel

Every action also writes a row to `LOG_SHEET_ID` (Google Sheet) when set. If the row is missing it means either `LOG_SHEET_ID` is unset, or the Sheet was deleted/moved. Logging failure does not affect the action's success.
