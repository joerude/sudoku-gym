// One game in progress: grid state, notes, undo, mistakes, move log (seq + t_ms) → buffered queue.
// A pause stops the clock: its time is left out of every t_ms, so it is no «long pause» in the analysis.
import { tr } from "./i18n.js";
import { createMoveQueue, finishGame } from "./api.js";
import { PEERS, stepCell, toDigits } from "./board.js";

/**
 * startGame({puzzle, gameId, mode, limit, onChange, onEnd})
 * onChange() — state changed, re-render; onEnd(status) — 'solved' | 'failed' reached locally.
 */
export function startGame({ puzzle, gameId, mode, limit, onChange, onEnd, onQueueError }) {
  const givens = toDigits(puzzle.givens);
  const S = {
    puzzle, gameId, mode, limit,
    given: givens.map(Boolean), vals: givens.slice(), sol: toDigits(puzzle.solution),
    notes: Array(81).fill(0), sel: givens.indexOf(0), multi: new Set(), notesMode: false, autoNotes: true,
    undo: [], redo: [], showBad: new Set(), mistakes: 0, seq: 0, hints: 0,
    start: performance.now(), end: null, status: "active", msg: null, result: null,
    pausedAt: null, pausedMs: 0, pauses: 0,
  };
  const queue = createMoveQueue(gameId, { onError: onQueueError });
  /** Game time at the wall-clock moment t: time since the start less the pauses (a running one up to t). */
  const clock = t => t - S.start - S.pausedMs - (S.pausedAt === null ? 0 : t - S.pausedAt);
  const elapsed = () => clock(S.end ?? performance.now());
  const locked = () => S.status !== "active" || S.pausedAt !== null;
  /** End a running pause: its length goes into pausedMs. */
  function unpause() {
    if (S.pausedAt === null) return;
    S.pausedMs += performance.now() - S.pausedAt;
    S.pausedAt = null;
  }

  /** Queue one move; t — game time to stamp it with (default: now), so a group action can give all its moves one t_ms. */
  function log(kind, cell, value, t = clock(performance.now())) {
    const m = { seq: ++S.seq, t_ms: Math.round(t), kind };
    if (cell !== undefined) m.cell = cell;
    if (value !== undefined) m.value = value;
    queue.push(m);
  }
  const say = (text, cls = "") => { S.msg = text ? { text, cls } : null; };

  function stop(status) {
    unpause();
    S.end = performance.now();
    S.status = status;
    onEnd?.(status);
  }

  function afterPlace() {
    if (mode === "original" && limit !== null && S.mistakes >= limit) {
      say(tr("Лимит ошибок исчерпан ({n}/{limit})", { n: S.mistakes, limit }), "bad");
      stop("failed");
      return;
    }
    if (S.vals.includes(0)) return;
    if (S.vals.every((v, i) => v === S.sol[i])) { say(tr("Решено ✓"), "ok"); stop("solved"); return; }
    say(mode === "hardcore" ? tr("Сетка заполнена, но где-то ошибка. Ищи — таймер идёт.")
                            : tr("Сетка заполнена, но есть ошибки. Ищи — таймер идёт."), "bad");
  }

  // a new action invalidates what was undone, as in any editor
  function pushUndo(i) { S.undo.push({ i, val: S.vals[i], notes: S.notes.slice() }); S.redo.length = 0; }
  /** One undo step for several cells about to change (the format of clear()). */
  function pushBatch(cells) { S.undo.push({ batch: cells.map(i => ({ i, val: S.vals[i] })), notes: S.notes.slice() }); S.redo.length = 0; }
  /** Put digit v into cell i (notes gone, peers' notes stripped under auto-notes), log it, count a mistake. */
  function placeDigit(i, v, t) {
    S.vals[i] = v; S.notes[i] = 0; S.showBad.delete(i);
    if (S.autoNotes) for (const p of PEERS[i]) S.notes[p] &= ~(1 << v);
    log("place", i, v, t);
    if (v !== S.sol[i]) S.mistakes++;
  }
  /** Wipe the digit and the notes of cell i and log it. */
  function wipe(i, t) {
    S.vals[i] = 0; S.notes[i] = 0; S.showBad.delete(i);
    log("erase", i, undefined, t);
  }
  /** Cells an action works on: the group (2+ cells) or the selected cell, givens left out. */
  const targets = () => (S.multi.size > 1 ? [...S.multi] : [S.sel]).filter(i => i >= 0 && !S.given[i]);

  /** A digit or a note into every cell of the group: one undo step, one logged move per changed cell.
   * A digit goes into the empty cells only; the same digit in every cell again clears them. A note goes to all
   * empty cells if any lacks it, else it comes off all of them. */
  function groupInput(v, asNote) {
    if (locked()) return;
    const cells = targets(), empty = cells.filter(i => !S.vals[i]), t = clock(performance.now());
    if (asNote) {
      const add = empty.some(i => !(S.notes[i] & (1 << v)));
      const change = empty.filter(i => !!(S.notes[i] & (1 << v)) !== add);
      if (!change.length) return;
      pushBatch(change);
      for (const i of change) { S.notes[i] ^= 1 << v; log("note", i, v, t); }
    } else if (empty.length) {
      pushBatch(empty);
      for (const i of empty) placeDigit(i, v, t);
      say(null);
      afterPlace();
    } else if (cells.length && cells.every(i => S.vals[i] === v)) {
      return groupErase();
    } else return;
    onChange();
  }

  /** ⌫ on a group: every cell with a digit or notes is wiped, one undo step. */
  function groupErase() {
    if (locked()) return;
    const cells = targets().filter(i => S.vals[i] || S.notes[i]);
    if (!cells.length) return;
    pushBatch(cells);
    const t = clock(performance.now());
    for (const i of cells) wipe(i, t);
    say(null);
    onChange();
  }
  /** The current state of the cells an undo/redo entry touches — what the opposite stack needs to come back. */
  const snapshot = e => ({ batch: (e.batch || [e]).map(({ i }) => ({ i, val: S.vals[i] })), notes: S.notes.slice() });
  /** Put the cells and notes of an entry back; logged as «undo» (a restore, not a new placement or mistake). */
  function restore(e) {
    for (const { i, val } of e.batch || [e]) {
      S.vals[i] = val; S.sel = i; S.showBad.delete(i);
      log("undo", i, val);
    }
    S.multi.clear();
    S.notes = e.notes;
    afterPlace();
    onChange();
  }

  const api = {
    S, elapsed, queue,
    select(i) { S.sel = i; S.multi.clear(); onChange(); },
    move(key) {
      S.sel = stepCell(S.sel < 0 ? 0 : S.sel, key);
      S.multi.clear();
      onChange();
    },
    /** Shift+click: the cell joins the group, or leaves it if it is in already (one cell left = no group). */
    extend(i) {
      if (S.multi.size < 2) { S.multi.clear(); if (S.sel >= 0) S.multi.add(S.sel); }
      if (S.multi.has(i) && S.multi.size > 1) {
        S.multi.delete(i);
        if (S.sel === i) S.sel = [...S.multi].at(-1);
        if (S.multi.size < 2) S.multi.clear();
      } else { S.multi.add(i); S.sel = i; }
      onChange();
    },
    /** Shift+arrow: one step on, and the new cell joins the group. */
    extendMove(key) {
      if (S.sel < 0) return this.move(key);
      if (S.multi.size < 2) { S.multi.clear(); S.multi.add(S.sel); }
      S.sel = stepCell(S.sel, key);
      S.multi.add(S.sel);
      onChange();
    },
    /** Drop the group (the selected cell stays); false if there was none. */
    clearMulti() {
      if (S.multi.size < 2) return false;
      S.multi.clear();
      onChange();
      return true;
    },
    toggleNotes() { S.notesMode = !S.notesMode; onChange(); },
    setAutoNotes(on) { S.autoNotes = on; },
    input(v, asNote) {
      if (S.multi.size > 1) return groupInput(v, asNote);
      const i = S.sel;
      if (i < 0 || S.given[i] || locked()) return;
      if (asNote) {
        if (S.vals[i]) return;
        pushUndo(i);
        S.notes[i] ^= 1 << v;
        log("note", i, v);
      } else {
        if (S.vals[i] === v) return this.erase();  // the same digit again clears the cell
        pushUndo(i);
        placeDigit(i, v);
        say(null);
        afterPlace();
      }
      onChange();
    },
    erase() {
      if (S.multi.size > 1) return groupErase();
      const i = S.sel;
      if (i < 0 || S.given[i] || locked() || (!S.vals[i] && !S.notes[i])) return;
      pushUndo(i);
      wipe(i);
      say(null);
      onChange();
    },
    /** Wipe every entered digit and note; one undo step brings them all back. */
    clear() {
      if (locked()) return;
      const cells = [];
      for (let i = 0; i < 81; i++) if (!S.given[i] && (S.vals[i] || S.notes[i])) cells.push(i);
      if (!cells.length) return;
      pushBatch(cells);
      for (const i of cells) { S.vals[i] = 0; log("erase", i); }
      S.notes = Array(81).fill(0); S.showBad.clear();
      say(null);
      onChange();
    },
    undoLast() {
      if (locked()) return;
      const u = S.undo.pop();
      if (!u) return;
      S.redo.push(snapshot(u));
      restore(u);
    },
    /** Bring back what the last undo took away (until a new action clears it). */
    redoLast() {
      if (locked()) return;
      const r = S.redo.pop();
      if (!r) return;
      S.undo.push(snapshot(r));
      restore(r);
    },
    check() {
      if (locked()) return;
      log("check");
      S.showBad.clear();
      S.vals.forEach((v, i) => { if (v && !S.given[i] && v !== S.sol[i]) S.showBad.add(i); });
      const n = S.showBad.size;
      say(n ? tr("Неверных клеток: {n} (подсвечены)", { n }) : tr("Ошибок нет"), n ? "bad" : "ok");
      onChange();
    },
    /** Stop the clock; nothing can be entered until resume(). */
    pause() {
      if (locked()) return;
      S.pausedAt = performance.now(); S.pauses++;
      onChange();
    },
    resume() {
      if (S.pausedAt === null || S.status !== "active") return;
      unpause();
      onChange();
    },
    isWrong(i) { return !!S.vals[i] && !S.given[i] && S.vals[i] !== S.sol[i]; },
    /** Stop the clock (if still running), send every move, then POST finish. Resolves to the server result. */
    async finish(status) {
      if (S.status === "active") { unpause(); S.end = performance.now(); S.status = status; }
      queue.close();
      await queue.flush();
      S.result = await finishGame(gameId, S.status, elapsed(), S.pauses);
      S.status = S.result.status;
      return S.result;
    },
  };
  return api;
}
