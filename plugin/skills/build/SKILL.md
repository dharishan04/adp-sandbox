---
name: build
description: Build one milestone of a locked spec until its cases pass. Use when asked to build a milestone of a locked spec revision.
---

# Build a milestone

Arguments: `<epic id> r<revision> m<milestone issue>`, followed by the locked delta and your milestone.

What you build to is **main's contract with this epic's delta applied**: the rules in `app/contract.md`, changed by
`specs/<id>/sensors.delta.md`. The shape is `specs/<id>/sensors.openapi.next.yaml` if the epic has one, otherwise
`app/openapi.yaml`. All of these are **locked**, and so are the case files under `app/cases/<id>/`. A guard refuses
edits to them and to gate configuration (`.github/`, `gates/`, `lanes/`, `plugin/`). The contract changes when the epic
merges, never in a milestone.

1. **Plan first.** Before writing code, put a short plan at the top of your summary under `Plan:`. Say how you'll
   sequence the work, how it fails, and what it costs. The plan is yours to change as you learn; say what changed and
   why. Nobody locks it.
2. Implement the milestone in `app/src/` (the toy service is `app/src/server.ts`, data in `app/src/data.ts`).
3. Make every case of your milestone pass, and keep `app/tests/` passing: `cd app && npx playwright test`.
4. Keep it small: this is a toy service.

When something turns up while you build, it goes one of four ways:
- **The plan was wrong:** change it and carry on. Note it under `Plan:`.
- **The contract or a case looks wrong** (a rule is missing, contradicts another, or a case tests the wrong thing):
  **stop**. Don't work around it in code. Say so under `Contract:` in your summary, naming the rule ID or case. The lead
  amends the delta, it is locked again, and the work is rebuilt.
- **Something would outlive the task** (a new dependency, table, cache, service or config setting): name it under
  `Outlives the task:`. The lead decides whether it needs a decision record before this merges.
- **New scope** (something worth doing that no rule asks for): don't build it. Note it under `Out of scope:` for a
  new epic.

Do not commit, push or open PRs: the workflow does that. Reply with the summary (Plan, then any of Contract, Outlives
the task and Out of scope) and the test result line.
