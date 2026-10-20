# GitHub setup for the slice (owner's steps)

Claude never handles keys or tokens. Steps marked **you** are yours. Steps marked **Claude, on your OK** are run with your `gh` login, only after you say yes.

1. **Claude, on your OK:** create the public repo `dharishan04/adp-sandbox`, push `main`, and push the tag `plugin-v0.1.0` (the pinned plugin).
2. **You: builder App.** GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.
   Name: something unique, e.g. `adp-sandbox-builder-ishan`. Homepage: the repo URL. Webhook: **untick Active**.
   Repository permissions: Contents **Read and write**, Pull requests **Read and write**, Issues **Read and write** (Metadata is read-only by default).
   Leave Workflows at **No access**: GitHub then refuses any commit by the App that touches `.github/workflows`.
   "Only on this account" → Create. Note the **App ID**. Generate a private key (it downloads a `.pem`).
   Install App → only `adp-sandbox`.
3. **You: reviewer App.** Same steps, named e.g. `adp-sandbox-reviewer-ishan`. Permissions: Pull requests **Read and write**, Checks **Read and write**, Contents **Read-only**, Issues **Read-only**. Note its App ID and slug, generate a key, and install it on `adp-sandbox` only.
4. **You: secrets and variables.** Repo → Settings → Secrets and variables → Actions.
   - Secrets: `BUILDER_APP_KEY` (the whole builder `.pem`), `REVIEWER_APP_KEY`. No model key: the agents run in Claude Code on your laptop.
   - Variables: `BUILDER_APP_ID`, `REVIEWER_APP_ID`, `REVIEWER_LOGIN` = `<reviewer slug>[bot]` (for example `adp-sandbox-reviewer-ishan[bot]`).
   Then delete the downloaded `.pem` files.
5. **Claude, on your OK:** apply the rulesets with `setup/apply-rulesets.sh dharishan04/adp-sandbox <reviewer App ID>`:
   - main: PR, 1 code-owner approval of the latest push, squash only, checks lock/spec-trace/integrity/app-tests, and `review` from the reviewer App only;
   - `epic/**`: the same, without lock;
   - `spec/**` tags: no update or delete.
6. **Claude, on your OK:** create the epic Issue ("Add reading history for a sensor over a time range"), assigned to you, plus one milestone sub-issue.
7. **You, once:** `claude auth login` in a terminal, so laptop runs can use your Claude Code subscription.
8. **The loop (owner's choice: agents run on the laptop, their output reaches GitHub as the Apps):**
   - Builder: `node lanes/local-build.ts draft-spec 1` (or `build 1 <rev> 2`) runs a fresh Claude Code session in a temporary worktree, with the plugin pinned at `plugin-v0.1.0`, and pushes `handoff/<branch>` as you. Then `gh workflow run publish -f handoff=handoff/<branch>`: the builder App re-commits it, signed, and opens or updates the PR.
   - Reviewer: `node lanes/local-review.ts <PR>` runs a fresh session on a different model, then `gh workflow run post-review -f pr=<PR> -f payload=...` posts the round as the reviewer App.
   - You close findings with `/dismiss F-n <reason>` on the PR, and approve as yourself.

Known snag for a one-person sandbox: you can't approve your own PR. Spec and milestone PRs come from the builder App, so that's fine. The one person's PR in the flow (syncing main into `epic/<id>` after an amendment) needs a ruleset bypass for you on that one merge. That itself is a finding for Q26.
