# agents/

**Folder for active workflow executors with persistent state.**
Every component that **coordinates**, **decides**, and **resumes across time** lives here.

---

## What is an agent and how it differs from skill and tool

| | `my-skills/` | `my-tools/` | `agents/` |
|---|---|---|---|
| **Role** | Content creator | Delivery channel | Workflow coordinator |
| **Output** | Text, document, strategy, prompt | Sent message, published post, delivered file | Completed multi-step business outcome |
| **Has persistent state** | No | No | Yes — Drive JSON + Sheet index |
| **Survives across conversations** | No | No | Yes |
| **Can pause and wait for Aram** | No | No | Yes — AWAITING_INPUT state |
| **Makes strategic decisions** | No | No | Yes — chooses which skills/tools to call, in what order |
| **Calls external APIs directly** | No | Yes (Gmail, Telegram Bot, WhatsApp, etc.) | Yes — dispatches to skills and tools |
| **Examples** | review-master, bannerizer, personizer | emailer, telegramer | orchestrator |

**Hard rule:** an agent never generates brand content itself. It calls skills for content, tools for delivery, and coordinates the result. An agent that writes marketing copy is a skill wearing an agent costume.

---

## When to create a new agent vs a new skill

Create a **skill** when:
- The task can be completed in one LLM turn
- No async waiting is needed (user won't make a decision mid-flow and come back tomorrow)
- The output is content or a plan, not a completed external action
- No state survives the conversation

Create an **agent** when:
- The workflow takes hours or days (e.g., B2B negotiation, NDA wait, customs clearance)
- Aram must make decisions at one or more steps before the workflow continues
- Multiple parallel runs of the same workflow are possible at once (different buyers at different stages)
- The workflow combines 3+ skills and/or tools in a fixed sequence that will repeat monthly
- Recovery from partial failure must be deterministic and auditable

**Rule of thumb:** if you need `AWAITING_INPUT` anywhere in the flow, it's an agent.

---

## Two-layer architecture

```
GitHub repo (agents/)
  └── workflows/          ← Templates: define WHAT steps a workflow has.
                             Reusable. Versioned. Written rarely.
                             Committed to this repo.

Google Drive (at runtime)
  └── Orchestrator_State/
        ├── active/       ← Instances: running workflow runs with state.
        │     └── <wf_id>.json   Auto-created. Never committed to GitHub.
        └── archived/     ← Completed or failed instances. Kept 1 year.
```

Templates define steps. Instances carry the actual data for one run (who the buyer is, which inbox, what decisions were made at each step, etc.).

---

## Three-mode operation

All agents in this folder use the same three-mode model:

| Mode | When | Behavior |
|---|---|---|
| **Templated** | Aram's trigger matches a known workflow template | Execute by template — deterministic, pre-approved steps |
| **Ad-hoc** | Trigger doesn't match any template | Propose plan → get approval → execute step-by-step |
| **Auto-detection** | Same ad-hoc pattern seen 3+ times in 30 days at 80%+ similarity with stable decisions | Draft template → ask Aram to promote |

The agent **selects mode automatically** based on trigger parsing. Aram does not need to know which mode is active. Mode selection rules live in `orchestrator/reference/mode-selection.md`.

---

## Architectural flow

```
[ARAM via Telegram]  "утренняя почта"
         │
   [ORCHESTRATOR]  ← receives trigger, identifies mode (templated: inbox-triage)
         │
         ├──► [my-skills/personizer]   ← draft email replies for URGENT/HIGH threads
         │           │
         │           └── consistency gates (product-skill, legalizer, Conversion Gate, Germany-check)
         │
         ├──► [my-tools/emailer]       ← deliver approved drafts
         │
         └──► [Telegram to Aram]       ← summary + approve/review buttons
                     │
              [ARAM approves]
                     │
         [ORCHESTRATOR resumes]
                     │
             [emailer.send for all URGENT/HIGH drafts]
                     │
          [Drive: instance archived, Sheet: run logged]
```

---

## Inventory of agents

| Agent | Purpose | Status | Backend |
|---|---|---|---|
| `orchestrator/` | Coordinates all multi-step workflows for Das Experten | planned | Apps Script Web App `<ORCHESTRATOR_EXEC_URL>` |

---

## Adding a new agent — checklist

- [ ] Create folder `agents/<agent-name>/`
- [ ] Write `SKILL.md` with YAML frontmatter (ROLE: AGENT, TYPE, BACKEND, AUTH, STATUS)
- [ ] Write `workflows/` with at least one template
- [ ] Write `reference/` with state-management and instance-lifecycle docs
- [ ] Write `backend/<bundle>.gs` — full Apps Script source
- [ ] Write `backend/SETUP_NOTES.md` with deploy instructions
- [ ] Write `DEPLOY_CHECKLIST.md` for operator
- [ ] Deploy Apps Script Web App
- [ ] Set Telegram webhook
- [ ] Create Drive state folders
- [ ] Create Google Sheet index
- [ ] Update this README — change status to `active`

---

## History

| Date | Change |
|---|---|
| 2026-04-27 | Folder created. Orchestrator agent added as first entry. |

---

**Source of truth:** this README.
**At conflict between this README and an individual agent's SKILL.md — this README governs architecture; SKILL.md governs operational detail.**
