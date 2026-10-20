// Recorded from the live sandbox run (dharishan04/adp-sandbox, 20 Oct 2026).
// The shared fixture 0026 asks for: whoever reads these records derives the same stage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../src/index.ts';

const rec = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/recorded/${n}`, import.meta.url), 'utf8'));

test('recorded: epic 1 is Done at r2', () => {
  const records = { issue: rec('issue-1.json'), pulls: rec('pulls.json'), refs: rec('tags-1.json') };
  assert.equal(R.formatStage(R.deriveStage(1, records)), 'spec 1@r2 · Done');
  assert.deepEqual(R.revisions(1, records.refs), [1, 2]);
});

test('recorded: the stage before each event is derivable by filtering the records', () => {
  const pulls: R.Pull[] = rec('pulls.json');
  const refs: R.Ref[] = rec('tags-1.json');
  const only = (ns: number[]) => pulls.filter(p => ns.includes(p.number)).map(p => (p.number === Math.max(...ns) ? { ...p, state: 'open' as const, merged_at: null } : p));
  const issue = rec('issue-1.json');
  assert.equal(R.deriveStage(1, { issue, pulls: [], refs: [] }).stage, 'Frame');
  assert.equal(R.deriveStage(1, { issue, pulls: only([3]), refs: [] }).stage, 'Design');
  assert.equal(R.deriveStage(1, { issue, pulls: pulls.filter(p => p.number === 3), refs: refs.slice(0, 1) }).stage, 'Lock');
});

test('recorded: lead approval on PR 3 was on its head commit', () => {
  const reviews: R.Review[] = rec('reviews-3.json');
  assert.equal(R.leadApproval(reviews, 'dharishan04', 'a27c01218edb0f434401bc5a178dd48df6869e67').ok, true);
});

test('recorded: the findings ledger on PR 3 closed F-1..F-4 by re-check', () => {
  const l = R.replayFindings(rec('comments-3.json'), 'adp-sandbox-reviewer-ishan[bot]', 'dharishan04');
  assert.deepEqual(l.findings.filter(f => f.closed?.by === 'recheck').map(f => f.id), ['F-1', 'F-2', 'F-3', 'F-4']);
  assert.equal(R.openFindings(l).length, 0);
});

test('recorded: PR 7 cites the current revision', () => {
  assert.equal(R.checkRevisionCurrent(rec('pull-7.json').body, rec('tags-1.json')).ok, true);
});
