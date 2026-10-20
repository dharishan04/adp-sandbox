// Hand-made in the shape of GitHub REST responses (trimmed). Replaced by
// recordings from the live sandbox run in fixtures/recorded/ once it exists.
import type { Comment, Issue, Pull, Ref, Review } from '../../src/github.ts';

export const issue = (state: 'open' | 'closed' = 'open'): Issue => ({
  number: 7, state, title: 'Add reading history for a sensor over a time range', assignees: [{ login: 'lead-person' }],
});

const pull = (n: number, head: string, base: string, state: 'open' | 'closed', merged: boolean, body = ''): Pull => ({
  number: n, state, merged_at: merged ? '2026-10-21T10:00:00Z' : null, title: `PR ${n}`, body,
  user: { login: 'adp-builder[bot]', type: 'Bot' }, head: { ref: head, sha: `sha${n}` }, base: { ref: base },
});

export const specOpen = pull(9, 'draft/7-r1', 'main', 'open', false);
export const specMerged = pull(9, 'draft/7-r1', 'main', 'closed', true);
export const milestoneOpen = pull(10, 'build/7-m8', 'epic/7', 'open', false, 'Closes #8\n\nSpec: 7@r1\n');
export const amendOpen = pull(11, 'draft/7-r2', 'main', 'open', false);
export const amendMerged = pull(11, 'draft/7-r2', 'main', 'closed', true);
export const epicMerged = pull(12, 'epic/7', 'main', 'closed', true, 'Spec: 7@r2\n');
export const unrelated = pull(3, 'draft/70-r1', 'main', 'open', false);

export const tag = (rev: number): Ref => ({ ref: `refs/tags/spec/7/r${rev}`, object: { sha: `t${rev}` } });

export const review = (login: string, state: string, commit: string): Review => ({
  user: { login, type: 'User' }, state, commit_id: commit,
});

let cid = 0;
export const comment = (login: string, body: string, type = 'User'): Comment => ({
  id: ++cid, user: { login, type }, body, created_at: `2026-10-21T10:${String(cid).padStart(2, '0')}:00Z`,
});
