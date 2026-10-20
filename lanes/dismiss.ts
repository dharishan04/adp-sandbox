// `/dismiss <F-n> <reason>` (0027): only the spec's human lead, as a person,
// closes a finding without a fix. The ledger replay ignores anyone else; this
// step answers them and refreshes the `review` check as the reviewer App.
import * as R from '../plugin/rules/src/index.ts';
import { api, event, repo } from '../gates/gh.ts';
import { specForPull } from './common.ts';
import { setReviewCheck } from './review-check.ts';

const ev = event();
const pull: R.Pull = await api(`/repos/${repo}/pulls/${ev.issue.number}`);
const spec = await specForPull(pull);
const lead = spec?.human_lead ?? '';
const who = ev.comment.user;
const reply = (body: string) => api(`/repos/${repo}/issues/${pull.number}/comments`, { method: 'POST', body: { body } });
const comments: R.Comment[] = await api(`/repos/${repo}/issues/${pull.number}/comments?per_page=100`);
const ledger = R.replayFindings(comments, process.env.REVIEWER_LOGIN!, lead);
const id = ev.comment.body.match(/^\/dismiss\s+(F-\d+)/m)?.[1];

if (who.type === 'Bot' || who.login.toLowerCase() !== lead.toLowerCase()) {
  await reply(`Ignored: \`/dismiss\` from @${who.login}. Only @${lead || 'the human lead'} can dismiss a finding; agents never can.`);
} else {
  const f = ledger.findings.find(f => f.id === id);
  await reply(f?.closed?.by === 'dismiss' ? `${id} dismissed by @${who.login}: ${f.closed.reason}` : `No open finding ${id}, or no reason given.`);
}
const open = R.openFindings(ledger);
await setReviewCheck(pull.head.sha, open.length === 0, `${open.length} blocking open`, open.map(f => `- ${f.id} [${f.severity}] ${f.title}`).join('\n') || 'nothing blocking');
