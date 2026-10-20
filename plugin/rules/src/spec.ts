import { parseYaml, splitFrontMatter, type Value } from './frontmatter.ts';

export type SpecCase = { path: string; covers: string[] };
export type SpecMilestone = { issue: number; covers: string[] };
export type Spec = {
  id: number;
  title: string;
  human_lead: string;
  revision: number;
  cases: SpecCase[];
  milestones: SpecMilestone[];
  body: string;
};

export type Problem = { check: string; message: string; fix: string };

export const MAX_MARKERS = 3;
const REQ_DEF = /^\s*[-*]\s*\**((?:FR|SC)-\d{3})\**/gm;
const MARKER = /\[NEEDS CLARIFICATION/g;
const REQUIRED = ['id', 'title', 'human_lead', 'revision', 'cases', 'milestones'] as const;

export function specPath(id: number): string {
  return `specs/${id}.md`;
}

/** Parses a spec file. Format problems are returned, not thrown. */
export function parseSpec(text: string): { spec?: Spec; problems: Problem[] } {
  const fix = 'Fix the front matter in the spec file; see specs/README.md for the format.';
  const parts = splitFrontMatter(text);
  if (!parts) return { problems: [{ check: 'format', message: 'no front matter block', fix }] };
  let fm: Record<string, Value>;
  try {
    fm = parseYaml(parts.yaml);
  } catch (e) {
    return { problems: [{ check: 'format', message: (e as Error).message, fix }] };
  }
  const problems: Problem[] = [];
  for (const k of REQUIRED) if (fm[k] === undefined) problems.push({ check: 'format', message: `missing field: ${k}`, fix });
  if ('status' in fm)
    problems.push({ check: 'format', message: 'a spec has no status field (draft/review/locked are GitHub states)', fix: 'Delete the status line.' });
  if (problems.length) return { problems };
  const list = (v: Value) => (Array.isArray(v) ? v : []) as Record<string, Value>[];
  const ids = (v: Value | undefined) => (Array.isArray(v) ? v.map(String) : []);
  const spec: Spec = {
    id: Number(fm.id),
    title: String(fm.title),
    human_lead: String(fm.human_lead),
    revision: Number(fm.revision),
    cases: list(fm.cases).map(c => ({ path: String(c.path), covers: ids(c.covers) })),
    milestones: list(fm.milestones).map(m => ({ issue: Number(m.issue), covers: ids(m.covers) })),
    body: parts.body,
  };
  if (!Number.isInteger(spec.id) || spec.id < 1) problems.push({ check: 'format', message: 'id must be the epic Issue number', fix });
  if (!Number.isInteger(spec.revision) || spec.revision < 1) problems.push({ check: 'format', message: 'revision must be a whole number from 1', fix });
  if (!spec.cases.length) problems.push({ check: 'format', message: 'no cases listed', fix });
  return { spec: problems.length ? undefined : spec, problems };
}

export function requirementIds(body: string): string[] {
  return [...new Set([...body.matchAll(REQ_DEF)].map(m => m[1]))];
}

export function markerCount(body: string): number {
  return (body.match(MARKER) ?? []).length;
}

/** Spec Kit-style machine-decidable passes (0023). */
export function checkConsistency(spec: Spec, opts: { atLock: boolean }): Problem[] {
  const out: Problem[] = [];
  const reqs = requirementIds(spec.body);
  const markers = markerCount(spec.body);
  if (!reqs.length) out.push({ check: 'coverage', message: 'no requirement IDs (FR-001, SC-001) in the body', fix: 'List each requirement as "- **FR-001** ...".' });
  if (markers > MAX_MARKERS) out.push({ check: 'markers', message: `${markers} [NEEDS CLARIFICATION] markers; at most ${MAX_MARKERS}`, fix: 'Resolve markers into the Clarifications section.' });
  if (opts.atLock && markers > 0) out.push({ check: 'markers', message: `${markers} [NEEDS CLARIFICATION] marker(s) remain`, fix: 'Answer each in a dated Clarifications section and remove the marker; Lock is refused while any remain.' });
  const caseCovers = new Set(spec.cases.flatMap(c => c.covers));
  for (const r of reqs) if (!caseCovers.has(r)) out.push({ check: 'coverage', message: `${r} has no case`, fix: `Add ${r} to a case's covers list, with a test for it.` });
  for (const c of spec.cases)
    for (const r of c.covers) if (!reqs.includes(r)) out.push({ check: 'coverage', message: `${c.path} cites ${r}, which the spec does not define`, fix: 'Cite only requirement IDs defined in the body.' });
  const msCovers = new Set(spec.milestones.flatMap(m => m.covers));
  for (const r of reqs) if (!msCovers.has(r)) out.push({ check: 'coverage', message: `${r} is in no milestone`, fix: `Add ${r} to a milestone's covers list.` });
  return out;
}
