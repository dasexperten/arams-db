# DEPLOY_CHECKLIST_LEVEL3.md

Additional checklist for the **Level 3 GitHub auto-merge pipeline**.
Complete the base `DEPLOY_CHECKLIST.md` (Steps 1–15) first.

Detailed instructions for each step: `backend/SETUP_NOTES.md` (Steps 13–20).

---

## GitHub setup

- [ ] **13. Fine-grained PAT created** on github.com
  - Repository: `dasexperten/arams-db`
  - Permissions: Contents (R/W), Pull requests (R/W), Metadata (R)
  - Expiration: 90 days
  - Token saved (shown only once)

- [ ] **14. Three new Script Properties added**
  - `GITHUB_PAT` — token from Step 13
  - `GITHUB_REPO` — `dasexperten/arams-db`
  - `GITHUB_PAT_ISSUED_DATE` — today's date (`YYYY-MM-DD`)

- [ ] **15. Auto-merge enabled on repository**
  - GitHub → dasexperten/arams-db → Settings → General → Pull Requests
  - "Allow auto-merge" checkbox: ✓

---

## Apps Script updates

- [ ] **16. `testGitHubConnection` passes**
  - Run from editor → console shows `GitHub connection OK`

- [ ] **17. `setupTimeTriggers` re-run**
  - Now registers 8 triggers (was 6)
  - New: `weeklyAutoDetectionScan` (daily 23:00 UTC) + `tokenRotationReminder` (daily 06:00 UTC)

- [ ] **18. Web App re-deployed as new version**
  - Deploy → Manage deployments → Edit → New version → Deploy
  - Webhook URL unchanged — no re-registration needed

---

## Smoke test

- [ ] **19. Level 3 smoke test passed**
  - Run `weeklyAutoDetectionScan` from editor (or wait for 3+ ad-hoc COMPLETED rows in Sheet)
  - Received Telegram with 4-button proposal
  - Tapped `[✅ Approve & auto-merge]`
  - Received confirmation with merge SHA + PR link within 30 seconds
  - PR visible and merged in GitHub under `auto-templates/` branch

- [ ] **20. Token rotation calendar reminder set**
  - Reminder at **80 days** from `GITHUB_PAT_ISSUED_DATE` to rotate token
  - After rotation: update `GITHUB_PAT` + `GITHUB_PAT_ISSUED_DATE` in Script Properties

---

## Runtime dependencies added by Level 3

| Dependency | Script Property | Source |
|---|---|---|
| GitHub PAT | `GITHUB_PAT` | github.com → Settings → Fine-grained tokens |
| GitHub repo | `GITHUB_REPO` | `dasexperten/arams-db` (literal value) |
| PAT issue date | `GITHUB_PAT_ISSUED_DATE` | Set manually on token creation (ISO date) |

---

## Rollback

If the Level 3 pipeline causes issues:

1. Do NOT disable the auto-merge feature in GitHub — existing PRs are unaffected.
2. To disable auto-detection promotion: comment out `weeklyAutoDetectionScan` trigger
   in `setupTimeTriggers()`, re-deploy, re-run `setupTimeTriggers`.
3. Level 1 / Level 2 workflows (inbox-triage, ad-hoc) are unaffected by GitHub errors —
   they don't call `githubFullPipeline_()`.
4. Any open validation-failed PRs can be closed manually in GitHub with no side effects.
