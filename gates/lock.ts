// Lock checks on a spec PR (0004, 0020, 0021, 0023, 0027): format, markers,
// coverage, every listed case red, revision = main's + 1, lead = epic assignee,
// reviewer green on the head commit, and the named lead's approval of the latest push.
// A contract delta (0031) also: applies to main, operations declared, living contract
// untouched, and a second human where §11 asks for one.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as R from '../plugin/rules/src/index.ts';
import { api, get, lockAt, readText, report, repo } from './gh.ts';
import { currentPull, specIdFromDraft } from './pr.ts';

const pull = await currentPull();
const draft = specIdFromDraft(pull.head.ref);
if (!draft) report('lock', [{ ok: true, message: `not a spec PR (${pull.head.ref}): Lock does not apply` }]);

type Line = { ok: boolean; message: string; fix?: string };
const lines: Line[] = [];
// The epic's lock in this PR: specs/<id>/<module>.delta.md (0031) or specs/<id>.md (0004).
const where = R.lockUnitPath(draft.id, existsSync(`specs/${draft.id}`) ? readdirSync(`specs/${draft.id}`) : []);
for (const p of where.problems) lines.push({ ok: false, message: `${p.check}: ${p.message}`, fix: p.fix });
if (!existsSync(where.path)) report('lock', [...lines, { ok: false, message: `${where.path} does not exist`, fix: 'A spec PR adds the epic\'s delta (or spec) file.' }]);
const { unit, problems } = R.parseLockUnit(where.path, readFileSync(where.path, 'utf8'));
for (const p of problems) lines.push({ ok: false, message: `${p.check}: ${p.message}`, fix: p.fix });
if (!unit) report('lock', lines);
const spec = unit; // the fields Lock reads are the same in both formats
lines.push({ ok: true, message: `locking ${where.path} (${unit.kind === 'delta' ? `contract delta for module ${unit.delta!.module}` : 'spec file'})` });

lines.push({ ok: spec.id === draft.id, message: `spec id ${spec.id} matches branch ${pull.head.ref}`, fix: 'The spec id is the epic Issue number and must match the branch.' });
const mainRev = (await lockAt(spec.id, 'main')).unit?.revision ?? 0;
lines.push({ ok: spec.revision === mainRev + 1, message: `revision ${spec.revision} is main's (${mainRev}) + 1`, fix: `Set revision: ${mainRev + 1}.` });

const issue: R.Issue = await api(`/repos/${repo}/issues/${spec.id}`);
const assignees = issue.assignees.map(a => a.login);
lines.push({
  ok: assignees.length === 1 && assignees[0].toLowerCase() === spec.human_lead.toLowerCase(),
  message: `human_lead @${spec.human_lead} is the epic's one assignee (${assignees.join(', ') || 'none'})`,
  fix: 'Assign the epic Issue to exactly one person and name them as human_lead.',
});

for (const p of R.lockConsistency(unit, { atLock: true })) lines.push({ ok: false, message: `${p.check}: ${p.message}`, fix: p.fix });
if (!lines.some(l => !l.ok && l.message.startsWith('coverage'))) lines.push({ ok: true, message: 'every requirement has a case and a milestone; every cite is real' });
if (R.markerCount(unit.text) === 0) lines.push({ ok: true, message: 'no [NEEDS CLARIFICATION] markers' });

// A delta must still apply to main's living contract, name only declared operations,
// and leave the living contract itself alone (it changes at epic merge, 0031 §5).
let secondApprover = false;
if (unit.delta) {
  const d = unit.delta;
  const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).trim();
  const contractPath =
    git('ls-files', '*contract.md').split('\n').filter(Boolean).find(p => R.parseContract(readFileSync(p, 'utf8')).contract?.module === d.module) ??
    `${(d.openapi ?? 'app/openapi.yaml').replace(/[^/]*$/, '')}contract.md`;
  const mainText = await readText(contractPath, 'main');
  const main = mainText ? R.parseContract(mainText).contract : undefined;
  const tags: R.Ref[] = await api(`/repos/${repo}/git/matching-refs/tags/contract/${d.module}/`).catch(() => []);
  const revs = R.contractRevisions(d.module, tags);
  const latest = revs.length ? R.contractTagName(d.module, revs[revs.length - 1]) : undefined;
  const state = R.deltaState(d, main, latest);
  for (const p of state.problems) lines.push({ ok: false, message: `applies: ${p.message}`, fix: p.fix });
  if (state.state === 'pending') lines.push({ ok: true, message: `the delta applies to main's ${d.module} contract (${latest ?? 'no tag yet'})${state.notes.length ? `; ${state.notes.join('; ')}` : ''}` });
  if (state.state === 'folded') lines.push({ ok: false, message: 'main already says everything in this delta: nothing to lock', fix: 'An amendment changes at least one rule.' });

  const next = R.openapiNextPath(d.id, d.module);
  const shapeFile = existsSync(next) ? next : (main?.openapi ?? d.openapi ?? 'app/openapi.yaml');
  const ops = existsSync(shapeFile) ? R.openapiOperations(readFileSync(shapeFile, 'utf8')) : [];
  for (const r of [...d.added, ...d.modified.map(m => m.now)])
    for (const op of r.operations)
      lines.push({ ok: ops.includes(op), message: `${r.id} constrains ${op}, declared in ${shapeFile}`, fix: `Declare ${op} in ${next}.` });
  for (const r of [...d.added, ...d.modified.map(m => m.now)])
    for (const ref of r.decidedIn) lines.push({ ok: existsSync(ref), message: `${r.id} → ${ref} resolves`, fix: 'Add the decision record in this PR.' });

  for (const f of [contractPath, main?.openapi ?? d.openapi ?? 'app/openapi.yaml']) {
    const tree = existsSync(f) ? readFileSync(f, 'utf8') : undefined;
    const onMain = await readText(f, 'main');
    lines.push({ ok: tree === onMain, message: `${f} is unchanged from main (it changes at epic merge)`, fix: `Put the change in the delta${f.endsWith('.yaml') ? ` or ${next}` : ''}, and restore ${f}.` });
  }
  secondApprover = R.needsSecondApprover(d, main);
  lines.push({ ok: true, message: `${R.classifyDelta(d)} change to a ${main?.stability ?? 'new (provisional)'} contract; second human needed: ${secondApprover ? 'yes' : 'no'}` });
}

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
if (secondApprover) {
  const other = reviews.find(r => r.state === 'APPROVED' && r.commit_id === pull.head.sha && r.user.type !== 'Bot' && r.user.login.toLowerCase() !== spec.human_lead.toLowerCase());
  lines.push({ ok: !!other, message: `a second human approves the latest push (0031 §11): ${other ? `@${other.user.login}` : 'none yet'}`, fix: 'A stable contract\'s possibly breaking change, or a graduation to stable, needs a person other than the lead.' });
}

report('lock', lines, [`spec ${spec.id} r${spec.revision} (${unit.kind}) · ${R.formatStage(R.deriveStage(spec.id, await R.gatherEpic(get, repo, spec.id)))}`]);
