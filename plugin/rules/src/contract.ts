// A module's living contract (0031): behavioural rules in contract.md, shape in
// OpenAPI. Pure: no Node APIs, so it runs in the mod, the browser and the gates.
import { parseYaml, splitFrontMatter, type Value } from './frontmatter.ts';
import type { Problem } from './spec.ts';
import type { Ref } from './github.ts';

export type Stability = 'provisional' | 'stable';
export type Rule = {
  id: string;
  title: string;
  /** `GET /sensors/{id}/history`; empty on a removed rule. */
  operations: string[];
  /** Decision records this rule depends on (paths in the repo). */
  decidedIn: string[];
  body: string;
  /** Set on a tombstone: "epic 9 · reason". The ID is never given out again. */
  removed?: string;
};
export type Contract = { module: string; stability: Stability; openapi: string; preamble: string; rules: Rule[] };

const RULE_HEAD = (level: number) => new RegExp(`^${'#'.repeat(level)}\\s+([A-Z][A-Z0-9]*-R\\d{3})\\s+·\\s+(.+?)\\s*$`);
const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

/** SENSORS for `sensors`, ORDERHISTORY for `order-history`. */
export const modulePrefix = (module: string) => module.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const ruleNumber = (id: string) => Number(id.slice(id.lastIndexOf('-R') + 2));
export const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();

export function contractTagName(module: string, rev: number): string {
  return `contract/${module}/r${rev}`;
}

/** Revisions of a module contract, from its `contract/<module>/rN` tags, ascending. */
export function contractRevisions(module: string, refs: Ref[]): number[] {
  const re = new RegExp(`^refs/tags/contract/${module}/r(\\d+)$`);
  return refs
    .map(r => r.ref.match(re))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => Number(m[1]))
    .sort((a, b) => a - b);
}

/**
 * Reads one rule's lines (after its heading). Meta lines (Operation:, Decided in:,
 * Removed:) come first; the body starts after the first blank line.
 */
export function parseRuleLines(id: string, title: string, lines: string[]): Rule {
  const rule: Rule = { id, title, operations: [], decidedIn: [], body: '' };
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++; // e.g. the blank line after "#### Now"
  for (; i < lines.length && lines[i].trim(); i++) {
    const m = lines[i].match(/^(Operations?|Decided in|Removed):\s*(.*)$/);
    if (!m) break;
    const list = m[2].split(',').map(s => s.trim()).filter(Boolean);
    if (m[1].startsWith('Operation')) rule.operations = list.map(normaliseOperation);
    else if (m[1] === 'Decided in') rule.decidedIn = list;
    else rule.removed = m[2].trim();
  }
  rule.body = lines.slice(i).join('\n').trim();
  return rule;
}

export function normaliseOperation(op: string): string {
  const [method, ...path] = op.trim().split(/\s+/);
  return `${(method ?? '').toUpperCase()} ${path.join(' ')}`;
}

export function renderRule(r: Rule, level = 2): string {
  const out = [`${'#'.repeat(level)} ${r.id} · ${r.title}`];
  if (r.removed) out.push(`Removed: ${r.removed}`);
  else {
    out.push(`Operation: ${r.operations.join(', ')}`);
    if (r.decidedIn.length) out.push(`Decided in: ${r.decidedIn.join(', ')}`);
    if (r.body) out.push('', r.body);
  }
  return out.join('\n');
}

/** Two rules say the same thing when their rendering matches, whitespace aside. */
export const sameRule = (a: Rule, b: Rule) => normalise(renderRule(a)) === normalise(renderRule(b));

export function defaultPreamble(module: string, openapi: string): string {
  return `# ${module} contract\n\nBehavioural rules only. The shape of each operation is in \`${openapi}\`; a rule never restates it.`;
}

export function parseContract(text: string): { contract?: Contract; problems: Problem[] } {
  const fix = 'See specs/README.md (contract format, 0031).';
  const parts = splitFrontMatter(text);
  if (!parts) return { problems: [{ check: 'contract', message: 'no front matter block', fix }] };
  let fm: Record<string, Value>;
  try {
    fm = parseYaml(parts.yaml);
  } catch (e) {
    return { problems: [{ check: 'contract', message: (e as Error).message, fix }] };
  }
  const problems: Problem[] = [];
  for (const k of ['module', 'stability', 'openapi']) if (fm[k] === undefined) problems.push({ check: 'contract', message: `missing field: ${k}`, fix });
  if (problems.length) return { problems };

  const lines = parts.body.split('\n');
  const head = RULE_HEAD(2);
  const preamble: string[] = [];
  const rules: Rule[] = [];
  let cur: { id: string; title: string; lines: string[] } | undefined;
  const flush = () => cur && rules.push(parseRuleLines(cur.id, cur.title, cur.lines));
  for (const line of lines) {
    const m = line.match(head);
    if (m) {
      flush();
      cur = { id: m[1], title: m[2], lines: [] };
    } else if (/^##\s/.test(line)) {
      problems.push({ check: 'contract', message: `"${line.trim()}" is not a rule heading (## <ID> · <title>)`, fix });
    } else if (cur) cur.lines.push(line);
    else preamble.push(line);
  }
  flush();
  const contract: Contract = {
    module: String(fm.module),
    stability: String(fm.stability) as Stability,
    openapi: String(fm.openapi),
    preamble: preamble.join('\n').trim(),
    rules,
  };
  return { contract: problems.length ? undefined : contract, problems };
}

export function renderContract(c: Contract): string {
  const rules = [...c.rules].sort((a, b) => ruleNumber(a.id) - ruleNumber(b.id));
  const fm = `---\nmodule: ${c.module}\nstability: ${c.stability}\nopenapi: ${c.openapi}\n---\n`;
  return `${fm}${c.preamble}\n\n${rules.map(r => renderRule(r)).join('\n\n')}\n`;
}

/**
 * The operations an OpenAPI document declares, as `GET /path`. Reads block-style
 * YAML only (`paths:` at the top, paths at two spaces, methods at four): enough
 * for the shape files here, with no YAML library (the package has no deps).
 */
export function openapiOperations(yaml: string): string[] {
  const ops: string[] = [];
  let inPaths = false;
  let path = '';
  for (const line of yaml.replace(/\r\n/g, '\n').split('\n')) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (/^\S/.test(line)) inPaths = false;
    if (!inPaths) continue;
    const p = line.match(/^ {2}['"]?(\/[^'":]*)['"]?:\s*$/);
    if (p) {
      path = p[1];
      continue;
    }
    const m = line.match(/^ {4}([a-z]+):/);
    if (m && path && METHODS.includes(m[1])) ops.push(`${m[1].toUpperCase()} ${path}`);
  }
  return ops;
}

/** Problems with a contract on its own, and against its OpenAPI operations when given. */
export function checkContract(c: Contract, operations?: string[]): Problem[] {
  const out: Problem[] = [];
  const prefix = modulePrefix(c.module);
  if (!/^[a-z][a-z0-9-]*$/.test(c.module)) out.push({ check: 'contract', message: `module "${c.module}" must be lower-case kebab`, fix: 'Rename the module.' });
  if (c.stability !== 'provisional' && c.stability !== 'stable')
    out.push({ check: 'contract', message: `stability "${c.stability}" must be provisional or stable`, fix: 'Contracts start provisional (0031).' });
  const seen = new Set<string>();
  for (const r of c.rules) {
    if (!r.id.startsWith(`${prefix}-R`)) out.push({ check: 'rule-id', message: `${r.id} is not a ${c.module} rule (IDs start ${prefix}-R)`, fix: `Number it ${prefix}-Rnnn.` });
    if (seen.has(r.id)) out.push({ check: 'rule-id', message: `${r.id} is used twice`, fix: 'Give the second rule the next free number; IDs are never reused.' });
    seen.add(r.id);
    if (r.removed) continue;
    if (!r.operations.length) out.push({ check: 'operation', message: `${r.id} names no operation`, fix: 'Add "Operation: GET /path" naming what the rule constrains.' });
    if (!r.body) out.push({ check: 'contract', message: `${r.id} has no scenarios`, fix: 'Add at least one Given/When/Then line.' });
    if (operations)
      for (const op of r.operations)
        if (!operations.includes(op)) out.push({ check: 'operation', message: `${r.id} names ${op}, which ${c.openapi} does not declare`, fix: 'Declare the operation in the OpenAPI file, or fix the rule.' });
  }
  return out;
}
