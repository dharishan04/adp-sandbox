import type { Review } from './github.ts';

/** The named lead's latest decisive review approves the head commit (0004, 0019). */
export function leadApproval(reviews: Review[], lead: string, headSha: string): { ok: boolean; message: string } {
  const mine = reviews.filter(r => r.user.login.toLowerCase() === lead.toLowerCase() && r.state !== 'COMMENTED' && r.state !== 'PENDING');
  const last = mine[mine.length - 1];
  if (!last) return { ok: false, message: `no review from human_lead @${lead}` };
  if (last.state !== 'APPROVED') return { ok: false, message: `@${lead}'s latest review is ${last.state}` };
  if (last.commit_id !== headSha)
    return { ok: false, message: `@${lead} approved ${last.commit_id.slice(0, 7)}, not the latest push ${headSha.slice(0, 7)}` };
  return { ok: true, message: `approved by human_lead @${lead} on the latest push ${headSha.slice(0, 7)}` };
}
