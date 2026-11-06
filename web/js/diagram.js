// Board diagrams of the theory pages: a ```sudoku block of the markdown, drawn by the trainer's own board.
// The block: 9 grid rows (digits, . for empty; | and ---- lines are only for the eye), then «key: value» lines:
//   unit: r4 c5 b3        groups to tint            pat: r1c4 r2c9        pattern cells (blue)
//   x: r4c2 r4c4          cells the digit can't go   ans: r4c7=5          the move (green)
//   cand: r2c1=12         candidates of a cell       elim: r5c3=4         a struck-out candidate (red)
//   arrow: r1c4>r4c4      «this digit sees that cell»  caption: text      a line under the board
// tests/test_theory.py parses the same format and checks every diagram of theory/ and theory/en/.
import { createBoard } from "./board.js";
import { h } from "./ui.js";

const CELL = /^r([1-9])c([1-9])$/;
const cellOf = ref => { const m = CELL.exec(ref); return m ? (m[1] - 1) * 9 + (m[2] - 1) : null; };

function unitCells(ref) {
  const m = /^([rcb])([1-9])$/.exec(ref);
  if (!m) return [];
  const n = +m[2] - 1, all = [...Array(81).keys()];
  if (m[1] === "r") return all.filter(i => Math.floor(i / 9) === n);
  if (m[1] === "c") return all.filter(i => i % 9 === n);
  return all.filter(i => Math.floor(i / 27) * 3 + Math.floor(i % 9 / 3) === n);
}

/** The block's text → {values, unit, pat, x, ans, cands, elims, links, caption}; null if the grid is not 9×9. */
export function parseDiagram(text) {
  const rows = [], d = { unit: new Set(), pat: new Set(), x: new Set(), ans: new Map(), cands: new Map(), elims: new Map(),
    links: [], caption: "" };
  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    const kv = /^([a-z]+):\s*(.*)$/.exec(line);
    if (kv) {
      const [, key, val] = kv, refs = val.split(/\s+/).filter(Boolean);
      if (key === "caption") d.caption = val;
      else if (key === "unit") refs.forEach(r => unitCells(r).forEach(i => d.unit.add(i)));
      else if (key === "pat" || key === "x") refs.forEach(r => { const i = cellOf(r); if (i !== null) d[key].add(i); });
      else if (key === "arrow") refs.forEach(r => {
        const [a, b] = r.split(">").map(cellOf);
        if (a !== null && b !== null && a !== undefined && b !== undefined) d.links.push({ from: a, to: b });
      });
      else for (const r of refs) {  // ans / cand / elim: r4c7=5
        const [ref, digits = ""] = r.split("="), i = cellOf(ref), ds = [...digits].map(Number).filter(v => v >= 1 && v <= 9);
        if (i === null || !ds.length) continue;
        if (key === "ans") d.ans.set(i, ds[0]);
        else if (key === "cand" || key === "elim") d[key === "cand" ? "cands" : "elims"].set(i, ds);
      }
      continue;
    }
    if (!line || /^[-+\s|]+$/.test(line)) continue;
    const cells = line.replace(/\|/g, " ").split(/\s+/).filter(Boolean);
    if (cells.length !== 9 || !cells.every(c => /^[1-9.]$/.test(c))) return null;
    rows.push(...cells.map(c => (c === "." ? 0 : +c)));
  }
  if (rows.length !== 81) return null;
  return { values: rows, ...d };
}

/** A static board for a parsed diagram; small — no row/column numbers (a thumbnail). */
export function diagramBoard(d, { small = false } = {}) {
  const el = h("div", { class: "diagram-board" + (small ? " small" : "") });
  const board = createBoard(el, { interactive: false });
  board.render({
    values: d.values, given: d.values.map(Boolean),
    ghost: d.ans,
    cellClass: i => [d.unit.has(i) ? "unit" : "", d.pat.has(i) ? "pat" : "", d.x.has(i) ? "closed" : "",
      d.ans.has(i) ? "ans" : ""].filter(Boolean),
    notes: i => {
      const ns = new Set([...(d.cands.get(i) || []), ...(d.elims.get(i) || [])]);
      return ns.size ? [...ns].sort() : null;
    },
    candClass: (i, v) => (d.elims.get(i)?.includes(v) ? "c-x" : ""),
    links: d.links,
  });
  return el;
}

/** Turn every <figure class="diagram" data-spec> that md.js left in `root` into a board with its caption. */
export function hydrateDiagrams(root) {
  for (const fig of root.querySelectorAll("figure.diagram[data-spec]")) {
    const spec = fig.dataset.spec, d = parseDiagram(spec);
    fig.removeAttribute("data-spec");
    if (!d) { fig.append(h("pre", {}, spec)); continue; }
    fig.append(diagramBoard(d));
    if (d.caption) fig.append(h("figcaption", {}, d.caption));
  }
}
