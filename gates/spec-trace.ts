// Spec trace + "revision is current" (0005, 0021) on milestone and epic PRs.
// Also prints the epic's stage from the shared rules package (assumption 9).
import * as R from '../plugin/rules/src/index.ts';
import { api, get, report, repo } from './gh.ts';
import { currentPull, specIdFromDraft } from './pr.ts';

const pull = await currentPull();
if (specIdFromDraft(pull.head.ref)) report('spec-trace', [{ ok: true, message: 'spec PR: the Lock check governs it' }]);
if (/^no-spec\s*$/m.test(pull.body ?? '') && !pull.base.ref.startsWith('epic/'))
  report('spec-trace', [{ ok: true, message: '`no-spec`: this change claims to touch no contract, storage or permission (0005)' }]);

const cite = R.parseCite(pull.body);
const refs: R.Ref[] = cite ? await api(`/repos/${repo}/git/matching-refs/tags/spec/${cite.id}/`) : [];
const verdict = R.checkRevisionCurrent(pull.body, refs);
const lines = [verdict];
if (cite && pull.base.ref.startsWith('epic/'))
  lines.push({ ok: pull.base.ref === R.epicBranch(cite.id), message: `targets ${pull.base.ref}, the epic branch of spec ${cite.id}`, fix: `Open the PR into ${R.epicBranch(cite.id)}.` });
const notes = cite ? [`stage (rules package): ${R.formatStage(R.deriveStage(cite.id, await R.gatherEpic(get, repo, cite.id)))}`] : [];
report('spec-trace', lines, notes);
