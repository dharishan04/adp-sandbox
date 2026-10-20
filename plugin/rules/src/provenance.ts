// Provenance the workflow (never the agent) writes into a PR body (0019).
export type Provenance = { role: string; model: string; plugin: string; run: string; actor: string; sdk?: string; where?: string; session?: string };

const BLOCK = /<!-- adp-provenance (\{[\s\S]*?\}) -->/g;

export function provenanceBlock(p: Provenance, runUrl: string): string {
  return [
    '### Provenance (written by the workflow)',
    '| agent role | model | plugin | where the agent ran | published by run | started by |',
    '|---|---|---|---|---|---|',
    `| ${p.role} | ${p.model} | ${p.plugin} | ${p.where ?? 'actions'}${p.where === 'laptop' ? ' (self-declared)' : ''} | [${p.run}](${runUrl}) | @${p.actor} |`,
    `<!-- adp-provenance ${JSON.stringify(p)} -->`,
  ].join('\n');
}

export function readProvenance(body: string | null): Provenance[] {
  return [...(body ?? '').matchAll(BLOCK)].map(m => JSON.parse(m[1]) as Provenance);
}
