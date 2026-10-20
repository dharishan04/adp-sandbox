// A review on a spec PR re-runs the PR's own Lock run rather than adding a
// second `lock` result: GitHub counts every required check run of that name on
// the commit, so a stale fail would keep blocking beside a fresh pass.
import { api, event, repo } from './gh.ts';

const sha = event().pull_request.head.sha;
const runs = await api(`/repos/${repo}/actions/workflows/lock.yml/runs?head_sha=${sha}&event=pull_request&per_page=1`);
const run = runs.workflow_runs[0];
if (!run) {
  console.log(`no pull_request Lock run for ${sha.slice(0, 7)}`);
  process.exit(0);
}
if (run.status !== 'completed') {
  console.log(`Lock run ${run.id} still running; it reads the review itself`);
  process.exit(0);
}
await api(`/repos/${repo}/actions/runs/${run.id}/rerun`, { method: 'POST' });
console.log(`re-ran Lock run ${run.id} for ${sha.slice(0, 7)}`);
