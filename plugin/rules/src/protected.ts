// Paths an agent may never change after Lock (harness integrity, 0006, 0024).
// One list, read by the guard hook in sessions and by the integrity gate in CI.
export const CASE_GLOB = /^app\/cases\//;
export const GATE_CONFIG = [/^\.github\//, /^gates\//, /^lanes\//, /^plugin\//, /^CODEOWNERS$/];
// The living contract and its shape change only at the fold on the epic PR
// (gates/contract.ts --epic checks the content); an epic's delta files only
// in that epic's own draft-spec run and Lock PR (0031).
export const LIVING_CONTRACT = [/(^|\/)contract\.md$/, /^app\/openapi\.yaml$/];
export const DELTA_FILE = /^specs\/(\d+)\/[^/]+\.(delta\.md|openapi\.next\.yaml)$/;

export type PathVerdict = { protected: boolean; kind?: 'case' | 'gate-config' | 'contract' };

export function classify(path: string): PathVerdict {
  const p = path.replace(/^\.\//, '');
  if (CASE_GLOB.test(p)) return { protected: true, kind: 'case' };
  if (LIVING_CONTRACT.some(r => r.test(p)) || DELTA_FILE.test(p)) return { protected: true, kind: 'contract' };
  if (GATE_CONFIG.some(r => r.test(p))) return { protected: true, kind: 'gate-config' };
  return { protected: false };
}

export const FIX_IT = {
  case: 'Case files are locked with the spec (0020). Make the code pass the case; if the case is wrong, ask the human lead to amend the spec and lock it again.',
  contract:
    "The contract changes only through an epic's delta, locked by the human lead (0031). If the contract is wrong, stop and say so; the lead amends the delta and locks it again.",
  'gate-config': 'Gate configuration sits outside an agent\'s permissions (harness integrity). Ask the human lead to change it in a person\'s PR.',
} as const;

/** Bash commands that write to a protected path, best effort: the integrity gate is the backstop. */
export function bashWrites(command: string): string[] {
  const hits: string[] = [];
  const paths = command.match(/(?:\.\/)?(?:app\/cases\/|\.github\/|gates\/|lanes\/|plugin\/|CODEOWNERS|app\/contract\.md|app\/openapi\.yaml|specs\/\d+\/)[^\s'";|&>)]*/g) ?? [];
  const writes = /(>|>>|\btee\b|\bsed\s+-i|\bperl\s+-[a-z]*i|\bcp\b|\bmv\b|\brm\b|\btouch\b|\bdd\b|\btruncate\b|\bln\b|\bpython3?\b|\bnode\b|\bgit\s+(checkout|restore|apply|rm|mv)\b|\bpatch\b|\bchmod\b|\binstall\b|\bmkdir\b|\bawk\b.*-i)/;
  if (paths.length && writes.test(command)) hits.push(...paths.filter(x => classify(x).protected || !/^(\.\/)?specs\//.test(x)));
  return [...new Set(hits)];
}

/** Classifies a tool's absolute path against the repo root it sits in. */
export function classifyAbsolute(root: string, path: string): PathVerdict & { rel: string } {
  const r = root.replace(/\/+$/, '') + '/';
  if (root && path.startsWith(r)) return { ...classify(path.slice(r.length)), rel: path.slice(r.length) };
  // Root unknown or path outside it: judge every suffix, so a guard that never
  // learned its root still refuses rather than allows.
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    const rel = parts.slice(i).join('/');
    const v = classify(rel);
    if (v.protected) return { ...v, rel };
  }
  return { protected: false, rel: path };
}
