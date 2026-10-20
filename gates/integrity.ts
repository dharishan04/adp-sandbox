// Harness integrity (0006, 0020, 0024): agents never change gate config, and a
// case file or spec only ever changes in its own spec PR, or to the exact
// content of its latest locked revision (syncing main into an epic branch).
import * as R from '../plugin/rules/src/index.ts';
import { api, readText, report, repo } from './gh.ts';
import { currentPull, specIdFromDraft } from './pr.ts';

const pull = await currentPull();
const files: { filename: string; status: string }[] = await api(`/repos/${repo}/pulls/${pull.number}/files?per_page=100`);
const commits: { author: { login: string; type: string } | null; commit: { author: { name: string } } }[] = await api(`/repos/${repo}/pulls/${pull.number}/commits?per_page=100`);
const bots = new Set([pull.user, ...commits.map(c => c.author)].filter(u => u?.type === 'Bot').map(u => u!.login));
const byAgent = bots.size > 0;
const draft = specIdFromDraft(pull.head.ref);

type Line = { ok: boolean; message: string; fix?: string };
const lines: Line[] = [];
const ownedBy = (path: string) => Number(path.match(/^(?:app\/cases|specs)\/(\d+)[/.]/)?.[1]);

for (const f of files) {
  const v = R.classify(f.filename);
  const isSpec = /^specs\/\d+\.md$/.test(f.filename);
  if (v.kind === 'gate-config') {
    lines.push({ ok: !byAgent, message: `${f.filename} is gate config, changed in a PR with agent commits (${[...bots].join(', ') || 'none'})`, fix: R.FIX_IT['gate-config'] });
    continue;
  }
  if (v.kind !== 'case' && !isSpec) continue;
  const id = ownedBy(f.filename);
  if (draft && draft.id === id) {
    lines.push({ ok: true, message: `${f.filename}: part of spec ${id}'s own Lock PR` });
    continue;
  }
  // Elsewhere it must equal the latest locked revision of its spec.
  const refs: R.Ref[] = id ? await api(`/repos/${repo}/git/matching-refs/tags/spec/${id}/`) : [];
  const revs = R.revisions(id, refs);
  const latest = revs.at(-1);
  const locked = latest ? await readText(f.filename, R.tagName(id, latest)) : undefined;
  const head = await readText(f.filename, pull.head.sha);
  lines.push({
    ok: latest !== undefined && locked === head,
    message: `${f.filename} ${latest ? `${locked === head ? 'equals' : 'differs from'} ${R.tagName(id, latest)}` : 'belongs to no locked spec'}`,
    fix: R.FIX_IT.case,
  });
}
if (!lines.length) lines.push({ ok: true, message: `no case, spec or gate-config path changed (${files.length} files)` });
report('integrity', lines, [`agent commits: ${byAgent ? [...bots].join(', ') : 'none'}`]);
