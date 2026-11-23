---
name: draft-spec
description: Draft (or amend) an epic's contract delta and its end-to-end case files, ready for the lead's Lock review. Use when asked to draft a spec for an epic.
---

# Draft a spec (a contract delta, ADP 0031)

Arguments: `<epic id> r<revision>`, followed by the epic Issue's text, any delta already locked, and any note from the lead.

What Lock freezes is the **contract change and its cases**, nothing else. The module's living contract is
`app/contract.md` (behavioural rules, module `sensors`); its shape is `app/openapi.yaml`. You never edit either: a
guard refuses it. You describe the change in files of your own epic.

You write only these files:

1. `specs/<id>/sensors.delta.md`, the delta:

   ````markdown
   ---
   id: <epic Issue number>
   title: <one line>
   human_lead: <the epic's assignee, from the context>
   revision: <the revision you were given>
   module: sensors
   base: <the latest contract/sensors/rN tag (git tag -l 'contract/sensors/r*'), or none if there is none>
   cases:
     - path: app/cases/<id>/<name>.spec.ts
       covers: [SENSORS-R008]
   milestones:
     - issue: <milestone sub-issue number from the epic text>
       covers: [SENSORS-R008]
   ---
   # Delta: epic <id> · <title>

   ## ADDED

   ### SENSORS-R008 · <the promise, as one sentence>
   Operation: GET /sensors/{id}/history

   - **Given** <state> **When** <request> **Then** <status and machine code>

   ## MODIFIED

   ### SENSORS-R004 · <the new title>

   #### Was

   ```md
   <the rule exactly as app/contract.md has it today, from its ## heading to its last line>
   ```

   #### Now

   Operation: GET /sensors/{id}/history

   - **Given** … **Then** …

   ## REMOVED

   ### SENSORS-R005 · <its title>
   Reason: <why the promise is withdrawn>
   ````

   Rules:
   - Leave out sections you don't need.
   - A new rule takes the next number after the highest ID in `app/contract.md`, counting removed rules. IDs are never
     reused.
   - Every rule names the operation it constrains. It states behaviour only, never a response shape: the shape is
     OpenAPI's.
   - No `status` field. Every added or modified rule has at least one case and is in a milestone. A case cites only
     rules this delta adds or modifies.
   - Mark a real ambiguity `[NEEDS CLARIFICATION: question]` (at most three) instead of guessing; Lock is refused while
     any remain.
   - **Choices are not rules.** When you or the lead decide something (a limit, a default), write it as a decision
     record `docs/decisions/NNNN-<slug>.md` and link it from the rule with `Decided in: <path>`. Out-of-scope items go
     in your reply for the lead to put on the epic Issue, not in the delta.

2. `specs/<id>/sensors.openapi.next.yaml`, only if the shape changes: a full copy of `app/openapi.yaml` with this
   epic's operations, parameters and responses added or changed. It replaces `app/openapi.yaml` when the epic merges.

3. Case files under `app/cases/<id>/`: Playwright API tests (`import { test, expect } from '@playwright/test'`, the
   `request` fixture, paths relative to `baseURL`). Copy the style of `app/tests/latest.spec.ts`.

4. A decision record under `docs/decisions/`, only for a choice as described above.

Every case must **fail today** and pass only once the feature exists. Watch for vacuous cases: the app already answers
unknown routes with 404 `{ "error": "not_found" }`, so a "404 for an unknown sensor" case must assert the exact body
(`{ "error": "unknown_sensor" }`), not just the status.

Check your work:
- `npx tsx gates/contract.ts`: the delta is consistent and applies to main.
- `cd app && npx playwright test cases/<id>`: every test fails for the right reason (missing feature, not a syntax
  error).

Do not commit, push or open PRs: the workflow does that. Reply with a short summary: the rules added, modified or
removed, which cases cover them, and any out-of-scope items for the epic Issue.
