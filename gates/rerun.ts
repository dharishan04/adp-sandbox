// Re-runs a PR's own pull_request run of a workflow (Lock on a review, the gates
// on a body edit) rather than adding a second result: GitHub counts each
// workflow run's check of that name on the commit, so a stale fail would keep
// blocking beside a fresh pass. Usage: node gates/rerun.ts <workflow file>
import { api, event, repo } from './gh.ts';

const sha = event().pull_request.head.sha;
const wf = process.argv[2];
const runs = await api(`/repos/${repo}/actions/workflows/${wf}/runs?head_sha=${sha}&event=pull_request&per_page=1`);
const run = runs.workflow_runs[0];
if (!run) {
  console.log(`no pull_request ${wf} run for ${sha.slice(0, 7)}`);
  process.exit(0);
}
if (run.status !== 'completed') {
  console.log(`${wf} run ${run.id} still running; it reads the current state itself`);
  process.exit(0);
}
await api(`/repos/${repo}/actions/runs/${run.id}/rerun`, { method: 'POST' });
console.log(`re-ran ${wf} run ${run.id} for ${sha.slice(0, 7)}`);
