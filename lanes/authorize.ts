// Builder lane, step 1 (runs with GITHUB_TOKEN, read-only): refuse unless the
// person who started the run is the spec's human lead (0019), and work out
// what to check out. Writes step outputs for the workflow.
import { appendFileSync, writeFileSync } from 'node:fs';
import * as R from '../plugin/rules/src/index.ts';
import { api, lockAt, repo } from '../gates/gh.ts';

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
  // The epic's lock on main, in either format (specs/<id>.md, or a 0031 delta).
  const onMain = (await lockAt(id, 'main')).unit;
  const rev = (onMain?.revision ?? 0) + 1;
  const branch = R.specBranch(id, rev);
  const existing = await branchExists(branch);
  out('lead', lead);
  out('revision', rev);
  out('branch', branch);
  out('base', 'main');
  out('checkout', existing ? branch : 'main');
  if (onMain) context.push(`## ${onMain.path} as locked now (this run amends it)`, '', onMain.text);
  if (onMain?.kind === 'spec') context.push('', '(Locked in the old spec format. Write this revision as a contract delta under specs/<id>/: 0031.)');
} else if (mode === 'build') {
  const rev = Number(process.env.REVISION);
  const milestone = Number(process.env.MILESTONE);
  const tag = R.tagName(id, rev);
  const { unit: spec, problems } = await lockAt(id, tag);
  if (!spec) refuse(`${tag} ${problems.length ? `does not parse: ${problems.map(p => p.message).join('; ')}` : 'does not exist: build only from a locked revision'}`);
  const text = spec.text;
  if (spec.human_lead.toLowerCase() !== actor.toLowerCase()) refuse(`only @${spec.human_lead}, human_lead of ${tag}, may start the builder; started by @${actor}`);
  const refs: R.Ref[] = await api(`/repos/${repo}/git/matching-refs/tags/spec/${id}/`);
  const latest = R.revisions(id, refs).at(-1);
  if (latest !== rev) refuse(`${tag} is not the current revision (r${latest})`);
  if (!spec.milestones.some(m => m.issue === milestone)) refuse(`#${milestone} is not a milestone of ${tag}`);
  const epic = R.epicBranch(id);
  const epicSha = await branchExists(epic);
  if (epicSha) {
    const onEpic = (await lockAt(id, epic)).unit;
    if (onEpic?.path !== spec.path || onEpic.text !== text) refuse(`${epic} does not hold ${tag}'s spec: merge main into ${epic} first (a person's PR; open question Q26)`);
  }
  // A new epic branch is cut from main when main still holds this exact spec,
  // so it carries today's gate config; else from the tag (gates frozen at Lock).
  const mainLock = (await lockAt(id, 'main')).unit;
  const mainSpec = mainLock?.path === spec.path ? mainLock.text : undefined;
  const mainSha = (await branchExists('main'))!;
  const cutFrom = mainSpec === text ? mainSha : refs.find(r => r.ref === `refs/tags/${tag}`)!.object.sha;
  let branch = `build/${id}-m${milestone}`;
  out('lead', spec.human_lead);
  out('revision', rev);
  out('base', epic);
  out('base_from', epicSha ? '' : cutFrom);
  // An existing milestone branch that no longer contains the epic head (the
  // epic took an amendment) is rebuilt from the epic head: the App resets it.
  const buildSha = await branchExists(branch);
  const stale = buildSha && epicSha ? (await api(`/repos/${repo}/compare/${epicSha}...${buildSha}`)).status !== 'ahead' && buildSha !== epicSha : false;
  // A stale milestone branch is not reset: the rebuild opens a new milestone PR.
  if (stale) branch = `${branch}-r${rev}`;
  out('branch', branch);
  out('checkout', buildSha && !stale ? branch : epicSha ? epic : cutFrom === mainSha ? 'main' : tag);
  out('milestone', milestone);
  context.push(`## Locked ${spec.kind === 'delta' ? 'contract delta' : 'spec'} ${tag} (${spec.path})`, '', text, '', `## Your milestone: #${milestone}`, '', JSON.stringify(spec.milestones.find(m => m.issue === milestone)));
} else refuse(`unknown mode ${mode}`);

if (process.env.NOTE) context.push('', '## Note from the lead', '', process.env.NOTE);
writeFileSync(`${process.env.RUNNER_TEMP}/adp-context.md`, context.join('\n'));
console.log(`authorized @${actor} for ${mode} on epic #${id}`);
