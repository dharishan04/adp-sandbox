# Specs

One file per epic: `specs/<epic Issue number>.md`. Front matter: `id`, `title`, `human_lead`, `revision`, `cases`
(each a `path` and the requirement IDs it `covers`), `milestones` (each a sub-issue number and what it `covers`).
Requirements and success criteria carry IDs in the body (`- **FR-001** ...`). No `status` field: draft, review and
locked are GitHub states. Lock is the merged spec PR; each revision is the tag `spec/<id>/r<N>`.
