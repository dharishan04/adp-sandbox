import { test, expect, mock } from 'claude-code/testing'

// The engine's own tool runs beneath these hooks in a session; here a stand-in
// answers, so a call that reaches it was allowed by the guard.
const allowed = { result: 'ran' }

test('guard denies Edit and Write on case files and gate config', async ($, on) => {
  on('tool.call', () => allowed as never)
  const edit = await $.tool.call({ tool: 'Edit', file_path: '/w/repo/app/cases/7/history.spec.ts', old_string: '404', new_string: '200' })
  expect(String((edit as { deny?: string; text?: string }).deny ?? (edit as { text?: string }).text)).toMatch(/locked case file/)
  const write = await $.tool.call({ tool: 'Write', file_path: '/w/repo/.github/workflows/gates.yml', content: 'x' })
  expect(String((write as { deny?: string }).deny ?? (write as { text?: string }).text)).toMatch(/gate configuration/)
  const ok = await $.tool.call({ tool: 'Write', file_path: '/w/repo/app/src/history.ts', content: 'x' })
  expect((ok as { deny?: string }).deny).toBeUndefined()
})

test('guard denies Bash writes to case files but allows reads and test runs', async ($, on) => {
  on('tool.call', () => allowed as never)
  const sed = await $.tool.call({ tool: 'Bash', command: "sed -i '' 's/404/200/' app/cases/7/history.spec.ts" })
  expect(String((sed as { deny?: string }).deny ?? (sed as { text?: string }).text)).toMatch(/locked case file/)
  const cat = await $.tool.call({ tool: 'Bash', command: 'cat app/cases/7/history.spec.ts' })
  expect((cat as { deny?: string }).deny).toBeUndefined()
  const run = await $.tool.call({ tool: 'Bash', command: 'npx playwright test cases/7' })
  expect((run as { deny?: string }).deny).toBeUndefined()
})

test('in a draft-spec run, only that spec\'s cases open up', async ($, on) => {
  mock.env(on, { ADP_MODE: 'draft-spec', ADP_SPEC: '7' })
  on('tool.call', () => allowed as never)
  const own = await $.tool.call({ tool: 'Write', file_path: '/w/repo/app/cases/7/history.spec.ts', content: 'x' })
  expect((own as { deny?: string }).deny).toBeUndefined()
  const other = await $.tool.call({ tool: 'Write', file_path: '/w/repo/app/cases/3/old.spec.ts', content: 'x' })
  expect(String((other as { deny?: string }).deny ?? (other as { text?: string }).text)).toMatch(/locked case file/)
  const gate = await $.tool.call({ tool: 'Bash', command: 'echo x >> .github/workflows/gates.yml' })
  expect(String((gate as { deny?: string }).deny ?? (gate as { text?: string }).text)).toMatch(/gate configuration/)
})
