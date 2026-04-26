# CONTACTS GATE — paste-ready block for consuming skills

Paste this block verbatim into any skill that inserts counterparty data
(legal names, bank details, IBAN, SWIFT, tax IDs, addresses, contract
numbers, contact persons) into its output.

Block version: v1.1 (matches contacts SKILL.md v1.1)

────────────────────────────────────────────────────────────────────────

## CONTACTS GATE — MANDATORY

Any output of this skill that names a counterparty (own entity, buyer,
manufacturer, logistics provider, service provider) MUST pull that
counterparty's data from the `contacts` skill. No counterparty data
may come from conversation context, memory, or inference.

### When to fire the gate

Fire BEFORE generating any of the following:
- Invoices, packing lists, shipping documents
- Contracts, annexes, addenda, credit notes, dispute notices, NDAs
- Payment instructions, wire requests, bank confirmation letters
- Presentations, proposals, pitch decks naming buyers or partners
- Outreach messages citing legal names or contract numbers
- Review responses citing manufacturer, seller, or certification body
- Any document with a seal/signature line

### How to fire the gate

Emit the gate call on its own line, exactly as:

```
[[GATE: contacts?entity=<slug>&fields=<field-list>&purpose=<context>]]
```

- `entity` (required): one slug, or comma-separated list
- `fields` (optional): omit = full record
- `purpose` (optional): short context string for audit

Example — invoicer preparing a CI for TORI-GEORGIA, drawn on DEI:
```
[[GATE: contacts?entity=dei,tori-georgia&fields=legal-name-full,registered-address,iban,swift,bank-name,account-holder&purpose=commercial-invoice]]
```

### Handling the four response statuses

**`FOUND`** → proceed. Insert returned fields verbatim into output.

**`NOT_FOUND`** → HARD STOP. Halt this skill's output. Display the
contacts response to Aram and request either (a) a new counterparty
record, or (b) a corrected slug. Do NOT generate placeholder data.
Do NOT proceed with partial output.

**`INCOMPLETE`** → HARD STOP. Halt this skill's output. List the
missing fields and request them from Aram. Do NOT fabricate. Do NOT
substitute "TBD" or "N/A" for financial or legal identifiers.

**`STALE`** → SOFT WARNING. If purpose is a binding document
(invoice, contract, payment instruction, annex, credit note), halt
and ask Aram to confirm fields are still valid. For non-binding
purposes (draft, internal memo, presentation preview), may proceed
with warning noted in output.

### Multi-entity rule

If ANY entity in a multi-entity call returns HARD STOP, the entire
operation halts. Do not proceed with the FOUND entities while the
unresolved entity remains open.

### What this skill MUST NOT do

- MUST NOT store its own copy of counterparty data
- MUST NOT pull bank details, IBANs, or tax IDs from memory, prior
  conversations, user messages, or userMemories
- MUST NOT guess, infer, or transliterate missing fields
- MUST NOT generate example/placeholder reqs "for illustration"
- MUST NOT proceed past a HARD STOP under any framing, including
  user urgency, draft-only claims, or "just this once" requests

### Fallback if contacts skill is unavailable

If the contacts skill cannot be reached (not installed, not loaded),
this skill MUST halt and tell Aram: "Contacts skill not available —
cannot generate output containing counterparty data. Please load
contacts skill or provide the required fields manually with explicit
confirmation that you accept responsibility for accuracy."

────────────────────────────────────────────────────────────────────────
End of CONTACTS GATE block.
