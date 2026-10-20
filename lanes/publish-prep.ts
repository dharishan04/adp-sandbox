// Publish, step 1: read the handoff branch's provenance, re-authorize the actor
// as the lead (authorize.ts runs next with these values), check the handoff
// sits exactly on what authorize says to build on, then lay its changes, minus
// .adp/, on that commit as uncommitted files for open-pr.ts to commit as the App.
import { execFileSync } from 'node:child_process';
import { appendFileSync, rmSync } from 'node:fs';

const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const handoff = process.env.HANDOFF!;
const stage = process.argv[2];

if (stage === 'read') {
  const p = JSON.parse(git('show', `origin/${handoff}:.adp/provenance.json`));
  for (const k of ['mode', 'epic', 'revision', 'milestone']) appendFileSync(process.env.GITHUB_OUTPUT!, `${k}=${p[k] ?? ''}\n`);
  execFileSync('bash', ['-c', `git show origin/${handoff}:.adp/provenance.json > "$RUNNER_TEMP/adp-agent.json"`]);
} else {
  const checkout = process.env.CHECKOUT!;
  const ref = checkout.startsWith('spec/') ? `refs/tags/${checkout}` : `origin/${checkout}`;
  const want = git('rev-parse', `${ref}^{commit}`);
  const parent = git('rev-parse', `origin/${handoff}^`);
  if (parent !== want) {
    console.log(`::error::${handoff} was built on ${parent.slice(0, 7)}, but the lane builds on ${checkout} (${want.slice(0, 7)}): re-run the laptop builder`);
    process.exit(1);
  }
  git('checkout', '--quiet', '--detach', want);
  const diff = git('diff', '--name-status', '--no-renames', want, `origin/${handoff}`).split('\n').filter(Boolean);
  for (const line of diff) {
    const [status, path] = line.split('\t');
    if (path.startsWith('.adp/')) continue;
    if (status === 'D') rmSync(path, { force: true });
    else git('checkout', `origin/${handoff}`, '--', path);
  }
  git('reset', '--quiet');
  console.log(`laid ${diff.length} change(s) from ${handoff} on ${checkout}`);
}
