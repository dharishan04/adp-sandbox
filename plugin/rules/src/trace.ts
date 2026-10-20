import type { Ref } from './github.ts';

export type Cite = { id: number; rev: number };

const CITE = /^Spec:\s*(\d+)@r(\d+)\s*$/m;

export function parseCite(body: string | null): Cite | undefined {
  const m = (body ?? '').match(CITE);
  return m ? { id: Number(m[1]), rev: Number(m[2]) } : undefined;
}

export function tagName(id: number, rev: number): string {
  return `spec/${id}/r${rev}`;
}

/** Revisions that exist for a spec, from its `spec/<id>/rN` tags, ascending. */
export function revisions(id: number, refs: Ref[]): number[] {
  const re = new RegExp(`^refs/tags/spec/${id}/r(\\d+)$`);
  return refs
    .map(r => r.ref.match(re))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => Number(m[1]))
    .sort((a, b) => a - b);
}

export type TraceVerdict = { ok: boolean; message: string; fix?: string };

/** Spec trace + "revision is current" (0005, 0021). */
export function checkRevisionCurrent(body: string | null, refs: Ref[]): TraceVerdict {
  const cite = parseCite(body);
  if (!cite)
    return { ok: false, message: 'PR body has no `Spec: <id>@r<N>` line', fix: 'Add a line `Spec: <id>@r<N>` naming the locked revision this PR builds.' };
  const revs = revisions(cite.id, refs);
  if (!revs.includes(cite.rev))
    return { ok: false, message: `${tagName(cite.id, cite.rev)} does not exist: that revision was never locked`, fix: 'Cite a revision that has a tag.' };
  const latest = revs[revs.length - 1];
  if (cite.rev !== latest)
    return {
      ok: false,
      message: `cites ${cite.id}@r${cite.rev} but the spec is now at r${latest}`,
      fix: `Re-point the PR to Spec: ${cite.id}@r${latest} and rebuild against that tag, or split the work into a new milestone.`,
    };
  return { ok: true, message: `cites ${cite.id}@r${cite.rev}, the current revision` };
}
