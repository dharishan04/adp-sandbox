// The `review` check run, written only with the reviewer App's token (checks: write).
import { api, repo } from '../gates/gh.ts';

export async function setReviewCheck(sha: string, ok: boolean, title: string, summary: string, meta: Record<string, unknown> = {}) {
  await api(`/repos/${repo}/check-runs`, {
    method: 'POST',
    body: {
      name: 'review',
      head_sha: sha,
      status: 'completed',
      conclusion: ok ? 'success' : 'failure',
      output: { title, summary: `${summary}\n\n${Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join(' · ')}` },
    },
  });
}
