// JSON API client and the buffered move queue.
import { lang, tr } from "./i18n.js";

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { "X-Lang": lang, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(tr("нет связи с сервером"), 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) throw new ApiError(data?.error || tr("ошибка сервера ({status})", { status: res.status }), res.status);
  return data;
}

const qs = params => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const getOptions = () => call("GET", "/api/puzzle/options");
export const getPuzzle = (level, grade) => call("GET", `/api/puzzle${qs({ level, grade })}`);
export const addPuzzle = (givens, level) => call("POST", "/api/puzzles", { givens, level });
export const createGame = (puzzleId, mode, limit) =>
  call("POST", "/api/games", mode === "original" ? { puzzle_id: puzzleId, mode, mistake_limit: limit }
                                                 : { puzzle_id: puzzleId, mode });
export const listGames = (limit = 20) => call("GET", `/api/games${qs({ limit })}`);
export const getGame = id => call("GET", `/api/games/${id}`);
export const finishGame = (id, status, tMs) => call("POST", `/api/games/${id}/finish`, { status, t_ms: Math.round(tMs) });
export const getReview = id => call("GET", `/api/games/${id}/review`);
export const getStats = () => call("GET", "/api/stats");
export const getRecords = () => call("GET", "/api/records");
export const drillTechniques = () => call("GET", "/api/drills/techniques");
export const nextDrill = technique => call("GET", `/api/drills/next${qs({ technique })}`);
export const sendAttempt = (id, timeMs, cell, value, hint = 0) =>
  call("POST", `/api/drills/${id}/attempt`, { time_ms: Math.round(timeMs), cell, value, hint });
export const drillHint = id => call("GET", `/api/drills/${id}/hint`);
export const revealDrill = (id, timeMs) => call("POST", `/api/drills/${id}/reveal`, { time_ms: Math.round(timeMs) });
export const getFavorites = () => call("GET", "/api/favorites");
export const setFavorite = (kind, id, on) => call(on ? "PUT" : "DELETE", `/api/favorites/${kind}/${id}`);
export const getFavoritePuzzle = () => call("GET", "/api/puzzle?favorite=1");
export const exportFavorites = () => call("GET", "/api/favorites/export");
export const importFavorites = favorites => call("POST", "/api/favorites/import", favorites);
export const getTheory = () => call("GET", "/api/theory");
export const getTheoryPage = slug => call("GET", `/api/theory/${encodeURIComponent(slug)}`);

/** Buffered, ordered, retrying move sender for one game.
 *  push() is synchronous; moves go out in batches every `interval` ms. A failed batch stays at the
 *  head of the buffer and is resent (the server upserts by seq, so a resend is harmless). */
export function createMoveQueue(gameId, { interval = 1000, onError } = {}) {
  const buf = [];
  let inflight = null, timer = null, closed = false, delay = interval;

  async function sendOnce() {
    if (!buf.length) return true;
    const batch = buf.slice();
    try {
      const res = await call("POST", `/api/games/${gameId}/moves`, { moves: batch });
      buf.splice(0, batch.length);
      delay = interval;
      return res;
    } catch (e) {
      if (e.status >= 400 && e.status < 500) { // rejected batch: will never succeed; drop it, but tell
        buf.splice(0, batch.length);
        onError?.(e);
        return false;
      }
      delay = Math.min(delay * 2, 10000);
      onError?.(e);
      return false;
    }
  }

  function flushOnce() {
    if (!inflight) inflight = sendOnce().finally(() => { inflight = null; });
    return inflight;
  }

  function schedule() {
    if (closed) return;
    timer = setTimeout(async () => { await flushOnce(); schedule(); }, delay);
  }
  schedule();

  return {
    push(move) { buf.push(move); },
    pending: () => buf.length,
    /** Resolves once everything pushed so far is stored (retries up to `tries` times). */
    async flush(tries = 8) {
      for (let k = 0; k < tries; k++) {
        if (inflight) await inflight;
        if (!buf.length) return true;
        await flushOnce();
        if (!buf.length) return true;
        await new Promise(r => setTimeout(r, Math.min(300 * 2 ** k, 4000)));
      }
      return !buf.length;
    },
    close() { closed = true; clearTimeout(timer); },
  };
}
