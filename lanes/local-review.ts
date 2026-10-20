// Reviewer lane on a laptop (owner's choice): a fresh Claude Code session on a
// different model, given the artifact and its context, never the builder's
// transcript. Once per push; later rounds cover lines changed since plus
// findings still open; after three rounds the PR goes to the lead.
//   node lanes/local-review.ts <PR>
// It writes nothing to GitHub. It prints the payload for the post-review
// workflow, which posts it as the reviewer App and sets the `review` check.
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as R from '../plugin/rules/src/index.ts';
import { api, repo } from '../gates/gh.ts';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { specIdFromDraft } from '../gates/pr.ts';
import { agentEnv, specForPull } from './common.ts';

process.env.ADP_LOCAL = '1';
const root = resolve(import.meta.dirname, '..');
const reviewer = process.env.REVIEWER_LOGIN ?? execFileSync('gh', ['variable', 'get', 'REVIEWER_LOGIN'], { encoding: 'utf8' }).trim();
const model = process.env.REVIEWER_MODEL ?? 'claude-opus-5-5';
const pull: R.Pull = await api(`/repos/${repo}/pulls/${process.argv[2]}`);
const payloadOut = (p: unknown): never => {
  const b64 = Buffer.from(JSON.stringify(p)).toString('base64');
  const file = join(mkdtempSync(join(tmpdir(), 'adp-review-')), 'payload.b64');
  writeFileSync(file, b64);
  if (process.env.GITHUB_OUTPUT) writeFileSync(`${process.env.RUNNER_TEMP}/review-payload.b64`, b64);
  console.log(`\npayload written to ${file}. Post it as the reviewer App:\n  gh workflow run post-review -f pr=${pull.number} -f payload="$(cat ${file})"`);
  process.exit(0);
};
const spec = await specForPull(pull);
const lead = spec?.human_lead ?? '';
const comments: R.Comment[] = await api(`/repos/${repo}/issues/${pull.number}/comments?per_page=100`);
const ledger = R.replayFindings(comments, reviewer, lead);

if (ledger.rounds.some(r => r.sha === pull.head.sha)) {
  console.log(`already reviewed ${pull.head.sha}`);
  process.exit(0);
}

// 0025: the reviewer's model must differ from every builder model in provenance.
const builders = R.readProvenance(pull.body).filter(p => p.role === 'builder').map(p => p.model);
if (builders.includes(model)) {
  console.log(`refused: reviewer ${model} also built this PR (${builders.join(', ')}); 0025 needs a different model`);
  process.exit(1);
}

const round = ledger.rounds.length + 1;
if (ledger.rounds.length >= R.MAX_ROUNDS) {
  payloadOut({ pr: pull.number, block: { round, sha: pull.head.sha, opened: [], fixed: [], handedToLead: true }, human: `**Adversarial review:** ${R.MAX_ROUNDS} rounds done; handed to @${lead}. Open findings close only by \`/dismiss <F-n> <reason>\` from the lead.` });
}

const files: { filename: string; patch?: string }[] = await api(`/repos/${repo}/pulls/${pull.number}/files?per_page=100`);
const last = ledger.rounds.at(-1);
let sinceLast = '';
if (last) {
  const cmp = await api(`/repos/${repo}/compare/${last.sha}...${pull.head.sha}`).catch(() => undefined);
  sinceLast = cmp ? cmp.files.map((f: any) => `--- ${f.filename}\n${f.patch ?? '(binary or too large)'}`).join('\n\n') : '(compare failed; review the whole diff)';
}
const openNow = ledger.findings.filter(f => !f.closed);
const isSpec = !!specIdFromDraft(pull.head.ref);
const attack = isSpec
  ? 'This is a SPEC PR (spec + case files, before Lock). Attack: ambiguity, missing negative cases, contradictions with the existing contract (app/openapi.yaml), invariants with no enforcing mechanism, untestable requirements, and cases that would pass without the feature (tests that test nothing).'
  : 'This is a CODE PR building a locked spec. Attack: security, contract drift from app/openapi.yaml and the spec, module boundaries, tests that test nothing, and fixes that miss places the rule applies.';

const prompt = [
  `You are the adversarial reviewer for PR #${pull.number} "${pull.title}" (${pull.head.ref} → ${pull.base.ref}), round ${round} of at most ${R.MAX_ROUNDS}.`,
  attack,
  'You comment only. Report a finding only if you would block the merge on it or if it is a real low-severity issue; no style nits. Use the repo checkout (read-only tools) to verify claims before raising them.',
  spec ? `\n## Spec ${spec.id} r${spec.revision}${isSpec ? ' (proposed)' : ' (locked)'}\n${spec.body}\nCases: ${JSON.stringify(spec.cases)}` : '\n(no spec found for this PR)',
  `\n## Diff of the PR\n${files.map(f => `--- ${f.filename}\n${f.patch ?? '(binary or too large)'}`).join('\n\n')}`,
  last ? `\n## Changed since your last round (${last.sha.slice(0, 7)}): focus here\n${sinceLast}` : '',
  openNow.length ? `\n## Findings still open: re-check each and list it in "fixed" only if the current code really fixes it\n${openNow.map(f => `- ${f.id} [${f.severity}] ${f.title}${f.path ? ` (${f.path}${f.line ? `:${f.line}` : ''})` : ''}`).join('\n')}` : '',
].join('\n');

const schema = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' }, description: 'IDs of open findings the current head really fixes' },
    new_findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { severity: { enum: ['high', 'medium', 'low'] }, title: { type: 'string' }, path: { type: 'string' }, line: { type: 'integer' }, detail: { type: 'string' } },
        required: ['severity', 'title', 'detail'],
      },
    },
    verdict: { type: 'string' },
  },
  required: ['fixed', 'new_findings', 'verdict'],
};

const work = join(mkdtempSync(join(tmpdir(), 'adp-review-wt-')), 'work');
execFileSync('git', ['fetch', '--quiet', 'origin', pull.head.sha], { cwd: root });
execFileSync('git', ['worktree', 'add', '--quiet', '--detach', work, pull.head.sha], { cwd: root });

let result: any;
let usedModel = model;
for await (const msg of query({
  prompt,
  options: {
    model,
    cwd: work,
    settingSources: [],
    env: agentEnv(),
    tools: ['Read', 'Grep', 'Glob'],
    allowedTools: ['Read', 'Grep', 'Glob'],
    permissionMode: 'dontAsk',
    maxTurns: 30,
    maxBudgetUsd: Number(process.env.MAX_BUDGET_USD ?? 3),
    outputFormat: { type: 'json_schema', schema },
  },
})) {
  if (msg.type === 'system' && msg.subtype === 'init') usedModel = msg.model;
  if (msg.type === 'result') result = msg;
}
const out = result?.structured_output as { fixed: string[]; new_findings: { severity: R.Severity; title: string; path?: string; line?: number; detail: string }[]; verdict: string } | undefined;
execFileSync('git', ['worktree', 'remove', '--force', work], { cwd: root });
if (!out) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
}

const openIds = new Set(openNow.map(f => f.id));
const fixed = out.fixed.filter(id => openIds.has(id));
let n = R.nextFindingId(ledger);
const opened = out.new_findings.map(f => ({ id: `F-${n++}`, severity: f.severity, title: f.title, path: f.path, line: f.line }));
const human = [
  `**Adversarial review, round ${round}** on \`${pull.head.sha.slice(0, 7)}\` by ${usedModel} (builder: ${builders.join(', ') || 'none recorded'}).`,
  '',
  out.verdict,
  '',
  ...out.new_findings.map((f, i) => `- **${opened[i].id}** [${f.severity}] ${f.title}${f.path ? ` — \`${f.path}${f.line ? `:${f.line}` : ''}\`` : ''}\n  ${f.detail.replace(/\n/g, '\n  ')}`),
  fixed.length ? `\nRe-checked and fixed: ${fixed.join(', ')}` : '',
  `\nOnly @${lead || 'the human lead'} can close a finding without a fix: \`/dismiss <F-n> <reason>\`.`,
].join('\n');
console.log(human);
console.log(JSON.stringify({ round, model: usedModel, cost: result.total_cost_usd, opened, fixed }, null, 2));
payloadOut({ pr: pull.number, block: { round, sha: pull.head.sha, opened, fixed, model: usedModel, session: result.session_id, cost: result.total_cost_usd }, human });
