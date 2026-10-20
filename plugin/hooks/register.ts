import type { EngineInterface, Register } from 'claude-code'
import {
  FIX_IT, bashWrites, checkRevisionCurrent, classifyAbsolute, deriveStage, formatStage, gatherEpic,
  gatherPull, leadApproval, openFindings, parseCite, parseSpec, readFileAt, readProvenance, replayFindings,
  revisions, specPath, tagName, type Get,
} from '../rules/src/index.ts'

// The delivery mod (0026) and the one guard hook (0024). Reads GitHub as the
// person through `gh`, and derives everything with the shared rules package.

const REVIEWER = 'adp-reviewer[bot]'

const gh =
  ($: EngineInterface): Get =>
  async path => {
    const run = await $.process.run(['gh', 'api', '-H', 'Accept: application/vnd.github+json', path], { timeoutMs: 20_000 })
    if (run.exitCode !== 0) throw new Error(`gh api ${path}: ${run.stderr.trim().slice(0, 200)}`)
    return JSON.parse(run.stdout)
  }

async function repoOf($: EngineInterface): Promise<string | undefined> {
  const run = await $.process.run(['gh', 'repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'])
  return run.exitCode === 0 ? run.stdout.trim() : undefined
}

/** The spec this checkout is working on, from the branch name. */
async function specOfBranch($: EngineInterface): Promise<number | undefined> {
  const run = await $.process.run(['git', 'branch', '--show-current'])
  const m = run.stdout.trim().match(/^(?:draft|build|epic)\/(\d+)/)
  return m ? Number(m[1]) : undefined
}

async function refreshStatus($: EngineInterface) {
  if (await $.env.get('CI')) return
  const id = Number(await $.env.get('ADP_SPEC')) || (await specOfBranch($))
  const repo = await repoOf($)
  if (!id || !repo) return $.ui.status(undefined)
  try {
    $.ui.status(formatStage(deriveStage(id, await gatherEpic(gh($), repo, id))))
  } catch {
    $.ui.status(`spec ${id} · (GitHub unreachable)`)
  }
}

async function trace($: EngineInterface, arg: string): Promise<string> {
  const n = Number(arg.replace(/^#/, '').trim())
  if (!n) return 'Usage: /trace <PR number>'
  const repo = await repoOf($)
  if (!repo) return 'No GitHub repo here (gh repo view failed).'
  const get = gh($)
  const { pull, reviews, comments, checks } = await gatherPull(get, repo, n)
  const lines = [`#${pull.number} ${pull.title}  [${pull.merged_at ? 'merged' : pull.state}]  ${pull.head.ref} → ${pull.base.ref}`]
  const cite = parseCite(pull.body)
  if (cite) {
    const refs = (await get(`/repos/${repo}/git/matching-refs/tags/spec/${cite.id}/`)) as Parameters<typeof revisions>[1]
    const verdict = checkRevisionCurrent(pull.body, refs)
    lines.push(`spec      ${cite.id}@r${cite.rev} → ${tagName(cite.id, cite.rev)}  ${verdict.ok ? 'current' : verdict.message}`)
    const stage = deriveStage(cite.id, await gatherEpic(get, repo, cite.id))
    lines.push(`stage     ${formatStage(stage)}`)
    try {
      const { spec } = parseSpec(await readFileAt(get, repo, specPath(cite.id), tagName(cite.id, cite.rev)))
      if (spec) {
        lines.push(`lead      @${spec.human_lead}: ${leadApproval(reviews, spec.human_lead, pull.head.sha).message}`)
        const ledger = replayFindings(comments, REVIEWER, spec.human_lead)
        const open = openFindings(ledger)
        lines.push(`findings  ${ledger.findings.length} raised, ${open.length} open blocking, ${ledger.rounds.length} round(s)${ledger.handedToLead ? ', handed to lead' : ''}`)
        for (const f of ledger.findings)
          lines.push(`  ${f.id} ${f.severity.padEnd(6)} ${f.closed ? `closed by ${f.closed.by}${f.closed.reason ? ` (${f.closed.reason})` : ''}` : 'OPEN'}  ${f.title}`)
      }
    } catch (e) {
      lines.push(`lead      cannot read spec at tag: ${(e as Error).message}`)
    }
  } else lines.push('spec      no `Spec:` line')
  for (const p of readProvenance(pull.body)) lines.push(`agent     ${p.role} · ${p.model} · ${p.plugin} · run ${p.run} · started by @${p.actor}`)
  lines.push('gates')
  for (const c of checks) lines.push(`  ${(c.conclusion ?? c.status).padEnd(10)} ${c.name}${c.app ? `  (${c.app.slug})` : ''}`)
  return lines.join('\n')
}

let root: string | undefined
// In the builder's draft-spec run (set by the workflow, not the agent), the
// agent writes the not-yet-locked cases of that one spec; nothing else opens.
let draftCases: string | undefined

let modeRead = false

async function readMode($: EngineInterface) {
  if (modeRead) return
  // A read that fails leaves draftCases unset: the guard then refuses more, never less.
  const mode = await $.env.get('ADP_MODE').catch(() => undefined)
  const spec = await $.env.get('ADP_SPEC').catch(() => undefined)
  draftCases = mode === 'draft-spec' && spec && /^\d+$/.test(spec) ? `app/cases/${spec}/` : undefined
  modeRead = true
}

const allowedInDraft = (rel: string) => !!draftCases && (rel.startsWith(draftCases) || rel === draftCases.slice(0, -1))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    root = await $.session.cwd()
    const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'])
    if (top.exitCode === 0) root = top.stdout.trim()
    await $.command.register({ name: 'trace', description: 'Trace a PR to its spec revision, lead, agent, findings and gates', argumentHint: '<PR>' })
    void refreshStatus($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    void refreshStatus($)
    return next(e)
  })

  on('command.run', { command: 'trace' }, async ($, e) => {
    try {
      return { text: await trace($, e.args) }
    } catch (err) {
      return { text: `trace failed: ${(err as Error).message}` }
    }
  })

  // The one guard hook: no agent edits case files or gate config, by the edit
  // tools or through Bash. A guide with a fix-it message; the harness
  // integrity gate in CI is the enforcement behind it.
  on('tool.call', async ($, e, next) => {
    await readMode($)
    const deny = (path: string, kind: 'case' | 'gate-config') => ({
      deny: `delivery guard: ${path} is ${kind === 'case' ? 'a locked case file' : 'gate configuration'}. ${FIX_IT[kind]}`,
    })
    if (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit') {
      const path = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
      const v = classifyAbsolute(root ?? '', path)
      if (v.protected && v.kind && !(v.kind === 'case' && allowedInDraft(v.rel))) return deny(v.rel, v.kind)
    }
    if (e.tool === 'Bash') {
      for (const hit of bashWrites(e.command)) {
        const v = classifyAbsolute(root ?? '', hit)
        if (!(v.kind === 'case' && allowedInDraft(v.rel))) return deny(v.rel, v.kind ?? 'gate-config')
      }
    }
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'delivery guard: the guard failed, so the edit is refused.' }))
}
