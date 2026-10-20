// The slices of GitHub REST records the rules read. Fixtures are recorded
// responses; extra fields are ignored.
export type User = { login: string; type?: string };
export type Issue = { number: number; state: 'open' | 'closed'; title: string; assignees: User[] };
export type Pull = {
  number: number;
  state: 'open' | 'closed';
  merged_at: string | null;
  title: string;
  body: string | null;
  html_url?: string;
  user: User;
  head: { ref: string; sha: string };
  base: { ref: string };
};
export type Review = { user: User; state: string; commit_id: string; submitted_at?: string };
export type Comment = { id: number; user: User; body: string; created_at: string };
export type Ref = { ref: string; object: { sha: string } };

/** Reads one GitHub REST path as JSON. The mod passes `gh api`; CI passes fetch. */
export type Get = (path: string) => Promise<unknown>;
