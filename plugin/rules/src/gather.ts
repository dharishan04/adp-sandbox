import type { Comment, Get, Issue, Pull, Ref, Review } from './github.ts';
import type { EpicRecords } from './stage.ts';

// One way to read GitHub for every caller: the mod (gh api, as the person) and
// the gates (fetch, as the workflow) pass their own Get.
export async function gatherEpic(get: Get, repo: string, id: number): Promise<EpicRecords> {
  const [issue, pulls, refs] = await Promise.all([
    get(`/repos/${repo}/issues/${id}`) as Promise<Issue>,
    get(`/repos/${repo}/pulls?state=all&per_page=100`) as Promise<Pull[]>,
    (get(`/repos/${repo}/git/matching-refs/tags/spec/${id}/`) as Promise<Ref[]>).catch(() => [] as Ref[]),
  ]);
  return { issue, pulls, refs };
}

export async function gatherPull(get: Get, repo: string, n: number) {
  const [pull, reviews, comments] = await Promise.all([
    get(`/repos/${repo}/pulls/${n}`) as Promise<Pull>,
    get(`/repos/${repo}/pulls/${n}/reviews?per_page=100`) as Promise<Review[]>,
    get(`/repos/${repo}/issues/${n}/comments?per_page=100`) as Promise<Comment[]>,
  ]);
  const checks = (await get(`/repos/${repo}/commits/${pull.head.sha}/check-runs?per_page=100`)) as {
    check_runs: { name: string; status: string; conclusion: string | null; app?: { slug: string } }[];
  };
  return { pull, reviews, comments, checks: checks.check_runs };
}

export async function readFileAt(get: Get, repo: string, path: string, ref: string): Promise<string> {
  const res = (await get(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`)) as { content: string };
  const bin = atob(res.content.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0)));
}
