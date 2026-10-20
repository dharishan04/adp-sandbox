// Builder lane, step 3 (runs with the builder App's token; the agent has
// exited): commit the agent's changes through the GraphQL API, so GitHub signs
// them, and open or update the PR. The workflow writes provenance (0019).
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import * as R from '../plugin/rules/src/index.ts';
import { api, graphql, repo } from '../gates/gh.ts';

const env = process.env;
const id = Number(env.EPIC);
const mode = env.MODE!;
const agent = JSON.parse(readFileSync(`${env.RUNNER_TEMP}/adp-agent.json`, 'utf8'));
if (mode === 'probe') {
  console.log('probe run: nothing is committed');
  process.exit(0);
}

const IGNORE = /^(node_modules\/|app\/test-results\/|app\/playwright-report\/|app\/lock\.json$|test-results\/|\.pinned\/)/;
const status = execFileSync('git', ['status', '--porcelain=v1', '-uall', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const additions: { path: string; contents: string }[] = [];
const deletions: { path: string }[] = [];
for (const line of status) {
  const path = line.slice(3);
  if (IGNORE.test(path)) continue;
  if (existsSync(path)) additions.push({ path, contents: readFileSync(path).toString('base64') });
  else deletions.push({ path });
}
if (!additions.length && !deletions.length) {
  console.log('::error::the agent changed nothing');
  process.exit(1);
}

const branch = env.BRANCH!;
const base = env.BASE!;
const head = async (b: string) => api(`/repos/${repo}/git/ref/heads/${b}`).then(r => r.object.sha as string, () => undefined);

// The epic branch is cut from the locked tag the first time a milestone is built.
if (base.startsWith('epic/') && !(await head(base)))
  await api(`/repos/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${base}`, sha: env.BASE_FROM } });

const startSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!(await head(branch))) await api(`/repos/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: startSha } });
const expected = (await head(branch))!;
if (expected !== startSha) throw new Error(`${branch} moved during the run (${expected} != ${startSha}); re-run`);

const title = mode === 'draft-spec' ? `Spec ${id} r${env.REVISION}: ${agent.output.summary.split('\n')[0].slice(0, 60)}` : `Epic ${id} milestone #${env.MILESTONE}`;
const commit = await graphql(
  `mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url signature { isValid state } } } }`,
  {
    input: {
      branch: { repositoryNameWithOwner: repo, branchName: branch },
      expectedHeadOid: expected,
      message: { headline: title, body: `Agent run ${env.GITHUB_RUN_ID} (${agent.model}).` },
      fileChanges: { additions, deletions },
    },
  },
);
const c = commit.createCommitOnBranch.commit;
console.log(`commit ${c.oid} signature ${JSON.stringify(c.signature)}`);

const runUrl = `${env.GITHUB_SERVER_URL}/${repo}/actions/runs/${env.GITHUB_RUN_ID}`;
const prov = R.provenanceBlock({ role: 'builder', model: agent.model, plugin: agent.plugin, run: env.GITHUB_RUN_ID!, actor: env.ACTOR!, sdk: '0.3.304', where: agent.where ?? 'actions', session: agent.session }, runUrl);
const open: R.Pull[] = await api(`/repos/${repo}/pulls?state=open&head=${repo.split('/')[0]}:${branch}`);
const summary = [`## Agent summary`, agent.output.summary, '', `**Tests:** ${agent.output.tests}`, ...(agent.output.open_questions?.length ? ['', '**Open questions:**', ...agent.output.open_questions.map((q: string) => `- ${q}`)] : [])].join('\n');
if (open[0]) {
  // A later run appends its provenance; earlier runs' records stay.
  const body = `${open[0].body ?? ''}\n\n---\n${summary}\n\n${prov}`;
  await api(`/repos/${repo}/pulls/${open[0].number}`, { method: 'PATCH', body: { body } });
  console.log(`updated #${open[0].number}`);
} else {
  const head = mode === 'draft-spec' ? `Spec for epic #${id}, revision ${env.REVISION}. Lock = @${env.LEAD} approves the latest push.` : `Closes #${env.MILESTONE}\n\nSpec: ${id}@r${env.REVISION}`;
  const pr = await api(`/repos/${repo}/pulls`, { method: 'POST', body: { title, head: branch, base, body: `${head}\n\n${summary}\n\n${prov}` } });
  console.log(`opened ${pr.html_url}`);
  await api(`/repos/${repo}/pulls/${pr.number}/requested_reviewers`, { method: 'POST', body: { reviewers: [env.LEAD] } }).catch(e => console.log(`review request: ${e.message}`));
}
