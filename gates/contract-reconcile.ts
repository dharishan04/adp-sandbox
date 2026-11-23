// Contract tag reconciler (0031 §9), like reconcile.ts for spec tags: for every
// module contract on main, make sure contract/<module>/rN exists at the commit
// where contract.md last changed. Idempotent; tags never move.
// NOT wired into a workflow yet: the 0031 trial runs it in step 3.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as R from '../plugin/rules/src/index.ts';
import { api, repo } from './gh.ts';

const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).trim();

for (const path of git('ls-files', '*contract.md').split('\n').filter(Boolean)) {
  const { contract } = R.parseContract(readFileSync(path, 'utf8'));
  if (!contract) continue;
  const sha = git('log', '-1', '--format=%H', '--', path);
  const refs: R.Ref[] = await api(`/repos/${repo}/git/matching-refs/tags/contract/${contract.module}/`);
  if (refs.some(r => r.object.sha === sha)) {
    console.log(`${contract.module}: ${sha.slice(0, 7)} already tagged`);
    continue;
  }
  const revs = R.contractRevisions(contract.module, refs);
  const tag = R.contractTagName(contract.module, (revs[revs.length - 1] ?? 0) + 1);
  await api(`/repos/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/tags/${tag}`, sha } });
  console.log(`created ${tag} at ${sha.slice(0, 7)}`);
}
