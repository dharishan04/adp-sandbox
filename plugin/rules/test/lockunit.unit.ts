// One reader for an epic's lock, in either format (0004 spec file, 0031 delta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../src/index.ts';

const repo = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const oldSpec = repo('specs/1.md');
const delta = repo('plugin/rules/test/fixtures/epic1-sensors.delta.md'); // served at specs/1/ in the fake repo below

// A tiny repo with two refs: the r2 tag holds only specs/1.md; the trial tree also holds the delta.
const files: Record<string, Record<string, string>> = {
  'spec/1/r2': { 'specs/1.md': oldSpec },
  trial: { 'specs/1.md': oldSpec, 'specs/1/sensors.delta.md': delta },
};
const read: R.ReadAt = async (path, ref) => files[ref]?.[path];
const list: R.ListAt = async (dir, ref) => Object.keys(files[ref] ?? {}).filter(p => p.startsWith(`${dir}/`)).map(p => p.slice(dir.length + 1));

test('the lock file is the delta when an epic folder holds one, else specs/<id>.md', () => {
  assert.equal(R.lockUnitPath(1, []).path, 'specs/1.md');
  assert.equal(R.lockUnitPath(1, ['sensors.delta.md', 'sensors.openapi.next.yaml', 'plan.md']).path, 'specs/1/sensors.delta.md');
  assert.match(R.lockUnitPath(1, ['a.delta.md', 'b.delta.md']).problems[0].message, /one module per epic/);
});

test('both formats give the same fields Lock reads', () => {
  const s = R.parseLockUnit('specs/1.md', oldSpec).unit!;
  const d = R.parseLockUnit('specs/1/sensors.delta.md', delta).unit!;
  for (const u of [s, d]) {
    assert.equal(u.id, 1);
    assert.equal(u.revision, 2);
    assert.equal(u.human_lead, 'dharishan04');
    assert.deepEqual(u.milestones.map(m => m.issue), [2]);
    assert.deepEqual(R.lockConsistency(u, { atLock: true }), []);
  }
  assert.equal(s.kind, 'spec');
  assert.deepEqual(s.requirements.map(r => r.id), ['FR-001', 'FR-002', 'FR-003', 'FR-004', 'FR-005', 'FR-006', 'FR-007', 'SC-001']);
  assert.ok(s.notes.some(n => n.includes('The maximum range is 7 days')));
  assert.equal(d.kind, 'delta');
  assert.deepEqual(d.requirements.map(r => r.id), ['R001', 'R002', 'R003', 'R004', 'R005', 'R006', 'R007'].map(n => `SENSORS-${n}`));
  assert.equal(d.requirements[3].text, 'A range longer than 7 days is refused');
  assert.deepEqual(d.notes, ['SENSORS-R004 decided in docs/decisions/0001-history-range-is-at-most-seven-days.md']);
});

test('history reads true: the r2 tag is the old spec; the trial tree is the delta', async () => {
  assert.equal((await R.readLockUnit(read, list, 1, 'spec/1/r2')).unit!.kind, 'spec');
  assert.equal((await R.readLockUnit(read, list, 1, 'trial')).unit!.kind, 'delta');
  assert.equal((await R.readLockUnit(read, list, 7, 'trial')).unit, undefined);
});

test('markers in a delta are counted and refused at Lock', () => {
  const marked = delta.replace('- **Given** a sensor ID that is not known', '- [NEEDS CLARIFICATION: which sensors are known?]\n- **Given** a sensor ID that is not known');
  const u = R.parseLockUnit('specs/1/sensors.delta.md', marked).unit!;
  assert.ok(R.lockConsistency(u, { atLock: true }).some(p => p.message === '1 [NEEDS CLARIFICATION] marker(s) remain'));
  assert.ok(!R.lockConsistency(u, { atLock: false }).some(p => p.check === 'markers'));
});

test('readersFromGet lists a folder and treats a missing one as empty', async () => {
  const get: R.Get = async path => {
    if (path.startsWith('/repos/o/r/contents/specs/1?')) return [{ type: 'file', name: 'sensors.delta.md' }, { type: 'dir', name: 'x' }];
    if (path.startsWith('/repos/o/r/contents/specs/1/sensors.delta.md')) return { content: Buffer.from(delta, 'utf8').toString('base64') };
    throw Object.assign(new Error('404'), { status: 404 });
  };
  const r = R.readersFromGet(get, 'o/r');
  assert.deepEqual(await r.list('specs/1', 'main'), ['sensors.delta.md']);
  assert.deepEqual(await r.list('specs/9', 'main'), []);
  assert.equal((await R.readLockUnit(r.read, r.list, 1, 'main')).unit!.kind, 'delta');
});
