// What Lock freezes for an epic, in either format: the old spec file
// `specs/<id>.md` (0004) or a contract delta `specs/<id>/<module>.delta.md`
// (0031). Every reader (Lock gate, tag reconciler, lanes, web view, mod) goes
// through here, so they agree on which file an epic's lock lives in at a ref.
import { checkConsistency, markerCount, MAX_MARKERS, parseSpec, requirementIds, specPath, type Problem, type Spec, type SpecCase, type SpecMilestone } from './spec.ts';
import { checkDelta, parseDelta, type Delta } from './delta.ts';
import { readFileAt } from './gather.ts';
import type { Get } from './github.ts';

export type LockUnit = {
  kind: 'spec' | 'delta';
  path: string;
  text: string;
  id: number;
  title: string;
  human_lead: string;
  revision: number;
  cases: SpecCase[];
  milestones: SpecMilestone[];
  /** What the cases must cover: FR/SC IDs, or the rules a delta adds or modifies. */
  requirements: { id: string; text: string }[];
  /** Clarifications (spec), or the decision records a delta's rules link to. */
  notes: string[];
  spec?: Spec;
  delta?: Delta;
};

export type ReadAt = (path: string, ref: string) => Promise<string | undefined>;
export type ListAt = (dir: string, ref: string) => Promise<string[]>;

/** Which file holds epic `id`'s lock, given the names in `specs/<id>/` (empty if no such folder). */
export function lockUnitPath(id: number, names: string[]): { path: string; problems: Problem[] } {
  const deltas = names.filter(n => n.endsWith('.delta.md')).sort();
  const problems: Problem[] =
    deltas.length > 1
      ? [{ check: 'format', message: `epic ${id} has ${deltas.length} deltas (${deltas.join(', ')}); the trial supports one module per epic`, fix: 'Split the epic per module (0031 §10), or extend the trial.' }]
      : [];
  return { path: deltas.length ? `specs/${id}/${deltas[0]}` : specPath(id), problems };
}

export function parseLockUnit(path: string, text: string): { unit?: LockUnit; problems: Problem[] } {
  if (path.endsWith('.delta.md')) {
    const { delta, problems } = parseDelta(text);
    if (!delta) return { problems };
    const changed = [...delta.added, ...delta.modified.map(m => m.now)];
    return {
      problems,
      unit: {
        kind: 'delta', path, text, delta,
        id: delta.id, title: delta.title, human_lead: delta.human_lead, revision: delta.revision,
        cases: delta.cases, milestones: delta.milestones,
        requirements: changed.map(r => ({ id: r.id, text: `${delta.added.includes(r) ? '' : '(modified) '}${r.title}` })),
        notes: [
          ...new Set(changed.flatMap(r => r.decidedIn.map(d => `${r.id} decided in ${d}`))),
          ...delta.removed.map(r => `${r.id} removed: ${r.reason}`),
        ],
      },
    };
  }
  const { spec, problems } = parseSpec(text);
  if (!spec) return { problems };
  const line = (id: string) => (spec.body.match(new RegExp(`^\\s*[-*]\\s*\\**${id}\\**\\s*(.*)$`, 'm'))?.[1] ?? '').replace(/\*\*/g, '');
  const clar = (spec.body.split(/^## Clarifications\s*$/m)[1] ?? '').split(/^## /m)[0];
  return {
    problems,
    unit: {
      kind: 'spec', path, text, spec,
      id: spec.id, title: spec.title, human_lead: spec.human_lead, revision: spec.revision,
      cases: spec.cases, milestones: spec.milestones,
      requirements: requirementIds(spec.body).map(id => ({ id, text: line(id) })),
      notes: clar.split('\n').map(l => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean),
    },
  };
}

/** The machine-decidable Lock checks for either format (0020, 0023, 0031). */
export function lockConsistency(u: LockUnit, opts: { atLock: boolean }): Problem[] {
  if (u.spec) return checkConsistency(u.spec, opts);
  const out = checkDelta(u.delta!);
  const markers = markerCount(u.text);
  if (markers > MAX_MARKERS) out.push({ check: 'markers', message: `${markers} [NEEDS CLARIFICATION] markers; at most ${MAX_MARKERS}`, fix: 'Answer them with the lead.' });
  if (opts.atLock && markers > 0)
    out.push({ check: 'markers', message: `${markers} [NEEDS CLARIFICATION] marker(s) remain`, fix: 'Answer each (a decision record for a choice) and remove the marker; Lock is refused while any remain.' });
  return out;
}

/** Reads epic `id`'s lock at a ref; undefined when the epic has none there. */
export async function readLockUnit(read: ReadAt, list: ListAt, id: number, ref: string): Promise<{ unit?: LockUnit; problems: Problem[] }> {
  const where = lockUnitPath(id, await list(`specs/${id}`, ref));
  const text = await read(where.path, ref);
  if (text === undefined) return { problems: where.problems };
  const parsed = parseLockUnit(where.path, text);
  return { unit: parsed.unit, problems: [...where.problems, ...parsed.problems] };
}

/** ReadAt and ListAt over the GitHub contents API, for callers holding a Get (web view, mod). */
export function readersFromGet(get: Get, repo: string): { read: ReadAt; list: ListAt } {
  return {
    read: (path, ref) => readFileAt(get, repo, path, ref).catch(() => undefined),
    list: async (dir, ref) => {
      const res = await (get(`/repos/${repo}/contents/${dir}?ref=${encodeURIComponent(ref)}`) as Promise<unknown>).catch(() => []);
      return Array.isArray(res) ? res.filter((e: { type?: string }) => e.type === 'file').map((e: { name: string }) => e.name) : [];
    },
  };
}
