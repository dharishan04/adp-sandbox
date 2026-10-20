// A tiny YAML-subset parser for spec front matter. The rules package must run
// inside a Claude Code mod (no Node, no npm deps), so no yaml library.
// Supports: `key: scalar`, `key: [a, b]`, and `key:` followed by `- k: v` maps.
export type Scalar = string | number;
export type Value = Scalar | Scalar[] | Record<string, Scalar | Scalar[]>[];

function scalar(raw: string): Scalar {
  const s = raw.trim().replace(/^["'](.*)["']$/, '$1');
  return /^-?\d+$/.test(s) ? Number(s) : s;
}

function value(raw: string): Scalar | Scalar[] {
  const s = raw.trim();
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    return inner ? inner.split(',').map(scalar) : [];
  }
  return scalar(s);
}

export function splitFrontMatter(text: string): { yaml: string; body: string } | undefined {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? { yaml: m[1], body: m[2] } : undefined;
}

export function parseYaml(yaml: string): Record<string, Value> {
  const out: Record<string, Value> = {};
  let listKey: string | undefined;
  let item: Record<string, Scalar | Scalar[]> | undefined;
  for (const line of yaml.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = line.match(/^([A-Za-z_]\w*):\s*(.*)$/);
    if (top) {
      listKey = undefined;
      if (top[2] === '') {
        listKey = top[1];
        out[listKey] = [];
      } else out[top[1]] = value(top[2]);
      continue;
    }
    const entry = line.match(/^\s+(-\s+)?([A-Za-z_]\w*):\s*(.*)$/);
    if (entry && listKey) {
      if (entry[1] || !item) {
        item = {};
        (out[listKey] as Record<string, Scalar | Scalar[]>[]).push(item);
      }
      item[entry[2]] = value(entry[3]);
      continue;
    }
    throw new Error(`front matter: cannot read line "${line.trim()}"`);
  }
  return out;
}
