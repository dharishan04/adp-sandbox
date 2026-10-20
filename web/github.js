// Reads GitHub's REST API from the browser, unauthenticated (public repo; no
// sign-in, Q30). Unauthenticated calls are limited to 60 an hour per IP, so:
// every response is kept in memory and in localStorage with its ETag and
// revalidated with If-None-Match after a short TTL; and if GitHub refuses for the
// rate limit, a local snapshot answers instead, labelled as such on the page.
import { REPO } from './config.js';

const API = 'https://api.github.com';
const TTL_MS = 10 * 60 * 1000;
const mem = new Map();
export const stats = { live: 0, notModified: 0, cached: 0, snapshot: 0, remaining: null, limit: null, reset: null, errors: [] };
const listeners = new Set();
export const onStats = fn => listeners.add(fn);
const emit = () => listeners.forEach(fn => fn(stats));

const key = path => `adp:gh:${path}`;
const load = path => {
  try {
    return JSON.parse(localStorage.getItem(key(path)) ?? 'null');
  } catch {
    return null;
  }
};
const save = (path, entry) => {
  try {
    localStorage.setItem(key(path), JSON.stringify(entry));
  } catch {
    // Storage full or blocked: memory still holds it.
  }
};

const snapshotName = path => path.replace(/^\//, '').replace(/[^A-Za-z0-9._-]+/g, '_') + '.json';
async function fromSnapshot(path) {
  const res = await fetch(`./snapshot/${snapshotName(path)}`);
  if (!res.ok) throw new Error(`no snapshot for ${path}`);
  stats.snapshot++;
  return res.json();
}

/** The rules package's Get: one REST path → JSON. */
export async function get(path) {
  if (mem.has(path)) return mem.get(path);
  const p = (async () => {
    const cached = load(path);
    if (cached && Date.now() - cached.at < TTL_MS) {
      stats.cached++;
      emit();
      return cached.body;
    }
    if (new URLSearchParams(location.search).get('source') === 'snapshot') return fromSnapshot(path);
    let res;
    try {
      res = await fetch(API + path, {
        headers: { accept: 'application/vnd.github+json', ...(cached?.etag ? { 'if-none-match': cached.etag } : {}) },
      });
    } catch (e) {
      stats.errors.push(`${path}: ${e.message}`);
      emit();
      if (cached) return cached.body;
      return fromSnapshot(path);
    }
    stats.remaining = res.headers.get('x-ratelimit-remaining');
    stats.limit = res.headers.get('x-ratelimit-limit');
    stats.reset = res.headers.get('x-ratelimit-reset');
    if (res.status === 304 && cached) {
      stats.notModified++;
      save(path, { ...cached, at: Date.now() });
      emit();
      return cached.body;
    }
    if ((res.status === 403 || res.status === 429) && stats.remaining === '0') {
      stats.errors.push(`rate limited at ${path}`);
      emit();
      return cached ? cached.body : fromSnapshot(path);
    }
    if (!res.ok) {
      const err = new Error(`GET ${path}: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const body = await res.json();
    stats.live++;
    save(path, { at: Date.now(), etag: res.headers.get('etag'), body });
    emit();
    return body;
  })();
  mem.set(path, p);
  p.catch(() => mem.delete(path));
  return p;
}

export const repoPath = rest => `/repos/${REPO}${rest}`;
export const html = rest => `https://github.com/${REPO}${rest}`;
