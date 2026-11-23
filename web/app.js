// The light delivery view (0029): static files, GitHub read in the browser, and
// every stage and verdict derived by the platform's rules package, imported
// unchanged from plugin/rules/src (ts-loader.js strips its types in the page).
import { REPO, EPIC, REVIEWER, HARNESS_STAGES } from './config.js';
import { get, repoPath, html, stats, onStats } from './github.js';
import { importTs } from './ts-loader.js';

let R;
let loaded = { files: [], ms: 0 };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const src = t => `<span class="src">${esc(t)}</span>`;
const a = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`;
const pill = (cls, text) => `<span class="pill ${cls}">${esc(text)}</span>`;
const isBot = u => u?.type === 'Bot' || /\[bot\]$/.test(u?.login ?? '');
const who = u => (u ? `<span class="chip ${isBot(u) ? 'bot' : 'person'}">@${esc(u.login)}</span>` : '<span class="muted">nobody</span>');
const when = s => (s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const short = sha => (sha ?? '').slice(0, 7);
const conclusionCls = c => ({ success: 'ok', failure: 'bad', cancelled: 'none', skipped: 'none', neutral: 'none', action_required: 'warn' })[c] ?? 'warn';
const fact = (k, v, where) => `<div class="fact"><div class="k">${esc(k)}</div><div class="v">${v} ${where ? src(where) : ''}</div></div>`;

// ---- shared reads -----------------------------------------------------------
let epicP;
const epic = () =>
  (epicP ??= (async () => {
    const rec = await R.gatherEpic(get, REPO, EPIC);
    const subs = await get(repoPath(`/issues/${EPIC}/sub_issues`)).catch(() => []);
    return { rec, view: R.deriveStage(EPIC, rec), subs };
  })());

// The epic's lock at a revision tag, in either format: specs/<id>.md or a 0031 contract delta.
const specAt = rev => {
  const r = R.readersFromGet(get, REPO);
  return R.readLockUnit(r.read, r.list, EPIC, R.tagName(EPIC, rev)).then(x => x.unit);
};
const kindOf = p =>
  R.isSpecPull(EPIC, p) ? 'spec' : p.base.ref === R.epicBranch(EPIC) ? (p.head.ref.startsWith('sync/') ? 'sync' : 'milestone') : p.head.ref === R.epicBranch(EPIC) ? 'epic' : 'other';
const lastApproval = (reviews, login) => [...reviews].reverse().find(r => r.state === 'APPROVED' && (!login || r.user.login.toLowerCase() === login.toLowerCase()));

// ---- stage track: the harness's seven stages over what the rules package derives
function track(view) {
  const at = { Frame: 0, Design: 1, Lock: 2, Build: 4, Done: 4 }[view.stage] ?? -1;
  const derivable = new Set(['Frame', 'Design', 'Lock', 'Build']);
  return HARNESS_STAGES.map((s, i) => {
    let cls = 'stage';
    let note = '';
    if (!derivable.has(s)) {
      cls += ' nod';
      note = s === 'Enforce' ? 'no rule derives it' : 'no deploy record (Q23)';
    } else if (i < at || (view.stage === 'Done' && i === at)) {
      cls += ' done';
      note = view.stage === 'Done' && i === at ? 'epic merged' : 'done';
    } else if (i === at) {
      cls += ' now';
      note = 'now';
    }
    return `<div class="${cls}">${s}<small>${esc(note)}</small></div>`;
  }).join('');
}

// ---- header -----------------------------------------------------------------
async function header() {
  const { rec, view } = await epic();
  const lead = rec.issue.assignees;
  $('#crumb').textContent = `${REPO} · epic #${EPIC}`;
  $('#title').innerHTML = `<span class="id">#${EPIC}</span>${esc(rec.issue.title)}`;
  $('#meta').innerHTML = [
    pill(view.stage === 'Done' ? 'ok' : 'info', view.stage),
    src('rules package: deriveStage'),
    `<span class="chip spec">${esc(R.formatStage(view))}</span>`,
    'lead',
    lead.map(who).join(' '),
    src(`Issue #${EPIC} · assignees`),
    a(html(`/issues/${EPIC}`), 'epic Issue ↗'),
  ].join(' ');
}

// ---- 1. module overview ----------------------------------------------------------
async function overview() {
  const { rec, view, subs } = await epic();
  const revs = R.revisions(EPIC, rec.refs);
  const pulls = [...rec.pulls].filter(p => kindOf(p) !== 'other').sort((x, y) => x.number - y.number);
  const milestones = subs.map(m => {
    const prs = rec.pulls.filter(p => new RegExp(`^Closes #${m.number}\\b`, 'm').test(p.body ?? ''));
    return `<tr><td>${a(m.html_url, `#${m.number}`)}</td><td>${esc(m.title)}</td>
      <td>${pill(m.state === 'open' ? 'warn' : 'ok', m.state)}${m.state === 'open' && prs.some(p => p.merged_at) ? `<div class="muted" style="font-size:.78rem">its PR merged into an epic branch; GitHub closes issues only on the default branch</div>` : ''}</td>
      <td>${prs.map(p => `${a(p.html_url, `#${p.number}`)} ${pill(p.merged_at ? 'ok' : p.state === 'open' ? 'info' : 'none', p.merged_at ? 'merged' : p.state)}`).join('<br>') || '—'}</td></tr>`;
  });
  return `
  <section class="card">
    <h2>Where the epic stands ${src('rules package: deriveStage(Issue, PRs, spec tags), over the harness’s seven stages')}</h2>
    <div class="track">${track(view)}</div>
    <p class="muted" style="font-size:.85rem">Derived, not stored: <span class="chip spec">${esc(R.formatStage(view))}</span>. The rules package derives Frame, Design, Lock and Build (Done = the epic PR merged); Enforce, Transition and Field have no rule or record yet.</p>
  </section>
  <div class="grid2">
    <section class="card">
      <h2>Accountability</h2>
      <dl class="kv">
        <dt>Accountable lead</dt><dd>${rec.issue.assignees.map(who).join(' ') || pill('bad', 'none')} ${src(`Issue #${EPIC} · assignees`)}</dd>
        <dt>Intake path</dt><dd>${(rec.issue.labels ?? []).map(l => `<span class="chip">${esc(l.name ?? l)}</span>`).join(' ')} ${src(`Issue #${EPIC} · labels`)}</dd>
        <dt>Spec revision</dt><dd>${revs.map(n => a(html(`/tree/${R.tagName(EPIC, n)}`), R.tagName(EPIC, n))).join(', ') || '—'} ${src('git tags spec/1/r*')}</dd>
        <dt>Epic branch</dt><dd><code>${esc(R.epicBranch(EPIC))}</code> ${view.epicPull ? `landed by ${a(html(`/pull/${view.epicPull}`), `#${view.epicPull}`)}` : ''} ${src('PR head epic/1 → main')}</dd>
      </dl>
    </section>
    <section class="card">
      <h2>Milestones ${src(`sub-issues of #${EPIC}; PRs by their “Closes #n” line`)}</h2>
      <div class="tblwrap"><table class="tbl"><tr><th>Issue</th><th>Milestone</th><th>State</th><th>PRs</th></tr>${milestones.join('') || '<tr><td colspan="4" class="muted">No sub-issues.</td></tr>'}</table></div>
    </section>
  </div>
  <section class="card">
    <h2>The work, as GitHub records it ${src('pulls API, classified by branch: draft/1-rN, build/…→epic/1, sync/…, epic/1→main')}</h2>
    <div class="tblwrap"><table class="tbl"><tr><th>PR</th><th>Kind</th><th>Title</th><th>State</th><th>Cites</th><th></th></tr>
    ${pulls.map(p => {
      const cite = R.parseCite(p.body);
      return `<tr><td>${a(p.html_url, `#${p.number}`)}</td><td><span class="chip">${kindOf(p)}</span></td><td>${esc(p.title)}</td>
        <td>${pill(p.merged_at ? 'ok' : p.state === 'open' ? 'info' : 'none', p.merged_at ? 'merged' : p.state)}</td>
        <td>${cite ? `<span class="chip spec">${cite.id}@r${cite.rev}</span>` : '—'}</td>
        <td><a href="#/gates/${p.number}">gates</a> · <a href="#/trace/${p.number}">trace</a></td></tr>`;
    }).join('')}</table></div>
  </section>`;
}

// ---- 2. spec page -------------------------------------------------------------------
async function specPage(arg) {
  const { rec } = await epic();
  const revs = R.revisions(EPIC, rec.refs);
  if (!revs.length) return '<section class="card"><h2>No locked revision yet</h2></section>';
  const rev = Number((arg ?? '').replace(/^r/, '')) || revs.at(-1);
  const spec = await specAt(rev);
  const tagRef = rec.refs.find(r => r.ref === `refs/tags/${R.tagName(EPIC, rev)}`);
  const pr = rec.pulls.find(p => p.head.ref === R.specBranch(EPIC, rev) && p.merged_at);
  const [reviews, comments] = pr
    ? await Promise.all([get(repoPath(`/pulls/${pr.number}/reviews?per_page=100`)), get(repoPath(`/issues/${pr.number}/comments?per_page=100`))])
    : [[], []];
  const approval = pr ? R.leadApproval(reviews, spec.human_lead, pr.head.sha) : { ok: false, message: 'no Lock PR found' };
  const approved = lastApproval(reviews, spec.human_lead);
  const reqs = spec.requirements.map(r => r.id);
  const problems = R.lockConsistency(spec, { atLock: true });
  const reqText = id => spec.requirements.find(r => r.id === id)?.text ?? '';
  const isDelta = spec.kind === 'delta';
  const ledger = R.replayFindings(comments, REVIEWER, spec.human_lead);
  const fileAt = path => html(`/blob/${R.tagName(EPIC, rev)}/${path}`);
  const where = `${spec.path} at tag ${R.tagName(EPIC, rev)}`;

  return `
  <div class="rev-tabs">${revs.map(n => `<a href="#/spec/r${n}"><button aria-pressed="${n === rev}">r${n}${n === revs.at(-1) ? ' · current' : ''}</button></a>`).join('')}</div>
  <div class="grid2">
    <section class="card">
      <h2>Lock of r${rev} ${pill(approval.ok ? 'ok' : 'bad', approval.ok ? 'locked by the named lead' : 'not proven')}</h2>
      <dl class="kv">
        <dt>Tag</dt><dd>${a(html(`/tree/${R.tagName(EPIC, rev)}`), R.tagName(EPIC, rev))} → <code>${short(tagRef?.object.sha)}</code> ${src('git ref refs/tags/spec/1/rN (ruleset: never moves)')}</dd>
        <dt>Lock PR</dt><dd>${pr ? `${a(pr.html_url, `#${pr.number}`)} by ${who(pr.user)}, merged ${when(pr.merged_at)}` : '—'} ${src('pulls API: head draft/1-rN, merged')}</dd>
        <dt>Approved by</dt><dd>${approved ? `${who(approved.user)} ${when(approved.submitted_at)} on <code>${short(approved.commit_id)}</code>` : '—'} ${src(`PR #${pr?.number} reviews API`)}</dd>
        <dt>Rules verdict</dt><dd>${esc(approval.message)} ${src('rules package: leadApproval(reviews, human_lead, head)')}</dd>
        <dt>human_lead</dt><dd>${who({ login: spec.human_lead })} ${src(`${where} · front matter`)}</dd>
      </dl>
    </section>
    <section class="card">
      <h2>${isDelta ? 'Decisions and removals' : 'Clarifications'} ${src(`${where} · ${isDelta ? 'Decided in: links and REMOVED reasons' : '## Clarifications'}`)}</h2>
      <div class="prose">${spec.notes.length ? `<ul>${spec.notes.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="muted">None.</p>'}</div>
      <p class="muted" style="font-size:.85rem">${isDelta ? `Contract delta for module <code>${esc(spec.delta.module)}</code>, written against <code>${esc(spec.delta.base)}</code> (0031). ` : ''}Markers left: ${R.markerCount(spec.text)} ${src('rules package: markerCount')}</p>
    </section>
  </div>
  <section class="card">
    <h2>${isDelta ? 'Rules changed and coverage' : 'Requirements and coverage'} ${pill(problems.length ? 'bad' : 'ok', problems.length ? `${problems.length} gap(s)` : `every ${isDelta ? 'changed rule' : 'requirement'} has a case and a milestone`)} ${src('rules package: readLockUnit + lockConsistency(atLock)')}</h2>
    <div class="tblwrap"><table class="tbl"><tr><th>ID</th><th>${isDelta ? 'Rule' : 'Requirement'}</th>${spec.cases.map(c => `<th>${a(fileAt(c.path), c.path.split('/').pop())}</th>`).join('')}${spec.milestones.map(m => `<th>milestone #${m.issue}</th>`).join('')}</tr>
    ${reqs.map(id => `<tr><td><code>${id}</code></td><td>${esc(reqText(id))}</td>${spec.cases.map(c => `<td class="c">${c.covers.includes(id) ? '●' : ''}</td>`).join('')}${spec.milestones.map(m => `<td class="c">${m.covers.includes(id) ? '●' : ''}</td>`).join('')}</tr>`).join('')}</table></div>
    ${problems.map(p => `<div class="callout bad">${esc(p.message)} <span>${esc(p.fix)}</span></div>`).join('')}
    <p class="muted" style="font-size:.85rem">${src(`${where} · front matter cases[] and milestones[]; IDs from ${isDelta ? 'the ADDED and MODIFIED rules' : 'the body'}`)} Cases were red at Lock: the Lock check ran each one ${pr ? a(html(`/pull/${pr.number}/checks`), 'on the Lock PR') : ''}.</p>
  </section>
  <section class="card">
    <h2>Adversarial review of the spec ${pill(R.openFindings(ledger).length ? 'bad' : 'ok', `${ledger.findings.length} raised, ${R.openFindings(ledger).length} open blocking, ${ledger.rounds.length} round(s)`)} ${src(`PR #${pr?.number} comments: reviewer App round blocks + the lead’s /dismiss`)}</h2>
    <div class="tblwrap"><table class="tbl"><tr><th>Finding</th><th>Severity</th><th>Title</th><th>Opened</th><th>How it closed</th></tr>
    ${ledger.findings.map(f => `<tr><td><code>${f.id}</code></td><td>${pill(f.severity === 'high' ? 'bad' : f.severity === 'medium' ? 'warn' : 'none', f.severity)}</td><td>${esc(f.title)}${f.path ? `<div class="muted mono">${esc(f.path)}${f.line ? `:${f.line}` : ''}</div>` : ''}</td><td>round ${f.openedRound}</td>
      <td>${f.closed ? (f.closed.by === 'recheck' ? `${pill('ok', 'fixed')} re-checked in round ${f.closed.round}` : `${pill('info', 'dismissed')} by @${esc(f.closed.who)}: ${esc(f.closed.reason)}`) : pill(f.severity === 'low' ? 'none' : 'bad', 'open')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No findings.</td></tr>'}
    </table></div>
    <p class="muted" style="font-size:.85rem">Rounds: ${ledger.rounds.map(r => `r${r.round} on <code>${short(r.sha)}</code>${r.model ? ` (${esc(r.model)})` : ''}`).join(' · ') || '—'} ${src('rules package: replayFindings (reviewer App + lead only)')}</p>
  </section>`;
}

// ---- 3. PR gate report ----------------------------------------------------------------
function prPicker(pulls, current, page, filter = () => true) {
  return `<label class="muted" style="font-weight:700">PR <select data-nav="${page}">${[...pulls]
    .filter(filter)
    .sort((x, y) => y.number - x.number)
    .map(p => `<option value="${p.number}" ${p.number === current ? 'selected' : ''}>#${p.number} ${esc(p.title.slice(0, 70))}</option>`)
    .join('')}</select></label>`;
}

async function gates(arg) {
  const { rec } = await epic();
  const n = Number(arg) || Math.max(...rec.pulls.map(p => p.number));
  const pull = await get(repoPath(`/pulls/${n}`));
  const [checks, runs] = await Promise.all([
    get(repoPath(`/commits/${pull.head.sha}/check-runs?per_page=100`)),
    get(repoPath(`/actions/runs?head_sha=${pull.head.sha}&per_page=50`)),
  ]);
  const runById = new Map(runs.workflow_runs.map(r => [String(r.id), r]));
  const counts = {};
  for (const c of checks.check_runs) counts[c.name] = (counts[c.name] ?? 0) + 1;
  const cite = R.parseCite(pull.body);
  const refs = cite ? (cite.id === EPIC ? rec.refs : await get(repoPath(`/git/matching-refs/tags/spec/${cite.id}/`))) : [];
  const now = R.checkRevisionCurrent(pull.body, refs);
  const rows = checks.check_runs
    .sort((x, y) => x.name.localeCompare(y.name))
    .map(c => {
      const runId = c.details_url?.match(/\/actions\/runs\/(\d+)/)?.[1];
      const run = runId ? runById.get(runId) : undefined;
      const reporter = c.app?.slug === 'github-actions'
        ? `<span class="chip">workflow</span> ${run ? a(run.html_url, `${run.name} · ${run.event}${run.run_attempt > 1 ? ` · attempt ${run.run_attempt}` : ''}`) : 'GitHub Actions'}`
        : `<span class="chip bot">App</span> ${esc(c.app?.name ?? c.app?.slug)}`;
      return `<tr><td><b>${esc(c.name)}</b>${counts[c.name] > 1 ? ` ${pill('warn', `${counts[c.name]} results`)}` : ''}</td>
        <td>${pill(conclusionCls(c.conclusion), c.conclusion ?? c.status)}</td>
        <td>${reporter}</td><td>${esc(c.output?.title ?? '')}</td><td>${when(c.completed_at)}</td><td>${a(c.html_url, 'details ↗')}</td></tr>`;
    });
  return `
  <section class="card">
    <h2>${prPicker(rec.pulls, n, 'gates')}</h2>
    <dl class="kv">
      <dt>PR</dt><dd>${a(pull.html_url, `#${pull.number} ${pull.title}`)} ${pill(pull.merged_at ? 'ok' : pull.state === 'open' ? 'info' : 'none', pull.merged_at ? 'merged' : pull.state)} <code>${esc(pull.head.ref)} → ${esc(pull.base.ref)}</code></dd>
      <dt>Head commit</dt><dd>${a(html(`/commit/${pull.head.sha}`), short(pull.head.sha))} ${src('PR head sha')}</dd>
      <dt>Revision, now</dt><dd>${pill(now.ok ? 'ok' : cite ? 'bad' : 'none', now.ok ? 'current' : cite ? 'stale' : 'no Spec line')} ${esc(now.message)} ${src('rules package: checkRevisionCurrent(PR body, spec tags), computed in this browser')}</dd>
    </dl>
  </section>
  <section class="card">
    <h2>Gates on the head commit ${src(`check-runs API on ${short(pull.head.sha)}; reporter from each run’s app and workflow run`)}</h2>
    <div class="tblwrap"><table class="tbl"><tr><th>Gate</th><th>Result</th><th>Reported by</th><th>Says</th><th>When</th><th></th></tr>${rows.join('') || '<tr><td colspan="6" class="muted">No checks.</td></tr>'}</table></div>
    <p class="muted" style="font-size:.85rem">“workflow” rows come from this repo’s gate workflows (GitHub Actions); “App” rows from the reviewer App, the only identity that may write <code>review</code>. A gate with more than one result on a commit is flagged: GitHub counts every result.</p>
  </section>`;
}

// ---- 4. one-minute trace --------------------------------------------------------------
async function trace(arg) {
  const t0 = performance.now();
  const { rec } = await epic();
  const merged = rec.pulls.filter(p => p.merged_at);
  const n = Number(arg) || Math.max(...merged.map(p => p.number));
  const { pull, reviews, comments, checks } = await R.gatherPull(get, REPO, n);
  const kind = kindOf(pull);
  const approved = lastApproval(reviews);
  const draft = pull.head.ref.match(/^draft\/(\d+)-r(\d+)$/);
  const cite = R.parseCite(pull.body) ?? (draft ? { id: Number(draft[1]), rev: Number(draft[2]) } : undefined);
  const spec = cite ? await specAt(cite.rev).catch(() => undefined) : undefined;
  const provs = R.readProvenance(pull.body);
  const ledger = R.replayFindings(comments, REVIEWER, spec?.human_lead ?? '');
  const epicPr = rec.pulls.find(p => p.head.ref === R.epicBranch(EPIC) && p.base.ref === 'main');
  const reviewRound = ledger.rounds.at(-1);

  let landed;
  if (kind === 'epic') landed = `main as one commit ${a(html(`/commit/${pull.merge_commit_sha}`), short(pull.merge_commit_sha))}`;
  else if (kind === 'spec') landed = `main as the Lock of r${cite.rev}: ${a(html(`/commit/${pull.merge_commit_sha}`), short(pull.merge_commit_sha))}, tagged ${a(html(`/tree/${R.tagName(EPIC, cite.rev)}`), R.tagName(EPIC, cite.rev))}`;
  else if (pull.base.ref === R.epicBranch(EPIC))
    landed = `${a(html(`/tree/${R.epicBranch(EPIC)}`), R.epicBranch(EPIC))}${epicPr?.merged_at ? `, then main through ${a(epicPr.html_url, `#${epicPr.number}`)} as ${a(html(`/commit/${epicPr.merge_commit_sha ?? ''}`), short(epicPr.merge_commit_sha) || 'one commit')}` : ' (epic not merged yet)'}`;
  else landed = `<code>${esc(pull.base.ref)}</code>`;

  const ms = Math.round(performance.now() - t0);
  return `
  <section class="card">
    <h2>${prPicker(rec.pulls, n, 'trace', p => p.merged_at)} ${pill('info', `traced in ${ms} ms`)}</h2>
    ${fact('Change', `${a(pull.html_url, `#${pull.number} ${pull.title}`)} <span class="chip">${kind}</span> merged ${when(pull.merged_at)} as ${a(html(`/commit/${pull.merge_commit_sha}`), short(pull.merge_commit_sha))}`, 'pulls API · merged_at, merge_commit_sha')}
    ${fact('Approver', approved ? `${who(approved.user)} approved ${a(approved.html_url, short(approved.commit_id))} ${when(approved.submitted_at)}${approved.commit_id === pull.head.sha ? ` ${pill('ok', 'the latest push')}` : ` ${pill('warn', 'an earlier push')}`}` : pill('bad', 'no approval'), 'PR reviews API')}
    ${fact('Spec revision', cite ? `<span class="chip spec">${cite.id}@r${cite.rev}</span> → ${a(html(`/tree/${R.tagName(cite.id, cite.rev)}`), R.tagName(cite.id, cite.rev))}${spec ? `, lead ${who({ login: spec.human_lead })}` : ''}` : '<span class="muted">none cited</span>', draft ? 'branch draft/1-rN → git tag' : 'PR body “Spec:” line → git tag')}
    ${fact('Agent and model', provs.length ? provs.map(p => `<span class="chip bot">${esc(p.role)}</span> <code>${esc(p.model)}</code> <code>${esc(p.plugin)}</code> ${esc(p.where ?? 'actions')}${p.where === 'laptop' ? ' (self-declared)' : ''} · ${a(html(`/actions/runs/${p.run}`), `run ${p.run}`)} · started by @${esc(p.actor)}`).join('<br>') : '<span class="muted">no provenance (a person’s change)</span>', 'PR body provenance block, written by the workflow')}
    ${fact('Adversarial review', ledger.rounds.length ? `${ledger.findings.length} finding(s), ${R.openFindings(ledger).length} open blocking, ${ledger.rounds.length} round(s)${reviewRound?.model ? ` · <code>${esc(reviewRound.model)}</code>` : ''}` : '<span class="muted">no rounds</span>', 'PR comments by the reviewer App · rules package: replayFindings')}
    ${fact('Gates', checks.map(c => `${pill(conclusionCls(c.conclusion), c.name)}`).join(' ') + ` <a href="#/gates/${pull.number}">report</a>`, `check-runs API on ${short(pull.head.sha)}`)}
    ${fact('Landed in', landed, 'branches, the epic PR and its merge commit')}
    ${fact('Epic', `${a(html(`/issues/${EPIC}`), `#${EPIC}`)} ${esc(rec.issue.title)}`, `Issue #${EPIC}`)}
  </section>`;
}

// ---- shell -------------------------------------------------------------------------
const pages = { overview, spec: specPage, gates, trace };
let seq = 0;
async function route() {
  const [, page = 'overview', arg] = (location.hash || '#/overview').split('/');
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', String(t.dataset.tab === page));
  const mine = ++seq;
  $('#main').innerHTML = '<p class="muted">Reading GitHub…</p>';
  try {
    const out = await (pages[page] ?? overview)(arg);
    if (mine === seq) $('#main').innerHTML = out;
  } catch (e) {
    if (mine === seq) $('#main').innerHTML = `<section class="card"><h2>${pill('bad', 'could not read GitHub')}</h2><p>${esc(e.message)}</p><p class="muted">Unauthenticated GitHub allows 60 requests an hour per IP. Try <a href="?source=snapshot${location.hash}">the snapshot</a>.</p></section>`;
  }
}

function foot(s) {
  const reset = s.reset ? new Date(Number(s.reset) * 1000).toLocaleTimeString(undefined, { timeStyle: 'short' }) : '—';
  $('#foot').innerHTML = [
    `GitHub API, no sign-in: ${s.live} live · ${s.notModified} not modified · ${s.cached} from cache${s.snapshot ? ` · <b>${s.snapshot} from the local snapshot</b>` : ''}`,
    `rate limit ${s.remaining ?? '—'}/${s.limit ?? 60} left, resets ${reset}`,
    `rules package: ${loaded.files.length} files from <code>plugin/rules/src</code>, unchanged, types stripped in the page in ${loaded.ms} ms`,
    ...s.errors.slice(-2).map(e => `<span style="color:var(--bad)">${esc(e)}</span>`),
  ].join(' · ');
}

function theme() {
  const order = ['system', 'light', 'dark'];
  let t = 'system';
  try {
    t = localStorage.getItem('adp:theme') ?? 'system';
  } catch {}
  const apply = () => {
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = t;
    $('#themeBtn').textContent = `Theme: ${t}`;
  };
  apply();
  $('#themeBtn').onclick = () => {
    t = order[(order.indexOf(t) + 1) % order.length];
    try {
      localStorage.setItem('adp:theme', t);
    } catch {}
    apply();
  };
}

function sources() {
  const sw = $('#srcSwitch');
  sw.onclick = () => {
    const on = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(on));
    document.documentElement.classList.toggle('src-on', on);
  };
  document.addEventListener('change', e => {
    const nav = e.target.closest?.('select[data-nav]');
    if (nav) location.hash = `#/${nav.dataset.nav}/${nav.value}`;
  });
}

async function boot() {
  theme();
  sources();
  loaded = await importTs('/plugin/rules/src/index.ts');
  R = loaded.mod;
  onStats(foot);
  foot(stats);
  window.addEventListener('hashchange', route);
  await header();
  route();
}

boot().catch(e => {
  $('#main').innerHTML = `<section class="card"><h2>${pill('bad', 'could not start')}</h2><p>${esc(e.message)}</p></section>`;
});
