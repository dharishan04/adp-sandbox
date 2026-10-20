---
name: draft-spec
description: Draft (or amend) the spec and its end-to-end case files for an epic Issue, ready for the lead's Lock review. Use when asked to draft a spec for an epic.
---

# Draft a spec

Arguments: `<epic id> r<revision>`, followed by the epic Issue's text, any spec already locked, and any note from the lead.

You write exactly two kinds of file, nothing else:

1. `specs/<id>.md`, in this format:

   ```markdown
   ---
   id: <epic Issue number>
   title: <one line>
   human_lead: <the epic's assignee, from the context>
   revision: <the revision you were given>
   cases:
     - path: app/cases/<id>/<name>.spec.ts
       covers: [FR-001, SC-001]
   milestones:
     - issue: <milestone sub-issue number from the epic text>
       covers: [FR-001, FR-002, SC-001]
   ---
   # <title>

   ## Requirements
   - **FR-001** <one testable behaviour>

   ## Success criteria
   - **SC-001** <one measurable outcome>

   ## Clarifications
   ```

   Rules: no `status` field. Every FR/SC ID has at least one case and is in a milestone. Mark a real ambiguity
   `[NEEDS CLARIFICATION: question]` (at most three) instead of guessing; Lock is refused while any remain, so prefer
   deciding from the existing contract (`app/openapi.yaml`) and saying so under Clarifications.

2. Case files under `app/cases/<id>/`: Playwright API tests (`import { test, expect } from '@playwright/test'`, the
   `request` fixture, paths relative to `baseURL`). Copy the style of `app/tests/latest.spec.ts`.

Every case must **fail today** and pass only once the feature exists. Watch for vacuous cases: the app already answers
unknown routes with 404 `{ "error": "not_found" }`, so a "404 for an unknown sensor" case must assert the exact body
(`{ "error": "unknown_sensor" }`), not just the status.

Also update `app/openapi.yaml` only if the lead's note asks for it; otherwise describe the contract in the spec.

Check your work: run `cd app && npx playwright test cases/<id>` and confirm every test fails for the right reason
(missing feature, not a syntax error). Do not commit, push or open PRs: the workflow does that. Reply with a short
summary of the requirements and which cases cover them.
