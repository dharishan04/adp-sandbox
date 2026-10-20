---
name: build
description: Build one milestone of a locked spec until its cases pass. Use when asked to build a milestone of a locked spec revision.
---

# Build a milestone

Arguments: `<epic id> r<revision> m<milestone issue>`, followed by the locked spec text and your milestone.

- The spec and the case files under `app/cases/<id>/` are **locked**. You cannot change them; a guard refuses edits to
  case files and gate configuration (`.github/`, `gates/`, `lanes/`, `plugin/`). If a case looks wrong, stop and say so
  in your summary: the lead amends the spec, it is locked again, and the work is rebuilt.
- Implement the milestone in `app/src/` (the toy service is `app/src/server.ts`, data in `app/src/data.ts`) and keep
  `app/openapi.yaml` in step with what you build.
- Make every case of your milestone pass, and keep `app/tests/` passing: `cd app && npx playwright test`.
- Keep it small: this is a toy service.

Do not commit, push or open PRs: the workflow does that. Reply with a short summary and the test result line.
