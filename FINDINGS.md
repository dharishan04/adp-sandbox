# ADP tracer-bullet slice: findings

Throwaway sandbox for decision 0028. **20 Oct 2026: epic #1 ran end to end, Frame → Done.**
Repo: https://github.com/dharishan04/adp-sandbox (public; delete after the decision records are updated).

**Owner's choices made during the run:**
- No Claude API key: the agents ran in Claude Code on the lead's laptop (Max plan). Their output reached GitHub
  through a `handoff/` branch that the `publish` workflow re-committed as the builder App; reviewer rounds were posted
  by the reviewer App through `post-review`.
- Two merges used the owner's admin bypass, to get past the deadlocks recorded below (PR #6, PR #8).

The run: epic [#1](https://github.com/dharishan04/adp-sandbox/issues/1) → spec r1 [#3](https://github.com/dharishan04/adp-sandbox/pull/3) (2 review rounds) → `spec/1/r1` →
milestone [#4](https://github.com/dharishan04/adp-sandbox/pull/4) (the reviewer found a crash) → amendment r2 [#5](https://github.com/dharishan04/adp-sandbox/pull/5) → `spec/1/r2` → #4 fails
"revision is current" → sync [#6](https://github.com/dharishan04/adp-sandbox/pull/6) → rebuilt milestone [#7](https://github.com/dharishan04/adp-sandbox/pull/7) → epic [#8](https://github.com/dharishan04/adp-sandbox/pull/8) → one commit `293c46e` on main.
Model spend: about $7 (builder claude-sonnet-5-5, about $0.10–0.22 a run; reviewer claude-opus-5-5, about $0.25–1.63 a round).

## The ten assumptions

| # | Assumption | Decision | Result | Evidence |
|---|---|---|---|---|
| 1 | The lead can approve a spec PR that the builder App authored and last pushed, with "approval of the most recent push" on | 0019 | **held** | #3: author `app/adp-sandbox-builder-ishan`, both commits by the bot; @dharishan04 APPROVED the head `a27c012`; merged `d714718` with no bypass. #5 and #7 the same. |
| 2 | App commits made through the API show **Verified** | 0019 | **held** | Every commit from `createCommitOnBranch` (`fe6f344`, `a27c012`, `0e7eb0a`, `718f090`, …): author `adp-sandbox-builder-ishan[bot]`, committer `web-flow`, `verified: true`. The epic's squash commit `293c46e` is Verified too. |
| 3 | Lock passes only with the named lead's approval, all cases red, full coverage and no markers | 0020, 0023 | **held** | #3, first push: Lock refused on one `[NEEDS CLARIFICATION]`, no review on the head and no approval, while coverage passed and all 5 cases were red. After the lead's answer: 9 cases, all red, then approval → Lock passed. #5 (r2): 10 new cases red, Lock passed on approval. Locally, a vacuous "status-only 404" case is caught as passing. |
| 4 | Merging creates `spec/<id>/r1`, and a tag ruleset stops it moving | 0021 | **held, after a fix** | The reconciler created `spec/1/r1` at `d714718` and `spec/1/r2` at `9ca14ab`, and re-created r1 at the same commit after it was deleted. The first pattern, `refs/tags/spec/**`, **matched nothing**: the admin force-moved and deleted the tag. With `refs/tags/spec/*/*`, git and the API are refused (`GH013 Cannot update this protected ref`). |
| 5 | A new revision tag re-runs "revision is current" on an open PR, which then fails | 0021 | **held** | Merging #5 → `spec/1/r2` → the reconciler re-ran [gates run 39392277063](https://github.com/dharishan04/adp-sandbox/actions/runs/39392277063) on #4: spec-trace went from pass to **fail**, "cites 1@r1 but the spec is now at r2", with the fix-it. |
| 6 | The Agent SDK runs in Actions, bare, loading the pinned plugin from the marketplace | 0024 | **not tested** (owner chose laptop agents) | Tested instead: the Agent SDK on the laptop, bare-equivalent (`settingSources: []`), with the plugin pinned by tag (`plugin-v0.1.0`, then `v0.1.1`) and resolved through `.claude-plugin/marketplace.json`. Init shows `delivery@inline 0.1.x` and the skills `delivery:draft-spec` and `delivery:build`. `--bare` itself refuses a subscription login (finding 2). |
| 7 | The reviewer runs on a second Claude model; a re-check closes fixed findings; only the lead's `/dismiss` closes the rest | 0025, 0027 | **mostly held** | Builder sonnet-5-5, reviewer opus-5-5, separate sessions. On #3, round 1 opened F-1 to F-4 and round 2 re-checked and closed all four (recorded-fixture test). The `review` check was written only by `adp-sandbox-reviewer-ishan` and pinned to that App in the ruleset. `/dismiss` was **not exercised live**; a unit test shows a builder-App, third-party or forged dismissal is ignored. |
| 8 | A milestone PR goes into `epic/<id>`, then the epic lands on main as one commit, with rulesets on both | 0022 | **held, with two bypasses** | #7 → `epic/1` (no bypass); #8 `epic/1` → main squashed into one commit `293c46e` (1 parent). The sync #6 and the epic #8 needed the admin bypass (findings 5, 6). Milestone Issue #2 did not auto-close (finding 9). |
| 9 | The mod and a gate check derive the same stage from one rules package | 0026 | **held** | Gate: `stage (rules package): spec 1@r1 · Build`; the mod's `/trace 4`: `stage spec 1@r1 · Build`. Later `1@r2 · Build`, and `/trace 8` → `spec 1@r2 · Done`. Recorded fixtures (`plugin/rules/test/recorded.unit.ts`) assert Frame, Design, Lock and Done from the real records. The status line wasn't seen on screen. |
| 10 | The guard hook blocks an agent's edit to a case file, including through Bash | 0024 | **held** | Live probe (Haiku, `delivery@0.1.0`): an Edit on a case, `sed -i` on a case and an append to `.github/workflows/gates.yml` were all refused with the fix-it; `git status` was clean. The integrity gate behind it was never needed against an agent's code change. |

## What the run changed (for the decision records)

1. **0026: the rules package must ship inside the plugin, with no dependencies.** A mod can't import outside its plugin folder, even through a symlink. Here it lives at `plugin/rules/` (no YAML library, no Node APIs), and the gates import it from there.
2. **0024: `--bare` refuses subscription auth, and a laptop session isn't isolated.** `--bare` accepts only `ANTHROPIC_API_KEY` or apiKeyHelper. With `settingSources: []`, a laptop session still loaded the owner's personal mod (`~/.claude/mods/idea-inbox`) and the built-in plugins. A laptop lane needs its own config dir or the managed policy 0024 already plans.
3. **0024: a guard whose `$` call fails is skipped, so the edit goes through,** even with `.catch`. Every read inside a guard must fail closed. A draft-mode guard also over-blocked a folder path, fixed in `delivery@0.1.1`. Hooks are guides; the integrity gate has to stay.
4. **0012 / 0020: one result per gate per commit needs re-runs, not new runs.** GitHub counts each workflow run's check of the same name. A stale Lock fail from the push sat next to a fresh pass from the review event, and the merge stayed BLOCKED (#3). Fix: a review event, or a PR body edit, re-runs the PR's own run (`gates/rerun.ts`) under a differently named job. A skipped job with the gate's name would read as a pass. Proven on #5: one `lock` result.
5. **0022 / Q26: syncing main into an epic deadlocks against the gates (#6).** Integrity can't tell gate config copied from main by the App's merge commit from an agent changing it. And app-tests can't pass, because the amendment's cases arrive red by design and the code comes in the next build. Suggested: integrity accepts content equal to main's; a sync PR runs only cases of revisions already built (or sync and rebuild land as one PR).
6. **0019 / 0021: "branches up to date" fights "approval of the most recent push".** Updating a PR's branch makes the clicker the last pusher, so the lead can't approve. The epic PR #8 was BEHIND main and needed a bypass. Only an App may update a PR branch, or main stays frozen while a spec or epic PR is open.
7. **0021: a tag ruleset can silently match nothing,** and creating a `spec/` tag stays open to anyone with write access (a stray `spec/999/r1` now can't be deleted). The setup check should try to move a canary tag, and creation should be limited to the reconciler.
8. **0022: an `epic/*` ruleset with required checks blocks creating the epic branch** ("4 of 4 required status checks are expected"). Needs `do_not_enforce_on_create`.
9. **0017 / 0022: "Closes #N" in a milestone PR doesn't close the sub-issue,** because GitHub only closes issues on merges into the default branch. The milestone stage has to be derived from the PR, or the epic PR has to carry every "Closes".
10. **0019: laptop agents make provenance self-declared.** The publish workflow proves *who* handed the work in (the lead), not *what produced it*. The lead could edit a handoff and then approve the App's commit of it. That's 0019's rejected "laptop as the App" alternative in another form.
11. **0027: the adversarial reviewer earned its place.** On #4 it found a one-request DoS the cases missed: a `__proto__` sensor ID crashes the server through a plain-object lookup, a bug already in the original `/latest`. That drove amendment r2. On #3 it found a case that ignored the sensor, and the missing contract change.
12. **0020: negative cases can pass vacuously.** The app already 404s unknown routes; only asserting the exact body makes "unknown sensor" red. The skill and the reviewer both caught it.
13. **0005 / 0022: a rebuild on a new revision is cleaner as a new milestone PR** than a reset of the old branch (resetting the PR's branch through the App's ref update didn't take; not chased).
14. **Solo owner:** one person can't approve their own PR, so every person-authored step (a sync, a fix to main) needs an App to author it, or a bypass. Real teams have a second reviewer; the platform should still give every flow step an App author.

## Where things are

- Rules (shared): `plugin/rules/src/`; tests `plugin/rules/test/*.unit.ts` (hand-made and recorded fixtures).
- Gates: `gates/`. Workflows: `.github/workflows/`. Rulesets: `setup/`.
- Lanes: `lanes/` (laptop: `local-build.ts`, `local-review.ts`; Apps: `publish`, `post-review`, `epic`, `dismiss`).
- Plugin and marketplace: `.claude-plugin/marketplace.json` → `plugin/` (skills, the mod and the guard in `hooks/register.ts`, tests in `plugin/tests/`).

## Teardown (owner)

Delete the repo, which also removes the undeletable `spec/999/r1` tag, then uninstall and delete both GitHub Apps at github.com/settings/apps.
