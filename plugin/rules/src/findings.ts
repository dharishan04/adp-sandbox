import type { Comment } from './github.ts';

// The adversarial reviewer's findings live only in PR comments (0027). State is
// replayed from comments by two authors: the reviewer App and the human lead.
// Anyone else's comment, including the builder App's, is ignored.
export type Severity = 'high' | 'medium' | 'low';
export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  path?: string;
  line?: number;
  openedRound: number;
  closed?: { by: 'recheck' | 'dismiss'; round?: number; reason?: string; who: string };
};
export type RoundBlock = {
  round: number;
  sha: string;
  opened: Omit<Finding, 'openedRound' | 'closed'>[];
  fixed: string[];
  handedToLead?: boolean;
};
export type Ledger = { findings: Finding[]; rounds: RoundBlock[]; ignored: { who: string; text: string }[]; handedToLead: boolean };

export const MAX_ROUNDS = 3;
const BLOCK = /<!-- adp-review (\{[\s\S]*?\}) -->/;
const DISMISS = /^\/dismiss\s+(F-\d+)\s+(\S[\s\S]*)$/m;

export function roundComment(block: RoundBlock, human: string): string {
  return `${human}\n\n<!-- adp-review ${JSON.stringify(block)} -->`;
}

export function replayFindings(comments: Comment[], reviewer: string, lead: string): Ledger {
  const findings = new Map<string, Finding>();
  const rounds: RoundBlock[] = [];
  const ignored: Ledger['ignored'] = [];
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  for (const c of [...comments].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const block = c.body.match(BLOCK);
    if (block && same(c.user.login, reviewer)) {
      const r = JSON.parse(block[1]) as RoundBlock;
      rounds.push(r);
      for (const id of r.fixed) {
        const f = findings.get(id);
        if (f && !f.closed) f.closed = { by: 'recheck', round: r.round, who: c.user.login };
      }
      for (const o of r.opened) if (!findings.has(o.id)) findings.set(o.id, { ...o, openedRound: r.round });
      continue;
    }
    const d = c.body.match(DISMISS);
    if (d) {
      const f = findings.get(d[1]);
      if (same(c.user.login, lead) && c.user.type !== 'Bot' && f && !f.closed)
        f.closed = { by: 'dismiss', reason: d[2].trim(), who: c.user.login };
      else ignored.push({ who: c.user.login, text: c.body.slice(0, 80) });
    }
  }
  return { findings: [...findings.values()], rounds, ignored, handedToLead: rounds.some(r => r.handedToLead) };
}

export function openFindings(l: Ledger, blocking: Severity[] = ['high', 'medium']): Finding[] {
  return l.findings.filter(f => !f.closed && blocking.includes(f.severity));
}

export function nextFindingId(l: Ledger): number {
  return l.findings.reduce((n, f) => Math.max(n, Number(f.id.slice(2))), 0) + 1;
}
