// Which PR a gate run is about, whatever event started it.
import { api, event, repo } from './gh.ts';
import type { Pull } from '../plugin/rules/src/index.ts';

export async function currentPull(): Promise<Pull> {
  const ev = event();
  const n = ev.pull_request?.number ?? ev.issue?.number ?? Number(process.env.PR_NUMBER);
  return api(`/repos/${repo}/pulls/${n}`);
}

export function specIdFromDraft(ref: string): { id: number; rev: number } | undefined {
  const m = ref.match(/^draft\/(\d+)-r(\d+)$/);
  return m ? { id: Number(m[1]), rev: Number(m[2]) } : undefined;
}
