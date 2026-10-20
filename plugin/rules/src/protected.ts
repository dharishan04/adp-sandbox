// Paths an agent may never change after Lock (harness integrity, 0006, 0024).
// One list, read by the guard hook in sessions and by the integrity gate in CI.
export const CASE_GLOB = /^app\/cases\//;
export const GATE_CONFIG = [/^\.github\//, /^gates\//, /^lanes\//, /^plugin\//, /^CODEOWNERS$/];

export type PathVerdict = { protected: boolean; kind?: 'case' | 'gate-config' };

export function classify(path: string): PathVerdict {
  const p = path.replace(/^\.\//, '');
  if (CASE_GLOB.test(p)) return { protected: true, kind: 'case' };
  if (GATE_CONFIG.some(r => r.test(p))) return { protected: true, kind: 'gate-config' };
  return { protected: false };
}

export const FIX_IT = {
  case: 'Case files are locked with the spec (0020). Make the code pass the case; if the case is wrong, ask the human lead to amend the spec and lock it again.',
  'gate-config': 'Gate configuration sits outside an agent\'s permissions (harness integrity). Ask the human lead to change it in a person\'s PR.',
} as const;

/** Bash commands that write to a protected path, best effort: the integrity gate is the backstop. */
export function bashWrites(command: string): string[] {
  const hits: string[] = [];
  const paths = command.match(/(?:\.\/)?(?:app\/cases\/|\.github\/|gates\/|lanes\/|plugin\/|CODEOWNERS)[^\s'";|&>)]*/g) ?? [];
  const writes = /(>|>>|\btee\b|\bsed\s+-i|\bperl\s+-[a-z]*i|\bcp\b|\bmv\b|\brm\b|\btouch\b|\bdd\b|\btruncate\b|\bln\b|\bpython3?\b|\bnode\b|\bgit\s+(checkout|restore|apply|rm|mv)\b|\bpatch\b|\bchmod\b|\binstall\b|\bmkdir\b|\bawk\b.*-i)/;
  if (paths.length && writes.test(command)) hits.push(...paths);
  return [...new Set(hits)];
}
