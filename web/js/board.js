// Reusable 9x9 board renderer (play, drills, review mini boards) + number pad + grid helpers.
import { tr } from "./i18n.js";
import { hintPrefs } from "./appearance.js";

export const ROW = i => Math.floor(i / 9);
export const COL = i => i % 9;
export const BOX = i => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const out = [];
  for (let j = 0; j < 81; j++)
    if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) out.push(j);
  return out;
});
/** Cells of unit u: 0-8 rows, 9-17 columns, 18-26 boxes. */
export function unitCells(u) {
  const out = [];
  for (let i = 0; i < 81; i++)
    if ((u < 9 && ROW(i) === u) || (u >= 9 && u < 18 && COL(i) === u - 9) || (u >= 18 && BOX(i) === u - 18)) out.push(i);
  return out;
}
export const cellName = i => `r${ROW(i) + 1}c${COL(i) + 1}`;
/** The cell an arrow key moves to from i (wrapping round the edges). */
export const stepCell = (i, key) => {
  const r = ROW(i), k = COL(i);
  return { ArrowUp: ((r + 8) % 9) * 9 + k, ArrowDown: ((r + 1) % 9) * 9 + k,
           ArrowLeft: r * 9 + (k + 8) % 9, ArrowRight: r * 9 + (k + 1) % 9 }[key];
};
export const toDigits = s => [...s].map(Number);

/** Candidates from placed digits only: 81 arrays (empty for filled cells). */
export function computeCandidates(values) {
  return values.map((v, i) => {
    if (v) return [];
    const used = new Set(PEERS[i].map(p => values[p]));
    return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(d => !used.has(d));
  });
}

/** Grid from pasted text: 81 digits / '.' / '0'; ASCII art with | - + is fine. null if not 81 cells. */
export function parseGrid(text) {
  const chars = String(text).replace(/[^0-9.]/g, "").replace(/\./g, "0");
  return chars.length === 81 ? chars : null;
}

/**
 * createBoard(el, {onCell, onCandidate, interactive})
 * render(view): view = {
 *   values: number[81], given: boolean[81], sel?: number, highlight?: boolean (peers + same digit),
 *   notes?: (i) => number[] | null  — small digits in empty cells,
 *   notesBig?: boolean, pickable?: boolean (candidates clickable → onCandidate(i, v)),
 *   cellClass?: (i) => string[], candClass?: (i, v) => string, ghost?: Map<cell, digit>, locked?: boolean,
 *   digit?: number — highlight this digit everywhere (cells and notes); default: the selected cell's value }
 * Row (1-9, left) and column (1-9, top) numbers frame the grid, matching cellName's r#c#.
 * Each kind of highlight (peers, same digit in cells / notes, row and column number) can be off in «Вид» (hintPrefs).
 */
export function createBoard(el, { onCell, onCandidate, interactive = true } = {}) {
  el.textContent = "";
  const frame = document.createElement("div");
  frame.className = "board-frame";
  const labels = cls => {
    const box = document.createElement("div");
    box.className = cls;
    box.setAttribute("aria-hidden", "true");
    for (let n = 1; n <= 9; n++) box.appendChild(Object.assign(document.createElement("span"), { textContent: n }));
    frame.appendChild(box);
    return [...box.children];
  };
  frame.appendChild(Object.assign(document.createElement("div"), { className: "corner" }));
  const colLabels = labels("col-nums"), rowLabels = labels("row-nums");
  const grid = document.createElement("div");
  grid.className = "grid" + (interactive ? "" : " static");
  grid.setAttribute("role", "grid");
  const cells = [];
  for (let i = 0; i < 81; i++) {
    const c = document.createElement("div"), r = ROW(i), k = COL(i);
    c.dataset.cell = i;
    c.setAttribute("role", "gridcell");
    c.setAttribute("aria-label", cellName(i));
    c.addEventListener("click", e => {
      const span = e.target.closest("span[data-v]");
      if (span && onCandidate && span.classList.contains("pick")) { onCandidate(i, +span.dataset.v); return; }
      onCell?.(i);
    });
    cells.push({ el: c, base: "cell" + (k % 3 === 2 && k < 8 ? " br" : "") + (r % 3 === 2 && r < 8 ? " bb" : "")
      + (k === 8 ? " c8" : "") + (r === 8 ? " r8" : "") });
    grid.appendChild(c);
  }
  frame.appendChild(grid);
  el.appendChild(frame);

  function render(view) {
    const { values, given, sel = -1, highlight = false } = view;
    const selVal = view.digit || (sel >= 0 && values[sel]) || 0, hl = hintPrefs();
    const sameCell = highlight && hl.same && selVal, sameNote = highlight && hl.notes && selVal;
    rowLabels.forEach((s, n) => s.classList.toggle("on", hl.labels && sel >= 0 && ROW(sel) === n));
    colLabels.forEach((s, n) => s.classList.toggle("on", hl.labels && sel >= 0 && COL(sel) === n));
    const peers = new Set(sel >= 0 && highlight && hl.peers ? PEERS[sel] : []);
    grid.classList.toggle("locked", !!view.locked);
    for (let i = 0; i < 81; i++) {
      const c = cells[i].el, cls = [cells[i].base];
      if (given[i]) cls.push("given");
      if (peers.has(i)) cls.push("peer");
      if (sameCell && values[i] === selVal) cls.push("same");
      if (i === sel) cls.push("sel");
      if (view.cellClass) cls.push(...view.cellClass(i));
      const ghost = view.ghost?.get(i);
      if (ghost && !values[i]) cls.push("ghost");
      c.className = cls.join(" ");
      c.textContent = "";
      if (values[i]) { c.textContent = values[i]; continue; }
      if (ghost) { c.textContent = ghost; continue; }
      const ns = view.notes?.(i);
      if (!ns || !ns.length) continue;
      const box = document.createElement("div");
      box.className = "notes" + (view.notesBig ? " big" : "");
      for (let v = 1; v <= 9; v++) {
        const s = document.createElement("span");
        if (ns.includes(v)) {
          s.textContent = v;
          s.dataset.v = v;
          const extra = view.candClass?.(i, v);
          s.className = [view.pickable ? "pick" : "", sameNote && v === selVal ? "hl" : "", extra || ""].join(" ").trim();
        }
        box.appendChild(s);
      }
      c.appendChild(box);
    }
  }
  return { el: grid, render, cell: i => cells[i].el };
}

/** Number pad 1-9 (+ erase). update(values) refreshes the remaining counts. */
export function createPad(el, { onDigit, onErase }) {
  el.textContent = "";
  el.className = "pad";
  const buttons = [];
  for (let v = 1; v <= 9; v++) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.digit = v;
    b.setAttribute("aria-label", tr("цифра {v}", { v }));
    b.addEventListener("click", () => onDigit(v));
    buttons.push(b);
    el.appendChild(b);
  }
  if (onErase) {
    const er = document.createElement("button");
    er.type = "button"; er.textContent = "⌫"; er.setAttribute("aria-label", tr("стереть"));
    er.addEventListener("click", onErase);
    el.appendChild(er);
  }
  return {
    update(values) {
      buttons.forEach((b, k) => {
        const left = values ? 9 - values.filter(x => x === k + 1).length : null;
        b.innerHTML = `${k + 1}${left === null ? "" : `<small>${left}</small>`}`;
        b.classList.toggle("empty", left !== null && left <= 0);
      });
    },
  };
}

export function fmtTime(ms, tenths = true) {
  if (ms === null || ms === undefined) return "—";
  const unit = tenths ? 100 : 1000, per = 60000 / unit;
  const tot = Math.floor(Math.max(0, ms) / unit), m = Math.floor(tot / per), s = (tot % per) / (1000 / unit);
  return `${m}:${s < 10 ? "0" : ""}${tenths ? s.toFixed(1) : s}`;
}
