// Live data layer: read-only GETs against https://make.fun/api, nothing else.
// Every response is cached in memory and (when small) in localStorage, revalidated
// with the ETag the API hands out, and concurrent callers share one in-flight
// request, so a view costs one network round-trip at most and a revisit costs none.

const API = 'https://make.fun/api';
const MEM_TTL = 60 * 1000; // fresh for a minute; the API rebuilds about that often
const STORE_TTL = 60 * 1000;
const STORE_MAX = 180 * 1024; // never persist a leaderboard-sized body

const mem = new Map(); // path -> { data, etag, at }
const inflight = new Map(); // path -> Promise

function storeKey(path) {
  return 'mf:' + path;
}

function readStore(path) {
  try {
    const raw = localStorage.getItem(storeKey(path));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (Date.now() - saved.at > STORE_TTL) return null;
    return saved;
  } catch {
    return null;
  }
}

function writeStore(path, entry) {
  try {
    const raw = JSON.stringify(entry);
    if (raw.length <= STORE_MAX) localStorage.setItem(storeKey(path), raw);
  } catch {
    // storage full or unavailable: memory cache still serves
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// One GET with ETag revalidation and one retry after a board_pending (503).
async function fetchOnce(path, etag) {
  const headers = { Accept: 'application/json' };
  if (etag) headers['If-None-Match'] = etag;
  const res = await fetch(API + path, { headers });
  if (res.status === 304) return { notModified: true };
  if (res.status === 503) {
    const wait = Math.min(8000, (Number(res.headers.get('Retry-After')) || 3) * 1000);
    await sleep(wait);
    const retry = await fetch(API + path, { headers });
    if (retry.status === 304) return { notModified: true };
    if (!retry.ok) throw new Error(`make.fun ${retry.status} on ${path}`);
    return { data: await retry.json(), etag: retry.headers.get('ETag') };
  }
  if (res.status === 404) throw Object.assign(new Error(`not found: ${path}`), { status: 404 });
  if (!res.ok) throw new Error(`make.fun ${res.status} on ${path}`);
  return { data: await res.json(), etag: res.headers.get('ETag') };
}

async function get(path) {
  const hit = mem.get(path);
  if (hit && Date.now() - hit.at < MEM_TTL) return hit.data;
  const shared = inflight.get(path);
  if (shared) return shared;
  const job = (async () => {
    const etag = hit?.etag ?? readStore(path)?.etag ?? null;
    const out = await fetchOnce(path, etag);
    if (out.notModified) {
      const cached = hit ?? readStore(path);
      if (cached?.data) {
        cached.at = Date.now();
        mem.set(path, cached);
        return cached.data;
      }
    }
    const entry = { data: out.data, etag: out.etag ?? null, at: Date.now() };
    mem.set(path, entry);
    writeStore(path, entry);
    return entry.data;
  })();
  inflight.set(path, job);
  try {
    return await job;
  } finally {
    inflight.delete(path);
  }
}

// The board: every competition the caller may see. activity=times keeps the
// per-listing activity rows small; the board only reads their timestamps.
export function getBoard() {
  return get('/competitions?status=open&activity=times');
}

// One bounty. submissions=summary drops the full entry list the page never shows.
export function getBounty(slug) {
  return get(`/competitions/${encodeURIComponent(slug)}?submissions=summary`);
}

// A bounty's leaderboard. rows=first returns the first 10 rows whole and every
// row past them slim (rank, handle, title, rank-key value), so a 13,000-row
// board costs ~3 MB once and the page paginates it locally instead of refetching.
export function getLeaderboard(slug, view) {
  const query = view ? `?rows=first&view=${encodeURIComponent(view)}` : '?rows=first';
  return get(`/competitions/${encodeURIComponent(slug)}/leaderboard${query}`);
}

// An account's public profile: links, record and solutions.
export function getProfile(handle) {
  return get(`/profiles/${encodeURIComponent(handle)}`);
}

// One account's standing in the site rankings; null when it holds no rank.
export async function getRanking(handle) {
  try {
    return await get(`/rankings/${encodeURIComponent(handle)}`);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

// Warm the board in the background so the first paint is usually a cache hit.
export function warmBoard() {
  getBoard().catch(() => {});
}
