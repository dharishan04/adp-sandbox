import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../src/index.ts';
import * as F from './fixtures/github.ts';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('a well-formed spec parses and is consistent at Lock', () => {
  const { spec, problems } = R.parseSpec(fx('spec-ok.md'));
  assert.deepEqual(problems, []);
  assert.equal(spec!.id, 7);
  assert.deepEqual(spec!.cases[0].covers, ['FR-001', 'FR-002', 'FR-003', 'SC-001']);
  assert.deepEqual(R.requirementIds(spec!.body), ['FR-001', 'FR-002', 'FR-003', 'SC-001']);
  assert.deepEqual(R.checkConsistency(spec!, { atLock: true }), []);
});

test('gaps: uncovered requirement, unknown cite, markers at Lock', () => {
  const { spec } = R.parseSpec(fx('spec-gaps.md'));
  const msgs = R.checkConsistency(spec!, { atLock: true }).map(p => p.message);
  assert.ok(msgs.includes('FR-002 has no case'));
  assert.ok(msgs.some(m => m.includes('cites FR-009')));
  assert.ok(msgs.some(m => m.includes('marker(s) remain')));
  // Before Lock, one marker is allowed.
  assert.ok(!R.checkConsistency(spec!, { atLock: false }).some(p => p.check === 'markers'));
});

test('a status field is refused', () => {
  const { problems } = R.parseSpec(fx('spec-status.md'));
  assert.ok(problems.some(p => p.message.includes('no status field')));
});

test('more than three markers are refused even before Lock', () => {
  const text = fx('spec-ok.md').replace('## Requirements', '## Requirements\n' + '[NEEDS CLARIFICATION: a]\n'.repeat(4));
  const { spec } = R.parseSpec(text);
  assert.ok(R.checkConsistency(spec!, { atLock: false }).some(p => p.message.startsWith('4 [NEEDS')));
});

test('stage is derived from GitHub state at each step', () => {
  const s = (pulls: R.Pull[], refs: R.Ref[] = [], issue = F.issue()) => R.deriveStage(7, { issue, pulls: [F.unrelated, ...pulls], refs }).stage;
  assert.equal(s([]), 'Frame');
  assert.equal(s([F.specOpen]), 'Design');
  assert.equal(s([F.specMerged], [F.tag(1)]), 'Lock');
  assert.equal(s([F.specMerged]), 'Lock'); // tag reconciler not run yet
  assert.equal(s([F.specMerged, F.milestoneOpen], [F.tag(1)]), 'Build');
  assert.equal(s([F.specMerged, F.milestoneOpen, F.epicMerged], [F.tag(1), F.tag(2)]), 'Done');
  assert.equal(s([], [], F.issue('closed')), 'Withdrawn');
  const v = R.deriveStage(7, { issue: F.issue(), pulls: [F.specMerged, F.milestoneOpen, F.amendOpen], refs: [F.tag(1)] });
  assert.equal(R.formatStage(v), 'spec 7@r1 · Build (amending in #11)');
  assert.equal(R.formatStage(R.deriveStage(7, { issue: F.issue(), pulls: [F.specMerged], refs: [] })), 'spec 7 · Lock (tag missing)');
});

test('revision is current: passes on r1, fails once r2 is tagged', () => {
  assert.equal(R.checkRevisionCurrent(F.milestoneOpen.body, [F.tag(1)]).ok, true);
  const after = R.checkRevisionCurrent(F.milestoneOpen.body, [F.tag(1), F.tag(2)]);
  assert.equal(after.ok, false);
  assert.match(after.message, /now at r2/);
  assert.equal(R.checkRevisionCurrent('no cite here', [F.tag(1)]).ok, false);
  assert.match(R.checkRevisionCurrent('Spec: 7@r5', [F.tag(1)]).message, /never locked/);
});

test('lead approval must be the named lead, on the latest push', () => {
  assert.equal(R.leadApproval([], 'lead-person', 'h2').ok, false);
  assert.equal(R.leadApproval([F.review('someone', 'APPROVED', 'h2')], 'lead-person', 'h2').ok, false);
  assert.equal(R.leadApproval([F.review('lead-person', 'APPROVED', 'h1')], 'lead-person', 'h2').ok, false);
  assert.equal(R.leadApproval([F.review('lead-person', 'APPROVED', 'h2')], 'lead-person', 'h2').ok, true);
  assert.equal(R.leadApproval([F.review('lead-person', 'APPROVED', 'h2'), F.review('lead-person', 'CHANGES_REQUESTED', 'h2')], 'lead-person', 'h2').ok, false);
  assert.equal(R.leadApproval([F.review('lead-person', 'APPROVED', 'h2'), F.review('lead-person', 'COMMENTED', 'h2')], 'lead-person', 'h2').ok, true);
});

test('findings close by re-check or by the lead\'s /dismiss only', () => {
  const bot = 'adp-reviewer[bot]';
  const r1 = R.roundComment({ round: 1, sha: 'a', fixed: [], opened: [
    { id: 'F-1', severity: 'high', title: 'no bound on range' },
    { id: 'F-2', severity: 'medium', title: '404 case tests nothing' },
    { id: 'F-3', severity: 'medium', title: 'naming' },
  ] }, 'Round 1');
  const r2 = R.roundComment({ round: 2, sha: 'b', fixed: ['F-1'], opened: [] }, 'Round 2');
  const ledger = R.replayFindings([
    F.comment(bot, r1, 'Bot'),
    F.comment('adp-builder[bot]', '/dismiss F-2 the agent says it is fine', 'Bot'),
    F.comment('random-dev', '/dismiss F-2 not mine to close'),
    F.comment('adp-builder[bot]', R.roundComment({ round: 9, sha: 'z', fixed: ['F-3'], opened: [] }, 'forged'), 'Bot'),
    F.comment(bot, r2, 'Bot'),
    F.comment('lead-person', '/dismiss F-3 naming is house style'),
  ], bot, 'lead-person');
  const byId = Object.fromEntries(ledger.findings.map(f => [f.id, f]));
  assert.equal(byId['F-1'].closed?.by, 'recheck');
  assert.equal(byId['F-2'].closed, undefined);
  assert.equal(byId['F-3'].closed?.by, 'dismiss');
  assert.equal(byId['F-3'].closed?.reason, 'naming is house style');
  assert.deepEqual(R.openFindings(ledger).map(f => f.id), ['F-2']);
  assert.equal(ledger.ignored.length, 2);
  assert.equal(R.nextFindingId(ledger), 4);
});

test('protected paths and bash writes', () => {
  assert.deepEqual(R.classify('app/cases/7/history.spec.ts'), { protected: true, kind: 'case' });
  assert.equal(R.classify('.github/workflows/gates.yml').kind, 'gate-config');
  assert.equal(R.classify('app/src/server.ts').protected, false);
  assert.deepEqual(R.bashWrites("sed -i '' 's/404/200/' app/cases/7/history.spec.ts"), ['app/cases/7/history.spec.ts']);
  assert.deepEqual(R.bashWrites('echo x > ./app/cases/7/a.spec.ts'), ['./app/cases/7/a.spec.ts']);
  assert.deepEqual(R.bashWrites('cat app/cases/7/history.spec.ts'), []);
  assert.deepEqual(R.bashWrites('npx playwright test app/cases/7'), []);
});

test('provenance round-trips through a PR body', () => {
  const p = { role: 'builder', model: 'claude-sonnet-5-5', plugin: 'delivery@0.1.0', run: '123', actor: 'lead-person' };
  const body = `Spec: 7@r1\n\n${R.provenanceBlock(p, 'https://x/run/123')}`;
  assert.deepEqual(R.readProvenance(body), [p]);
});

test('gatherEpic reads through any Get, and the tags call may 404', async () => {
  const calls: string[] = [];
  const get: R.Get = async path => {
    calls.push(path);
    if (path.includes('/issues/')) return F.issue();
    if (path.includes('/pulls')) return [F.specOpen];
    throw new Error('404');
  };
  const rec = await R.gatherEpic(get, 'o/r', 7);
  assert.equal(R.deriveStage(7, rec).stage, 'Design');
  assert.deepEqual(calls.sort(), ['/repos/o/r/git/matching-refs/tags/spec/7/', '/repos/o/r/issues/7', '/repos/o/r/pulls?state=all&per_page=100']);
});
