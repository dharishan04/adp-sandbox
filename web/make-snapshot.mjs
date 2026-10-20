// Records the API responses the view reads into web/snapshot/, through the
// person's gh login (run locally). The page uses them only when unauthenticated
// GitHub refuses for the rate limit, or with ?source=snapshot; it says so.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const REPO = 'dharishan04/adp-sandbox';
const name = path => path.replace(/^\//, '').replace(/[^A-Za-z0-9._-]+/g, '_') + '.json';
const gh = path => execFileSync('gh', ['api', '-H', 'Accept: application/vnd.github+json', path.replace(/^\//, '')], { encoding: 'utf8', maxBuffer: 64 << 20 });
const out = new URL('./snapshot/', import.meta.url);
mkdirSync(out, { recursive: true });
const save = path => {
  // Personal emails are not needed by any page: scrub them.
  const body = gh(path).replace(/"email":\s*"[^"]*"/g, '"email":"redacted@example.invalid"');
  writeFileSync(new URL(name(path), out), body);
  return JSON.parse(body);
};
const r = `/repos/${REPO}`;
save(`${r}/issues/1`);
save(`${r}/issues/1/sub_issues`);
save(`${r}/git/matching-refs/tags/spec/1/`);
const pulls = save(`${r}/pulls?state=all&per_page=100`);
for (const rev of [1, 2]) save(`${r}/contents/specs/1.md?ref=${encodeURIComponent(`spec/1/r${rev}`)}`);
for (const p of pulls) {
  save(`${r}/pulls/${p.number}`);
  save(`${r}/pulls/${p.number}/reviews?per_page=100`);
  save(`${r}/issues/${p.number}/comments?per_page=100`);
  save(`${r}/commits/${p.head.sha}/check-runs?per_page=100`);
  save(`${r}/actions/runs?head_sha=${p.head.sha}&per_page=50`);
}
console.log(`saved ${3 + 1 + 2 + pulls.length * 5} responses`);
