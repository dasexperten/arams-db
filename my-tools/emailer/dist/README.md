# Emailer Bundle — paste-into-editor distribution

`emailer-bundle.gs` is the entire `src/` tree concatenated into one file, in dependency order, so it can be pasted as a single block into the Apps Script editor. Use this when `clasp push` is not available (no terminal, no Node.js).

## How to use

1. Open the bundle in raw form: https://github.com/dasexperten/arams-db/raw/main/my-tools/emailer/dist/emailer-bundle.gs
2. Select all (Cmd/Ctrl+A) → copy.
3. In the Apps Script editor (https://script.google.com → your Emailer project):
   - Click the existing file in the left panel (probably `Code`).
   - Select all of its content → delete.
   - Paste the bundle.
   - Save (Cmd/Ctrl+S).
4. Update the manifest. **Project Settings** (gear icon, left bar) → toggle **Show "appsscript.json" manifest file in editor** → ON. Open the new `appsscript.json` file and replace its content with [`emailer/appsscript.json`](../appsscript.json) from this repo (raw URL: https://github.com/dasexperten/arams-db/raw/main/my-tools/emailer/appsscript.json).
5. **Deploy** → **Manage deployments** → ✏️ next to the existing deployment → **Version**: **New version** → **Deploy**. Authorize the new scopes (Drive, Sheets, Docs) when prompted.
6. Optional but recommended for full functionality: in **Project Settings** → **Script properties**, set:
   - `LOG_SHEET_ID` — Google Sheet ID for the operation log (Logger.gs writes one row per call).
   - `REPORTER_FOLDER_ID` — Google Drive folder ID for the per-recipient archive Docs (Reporter.gs).
   - `INBOX_ATTACHMENTS_FOLDER_ID` — `1SYEckKOUSm9JPAIDq4fnn3tP81BOewva` (or your own — used by `download_attachment` action).

Without `LOG_SHEET_ID` and `REPORTER_FOLDER_ID` set, Logger and Reporter no-op silently — `send`, `reply`, `find`, etc. all still work.

## How to rebuild

When you change anything under `src/`, regenerate the bundle so the paste-flow stays in sync:

```bash
cd my-tools/emailer
{
  printf '/**\n * emailer-bundle.gs — single-file concatenation of every src/*.gs source.\n */\n\n'
  for f in src/Logger.gs src/DriveManager.gs src/lib/InboxAttachmentManager.gs src/Reporter.gs src/ThreadResolver.gs src/GmailSender.gs src/actions/ActionSend.gs src/actions/ActionReply.gs src/actions/ActionReplyAll.gs src/actions/ActionFind.gs src/actions/ActionGetThread.gs src/actions/ActionDownloadAttachment.gs src/Main.gs; do
    printf '\n// === %s ===\n\n' "$f"
    cat "$f"
  done
} > dist/emailer-bundle.gs
```

The order is fixed: helpers (`Logger`, `DriveManager`, `InboxAttachmentManager`, `Reporter`, `ThreadResolver`, `GmailSender`) → action handlers (`ActionSend`, `ActionReply`, `ActionReplyAll`, `ActionFind`, `ActionGetThread`, `ActionDownloadAttachment`) → `Main` dispatcher last. Concatenating respects this order so all references resolve.
