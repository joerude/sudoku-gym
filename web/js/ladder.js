// The hint ladder of hints.py (next_ladder): its opened levels as text, and the board highlight of the deepest one.
import { tr } from "./i18n.js";
import { unitCells } from "./board.js";
import { h } from "./ui.js";

/** Paragraphs for levels 1..n, then a theory link once the technique is named. */
export function ladderText(lad, n) {
  const steps = lad.levels.slice(0, n).map((l, k) =>
    h("p", { class: "ladder-step", "data-level": k + 1 }, h("b", {}, `${k + 1}. `), l.text));
  return [...steps, lad.theory && n > 0 ? h("a", { class: "hint", href: `#/theory/${lad.theory}` }, tr("Как это работает?")) : null];
}

/** Highlight of the deepest opened level: group (unit), pattern cells (pat; red for a board error), the move (ans + ghost
 *  digit), the digit everywhere, struck candidates. null when nothing is open. */
export function ladderView(lad, n) {
  const l = lad && n > 0 ? lad.levels[Math.min(n, lad.levels.length) - 1] : null;
  if (!l) return null;
  const unit = new Set(l.unit === null || l.unit === undefined ? [] : unitCells(l.unit)), cells = new Set(l.cells);
  const elims = new Map();
  for (const [c, v] of l.elims) elims.set(c, [...(elims.get(c) || []), v]);
  const mark = lad.kind === "error" ? "bad" : "pat", at = l.place ? l.place[0] : -1;
  return {
    cellClass: i => [unit.has(i) ? "unit" : "", cells.has(i) ? mark : "", i === at ? "ans" : ""].filter(Boolean),
    digit: l.digit || 0,
    ghost: new Map(l.place ? [[l.place[0], l.place[1]]] : []),
    elims,
  };
}
