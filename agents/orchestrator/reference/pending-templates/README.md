# pending-templates/

Staging area for auto-detected template drafts before Aram approves promotion to `workflows/`.

---

## How files land here

1. Auto-detection criteria are met (3+ similar ad-hoc runs, 80%+ similarity, stable decisions).
2. Orchestrator generates a template draft and saves it here as `<name>-draft.md`.
3. Aram is notified via Telegram with "Сохранить шаблон / Просмотреть / Пропустить" buttons.
4. On approval: draft is moved to `../../../workflows/<name>.md` (renaming, removing `-draft` suffix).
5. On rejection/skip: file is deleted or kept with `_suppressed` suffix for reference.

## What files look like here

Same format as production templates in `workflows/`. The only difference is the `-draft` suffix
in the filename and the presence of:

```yaml
draft: true
auto_detected: true
detection_date: <ISO date>
qualifying_instances: [<wf_id_1>, <wf_id_2>, <wf_id_3>]
```

in the YAML frontmatter.

## Retention

Drafts not approved within 90 days are deleted automatically.
Reminder sent at 30 days and 89 days via Telegram.

## Current pending drafts

(None yet — populated at runtime by orchestrator auto-detection.)
