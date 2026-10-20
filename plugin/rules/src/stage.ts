import type { Issue, Pull, Ref } from './github.ts';
import { revisions } from './trace.ts';

export type Stage = 'Frame' | 'Design' | 'Lock' | 'Build' | 'Done' | 'Withdrawn';
export type EpicRecords = { issue: Issue; pulls: Pull[]; refs: Ref[] };
export type StageView = {
  id: number;
  stage: Stage;
  revision?: number;
  /** An open spec PR proposing the next revision while the epic is past Design. */
  amendment?: number;
  /** A spec PR merged but no tag exists yet: the reconciler has work to do. */
  tagMissing?: boolean;
  specPull?: number;
  milestonePulls: number[];
  epicPull?: number;
};

export const specBranch = (id: number, rev: number) => `draft/${id}-r${rev}`;
export const epicBranch = (id: number) => `epic/${id}`;
export const isSpecPull = (id: number, p: Pull) => new RegExp(`^draft/${id}-r\\d+$`).test(p.head.ref);

/** Derives an epic's stage from GitHub state alone; nothing is stored (0002, 0017). */
export function deriveStage(id: number, rec: EpicRecords): StageView {
  const specPulls = rec.pulls.filter(p => isSpecPull(id, p));
  const openSpec = specPulls.find(p => p.state === 'open');
  const milestones = rec.pulls.filter(p => p.base.ref === epicBranch(id));
  const epicPull = rec.pulls.find(p => p.head.ref === epicBranch(id) && p.base.ref === 'main');
  const revs = revisions(id, rec.refs);
  const revision = revs.length ? revs[revs.length - 1] : undefined;

  let stage: Stage;
  if (epicPull?.merged_at) stage = 'Done';
  else if (milestones.length || epicPull) stage = 'Build';
  else if (revision !== undefined || specPulls.some(p => p.merged_at)) stage = 'Lock';
  else if (openSpec) stage = 'Design';
  else if (rec.issue.state === 'open') stage = 'Frame';
  else stage = 'Withdrawn';

  return {
    id,
    stage,
    revision,
    amendment: revision !== undefined && openSpec ? openSpec.number : undefined,
    tagMissing: specPulls.some(p => p.merged_at) && revision === undefined,
    specPull: openSpec?.number ?? specPulls.find(p => p.merged_at)?.number,
    milestonePulls: milestones.map(p => p.number),
    epicPull: epicPull?.number,
  };
}

export function formatStage(v: StageView): string {
  const rev = v.revision ? `@r${v.revision}` : '';
  const amend = v.amendment ? ` (amending in #${v.amendment})` : '';
  const tag = v.tagMissing ? ' (tag missing)' : '';
  return `spec ${v.id}${rev} · ${v.stage}${amend}${tag}`;
}
