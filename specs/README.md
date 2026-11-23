# Specs

One file per epic: `specs/<epic Issue number>.md`. Front matter: `id`, `title`, `human_lead`, `revision`, `cases`
(each a `path` and the requirement IDs it `covers`), `milestones` (each a sub-issue number and what it `covers`).
Requirements and success criteria carry IDs in the body (`- **FR-001** ...`). No `status` field: draft, review and
locked are GitHub states. Lock is the merged spec PR; each revision is the tag `spec/<id>/r<N>`.

## Trial: living contract and deltas (ADP 0031)

Beside the format above: an epic is in one or the other, decided per ref by `readLockUnit` in the rules package
(a `specs/<id>/<module>.delta.md` wins over `specs/<id>.md`). The skills write this format; the Lock gate, the tag
reconciler, the lanes, the mod's `/trace` and the web view read both.

- **Living contract**, one per module, next to its shape: `app/contract.md` (front matter `module`, `stability`,
  `openapi`) holds behavioural rules only, each `## <MODULE>-Rnnn · <title>`, then `Operation: GET /path[, …]`,
  optionally `Decided in: <decision record>`, a blank line, and Given/When/Then lines. IDs are never reused; a removed
  rule stays as `Removed: epic <n> · <reason>`. Shape lives only in `app/openapi.yaml`.
- **Delta**, per epic and module: `specs/<id>/<module>.delta.md`. Front matter as a spec's (`id`, `title`,
  `human_lead`, `revision`, `cases`, `milestones`) plus `module` and `base` (the `contract/<module>/rN` tag it was
  written against, or `none`). Sections `## ADDED`, `## MODIFIED` (each rule with `#### Was`, the rule exactly as main
  has it in a ``` block, and `#### Now`) and `## REMOVED` (with `Reason:`). A shape change is the full candidate file
  `specs/<id>/<module>.openapi.next.yaml`.
- **Fold** at epic merge: the epic PR's author runs `npx tsx gates/contract.ts --fold <id>`; the check
  `npx tsx gates/contract.ts --epic <id>` proves the tree is exactly main's contract plus the delta. Then
  `gates/contract-reconcile.ts` (not wired yet) tags `contract/<module>/rN`.
- `npx tsx gates/contract.ts` checks every contract and delta against `BASE_REF` (default `main`).
