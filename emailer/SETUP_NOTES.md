# Emailer — Manual Setup Steps

After Claude Code finishes scaffolding, run through this list manually. None
of it is automated yet — Aram does each step with `clasp` from his terminal.

## TL;DR for Aram (top-of-file checklist)

1. `cd arams-db/emailer/`
2. `clasp create --type webapp --title "Emailer"` (creates new Apps Script project)
3. `clasp push` (uploads `src/*.gs` and `appsscript.json`)
4. Create a Google Sheet named e.g. `Emailer Log`, copy its ID from the URL.
5. Deploy as web app: Apps Script editor → Deploy → New deployment →
   Web app → Execute as: me, Who has access: Anyone with the link.
   Copy the deployment URL.
6. Set Properties (Apps Script editor → Project Settings → Script Properties):
   - `LOG_SHEET_ID`         = sheet ID from step 4
   - `DEFAULT_DRIVE_FOLDER` = e.g. `Emailer Reports`
7. Load skills into Properties (one-liner in section 7 below).
8. Smoke-test with the three sample `curl` commands at the bottom of this file.

---

## 1. Working directory

```bash
cd arams-db/emailer/
```

All subsequent commands assume this is your CWD.

## 2. Install / authorise clasp

```bash
npm install -g @google/clasp
clasp login
```

`clasp login` opens a browser window — sign in with the Google account that
already owns Aram's Gmail / Drive integrations.

## 3. Create the Apps Script project

```bash
clasp create --type webapp --title "Emailer" --rootDir ./src
```

This writes a `.clasp.json` file at the emailer root. Compare it with
`.clasp.json.example` if anything looks odd. **Do not commit `.clasp.json`** —
it contains the `scriptId` (treat like a project key, not a secret, but no
need to leak it).

## 4. Push the code

```bash
clasp push
```

This uploads:

- `src/Main.gs`
- `src/EmailComposer.gs`
- `src/DocBuilder.gs`
- `src/DriveManager.gs`
- `src/GmailSender.gs`
- `src/ThreadResolver.gs`
- `src/SkillsBridge.gs`
- `src/Logger.gs`
- `appsscript.json` (manifest)

## 5. Create the logging Google Sheet

1. Create a new Google Sheet named e.g. `Emailer Log`.
2. Copy the ID from the URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`.
3. The sheet's first row will auto-populate with headers on first run; no need
   to set them up by hand.

## 6. Deploy as web app

In the Apps Script editor (`clasp open` opens it):

- Deploy → New deployment.
- Type: **Web app**.
- Description: `Emailer v1`.
- Execute as: **Me**.
- Who has access: **Anyone with the link** (this is required for
  programmatic callers like n8n / Make / dasoperator).
- Click Deploy. Authorise the Gmail / Drive / Docs / Sheets scopes when prompted.
- Copy the **deployment URL**. That is the endpoint external callers will hit.

## 7. Configure script properties

Apps Script editor → Project Settings → Script properties → Add property:

| Key                    | Value                                                    |
|------------------------|----------------------------------------------------------|
| `LOG_SHEET_ID`         | the Sheet ID from step 5                                 |
| `DEFAULT_DRIVE_FOLDER` | e.g. `Emailer Reports`                                   |

You can also set them programmatically once via clasp + a one-shot script
(or the editor's "Run" button on a tiny helper).

## 8. Load skill templates into PropertiesService

Apps Script cannot read repo files at runtime, so we copy each
`SKILL.md` into `PropertiesService` once at deploy time.

From the `arams-db/emailer/` directory, run a Bash one-liner that emits a
short Apps Script source file pre-loaded with every skill, then push it:

```bash
# Generate src/_LoadSkills.gs from arams-db/.claude/skills/*/SKILL.md.
# Run from arams-db/emailer/.
{
  echo '/** Auto-generated. Run loadAllSkills_() once, then delete this file. */';
  echo 'function loadAllSkills_() {';
  echo '  var props = PropertiesService.getScriptProperties();';
  for d in ../.claude/skills/*/ ; do
    name="$(basename "$d")"
    file="$d/SKILL.md"
    [ -f "$file" ] || continue
    # JSON-encode the file content so Apps Script V8 reads it as a string literal.
    payload="$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1],encoding="utf-8").read()))' "$file")"
    echo "  props.setProperty('skill_${name}', ${payload});"
  done
  echo '}'
} > src/_LoadSkills.gs

clasp push
```

Then in the Apps Script editor:

1. Open `_LoadSkills.gs`.
2. Select `loadAllSkills_` from the function dropdown.
3. Click **Run** once. Authorise if prompted.
4. Verify in Project Settings → Script properties that keys
   `skill_bannerizer`, `skill_das-presenter`, etc. are present.
5. Delete `src/_LoadSkills.gs` locally and `clasp push` again so the loader
   does not stay in production code.

To verify which skills are present, run `listLoadedSkills()` from
`SkillsBridge.gs` in the editor — it returns the array of deployed skill names.

To refresh a single skill after editing its `SKILL.md`:

```bash
SKILL=technolog
python3 -c "import json,sys; print(json.dumps(open(sys.argv[1],encoding='utf-8').read()))" \
  ../.claude/skills/$SKILL/SKILL.md \
  | xargs -0 -I {} echo "PropertiesService.getScriptProperties().setProperty('skill_$SKILL', {});"
```

…then paste the printed line into the editor and run it once.

## 9. Smoke-test the three scenarios

Replace `<URL>` with the deployment URL from step 6.

### Scenario A — new email with pre-made attachment

```bash
curl -sS -X POST "<URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "Send Q2 distributor deck to Vietnam buyer",
    "recipient": "your-test-inbox@gmail.com",
    "subject": "Das Experten — Q2 distributor deck",
    "content_brief": "Cover note with the attached distributor deck.",
    "attachment_link": "https://drive.google.com/file/d/EXISTING_ID/view",
    "context": "Vietnam, pharmacy chain, follow-up to last week call."
  }'
```

### Scenario B — new email, content + Doc generated by a skill

```bash
curl -sS -X POST "<URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "Brief on SCHWARZ paste for Polish wholesaler",
    "recipient": "your-test-inbox@gmail.com",
    "content_brief": "Explain SCHWARZ positioning, RDA, and target shopper.",
    "skill_call": "product-skill",
    "context": "Wholesaler asked about whitening line; price tier mid."
  }'
```

### Scenario C — reply inside existing Gmail thread

First, send Scenario A, copy the `thread_id` from the response, and use it:

```bash
curl -sS -X POST "<URL>" \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "Reply to Vietnam buyer about MOQ",
    "thread_id": "PASTE_THREAD_ID_HERE",
    "content_brief": "Confirm MOQ 1 pallet, lead time 4 weeks, FOB Riga.",
    "context": "Buyer pushed back on MOQ in last reply."
  }'
```

Confirm in Gmail that the reply appears **inside the same thread** (not as a
new message). If it ever appears as a separate thread, something is wrong
with `replyToThread` — open an issue and do not ship.

## 10. Optional — versioning

After every code change:

```bash
clasp push
clasp deploy --description "vN: <what changed>"
```

`clasp deploy` creates a new immutable version. The Web app URL stays the
same if you redeploy under the existing deployment ID; otherwise you get a
new URL — update callers accordingly.
