// One game in progress: grid state, notes, undo, mistakes, move log (seq + t_ms) → buffered queue.
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
    notes: Array(81).fill(0), sel: givens.indexOf(0), notesMode: false, autoNotes: true,
    undo: [], redo: [], showBad: new Set(), mistakes: 0, seq: 0,
    start: performance.now(), end: null, status: "active", msg: null, result: null,
  };
  const queue = createMoveQueue(gameId, { onError: onQueueError });
  const elapsed = () => (S.end ?? performance.now()) - S.start;
  const locked = () => S.status !== "active";

  function log(kind, cell, value) {
    const m = { seq: ++S.seq, t_ms: Math.round(performance.now() - S.start), kind };
    if (cell !== undefined) m.cell = cell;
    if (value !== undefined) m.value = value;
    queue.push(m);
  }
  const say = (text, cls = "") => { S.msg = text ? { text, cls } : null; };

  function stop(status) {
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
  /** The current state of the cells an undo/redo entry touches — what the opposite stack needs to come back. */
  const snapshot = e => ({ batch: (e.batch || [e]).map(({ i }) => ({ i, val: S.vals[i] })), notes: S.notes.slice() });
  /** Put the cells and notes of an entry back; logged as «undo» (a restore, not a new placement or mistake). */
  function restore(e) {
    for (const { i, val } of e.batch || [e]) {
      S.vals[i] = val; S.sel = i; S.showBad.delete(i);
      log("undo", i, val);
    }
    S.notes = e.notes;
    afterPlace();
    onChange();
  }

  const api = {
    S, elapsed, queue,
    select(i) { S.sel = i; onChange(); },
    move(key) {
      S.sel = stepCell(S.sel < 0 ? 0 : S.sel, key);
      onChange();
    },
    toggleNotes() { S.notesMode = !S.notesMode; onChange(); },
    setAutoNotes(on) { S.autoNotes = on; },
    input(v, asNote) {
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
        S.vals[i] = v; S.notes[i] = 0; S.showBad.delete(i);
        if (S.autoNotes) for (const p of PEERS[i]) S.notes[p] &= ~(1 << v);
        log("place", i, v);
        if (v !== S.sol[i]) S.mistakes++;
        say(null);
        afterPlace();
      }
      onChange();
    },
    erase() {
      const i = S.sel;
      if (i < 0 || S.given[i] || locked() || (!S.vals[i] && !S.notes[i])) return;
      pushUndo(i);
      S.vals[i] = 0; S.notes[i] = 0; S.showBad.delete(i);
      log("erase", i);
      say(null);
      onChange();
    },
    /** Wipe every entered digit and note; one undo step brings them all back. */
    clear() {
      if (locked()) return;
      const cells = [];
      for (let i = 0; i < 81; i++) if (!S.given[i] && (S.vals[i] || S.notes[i])) cells.push({ i, val: S.vals[i] });
      if (!cells.length) return;
      S.undo.push({ batch: cells, notes: S.notes.slice() }); S.redo.length = 0;
      for (const { i } of cells) { S.vals[i] = 0; log("erase", i); }
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
    isWrong(i) { return !!S.vals[i] && !S.given[i] && S.vals[i] !== S.sol[i]; },
    /** Stop the clock (if still running), send every move, then POST finish. Resolves to the server result. */
    async finish(status) {
      if (S.status === "active") { S.end = performance.now(); S.status = status; }
      queue.close();
      await queue.flush();
      S.result = await finishGame(gameId, S.status, S.end - S.start);
      S.status = S.result.status;
      return S.result;
    },
  };
  return api;
}
