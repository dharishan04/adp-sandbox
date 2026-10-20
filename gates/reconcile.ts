// Tag reconciler (0021): for every spec on main, make sure spec/<id>/rN exists
// at the commit that set revision N. Idempotent and re-runnable. When it makes
// a new tag, it re-runs the gates on open PRs citing that spec, because checks
// do not re-run on their own (and a tag pushed with GITHUB_TOKEN starts no workflow).
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import * as R from '../plugin/rules/src/index.ts';
import { api, repo } from './gh.ts';

const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const created: number[] = [];

for (const f of readdirSync('specs').filter(f => /^\d+\.md$/.test(f))) {
  const { spec } = R.parseSpec(readFileSync(`specs/${f}`, 'utf8'));
  if (!spec) continue;
  const tag = R.tagName(spec.id, spec.revision);
  // The commit on main where this file last changed: the merge of its Lock PR.
  const sha = git('log', '-1', '--format=%H', '--', `specs/${f}`);
  try {
    const existing = await api(`/repos/${repo}/git/ref/tags/${tag}`);
    console.log(`${tag} exists at ${existing.object.sha.slice(0, 7)}${existing.object.sha === sha ? '' : ` (main's last change is ${sha.slice(0, 7)}: left alone, tags never move)`}`);
    continue;
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
  }
  await api(`/repos/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/tags/${tag}`, sha } });
  console.log(`created ${tag} at ${sha.slice(0, 7)}`);
  created.push(spec.id);
}

for (const id of created) {
  const open: R.Pull[] = await api(`/repos/${repo}/pulls?state=open&per_page=100`);
  for (const p of open.filter(p => R.parseCite(p.body)?.id === id)) {
    const runs = await api(`/repos/${repo}/actions/workflows/gates.yml/runs?head_sha=${p.head.sha}&per_page=1`);
    const run = runs.workflow_runs[0];
    if (!run) {
      console.log(`#${p.number}: no gates run to re-run`);
      continue;
    }
    await api(`/repos/${repo}/actions/runs/${run.id}/rerun`, { method: 'POST' });
    console.log(`#${p.number} cites spec ${id}: re-ran gates run ${run.id}`);
  }
}
