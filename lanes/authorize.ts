// Builder lane, step 1 (runs with GITHUB_TOKEN, read-only): refuse unless the
// person who started the run is the spec's human lead (0019), and work out
// what to check out. Writes step outputs for the workflow.
import { appendFileSync, writeFileSync } from 'node:fs';
import * as R from '../plugin/rules/src/index.ts';
import { api, readText, repo } from '../gates/gh.ts';

const mode = process.env.MODE!;
const id = Number(process.env.EPIC);
const actor = process.env.ACTOR!;
const out = (k: string, v: string | number) => appendFileSync(process.env.GITHUB_OUTPUT!, `${k}=${v}\n`);
function refuse(why: string): never {
  console.log(`::error::refused: ${why}`);
  process.exit(1);
}

const issue: R.Issue & { body: string | null } = await api(`/repos/${repo}/issues/${id}`);
const branchExists = async (b: string) => api(`/repos/${repo}/git/ref/heads/${b}`).then(r => r.object.sha as string, () => undefined);
const context: string[] = [`# Epic #${id}: ${issue.title}`, '', issue.body ?? '', ''];

if (mode === 'draft-spec' || mode === 'probe') {
  const lead = issue.assignees.length === 1 ? issue.assignees[0].login : undefined;
  if (!lead) refuse(`epic #${id} must have exactly one assignee, the human lead`);
  if (lead.toLowerCase() !== actor.toLowerCase()) refuse(`only @${lead}, the epic's lead, may start the builder; started by @${actor}`);
  const onMain = await readText(R.specPath(id), 'main');
  const rev = (onMain ? (R.parseSpec(onMain).spec?.revision ?? 0) : 0) + 1;
  const branch = R.specBranch(id, rev);
  const existing = await branchExists(branch);
  out('lead', lead);
  out('revision', rev);
  out('branch', branch);
  out('base', 'main');
  out('checkout', existing ? branch : 'main');
  if (onMain) context.push('## The spec as locked now (this run amends it)', '', onMain);
} else if (mode === 'build') {
  const rev = Number(process.env.REVISION);
  const milestone = Number(process.env.MILESTONE);
  const tag = R.tagName(id, rev);
  const text = await readText(R.specPath(id), tag);
  if (!text) refuse(`${tag} does not exist: build only from a locked revision`);
  const { spec } = R.parseSpec(text);
  if (!spec) refuse(`${tag} does not parse`);
  if (spec.human_lead.toLowerCase() !== actor.toLowerCase()) refuse(`only @${spec.human_lead}, human_lead of ${tag}, may start the builder; started by @${actor}`);
  const refs: R.Ref[] = await api(`/repos/${repo}/git/matching-refs/tags/spec/${id}/`);
  const latest = R.revisions(id, refs).at(-1);
  if (latest !== rev) refuse(`${tag} is not the current revision (r${latest})`);
  if (!spec.milestones.some(m => m.issue === milestone)) refuse(`#${milestone} is not a milestone of ${tag}`);
  const epic = R.epicBranch(id);
  const epicSha = await branchExists(epic);
  if (epicSha) {
    const onEpic = await readText(R.specPath(id), epic);
    if (onEpic !== text) refuse(`${epic} does not hold ${tag}'s spec: merge main into ${epic} first (a person's PR; open question Q26)`);
  }
  const branch = `build/${id}-m${milestone}`;
  out('lead', spec.human_lead);
  out('revision', rev);
  out('branch', branch);
  out('base', epic);
  out('base_from', epicSha ? '' : (refs.find(r => r.ref === `refs/tags/${tag}`)!.object.sha));
  out('checkout', (await branchExists(branch)) ? branch : epicSha ? epic : tag);
  out('milestone', milestone);
  context.push(`## Locked spec ${tag}`, '', text, '', `## Your milestone: #${milestone}`, '', JSON.stringify(spec.milestones.find(m => m.issue === milestone)));
} else refuse(`unknown mode ${mode}`);

if (process.env.NOTE) context.push('', '## Note from the lead', '', process.env.NOTE);
writeFileSync(`${process.env.RUNNER_TEMP}/adp-context.md`, context.join('\n'));
console.log(`authorized @${actor} for ${mode} on epic #${id}`);
