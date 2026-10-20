// Shared by the lanes: who leads a PR's spec, and the plugin pinned from the marketplace.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as R from '../plugin/rules/src/index.ts';
import { readText } from '../gates/gh.ts';
import { specIdFromDraft } from '../gates/pr.ts';

export async function specForPull(pull: R.Pull): Promise<R.Spec | undefined> {
  const draft = specIdFromDraft(pull.head.ref);
  const cite = R.parseCite(pull.body);
  const id = draft?.id ?? cite?.id;
  if (!id) return undefined;
  const ref = draft ? pull.head.sha : R.tagName(id, cite!.rev);
  const text = await readText(R.specPath(id), ref);
  return text ? R.parseSpec(text).spec : undefined;
}

/** Resolves the delivery plugin through the marketplace file of a pinned checkout. */
export function pinnedPlugin(marketplaceRoot: string): { path: string; version: string } {
  const market = JSON.parse(readFileSync(join(marketplaceRoot, '.claude-plugin/marketplace.json'), 'utf8'));
  const entry = market.plugins.find((p: { name: string }) => p.name === 'delivery');
  if (!entry) throw new Error('delivery plugin not in the pinned marketplace');
  const path = join(marketplaceRoot, entry.source);
  const manifest = JSON.parse(readFileSync(join(path, '.claude-plugin/plugin.json'), 'utf8'));
  return { path, version: `delivery@${manifest.version}` };
}

/** The only environment an agent process gets: no GitHub token, ever. */
export function agentEnv(extra: Record<string, string> = {}): Record<string, string> {
  if (process.env.ADP_LOCAL) {
    // On a laptop the agent signs in with the person's Claude Code login, so it
    // keeps the user environment, minus anything that could reach GitHub.
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(GH_|GITHUB_|ANTHROPIC_API_KEY$)|TOKEN/.test(k)) env[k] = v;
    return { ...env, ...extra };
  }
  const keep = ['PATH', 'HOME', 'ANTHROPIC_API_KEY', 'RUNNER_TEMP', 'LANG'];
  const env: Record<string, string> = { CI: 'true', ...extra };
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]!;
  return env;
}
