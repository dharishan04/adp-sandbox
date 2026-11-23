// 0031 trial: living contract + deltas. Reads the sandbox's real contract and
// epic 1's delta, and an invented epic 9 that changes the 7-day maximum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../src/index.ts';

const repo = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const contractText = repo('app/contract.md');
const ops = R.openapiOperations(repo('app/openapi.yaml'));
const main = () => R.parseContract(contractText).contract!;
const epic1 = () => R.parseDelta(repo('plugin/rules/test/fixtures/epic1-sensors.delta.md')).delta!;

// Epic 9 raises the maximum to 30 days. Its Was block is R004 exactly as main has it.
const r004 = () => R.renderRule(main().rules.find(r => r.id === 'SENSORS-R004')!);
const epic9 = (was = r004(), extra = '') => `---
id: 9
title: Allow a month of history
human_lead: dharishan04
revision: 1
module: sensors
base: contract/sensors/r1
cases:
  - path: app/cases/9/month.spec.ts
    covers: [SENSORS-R004]
milestones:
  - issue: 10
    covers: [SENSORS-R004]
---
# Delta: epic 9

## MODIFIED

### SENSORS-R004 · A range longer than 30 days is refused

#### Was

\`\`\`md
${was}
\`\`\`

#### Now

Operation: GET /sensors/{id}/history
Decided in: docs/decisions/0002-history-range-is-at-most-thirty-days.md

- **Given** \`to - from\` is more than 30 days **Then** 400 \`range_too_large\`
- **Given** \`to - from\` is exactly 30 days **Then** 200
${extra}`;

test('the OpenAPI file declares two operations', () => {
  assert.deepEqual(ops, ['GET /sensors/{id}/latest', 'GET /sensors/{id}/history']);
});

test('the living contract parses, is clean against OpenAPI, and renders back unchanged', () => {
  const { contract, problems } = R.parseContract(contractText);
  assert.deepEqual(problems, []);
  assert.equal(contract!.module, 'sensors');
  assert.equal(contract!.stability, 'provisional');
  assert.deepEqual(contract!.rules.map(r => r.id), ['R001', 'R002', 'R003', 'R004', 'R005', 'R006', 'R007'].map(n => `SENSORS-${n}`));
  assert.deepEqual(contract!.rules[5].operations, ['GET /sensors/{id}/history', 'GET /sensors/{id}/latest']);
  assert.deepEqual(contract!.rules[3].decidedIn, ['docs/decisions/0001-history-range-is-at-most-seven-days.md']);
  assert.deepEqual(R.checkContract(contract!, ops), []);
  assert.equal(R.renderContract(contract!), contractText);
});

test('contract checks: unknown operation, reused ID, foreign prefix, rule with no operation', () => {
  const c = main();
  c.rules[0].operations = ['GET /sensors/{id}/average'];
  c.rules.push({ ...c.rules[1] }, { id: 'ORDERS-R001', title: 'x', operations: ['GET /sensors/{id}/latest'], decidedIn: [], body: '- x' });
  c.rules[2].operations = [];
  const msgs = R.checkContract(c, ops).map(p => p.message);
  assert.ok(msgs.some(m => m.includes('GET /sensors/{id}/average, which app/openapi.yaml does not declare')));
  assert.ok(msgs.includes('SENSORS-R002 is used twice'));
  assert.ok(msgs.some(m => m.startsWith('ORDERS-R001 is not a sensors rule')));
  assert.ok(msgs.includes('SENSORS-R003 names no operation'));
});

test("epic 1's delta is consistent, and folding it onto no contract gives exactly app/contract.md", () => {
  const { delta, problems } = R.parseDelta(repo('plugin/rules/test/fixtures/epic1-sensors.delta.md'));
  assert.deepEqual(problems, []);
  assert.equal(delta!.added.length, 7);
  assert.deepEqual(R.checkDelta(delta!), []);
  assert.equal(R.deltaState(delta!, undefined).state, 'pending');
  const { contract } = R.foldDelta(delta!, undefined);
  assert.equal(R.renderContract(contract!), contractText);
  assert.equal(R.classifyDelta(delta!), 'additive');
});

test("on today's main, epic 1 reads as folded, and folding it again is refused", () => {
  assert.equal(R.deltaState(epic1(), main()).state, 'folded');
  assert.match(R.foldDelta(epic1(), main()).problems[0].message, /already folded/);
});

test('r1 of epic 1 (no SENSORS-R006) with r2 case lists is caught: a case cites a rule the delta does not add', () => {
  const d = epic1();
  d.added = d.added.filter(r => r.id !== 'SENSORS-R006');
  const msgs = R.checkDelta(d).map(p => p.message);
  assert.ok(msgs.includes('app/cases/1/prototype-ids.spec.ts cites SENSORS-R006, which this delta does not add or modify'));
});

test('epic 9 (MODIFIED R004) applies, folds, and is possibly breaking', () => {
  const { delta, problems } = R.parseDelta(epic9());
  assert.deepEqual(problems, []);
  assert.deepEqual(R.checkDelta(delta!), []);
  const s = R.deltaState(delta!, main(), 'contract/sensors/r1');
  assert.equal(s.state, 'pending');
  assert.deepEqual(s.notes, []);
  const folded = R.foldDelta(delta!, main()).contract!;
  const r4 = folded.rules.find(r => r.id === 'SENSORS-R004')!;
  assert.equal(r4.title, 'A range longer than 30 days is refused');
  assert.match(r4.body, /exactly 30 days/);
  assert.equal(folded.rules.length, 7);
  assert.equal(R.deltaState(delta!, folded).state, 'folded');
  assert.equal(R.classifyDelta(delta!), 'possibly-breaking');
  assert.equal(R.needsSecondApprover(delta!, main()), false); // provisional: the lead alone
  assert.equal(R.needsSecondApprover(delta!, { ...main(), stability: 'stable' }), true);
});

test('a moved base is only a note when nothing the delta touches changed', () => {
  const s = R.deltaState(R.parseDelta(epic9()).delta!, main(), 'contract/sensors/r4');
  assert.equal(s.state, 'pending');
  assert.match(s.notes[0], /written against contract\/sensors\/r1, main is at contract\/sensors\/r4/);
});

test("main's R004 changed under epic 9: conflict, and the fix is an amendment", () => {
  const moved = main();
  moved.rules[3] = { ...moved.rules[3], body: moved.rules[3].body.replace('7 days **Then** 200', '7 days **Then** 200 with readings') };
  const s = R.deltaState(R.parseDelta(epic9()).delta!, moved, 'contract/sensors/r2');
  assert.equal(s.state, 'conflict');
  assert.match(s.problems[0].message, /main's rule has changed since this delta quoted it/);
  assert.match(s.problems[0].fix, /amend/);
  assert.equal(R.foldDelta(R.parseDelta(epic9()).delta!, moved).contract, undefined);
});

test('a heading inside the Was fence is not read as a section', () => {
  const { delta } = R.parseDelta(epic9());
  assert.equal(delta!.modified.length, 1);
  assert.ok(delta!.modified[0].was.startsWith('## SENSORS-R004 · A range longer than 7 days is refused'));
});

test('REMOVED leaves a tombstone, and the ID can never be added again', () => {
  const removal = `---
id: 12
title: Drop the empty-range rule
human_lead: dharishan04
revision: 1
module: sensors
base: contract/sensors/r1
cases:
  - path: app/cases/12/none.spec.ts
    covers: []
milestones:
  - issue: 13
    covers: []
---
## REMOVED

### SENSORS-R005 · A range with no readings is an empty history, not an error
Reason: an empty range now answers 404 no_readings (see R008)

## ADDED

### SENSORS-R008 · A range with no readings is 404
Operation: GET /sensors/{id}/history

- **Given** a range that holds no readings **Then** 404 \`no_readings\`
`;
  const d = R.parseDelta(removal).delta!;
  d.cases[0].covers = ['SENSORS-R008'];
  d.milestones[0].covers = ['SENSORS-R008'];
  assert.deepEqual(R.checkDelta(d), []);
  const folded = R.foldDelta(d, main()).contract!;
  const tomb = folded.rules.find(r => r.id === 'SENSORS-R005')!;
  assert.equal(tomb.removed, 'epic 12 · an empty range now answers 404 no_readings (see R008)');
  assert.match(R.renderContract(folded), /## SENSORS-R005 · A range with no readings is an empty history, not an error\nRemoved: epic 12/);
  assert.deepEqual(R.checkContract(folded, ops), []);
  assert.equal(R.deltaState(d, folded).state, 'folded');
  // A later epic that tries to reuse R005:
  const reuse = { ...d, id: 14, removed: [], added: [{ ...d.added[0], id: 'SENSORS-R005' }] };
  assert.match(R.deltaState(reuse, folded).problems[0].message, /main already has SENSORS-R005 \(removed; IDs are never reused\)/);
});

test('graduating to stable needs a second human; a delta with no change is refused', () => {
  const d = R.parseDelta(epic9()).delta!;
  assert.equal(R.needsSecondApprover({ ...d, modified: [], added: [], stability: 'stable' }, main()), true);
  assert.ok(R.checkDelta({ ...d, modified: [] }).some(p => p.message === 'the delta changes no rule'));
});

test('contract tags are named and listed like spec tags', () => {
  assert.equal(R.contractTagName('sensors', 3), 'contract/sensors/r3');
  const refs = [2, 1, 10].map(n => ({ ref: `refs/tags/contract/sensors/r${n}`, object: { sha: 'x' } }));
  assert.deepEqual(R.contractRevisions('sensors', [...refs, { ref: 'refs/tags/spec/1/r1', object: { sha: 'y' } }]), [1, 2, 10]);
});

test('the guard list protects the living contract, the shape and delta files (0031)', () => {
  assert.equal(R.classify('app/contract.md').kind, 'contract');
  assert.equal(R.classify('app/openapi.yaml').kind, 'contract');
  assert.equal(R.classify('specs/9/sensors.delta.md').kind, 'contract');
  assert.equal(R.classify('specs/9/sensors.openapi.next.yaml').kind, 'contract');
  assert.equal(R.DELTA_FILE.exec('specs/9/sensors.delta.md')?.[1], '9');
  assert.equal(R.classify('specs/9/plan.md').protected, false); // the plan is disposable
  assert.equal(R.classify('app/src/history.ts').protected, false);
  assert.deepEqual(R.bashWrites("sed -i '' 's/7/30/' app/contract.md"), ['app/contract.md']);
  assert.deepEqual(R.bashWrites('echo x > specs/9/plan.md'), []);
  assert.deepEqual(R.bashWrites('cat app/contract.md'), []);
});
