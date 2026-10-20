// epic workflow (builder App; started by the lead):
//   sync: merge main into epic/<id> through a PR the lead can approve (Q26), after an amendment.
//   land: open the epic PR epic/<id> → main, its body carrying every milestone's provenance (0022).
import * as R from '../plugin/rules/src/index.ts';
import { api, readText, repo } from '../gates/gh.ts';

const id = Number(process.env.EPIC);
const op = process.env.OP!;
const actor = process.env.ACTOR!;
function refuse(why: string): never {
  console.log(`::error::refused: ${why}`);
  process.exit(1);
}
const refs: R.Ref[] = await api(`/repos/${repo}/git/matching-refs/tags/spec/${id}/`);
const rev = R.revisions(id, refs).at(-1);
if (!rev) refuse(`spec ${id} has no locked revision`);
const spec = R.parseSpec((await readText(R.specPath(id), R.tagName(id, rev)))!).spec!;
if (spec.human_lead.toLowerCase() !== actor.toLowerCase()) refuse(`only @${spec.human_lead} may start this; started by @${actor}`);
const epic = R.epicBranch(id);
const head = async (b: string) => api(`/repos/${repo}/git/ref/heads/${b}`).then(r => r.object.sha as string, () => undefined);
if (!(await head(epic))) refuse(`${epic} does not exist`);

if (op === 'sync') {
  const branch = `sync/${id}-r${rev}`;
  if (!(await head(branch))) await api(`/repos/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: await head(epic) } });
  const merge = await api(`/repos/${repo}/merges`, { method: 'POST', body: { base: branch, head: 'main', commit_message: `Merge main into ${epic}: spec ${id} r${rev}` } });
  console.log(merge ? `merged main into ${branch}: ${merge.sha}` : `${branch} already has main`);
  const pr = await api(`/repos/${repo}/pulls`, {
    method: 'POST',
    body: { title: `Sync main into ${epic} (spec ${id} r${rev})`, head: branch, base: epic, body: `Brings ${R.tagName(id, rev)} (spec and cases) into ${epic}.\n\nSpec: ${id}@r${rev}` },
  });
  console.log(`opened ${pr.html_url}`);
} else if (op === 'land') {
  const pulls: R.Pull[] = await api(`/repos/${repo}/pulls?state=closed&base=${encodeURIComponent(epic)}&per_page=100`);
  const merged = pulls.filter(p => p.merged_at);
  const lines = merged.map(p => `- #${p.number} ${p.title}`);
  const provs = merged.flatMap(p => R.readProvenance(p.body).map(v => ({ pr: p.number, ...v })));
  const table = ['| PR | role | model | plugin | where | run |', '|---|---|---|---|---|---|', ...provs.map(v => `| #${v.pr} | ${v.role} | ${v.model} | ${v.plugin} | ${v.where ?? 'actions'} | ${v.run} |`)].join('\n');
  const body = [`Lands epic #${id} on main as one commit.`, '', `Spec: ${id}@r${rev}`, '', '## Milestones', ...lines, '', '## Provenance of every milestone (from their PR bodies)', table, ...provs.map(v => `<!-- adp-provenance ${JSON.stringify({ role: v.role, model: v.model, plugin: v.plugin, run: v.run, actor: v.actor, where: v.where })} -->`)].join('\n');
  const pr = await api(`/repos/${repo}/pulls`, { method: 'POST', body: { title: `Epic #${id}: ${spec.title}`, head: epic, base: 'main', body } });
  console.log(`opened ${pr.html_url}`);
} else refuse(`unknown op ${op}`);
