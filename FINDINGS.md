# ADP tracer-bullet slice: findings

Throwaway sandbox for decision 0028. **20 Oct 2026: epic #1 ran end to end, Frame → Done.**
Repo: https://github.com/dharishan04/adp-sandbox (public; delete after the decision records are updated).

**Owner's choices made during the run** (and, at the end, option A: the lanes moved back into Actions, signed in with the lead's Claude plan token, because API use is billed separately from the plan):
- No Claude API key: the agents ran in Claude Code on the lead's laptop (Max plan). Their output reached GitHub
  through a `handoff/` branch that the `publish` workflow re-committed as the builder App; reviewer rounds were posted
  by the reviewer App through `post-review`.
- Two merges used the owner's admin bypass, to get past the deadlocks recorded below (PR #6, PR #8).

The run: epic [#1](https://github.com/dharishan04/adp-sandbox/issues/1) → spec r1 [#3](https://github.com/dharishan04/adp-sandbox/pull/3) (2 review rounds) → `spec/1/r1` →
milestone [#4](https://github.com/dharishan04/adp-sandbox/pull/4) (the reviewer found a crash) → amendment r2 [#5](https://github.com/dharishan04/adp-sandbox/pull/5) → `spec/1/r2` → #4 fails
"revision is current" → sync [#6](https://github.com/dharishan04/adp-sandbox/pull/6) → rebuilt milestone [#7](https://github.com/dharishan04/adp-sandbox/pull/7) → epic [#8](https://github.com/dharishan04/adp-sandbox/pull/8) → one commit `293c46e` on main.
Model spend: about $7 (builder claude-sonnet-5-5, about $0.10–0.22 a run; reviewer claude-opus-5-5, about $0.25–1.63 a round).

## The assumptions (ten, plus 11 for the light view)

| # | Assumption | Decision | Result | Evidence |
|---|---|---|---|---|
| 1 | The lead can approve a spec PR that the builder App authored and last pushed, with "approval of the most recent push" on | 0019 | **held** | #3: author `app/adp-sandbox-builder-ishan`, both commits by the bot; @dharishan04 APPROVED the head `a27c012`; merged `d714718` with no bypass. #5 and #7 the same. |
| 2 | App commits made through the API show **Verified** | 0019 | **held** | Every commit from `createCommitOnBranch` (`fe6f344`, `a27c012`, `0e7eb0a`, `718f090`, …): author `adp-sandbox-builder-ishan[bot]`, committer `web-flow`, `verified: true`. The epic's squash commit `293c46e` is Verified too. |
| 3 | Lock passes only with the named lead's approval, all cases red, full coverage and no markers | 0020, 0023 | **held** | #3, first push: Lock refused on one `[NEEDS CLARIFICATION]`, no review on the head and no approval, while coverage passed and all 5 cases were red. After the lead's answer: 9 cases, all red, then approval → Lock passed. #5 (r2): 10 new cases red, Lock passed on approval. Locally, a vacuous "status-only 404" case is caught as passing. |
| 4 | Merging creates `spec/<id>/r1`, and a tag ruleset stops it moving | 0021 | **held, after a fix** | The reconciler created `spec/1/r1` at `d714718` and `spec/1/r2` at `9ca14ab`, and re-created r1 at the same commit after it was deleted. The first pattern, `refs/tags/spec/**`, **matched nothing**: the admin force-moved and deleted the tag. With `refs/tags/spec/*/*`, git and the API are refused (`GH013 Cannot update this protected ref`). |
| 5 | A new revision tag re-runs "revision is current" on an open PR, which then fails | 0021 | **held** | Merging #5 → `spec/1/r2` → the reconciler re-ran [gates run 39392277063](https://github.com/dharishan04/adp-sandbox/actions/runs/39392277063) on #4: spec-trace went from pass to **fail**, "cites 1@r1 but the spec is now at r2", with the fix-it. |
| 6 | The Agent SDK runs in Actions, bare, loading the pinned plugin from the marketplace | 0024 | **held, bare-equivalent** (option A: the lead's plan token) | [Builder run 39398227748](https://github.com/dharishan04/adp-sandbox/actions/runs/39398227748): Agent SDK 0.3.304 on an ephemeral runner, signed in with `CLAUDE_CODE_OAUTH_TOKEN` (no GitHub token in the agent step), `settingSources: []`, plugin `delivery@0.1.1` pinned at `plugin-v0.1.1` and resolved through `.claude-plugin/marketplace.json`. The session loaded only `delivery` and the built-in plugins (no personal mods, unlike the laptop), and the guard refused all three probe edits ($0.08, sonnet-5-5). The `--bare` flag itself can't be used with a plan token. [Reviewer run 39398342619](https://github.com/dharishan04/adp-sandbox/actions/runs/39398342619): opus-5-5 in Actions, round posted on #6 by the reviewer App. Gotcha: the token prints over two lines, and copying one gave `401 OAuth access token is invalid`. |
| 7 | The reviewer runs on a second Claude model; a re-check closes fixed findings; only the lead's `/dismiss` closes the rest | 0025, 0027 | **mostly held** | Builder sonnet-5-5, reviewer opus-5-5, separate sessions. On #3, round 1 opened F-1 to F-4 and round 2 re-checked and closed all four (recorded-fixture test). The `review` check was written only by `adp-sandbox-reviewer-ishan` and pinned to that App in the ruleset. `/dismiss` was **not exercised live**; a unit test shows a builder-App, third-party or forged dismissal is ignored. |
| 8 | A milestone PR goes into `epic/<id>`, then the epic lands on main as one commit, with rulesets on both | 0022 | **held, with two bypasses** | #7 → `epic/1` (no bypass); #8 `epic/1` → main squashed into one commit `293c46e` (1 parent). The sync #6 and the epic #8 needed the admin bypass (findings 5, 6). Milestone Issue #2 did not auto-close (finding 9). |
| 9 | The mod and a gate check derive the same stage from one rules package | 0026 | **held** | Gate: `stage (rules package): spec 1@r1 · Build`; the mod's `/trace 4`: `stage spec 1@r1 · Build`. Later `1@r2 · Build`, and `/trace 8` → `spec 1@r2 · Done`. Recorded fixtures (`plugin/rules/test/recorded.unit.ts`) assert Frame, Design, Lock and Done from the real records. The status line wasn't seen on screen. |
| 10 | The guard hook blocks an agent's edit to a case file, including through Bash | 0024 | **held** | Live probe (Haiku, `delivery@0.1.0`): an Edit on a case, `sed -i` on a case and an append to `.github/workflows/gates.yml` were all refused with the fix-it; `git status` was clean. The integrity gate behind it was never needed against an agent's code change. |
| 11 | The rules package runs unmodified in a browser | 0029 | **held, with a loader** | `web/` imports `plugin/rules/src/index.ts` with **no change to the package**: it uses only web APIs (`atob`, `TextDecoder`, `fetch` through the `Get` it is handed), because it already had to run inside a mod. But **browsers can't execute TypeScript**, so natively it doesn't load. `web/ts-loader.js` fetches the 11 `.ts` files and strips the types with esbuild-wasm (14 MB wasm, loaded once) in the page, in about 43 ms; nothing is built ahead of time and the server only serves files. All four pages (overview, spec, gate report, trace) work on the real epic in the Claude desktop browser pane, live and unauthenticated. |

## What the run changed (for the decision records)

1. **0026: the rules package must ship inside the plugin, with no dependencies.** A mod can't import outside its plugin folder, even through a symlink. Here it lives at `plugin/rules/` (no YAML library, no Node APIs), and the gates import it from there.
2. **0024: `--bare` refuses subscription auth, and a laptop session isn't isolated (an ephemeral runner is).** `--bare` accepts only `ANTHROPIC_API_KEY` or apiKeyHelper. With `settingSources: []`, a laptop session still loaded the owner's personal mod (`~/.claude/mods/idea-inbox`) and the built-in plugins. A laptop lane needs its own config dir or the managed policy 0024 already plans.
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
15. **Install friction: creating the GitHub Apps was the hardest step for the owner** (an App form, a private key, five secrets and variables, some saved in the wrong place). A product for "any person" can't ask for that: platform-owned published Apps per role (Q25) and one `npx adp init` command. The owner also chose a light, serverless web view over Backstage first (note in the shared notes; supersedes 0003).
14. **Solo owner:** one person can't approve their own PR, so every person-authored step (a sync, a fix to main) needs an App to author it, or a bypass. Real teams have a second reviewer; the platform should still give every flow step an App author.

16. **0029: the light view works as static files over unauthenticated GitHub, with four catches.** (a) The rules package must ship as JavaScript for browsers, or be type-stripped at load (here esbuild-wasm in the page; a release step that emits `.js` beside the `.ts` would remove the 14 MB loader). (b) The Claude desktop browser pane **refuses service workers** (every registration fails, even a `data:` one), so a service-worker loader was dropped for an in-page one. (c) Unauthenticated GitHub allows 60 calls an hour per IP. A full click-through of the four pages costs about 20 calls; responses are cached in memory and localStorage with ETags (10-minute TTL), the footer shows what's left, and `web/snapshot/` (recorded with `gh`, 36 responses) answers only when the limit is hit, labelled. For a team, sign-in (Q30) is not optional: a shared office IP exhausts 60 an hour fast. (d) Unauthenticated reads can't see repo variables, so the reviewer App's identity is view config (`web/config.js`). CORS from the browser to api.github.com just works.
17. **The rules package's stages are not the harness's seven.** It derives Frame, Design, Lock, Build and Done; Enforce, Transition and Field have no rule and no record (deploys are out of v0, Q23). The view shows those three as "not derived" rather than inventing them. The stage model needs a decision: either the package grows rules (and records) for the last three, or the portal admits a five-stage v0.
18. **The one-minute trace takes 1.5 seconds** live, unauthenticated (PR #3: change, approver on the latest push, spec revision → tag, agent and model with run links, review rounds, gates, where it landed), and about 10 ms from cache.
19. **Static-server gotcha in the desktop app:** `python3 -m http.server` died at startup (`os.getcwd()`: Operation not permitted in the launch sandbox). `web/serve.mjs`, a 20-line Node file server with absolute paths, works and sets `application/wasm`.

## Contract-model trial (ADP 0031), steps 1 and 2, local, 23 Nov 2026

Spec 1 re-expressed as a living contract (`app/contract.md`) and a delta (now the test fixture
`plugin/rules/test/fixtures/epic1-sensors.delta.md`, see 32); the rules
package gained `contract.ts` and `delta.ts` (30 of 30 unit tests, typecheck clean); `gates/contract.ts` runs the checks
with git alone. Nothing pushed; no workflow changed.

20. **"FR-001 and FR-003 disappear into OpenAPI" was half wrong.** Only their shape did. "Only that sensor, oldest
    first" and "unknown sensor → 404" are behaviour, so they became SENSORS-R001 and R003. Only FR-006 ("documented in
    `openapi.yaml`") vanished outright: the operation-link check now does its job. Seven FR/SC items became seven rules.
21. **The shape file restates behaviour too.** `openapi.yaml`'s descriptions say "Inclusive start" and "at most 7 days
    after from": the drift 0031 removed from the spec survives in OpenAPI prose. Open: forbid rule-like descriptions,
    or point them at rule IDs.
22. **The fold round-trips exactly.** Folding epic 1's delta onto no contract renders a byte-identical
    `app/contract.md`; on today's tree the delta reads as folded and a second fold is refused. It needs one canonical
    rule layout (meta lines, blank line, scenarios). The test found a parser bug: a blank line after `#### Now` hid the
    `Operation:` line.
23. **Clarifications split three ways.** The 7-day maximum became a module decision
    (`docs/decisions/0001-history-range-is-at-most-seven-days.md`, linked from R004 and checked to resolve). Why r2
    exists is history (PR #5). The out-of-scope list belongs on the epic Issue, which was not edited (GitHub write).
24. **Guard gap, now closed: the contract was not protected.** `app/openapi.yaml`, and any future `contract.md` or
    delta file, were open to agents; spec 1's builder edited `openapi.yaml` (FR-006). They are now a `contract` kind in
    `protected.ts`. A draft-spec run may write only its own epic's delta files; the integrity gate allows the living
    contract to change only on the epic PR into main, where `--epic` checks the content. `plugin/tests/guard.test.ts`
    was not run here (it needs the mod test harness).
25. **The skills contradicted the new guard; updated.** `build` told the builder to keep `app/openapi.yaml` in step,
    and `draft-spec` wrote `specs/<id>.md`. Now `draft-spec` writes `specs/<id>/sensors.delta.md`, an optional
    `sensors.openapi.next.yaml`, the cases and any decision record; its template parses, checks clean and applies.
    `build` builds to main's contract plus the delta, puts a disposable `Plan:` first, and reports what turns up under
    Contract (stop), Outlives the task, or Out of scope (0031 §1).
26. **The fold is committed by the epic PR's author and verified, not pushed by CI.** CI cannot push past the
    rulesets, and 0019 already has the epic lane author that PR. `--fold` writes the result; `--epic` proves it.
27. **"Breaking" is conservative until Q36:** any MODIFIED or REMOVED rule counts as possibly breaking, so on a stable
    contract it needs a second approver.

28. **One reader for an epic's lock, in either format.** `plugin/rules/src/lockunit.ts` (`readLockUnit`) decides,
    per ref, whether epic N's lock is `specs/N.md` or `specs/N/<module>.delta.md`. It gives both the same fields: lead,
    revision, cases, milestones, requirement IDs and text, notes. Seven readers moved to it: the Lock gate, the spec-tag
    reconciler, the builder lane's context (`authorize.ts`), `common.ts` (the review and dismiss lanes), the epic lane,
    the mod's `/trace` and the web view. History reads true: at `spec/1/r2` epic 1 is the old spec; with the delta on
    main it is the delta. 35 of 35 unit tests.
29. **The Lock gate checks more for a delta.**
    - It applies to main's contract (IDs and the quoted Was text).
    - Every rule's operation is declared in the shape the epic will merge (`openapi.next.yaml`, else `openapi.yaml`).
    - `Decided in:` links resolve.
    - The living contract and `openapi.yaml` are unchanged from main.
    - When §11 asks for one, a second human (not the lead, not a bot) approves the latest push.

    Not yet run against a live PR.
30. **The epic lane refuses to land an unfolded delta**, but doesn't fold it. `land` checks that `epic/N` holds
    exactly main's contract plus the delta, with no `openapi.next.yaml` left. Committing the fold from the lane (an
    App commit through the API, as `open-pr.ts` does) is step 3 work; until then someone runs `gates/contract.ts --fold`
    on the epic branch.
31. **The web view runs on the new reader**, checked live against GitHub (spec page, r2). Two costs:
    - Each spec read lists `specs/N/` first. For an epic in the old format that's a 404, so one extra call against the
      60-an-hour unauthenticated limit. `web/make-snapshot.mjs` doesn't record those listings.
    - The delta branch of the spec page (rules changed, decisions and removals, base tag) is covered only by unit
      tests until a delta is on GitHub.

32. **The integrity gate refused the trial's own PR (#9), rightly.** `specs/1/sensors.delta.md` was a lock record for
    epic 1, added outside epic 1's Lock PR. Epic 1 was locked at `spec/1/r2` as `specs/1.md`, so a later delta would
    rewrite a locked epic's history with no Lock. The same rule protects cases and specs.
    - **The fix keeps history true:** epic 1 stays in the old format, `app/contract.md` lands as the starting
      contract (a person's change, allowed), and the delta became a test fixture.
    - **Migration rule:** an existing module's contract starts as a baseline commit. Epics locked before the switch
      keep their old record; only new epics write deltas.
    - **Message bug fixed:** it said "with agent commits ()" when there were none.

## Where things are

- Rules (shared): `plugin/rules/src/`; tests `plugin/rules/test/*.unit.ts` (hand-made and recorded fixtures).
- Gates: `gates/`. Workflows: `.github/workflows/`. Rulesets: `setup/`.
- Lanes: `lanes/` (laptop: `local-build.ts`, `local-review.ts`; Apps: `publish`, `post-review`, `epic`, `dismiss`).
- Light view (0029): `web/` (`index.html`, `app.js`, `github.js`, `ts-loader.js`, `config.js`, `style.css`, `snapshot/`); serve with `node web/serve.mjs` and open http://localhost:8787/web/ (`.claude/launch.json` → `delivery-view`).
- Plugin and marketplace: `.claude-plugin/marketplace.json` → `plugin/` (skills, the mod and the guard in `hooks/register.ts`, tests in `plugin/tests/`).

## Teardown (owner)

Delete the repo, which also removes the undeletable `spec/999/r1` tag, then uninstall and delete both GitHub Apps at github.com/settings/apps.
