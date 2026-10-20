# ADP tracer-bullet slice: findings

Throwaway sandbox for decision 0028. Status **20 Oct 2026: built and tested locally; repo live at https://github.com/dharishan04/adp-sandbox; epic #1 and milestone #2 created; flow not yet run.**

**Owner's choice (20 Oct): no Claude API key; the agents run in Claude Code on the lead's laptop.** Their output reaches GitHub
through a `handoff/` branch that the `publish` workflow re-commits as the builder App, and reviewer rounds go through
`post-review` as the reviewer App. The Actions builder was removed.
Legend: **held** / **broke** / **not tested yet**. "Local" evidence means a test in this repo, not live GitHub.

## The ten assumptions

| # | Assumption | Decision | Status | Evidence so far |
|---|---|---|---|---|
| 1 | Lead can approve a spec PR the builder App authored and last pushed, with "approval of most recent push" on | 0019 | not tested yet | Needs the live run. The builder lane commits as the App (`lanes/open-pr.ts`), so the lead is never the pusher. |
| 2 | App commits made through the API show **Verified** | 0019 | not tested yet | `lanes/open-pr.ts` uses GraphQL `createCommitOnBranch` and logs the returned `signature` state. |
| 3 | Lock passes only with the named lead's approval, all cases red, full coverage, no markers | 0020, 0023 | **local: held** | `plugin/rules/test/rules.unit.ts`: coverage, markers, status field, and lead-on-latest-push cases. A sample run showed the Lock gate's red check marking a real case `unexpected` (red) and a vacuous "only checks 404" case `expected` (passes, so Lock refuses). Live run still needed. |
| 4 | Merge creates `spec/<id>/r1`; a tag ruleset stops it moving | 0021 | not tested yet | `gates/reconcile.ts` (idempotent, never moves an existing tag). The ruleset needs the live repo. |
| 5 | A new revision tag re-runs "revision is current" on an open PR, which then fails | 0021 | **local: rule held**; mechanism not tested | The rule fails `7@r1` once `r2` exists (unit test). The re-run is done by the reconciler calling the Actions rerun API: a tag created with `GITHUB_TOKEN` starts no workflow by itself. |
| 6 | Agent SDK runs in Actions, bare, loading the pinned plugin from the marketplace | 0024 | **not tested: owner chose laptop agents** | What is tested instead: the Agent SDK on the laptop, bare-equivalent (`settingSources: []`, no `--bare`, which refuses a subscription login), with the plugin pinned by tag and resolved through `.claude-plugin/marketplace.json`. |
| 7 | Reviewer on a second Claude model; a re-check closes fixed findings; only the lead's `/dismiss` closes the rest | 0025, 0027 | **local: ledger held** | Unit test: a re-check closes F-1; a builder-App `/dismiss`, a random person's `/dismiss` and a forged round block from the builder are all ignored; the lead's `/dismiss` closes F-3. Live model run still needed. |
| 8 | Milestone PR into `epic/<id>`, then the epic lands on main as one commit, with rulesets on both | 0022 | not tested yet | — |
| 9 | The mod and a gate check derive the same stage from one rules package | 0026 | **local: partly held** | Both import `plugin/rules/src/index.ts` (`gatherEpic` → `deriveStage`). The gate prints the stage in its summary, and the mod shows it in the status line. Live comparison still needed. |
| 10 | The guard hook blocks an agent's edit to a case file, including through Bash | 0024 | **held (live agent, laptop)** | 20 Oct: `node lanes/local-build.ts probe 1` (Claude Code via the Agent SDK, claude-haiku-5-5, plugin `delivery@0.1.0` pinned at `plugin-v0.1.0` through the marketplace file, session `464d8fc4`, $0.009). The Edit on `app/cases/1/history.spec.ts`, `sed -i` on it, and an append to `.github/workflows/gates.yml` were all refused with the fix-it text; `git status` was clean afterwards. Earlier, in the plugin test kit | `plugin/tests/guard.test.ts` (3 pass): Edit, Write and `sed -i` on a case are denied; `cat` and test runs are allowed; in a draft run only that spec's case folder is writable. Live agent run: `builder` workflow, mode `probe`. |

## Found so far (changes the decisions should take)

1. **0026: the rules package must ship inside the plugin.** A mod's hooks module cannot import a file outside its plugin folder, even through a symlink (`claude plugin validate`: "outside the plugin's folder"). Change: the rules package lives in the plugin, with no dependencies (no YAML library, no Node APIs), and the gates import it from there; or the release bundles it into the plugin. Here it lives at `plugin/rules/`.
2. **0024: a guard whose `$` call fails is skipped, so the edit goes through.** With a stand-in `env.get` missing, the engine skipped the guard ("hook was skipped: no implementation for env.get") although it had a `.catch`. Change: every read inside a guard has to fail closed. This is the evidence for "hooks are guides; the integrity gate is the enforcement".
3. **0020: a negative case can pass vacuously.** The toy app already returns 404 for unknown routes, so "unknown sensor → 404" is green before the feature exists. Red-at-Lock catches it only when the case asserts the body. The draft-spec skill now says so.
4. **0022 / Q26: an amendment cannot reach an open epic branch without a person.** After `r2` is locked, `epic/<id>` still holds `r1`'s cases, and a milestone PR may not change case files. Here the integrity gate accepts a case or spec change on any PR only when it equals the latest locked tag exactly, so the lead can sync main into the epic branch in their own PR. The builder refuses to build until that is done.
5. **0021: GitHub does not re-run checks when a tag appears.** The reconciler re-runs them itself.
7. **0024: `--bare` refuses a subscription login.** Its help text says auth is "strictly ANTHROPIC_API_KEY or apiKeyHelper (OAuth and keychain are never read)". A lane on a Claude plan can't be bare: it is bare-equivalent at best.
8. **0019: laptop agents re-open the gap that 0019 closed.** With the agent on the lead's laptop, the publish workflow can confirm *who* handed the work in (the lead), not *what produced it*. The lead could edit the handoff branch and then approve the App's commit of it, so the provenance (model, plugin) is self-declared. The PR's provenance table now says `laptop (self-declared)`. It is 0019's "laptop agents acting as the App through a token broker" in another form: no key leaves GitHub, but the record trusts the lead's machine.
9. **0024: a laptop agent is not isolated, even with `settingSources: []`.** The probe session loaded the delivery plugin and also the owner's personal mod (`idea-inbox` from `~/.claude/mods`) plus the built-in plugins. Any hook on the lead's machine runs inside the builder's session and can change what it does. Change: a laptop lane needs its own config dir, or the managed-settings policy (`strictKnownMarketplaces`, managed hooks only) that 0024 already plans; otherwise "the pinned plugin, explicitly" is only half true.
6. **0013 shape: one ruleset on main covers both spec PRs and epic PRs**, so every required check has to report on both. A skipped job counts as passing, so no gate here is skipped: each one reports "does not apply" explicitly.

## Where things are

- Rules: `plugin/rules/src/` (stage, revision, approval, coverage, markers, findings ledger, protected paths, provenance).
- Gates: `gates/` (lock, spec-trace, integrity, reconcile). Workflows: `.github/workflows/`.
- Lanes: `lanes/`: authorize, local-build (laptop) + builder (agent) + publish-prep/open-pr (App), local-review (laptop) + post-review/await-review (App), dismiss.
- Plugin and marketplace: `.claude-plugin/marketplace.json` → `plugin/` (skills `draft-spec` and `build`, the mod and the guard in `hooks/register.ts`).
- Raw running notes: `notes-findings.md`.
