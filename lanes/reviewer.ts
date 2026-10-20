// Reviewer lane (0025, 0027): a fresh session on a different Claude model,
// given the artifact and its context, never the builder's transcript. Once per
// push; later rounds cover lines changed since plus findings still open; after
// three rounds the PR goes to the lead. Posts as the reviewer App and sets the
// `review` check, which only that App can write.
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as R from '../plugin/rules/src/index.ts';
import { api, repo } from '../gates/gh.ts';
import { currentPull, specIdFromDraft } from '../gates/pr.ts';
import { agentEnv, specForPull } from './common.ts';
import { setReviewCheck } from './review-check.ts';

const reviewer = process.env.REVIEWER_LOGIN!;
const model = process.env.REVIEWER_MODEL!;
const pull = await currentPull();
const spec = await specForPull(pull);
const lead = spec?.human_lead ?? '';
const comments: R.Comment[] = await api(`/repos/${repo}/issues/${pull.number}/comments?per_page=100`);
const ledger = R.replayFindings(comments, reviewer, lead);
const post = (body: string) => api(`/repos/${repo}/issues/${pull.number}/comments`, { method: 'POST', body: { body } });

if (ledger.rounds.some(r => r.sha === pull.head.sha)) {
  console.log(`already reviewed ${pull.head.sha}`);
  process.exit(0);
}

// 0025: the reviewer's model must differ from every builder model in provenance.
const builders = R.readProvenance(pull.body).filter(p => p.role === 'builder').map(p => p.model);
if (builders.includes(model)) {
  await setReviewCheck(pull.head.sha, false, 'reviewer model equals builder model', `Reviewer ${model} also built this PR (${builders.join(', ')}). 0025 needs a different model.`);
  process.exit(1);
}

const round = ledger.rounds.length + 1;
if (ledger.rounds.length >= R.MAX_ROUNDS) {
  if (!ledger.handedToLead)
    await post(R.roundComment({ round, sha: pull.head.sha, opened: [], fixed: [], handedToLead: true }, `**Adversarial review:** ${R.MAX_ROUNDS} rounds done; handed to @${lead}. Open findings close only by \`/dismiss <F-n> <reason>\` from the lead.`));
  const open = R.openFindings(ledger);
  await setReviewCheck(pull.head.sha, open.length === 0, `handed to lead: ${open.length} open`, open.map(f => `- ${f.id} ${f.title}`).join('\n') || 'none open');
  process.exit(0);
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

let result: any;
let usedModel = model;
for await (const msg of query({
  prompt,
  options: {
    model,
    cwd: process.cwd(),
    settingSources: [],
    extraArgs: { bare: null },
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
if (!out) {
  console.log(JSON.stringify(result, null, 2));
  await setReviewCheck(pull.head.sha, false, 'reviewer produced no result', `subtype ${result?.subtype}`);
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
await post(R.roundComment({ round, sha: pull.head.sha, opened, fixed }, human));

const after = R.replayFindings([...comments, { id: 0, user: { login: reviewer, type: 'Bot' }, body: R.roundComment({ round, sha: pull.head.sha, opened, fixed }, ''), created_at: new Date().toISOString() }], reviewer, lead);
const blocking = R.openFindings(after);
await setReviewCheck(pull.head.sha, blocking.length === 0, `round ${round}: ${blocking.length} blocking open`, blocking.map(f => `- ${f.id} [${f.severity}] ${f.title}`).join('\n') || 'nothing blocking', { model: usedModel, cost: result.total_cost_usd });
console.log(JSON.stringify({ round, model: usedModel, cost: result.total_cost_usd, opened, fixed }, null, 2));
