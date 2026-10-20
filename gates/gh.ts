// GitHub access for gates and lanes in Actions: fetch with the job's token.
import { appendFileSync, readFileSync } from 'node:fs';
import type { Get } from '../plugin/rules/src/index.ts';

export const repo = process.env.GITHUB_REPOSITORY!;
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;

export async function api(path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const res = await fetch(`https://api.github.com${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? undefined : res.json();
}

export const get: Get = path => api(path);

export async function graphql(query: string, variables: Record<string, unknown>): Promise<any> {
  const out = await api('/graphql', { method: 'POST', body: { query, variables } });
  if (out.errors) throw new Error(JSON.stringify(out.errors));
  return out.data;
}

export async function readText(path: string, ref: string): Promise<string | undefined> {
  try {
    const r = await api(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`);
    return Buffer.from(r.content, 'base64').toString('utf8');
  } catch (e) {
    if ((e as { status?: number }).status === 404) return undefined;
    throw e;
  }
}

export function event(): any {
  return JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8'));
}

/** One gate = one check run (the job). Prints a report with fix-its and sets the exit code. */
export function report(gate: string, lines: { ok: boolean; message: string; fix?: string }[], notes: string[] = []): never {
  const ok = lines.every(l => l.ok);
  const md = [
    `## ${gate}: ${ok ? 'pass' : 'FAIL'}`,
    ...notes.map(n => `> ${n}`),
    '',
    ...lines.map(l => `- ${l.ok ? '✅' : '❌'} ${l.message}${l.fix && !l.ok ? `\n  - **fix:** ${l.fix}` : ''}`),
  ].join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  process.exit(ok ? 0 : 1);
}
