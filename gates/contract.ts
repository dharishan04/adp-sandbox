// Contract checks (0031), runnable locally or in CI with git alone (no GitHub calls):
//
//   npx tsx gates/contract.ts                 every contract and delta, against the base ref
//   npx tsx gates/contract.ts --fold <epic>   write the fold: what the epic PR into main commits
//   npx tsx gates/contract.ts --epic <epic>   epic-merge check: the tree holds exactly main + the delta
//
// The base ref is BASE_REF (default main). Exit code 1 on any problem.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as R from '../plugin/rules/src/index.ts';

const base = process.env.BASE_REF ?? 'main';
const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const atBase = (path: string) => {
  try {
    return git('show', `${base}:${path}`);
  } catch {
    return undefined;
  }
};
const latestTag = (module: string) => {
  const revs = git('tag', '-l', `contract/${module}/r*`)
    .split('\n')
    .filter(Boolean)
    .map(t => ({ ref: `refs/tags/${t}`, object: { sha: '' } }));
  const n = R.contractRevisions(module, revs);
  return n.length ? R.contractTagName(module, n[n.length - 1]) : undefined;
};

let failed = false;
const say = (ok: boolean, msg: string, fix?: string) => {
  if (!ok) failed = true;
  console.log(`${ok ? '✓' : '✗'} ${msg}${!ok && fix ? `\n    fix: ${fix}` : ''}`);
};

// Contracts in the tree, by module.
const contractFiles = git('ls-files', '--cached', '--others', '--exclude-standard', '*contract.md').split('\n').filter(Boolean);
const contracts = new Map<string, { path: string; contract: R.Contract }>();
for (const path of contractFiles) {
  const { contract, problems } = R.parseContract(readFileSync(path, 'utf8'));
  for (const p of problems) say(false, `${path}: ${p.message}`, p.fix);
  if (!contract) continue;
  contracts.set(contract.module, { path, contract });
}

const deltas: { path: string; delta: R.Delta }[] = [];
for (const dir of existsSync('specs') ? readdirSync('specs').filter(d => /^\d+$/.test(d)) : [])
  for (const f of readdirSync(`specs/${dir}`).filter(f => f.endsWith('.delta.md'))) {
    const path = `specs/${dir}/${f}`;
    const { delta, problems } = R.parseDelta(readFileSync(path, 'utf8'));
    for (const p of problems) say(false, `${path}: ${p.message}`, p.fix);
    if (delta) deltas.push({ path, delta });
  }

function baseContract(module: string, path: string | undefined) {
  const text = path ? atBase(path) : undefined;
  return text ? R.parseContract(text).contract : undefined;
}

const mode = process.argv[2];
const epicArg = Number(process.argv[3]);
const mine = deltas.filter(d => d.delta.id === epicArg);

if (mode === '--fold' || mode === '--epic') {
  if (!mine.length) say(false, `no delta for epic ${process.argv[3]} under specs/${process.argv[3]}/`);
  for (const { path, delta } of mine) {
    const known = contracts.get(delta.module);
    const contractPath = known?.path ?? `${(delta.openapi ?? 'app/openapi.yaml').replace(/[^/]*$/, '')}contract.md`;
    const main = baseContract(delta.module, contractPath);
    const { contract, problems } = R.foldDelta(delta, main);
    for (const p of problems) say(false, `${path}: ${p.message}`, p.fix);
    if (!contract) continue;
    const expected = R.renderContract(contract);
    const next = R.openapiNextPath(delta.id, delta.module);
    if (mode === '--fold') {
      writeFileSync(contractPath, expected);
      const hadShape = existsSync(next);
      if (hadShape) {
        writeFileSync(contract.openapi, readFileSync(next, 'utf8'));
        rmSync(next);
      }
      say(true, `folded ${path} into ${contractPath}${hadShape ? `; shape from ${next} into ${contract.openapi}` : ''}`);
    } else {
      const tree = existsSync(contractPath) ? readFileSync(contractPath, 'utf8') : '';
      say(tree === expected, `${contractPath} is exactly ${base}'s contract + ${path}`, `Run: npx tsx gates/contract.ts --fold ${delta.id}`);
      say(!existsSync(next), `${next} has been folded into ${contract.openapi}`, `Run: npx tsx gates/contract.ts --fold ${delta.id}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

for (const [module, { path, contract }] of contracts) {
  const yaml = existsSync(contract.openapi) ? readFileSync(contract.openapi, 'utf8') : undefined;
  say(!!yaml, `${path}: shape file ${contract.openapi} exists`, 'Fix the openapi field.');
  const problems = R.checkContract(contract, yaml ? R.openapiOperations(yaml) : undefined);
  for (const p of problems) say(false, `${path}: ${p.message}`, p.fix);
  if (!problems.length) say(true, `${path}: ${contract.rules.length} rules (${contract.stability}); every rule names a declared operation`);
  for (const r of contract.rules)
    for (const d of r.decidedIn) say(existsSync(d), `${r.id} → ${d} resolves`, 'Fix the Decided in: path or restore the decision record.');
  console.log(`  ${module}: latest contract tag ${latestTag(module) ?? 'none yet'}`);
}

for (const { path, delta } of deltas) {
  const problems = R.checkDelta(delta);
  for (const p of problems) say(false, `${path}: ${p.message}`, p.fix);
  if (!problems.length) say(true, `${path}: every changed rule has a case and a milestone`);
  for (const r of [...delta.added, ...delta.modified.map(m => m.now)])
    for (const d of r.decidedIn) say(existsSync(d), `${r.id} → ${d} resolves`, 'Add the decision record in the same PR.');
  const known = contracts.get(delta.module);
  const main = baseContract(delta.module, known?.path);
  const s = R.deltaState(delta, main, latestTag(delta.module));
  for (const p of s.problems) say(false, `${path} against ${base}: ${p.message}`, p.fix);
  const label = { pending: 'applies cleanly (folds at epic merge)', folded: 'already folded', conflict: 'does not apply' }[s.state];
  if (!s.problems.length) say(true, `${path} against ${base}: ${label}`);
  for (const n of s.notes) console.log(`  note: ${n}`);
  if (s.state === 'pending' && !main && known) {
    // The base ref has no contract yet but the tree does (e.g. the trial's first commit).
    const tree = R.deltaState(delta, known.contract);
    console.log(`  note: against the working tree it is ${tree.state}`);
  }
  if (s.state === 'folded') say(!existsSync(R.openapiNextPath(delta.id, delta.module)), `${path}: no leftover openapi.next file`, 'Delete it: the shape was folded.');
  console.log(`  ${R.classifyDelta(delta)}; second human needed: ${R.needsSecondApprover(delta, main) ? 'yes' : 'no'}`);
}

process.exit(failed ? 1 : 0);
