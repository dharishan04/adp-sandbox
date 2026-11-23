// An epic's delta to one module's contract (0031): what Lock freezes, and what
// folds into main's living contract at epic merge. Pure, like contract.ts.
import { parseYaml, splitFrontMatter, type Value } from './frontmatter.ts';
import type { Problem, SpecCase, SpecMilestone } from './spec.ts';
import {
  contractTagName,
  defaultPreamble,
  modulePrefix,
  normalise,
  parseRuleLines,
  renderRule,
  ruleNumber,
  sameRule,
  type Contract,
  type Rule,
  type Stability,
} from './contract.ts';

export type Modified = { id: string; was: string; now: Rule };
export type Removed = { id: string; title: string; reason: string };
export type Delta = {
  id: number;
  title: string;
  human_lead: string;
  revision: number;
  module: string;
  /** The module contract tag this delta was written against, or `none`. */
  base: string;
  /** Needed when base is `none`: where the new contract's shape lives. */
  openapi?: string;
  /** Set to `stable` by a graduation delta (0031 §11). */
  stability?: Stability;
  cases: SpecCase[];
  milestones: SpecMilestone[];
  added: Rule[];
  modified: Modified[];
  removed: Removed[];
};

export const deltaPath = (epic: number, module: string) => `specs/${epic}/${module}.delta.md`;
export const openapiNextPath = (epic: number, module: string) => `specs/${epic}/${module}.openapi.next.yaml`;

const REQUIRED = ['id', 'title', 'human_lead', 'revision', 'module', 'base', 'cases', 'milestones'] as const;
const SECTION = /^##\s+(ADDED|MODIFIED|REMOVED)\s*$/;
const RULE = /^###\s+([A-Z][A-Z0-9]*-R\d{3})\s+·\s+(.+?)\s*$/;

/** Splits markdown lines into blocks at a heading regex, ignoring headings inside ``` fences. */
function blocks(lines: string[], head: RegExp): { m: RegExpMatchArray | null; lines: string[] }[] {
  const out: { m: RegExpMatchArray | null; lines: string[] }[] = [{ m: null, lines: [] }];
  let fence = false;
  for (const line of lines) {
    if (/^```/.test(line)) fence = !fence;
    const m = fence ? null : line.match(head);
    if (m) out.push({ m, lines: [] });
    else out[out.length - 1].lines.push(line);
  }
  return out;
}

export function parseDelta(text: string): { delta?: Delta; problems: Problem[] } {
  const fix = 'See specs/README.md (delta format, 0031).';
  const parts = splitFrontMatter(text);
  if (!parts) return { problems: [{ check: 'delta', message: 'no front matter block', fix }] };
  let fm: Record<string, Value>;
  try {
    fm = parseYaml(parts.yaml);
  } catch (e) {
    return { problems: [{ check: 'delta', message: (e as Error).message, fix }] };
  }
  const problems: Problem[] = [];
  for (const k of REQUIRED) if (fm[k] === undefined) problems.push({ check: 'delta', message: `missing field: ${k}`, fix });
  if ('status' in fm) problems.push({ check: 'delta', message: 'a delta has no status field (draft/locked/folded are GitHub and git states)', fix: 'Delete the status line.' });
  if (problems.length) return { problems };

  const list = (v: Value) => (Array.isArray(v) ? v : []) as Record<string, Value>[];
  const ids = (v: Value | undefined) => (Array.isArray(v) ? v.map(String) : []);
  const delta: Delta = {
    id: Number(fm.id),
    title: String(fm.title),
    human_lead: String(fm.human_lead),
    revision: Number(fm.revision),
    module: String(fm.module),
    base: String(fm.base),
    openapi: fm.openapi === undefined ? undefined : String(fm.openapi),
    stability: fm.stability === undefined ? undefined : (String(fm.stability) as Stability),
    cases: list(fm.cases).map(c => ({ path: String(c.path), covers: ids(c.covers) })),
    milestones: list(fm.milestones).map(m => ({ issue: Number(m.issue), covers: ids(m.covers) })),
    added: [],
    modified: [],
    removed: [],
  };

  for (const section of blocks(parts.body.split('\n'), SECTION)) {
    if (!section.m) continue; // title and prose before the first section
    const kind = section.m[1];
    for (const b of blocks(section.lines, RULE)) {
      if (!b.m) {
        if (b.lines.some(l => l.trim())) problems.push({ check: 'delta', message: `text under ## ${kind} outside a rule`, fix });
        continue;
      }
      const [, id, title] = b.m;
      if (kind === 'ADDED') delta.added.push(parseRuleLines(id, title, b.lines));
      else if (kind === 'REMOVED') {
        const reason = b.lines.map(l => l.match(/^Reason:\s*(.+)$/)?.[1]).find(Boolean);
        if (!reason) problems.push({ check: 'delta', message: `REMOVED ${id} gives no "Reason:"`, fix: 'Say why the promise is withdrawn.' });
        delta.removed.push({ id, title, reason: reason ?? '' });
      } else {
        const sub = blocks(b.lines, /^####\s+(Was|Now)\s*$/);
        const was = sub.find(s => s.m?.[1] === 'Was');
        const now = sub.find(s => s.m?.[1] === 'Now');
        const fenced = was?.lines.join('\n').match(/```[a-z]*\n([\s\S]*?)\n```/);
        if (!fenced || !now) {
          problems.push({ check: 'delta', message: `MODIFIED ${id} needs "#### Was" (the rule as main has it, in a \`\`\` block) and "#### Now"`, fix });
          continue;
        }
        delta.modified.push({ id, was: fenced[1], now: parseRuleLines(id, title, now.lines) });
      }
    }
  }
  return { delta: problems.length ? undefined : delta, problems };
}

/** Problems with a delta on its own: IDs, operations, and that every changed rule has a case and a milestone. */
export function checkDelta(d: Delta): Problem[] {
  const out: Problem[] = [];
  const prefix = modulePrefix(d.module);
  const changed = [...d.added.map(r => r.id), ...d.modified.map(m => m.id)];
  const all = [...changed, ...d.removed.map(r => r.id)];
  if (!all.length) out.push({ check: 'delta', message: 'the delta changes no rule', fix: 'Add, modify or remove at least one rule; an epic with no contract change has no delta.' });
  const seen = new Set<string>();
  for (const id of all) {
    if (!id.startsWith(`${prefix}-R`)) out.push({ check: 'rule-id', message: `${id} is not a ${d.module} rule`, fix: `Rules of ${d.module} are numbered ${prefix}-Rnnn.` });
    if (seen.has(id)) out.push({ check: 'rule-id', message: `${id} appears twice in the delta`, fix: 'Each rule is added, modified or removed once.' });
    seen.add(id);
  }
  if (d.base !== 'none' && !new RegExp(`^${contractTagName(d.module, 0).replace(/0$/, '')}\\d+$`).test(d.base))
    out.push({ check: 'delta', message: `base "${d.base}" is neither none nor a ${d.module} contract tag`, fix: `Set base to the tag main was at, e.g. ${contractTagName(d.module, 1)}.` });
  if (d.base === 'none' && !d.openapi) out.push({ check: 'delta', message: 'a delta that creates a contract (base: none) must name its openapi file', fix: 'Add "openapi: <path>".' });
  for (const r of [...d.added, ...d.modified.map(m => m.now)]) {
    if (!r.operations.length) out.push({ check: 'operation', message: `${r.id} names no operation`, fix: 'Add "Operation: GET /path".' });
    if (!r.body) out.push({ check: 'delta', message: `${r.id} has no scenarios`, fix: 'Add at least one Given/When/Then line.' });
  }
  const caseCovers = new Set(d.cases.flatMap(c => c.covers));
  const msCovers = new Set(d.milestones.flatMap(m => m.covers));
  if (!d.cases.length) out.push({ check: 'coverage', message: 'no cases listed', fix: 'Every changed rule needs a case, locked with the delta (0020).' });
  for (const id of changed) {
    if (!caseCovers.has(id)) out.push({ check: 'coverage', message: `${id} has no case`, fix: `Add ${id} to a case's covers list, with a test for it.` });
    if (!msCovers.has(id)) out.push({ check: 'coverage', message: `${id} is in no milestone`, fix: `Add ${id} to a milestone's covers list.` });
  }
  for (const c of d.cases)
    for (const id of c.covers) if (!changed.includes(id)) out.push({ check: 'coverage', message: `${c.path} cites ${id}, which this delta does not add or modify`, fix: 'A case locked with a delta tests what the delta changes.' });
  return out;
}

export type DeltaState = {
  /** pending: applies to main; folded: main already says it; conflict: neither. */
  state: 'pending' | 'folded' | 'conflict';
  problems: Problem[];
  notes: string[];
};

function isFolded(d: Delta, main: Contract): boolean {
  const byId = new Map(main.rules.map(r => [r.id, r]));
  return (
    d.added.every(r => byId.has(r.id) && sameRule(byId.get(r.id)!, r)) &&
    d.modified.every(m => byId.has(m.id) && sameRule(byId.get(m.id)!, m.now)) &&
    d.removed.every(r => (byId.get(r.id)?.removed ?? '').startsWith(`epic ${d.id} `))
  );
}

/**
 * Does the delta still apply to main's contract (0031 §5, §7)? Checked on the
 * IDs and the quoted old text, not on the base tag alone: a moved base is only a
 * note when nothing the delta touches has changed underneath it.
 */
export function deltaState(d: Delta, main: Contract | undefined, latestTag?: string): DeltaState {
  const problems: Problem[] = [];
  const notes: string[] = [];
  const amend = 'Rebase the epic and amend the delta against main\'s contract; the lead locks it again.';
  if (main && isFolded(d, main)) return { state: 'folded', problems, notes: [`main's contract already says everything in this delta`] };
  if (!main) {
    if (d.base !== 'none') problems.push({ check: 'applies', message: `base is ${d.base} but main has no ${d.module} contract`, fix: amend });
    for (const m of d.modified) problems.push({ check: 'applies', message: `MODIFIED ${m.id}: main has no ${d.module} contract`, fix: amend });
    for (const r of d.removed) problems.push({ check: 'applies', message: `REMOVED ${r.id}: main has no ${d.module} contract`, fix: amend });
    return { state: problems.length ? 'conflict' : 'pending', problems, notes };
  }
  if (d.base === 'none') problems.push({ check: 'applies', message: `the delta creates the ${d.module} contract, but main has one now`, fix: amend });
  const byId = new Map(main.rules.map(r => [r.id, r]));
  for (const r of d.added) {
    const there = byId.get(r.id);
    if (there) problems.push({ check: 'applies', message: `ADDED ${r.id}: main already has ${r.id}${there.removed ? ' (removed; IDs are never reused)' : ''}`, fix: 'Take the next free number.' });
  }
  for (const m of d.modified) {
    const there = byId.get(m.id);
    if (!there || there.removed) problems.push({ check: 'applies', message: `MODIFIED ${m.id}: main has no live ${m.id}`, fix: amend });
    else if (normalise(m.was) !== normalise(renderRule(there)))
      problems.push({ check: 'applies', message: `MODIFIED ${m.id}: main's rule has changed since this delta quoted it`, fix: amend });
  }
  for (const r of d.removed) {
    const there = byId.get(r.id);
    if (!there || there.removed) problems.push({ check: 'applies', message: `REMOVED ${r.id}: main has no live ${r.id}`, fix: amend });
  }
  if (!problems.length && latestTag && d.base !== 'none' && d.base !== latestTag)
    notes.push(`written against ${d.base}, main is at ${latestTag}: nothing this delta touches has changed, so it still applies`);
  return { state: problems.length ? 'conflict' : 'pending', problems, notes };
}

/** Main's contract after the epic merges. Refuses unless the delta is pending. */
export function foldDelta(d: Delta, main: Contract | undefined): { contract?: Contract; problems: Problem[] } {
  const s = deltaState(d, main);
  if (s.state !== 'pending')
    return { problems: s.state === 'folded' ? [{ check: 'fold', message: 'already folded', fix: 'Nothing to do.' }] : s.problems };
  const openapi = main?.openapi ?? d.openapi!;
  const next: Contract = main
    ? { ...main, rules: main.rules.map(r => ({ ...r })) }
    : { module: d.module, stability: 'provisional', openapi, preamble: defaultPreamble(d.module, openapi), rules: [] };
  if (d.stability) next.stability = d.stability;
  for (const r of d.added) next.rules.push({ ...r });
  for (const m of d.modified) next.rules = next.rules.map(r => (r.id === m.id ? { ...m.now } : r));
  for (const x of d.removed)
    next.rules = next.rules.map(r => (r.id === x.id ? { id: r.id, title: r.title, operations: [], decidedIn: [], body: '', removed: `epic ${d.id} · ${x.reason}` } : r));
  next.rules.sort((a, b) => ruleNumber(a.id) - ruleNumber(b.id));
  return { contract: next, problems: [] };
}

/**
 * Additive or possibly breaking (0031 §11). Conservative until Q36 defines
 * "breaking" for a behavioural rule: any MODIFIED or REMOVED rule counts.
 */
export function classifyDelta(d: Delta): 'additive' | 'possibly-breaking' {
  return d.modified.length || d.removed.length ? 'possibly-breaking' : 'additive';
}

/** A second human must approve: a possibly breaking change to a stable contract, or graduation to stable. */
export function needsSecondApprover(d: Delta, main: Contract | undefined): boolean {
  const graduating = d.stability === 'stable' && main?.stability !== 'stable';
  return graduating || (main?.stability === 'stable' && classifyDelta(d) === 'possibly-breaking');
}
