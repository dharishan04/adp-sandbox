// post-review workflow: the lead hands in a laptop reviewer round; this posts
// it as the reviewer App and sets the `review` check. It accepts a round only
// for the PR's current head, as the next round number, from the spec's lead.
import * as R from '../plugin/rules/src/index.ts';
import { api, repo } from '../gates/gh.ts';
import { specForPull } from './common.ts';
import { setReviewCheck } from './review-check.ts';

const reviewer = process.env.REVIEWER_LOGIN!;
const actor = process.env.ACTOR!;
const p = JSON.parse(Buffer.from(process.env.PAYLOAD!, 'base64').toString('utf8')) as { pr: number; block: R.RoundBlock; human: string };
const pull: R.Pull = await api(`/repos/${repo}/pulls/${process.env.PR}`);
function refuse(why: string): never {
  console.log(`::error::refused: ${why}`);
  process.exit(1);
}
if (p.pr !== pull.number) refuse(`payload is for #${p.pr}, not #${pull.number}`);
const spec = await specForPull(pull);
if (!spec) refuse('no spec found for this PR');
if (actor.toLowerCase() !== spec.human_lead.toLowerCase()) refuse(`only @${spec.human_lead} may hand in a review round`);
if (p.block.sha !== pull.head.sha) refuse(`round reviewed ${p.block.sha.slice(0, 7)}, but the head is now ${pull.head.sha.slice(0, 7)}: review again`);
const comments: R.Comment[] = await api(`/repos/${repo}/issues/${pull.number}/comments?per_page=100`);
const ledger = R.replayFindings(comments, reviewer, spec.human_lead);
if (p.block.round !== ledger.rounds.length + 1) refuse(`expected round ${ledger.rounds.length + 1}, got ${p.block.round}`);
const next = R.nextFindingId(ledger);
if (p.block.opened.some(f => Number(f.id.slice(2)) < next)) refuse('a new finding reuses an existing ID');
const openIds = new Set(ledger.findings.filter(f => !f.closed).map(f => f.id));
p.block.fixed = p.block.fixed.filter(id => openIds.has(id));

const footer = `\n\n<sub>Reviewer ran in Claude Code on @${actor}'s laptop (${p.block.model ?? 'model not recorded'}, self-declared); posted by run ${process.env.GITHUB_RUN_ID}.</sub>`;
await api(`/repos/${repo}/issues/${pull.number}/comments`, { method: 'POST', body: { body: R.roundComment(p.block, p.human + footer) } });
const after = R.replayFindings([...comments, { id: 0, user: { login: reviewer, type: 'Bot' }, body: R.roundComment(p.block, ''), created_at: new Date().toISOString() }], reviewer, spec.human_lead);
const blocking = R.openFindings(after);
await setReviewCheck(pull.head.sha, blocking.length === 0, `round ${p.block.round}: ${blocking.length} blocking open`, blocking.map(f => `- ${f.id} [${f.severity}] ${f.title}`).join('\n') || 'nothing blocking', { model: p.block.model, where: 'laptop' });
console.log(`posted round ${p.block.round} on #${pull.number}: ${blocking.length} blocking open`);
