// Lock checks on a spec PR (0004, 0020, 0021, 0023, 0027): format, markers,
// coverage, every listed case red, revision = main's + 1, lead = epic assignee,
// reviewer green on the head commit, and the named lead's approval of the latest push.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as R from '../plugin/rules/src/index.ts';
import { api, get, readText, report, repo } from './gh.ts';
import { currentPull, specIdFromDraft } from './pr.ts';

const pull = await currentPull();
const draft = specIdFromDraft(pull.head.ref);
if (!draft) report('lock', [{ ok: true, message: `not a spec PR (${pull.head.ref}): Lock does not apply` }]);

type Line = { ok: boolean; message: string; fix?: string };
const lines: Line[] = [];
const text = readFileSync(R.specPath(draft.id), 'utf8');
const { spec, problems } = R.parseSpec(text);
for (const p of problems) lines.push({ ok: false, message: `${p.check}: ${p.message}`, fix: p.fix });
if (!spec) report('lock', lines);

lines.push({ ok: spec.id === draft.id, message: `spec id ${spec.id} matches branch ${pull.head.ref}`, fix: 'The spec id is the epic Issue number and must match the branch.' });
const onMain = await readText(R.specPath(spec.id), 'main');
const mainRev = onMain ? (R.parseSpec(onMain).spec?.revision ?? 0) : 0;
lines.push({ ok: spec.revision === mainRev + 1, message: `revision ${spec.revision} is main's (${mainRev}) + 1`, fix: `Set revision: ${mainRev + 1}.` });

const issue: R.Issue = await api(`/repos/${repo}/issues/${spec.id}`);
const assignees = issue.assignees.map(a => a.login);
lines.push({
  ok: assignees.length === 1 && assignees[0].toLowerCase() === spec.human_lead.toLowerCase(),
  message: `human_lead @${spec.human_lead} is the epic's one assignee (${assignees.join(', ') || 'none'})`,
  fix: 'Assign the epic Issue to exactly one person and name them as human_lead.',
});

for (const p of R.checkConsistency(spec, { atLock: true })) lines.push({ ok: false, message: `${p.check}: ${p.message}`, fix: p.fix });
if (!lines.some(l => !l.ok && l.message.startsWith('coverage'))) lines.push({ ok: true, message: 'every requirement has a case and a milestone; every cite is real' });
if (R.markerCount(spec.body) === 0) lines.push({ ok: true, message: 'no [NEEDS CLARIFICATION] markers' });

// Every listed case must be red at Lock: each test in each case file fails.
const missing = spec.cases.filter(c => !existsSync(c.path));
for (const c of missing) lines.push({ ok: false, message: `case file ${c.path} does not exist`, fix: 'Add the case file listed in the front matter.' });
if (!missing.length) {
  const files = spec.cases.map(c => c.path.replace(/^app\//, ''));
  try {
    execFileSync('npx', ['playwright', 'test', '--reporter=json', ...files], { cwd: 'app', stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: `${process.cwd()}/app/lock.json` } });
  } catch {
    // Failing is the expected outcome; read the report.
  }
  const results = JSON.parse(readFileSync('app/lock.json', 'utf8'));
  const tests: { file: string; title: string; status: string }[] = [];
  const walk = (s: any, file = s.file) => {
    for (const sp of s.specs ?? []) for (const t of sp.tests) tests.push({ file: sp.file ?? file, title: sp.title, status: t.status });
    for (const c of s.suites ?? []) walk(c, c.file ?? file);
  };
  for (const s of results.suites) walk(s);
  for (const c of files) {
    const mine = tests.filter(t => t.file.endsWith(c.replace(/^cases\//, '')) || t.file === c);
    if (!mine.length) lines.push({ ok: false, message: `${c} holds no tests`, fix: 'A case must hold at least one test.' });
    for (const t of mine)
      lines.push({ ok: t.status === 'unexpected', message: `case red at Lock: ${c} › ${t.title} (${t.status === 'unexpected' ? 'fails' : 'PASSES'})`, fix: 'A case that already passes tests nothing new: make it assert the new behaviour.' });
  }
}

// The reviewer has reviewed this head commit and nothing blocking is open (0027).
const comments: R.Comment[] = await api(`/repos/${repo}/issues/${pull.number}/comments?per_page=100`);
const ledger = R.replayFindings(comments, process.env.REVIEWER_LOGIN ?? 'adp-reviewer[bot]', spec.human_lead);
const reviewedHead = ledger.rounds.some(r => r.sha === pull.head.sha) || ledger.handedToLead;
const open = R.openFindings(ledger);
lines.push({ ok: reviewedHead, message: `adversarial review covers the head commit ${pull.head.sha.slice(0, 7)}`, fix: 'Wait for the reviewer lane on this push.' });
lines.push({ ok: open.length === 0, message: `open blocking findings: ${open.map(f => f.id).join(', ') || 'none'}`, fix: 'Fix them (the reviewer re-checks on the next push) or the lead comments /dismiss <F-n> <reason>.' });

const reviews: R.Review[] = await api(`/repos/${repo}/pulls/${pull.number}/reviews?per_page=100`);
const appr = R.leadApproval(reviews, spec.human_lead, pull.head.sha);
lines.push({ ok: appr.ok, message: appr.message, fix: `@${spec.human_lead} approves the PR at its latest push.` });

report('lock', lines, [`spec ${spec.id} r${spec.revision} · ${R.formatStage(R.deriveStage(spec.id, await R.gatherEpic(get, repo, spec.id)))}`]);
