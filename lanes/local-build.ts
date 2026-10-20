// The builder lane on a laptop (owner's choice, replacing Actions for the agent).
//   node lanes/local-build.ts draft-spec <epic> [--note "..."]
//   node lanes/local-build.ts build <epic> <revision> <milestone>
//   node lanes/local-build.ts probe <epic>
// Same authorize step and agent as CI, in a fresh worktree, with the plugin
// pinned by tag and resolved through the marketplace file. The runner (never
// the agent) writes .adp/provenance.json and pushes a handoff/ branch as the
// person; the publish workflow re-commits it as the builder App.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [mode, epic, a3, a4] = process.argv.slice(2);
const noteAt = process.argv.indexOf('--note');
const note = noteAt > 0 ? process.argv[noteAt + 1] : '';
const root = resolve(import.meta.dirname, '..');
const sh = (cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', cwd: opts.cwd ?? root, env: opts.env ?? process.env, stdio: ['ignore', 'pipe', 'inherit'] }).trim();

const tmp = mkdtempSync(join(tmpdir(), `adp-${mode}-${epic}-`));
const outputs = join(tmp, 'outputs');
writeFileSync(outputs, '');
const actor = sh('gh', ['api', 'user', '-q', '.login']);
const plugTag = process.env.PLUGIN_TAG ?? 'plugin-v0.1.0';
const base = { ...process.env, ADP_LOCAL: '1', RUNNER_TEMP: tmp, GITHUB_OUTPUT: outputs, MODE: mode, EPIC: epic, ACTOR: actor, REVISION: a3 ?? '', MILESTONE: a4 ?? '', NOTE: note };

// 1. Refuse unless the person running this is the lead (0019).
execFileSync('node', ['lanes/authorize.ts'], { cwd: root, env: base, stdio: 'inherit' });
const out = Object.fromEntries(readFileSync(outputs, 'utf8').trim().split('\n').map(l => l.split(/=(.*)/s).slice(0, 2)));

// 2. A fresh worktree at what the agent builds on, and the pinned plugin.
sh('git', ['fetch', '--quiet', '--tags', 'origin']);
const checkout = out.checkout.startsWith('spec/') ? `refs/tags/${out.checkout}` : `origin/${out.checkout}`;
const work = join(tmp, 'work');
const pinned = join(tmp, 'pinned');
sh('git', ['worktree', 'add', '--quiet', '--detach', work, checkout]);
sh('git', ['worktree', 'add', '--quiet', '--detach', pinned, `refs/tags/${plugTag}`]);
symlinkSync(join(root, 'node_modules'), join(work, 'node_modules'));
const startSha = sh('git', ['rev-parse', 'HEAD'], { cwd: work });

// 3. The agent: a separate Claude Code process with no GitHub credentials.
let agentOk = true;
try {
  execFileSync('node', ['lanes/builder.ts'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...base, ADP_WORKTREE: work, PINNED_MARKETPLACE: pinned, BUILDER_MODEL: process.env.BUILDER_MODEL ?? 'claude-sonnet-5-5', REVISION: out.revision ?? '', MILESTONE: out.milestone ?? '' },
  });
} catch {
  agentOk = false;
}
const agent = JSON.parse(readFileSync(join(tmp, 'adp-agent.json'), 'utf8'));
console.log(`\nagent result: ${agent.subtype}, cost $${agent.cost_usd}, guard denials: ${agent.guard_denials.length}`);
if (mode === 'probe' || !agentOk) {
  console.log(`worktree kept at ${work}; nothing pushed`);
  process.exit(agentOk ? 0 : 1);
}

// 4. The runner writes provenance and pushes the handoff branch as the person.
mkdirSync(join(work, '.adp'), { recursive: true });
writeFileSync(join(work, '.adp/provenance.json'), JSON.stringify({ ...agent, mode, epic, revision: out.revision, milestone: out.milestone, start: startSha, where: 'laptop', actor }, null, 2));
sh('git', ['add', '-A'], { cwd: work });
sh('git', ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', `handoff: ${mode} ${epic} (${agent.model})`], { cwd: work });
const handoff = `handoff/${out.branch}`;
sh('git', ['push', '--quiet', '--force', 'origin', `HEAD:refs/heads/${handoff}`], { cwd: work });
console.log(`\npushed ${handoff}. Publish it as the builder App:\n  gh workflow run publish -f handoff=${handoff}`);
if (existsSync(work)) sh('git', ['worktree', 'remove', '--force', pinned]);
