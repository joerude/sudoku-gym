// #/theory — cards: the technique in one line, its first diagram, its drills with progress.
// #/theory/{slug} — the article with its diagrams, then a worked example from the drill bank, step by step.
import { tr } from "./i18n.js";
import { drillTechniques, getTheory, getTheoryExample, getTheoryPage } from "./api.js";
import { createBoard, toDigits } from "./board.js";
import { diagramBoard, hydrateDiagrams, parseDiagram } from "./diagram.js";
import { ladderView } from "./ladder.js";
import { renderMarkdown } from "./md.js";
import { errorBox, h } from "./ui.js";
import { icon } from "./icons.js";

const LEVEL_TITLE = { 1: tr("Уровень 1 — основа"), 2: tr("Уровень 2 — пересечения и заметки"), 3: tr("Уровень 3 — пары и крылья") };
const UNLOCK = 15;  // drills.UNLOCK_MIN_CORRECT
// a page with several drills names each one: hidden single — in a box, a row, a column
const SHORT = {
  hidden_single_box: tr("в блоке"), hidden_single_row: tr("в строке"), hidden_single_col: tr("в столбце"),
  pointing: tr("указывающая пара"), claiming: tr("захват"),
};
const bits = m => { const out = []; for (let v = 1; v <= 9; v++) if (m & (1 << v)) out.push(v); return out; };

/** Links to the page's drills: «в строке 3/15», ✓ once mastered, a lock before its tier opens (training still works). */
function drillLinks(drills, techs, { big = false } = {}) {
  const byT = new Map(techs.map(t => [t.technique, t]));
  return h("div", { class: "drill-links" + (big ? " big" : "") }, drills.map((d, k) => {
    const t = byT.get(d), label = drills.length > 1 ? SHORT[d] || t?.title || d : tr("тренировать");
    const prog = !t ? "" : t.mastered ? "✓" : `${Math.min(t.correct, UNLOCK)}/${UNLOCK}`;
    return h("a", { href: `#/drills?technique=${encodeURIComponent(d)}`, class: big && k === 0 ? "primary" : "",
      title: t && !t.unlocked ? tr("Ещё не открыта в адаптивном режиме, но потренировать можно") : tr("Упражнение: {title}", { title: t?.title || d }) },
      t && !t.unlocked ? icon("lock") : "", label, prog ? h("small", {}, prog) : null);
  }));
}

export function mountList(el) {
  el.append(h("h1", {}, tr("Теория")));
  const box = h("div", {}, h("p", { class: "hint" }, tr("Загрузка…")));
  el.append(box);
  Promise.all([getTheory(), drillTechniques().catch(() => [])]).then(([items, techs]) => {
    box.textContent = "";
    if (!items.length) { box.append(h("p", { class: "hint" }, tr("Статей пока нет."))); return; }
    box.append(h("p", { class: "hint" }, tr("На схеме — суть техники, внизу карточки — её упражнения и твой прогресс (✓ — освоена).")));
    for (const lv of [...new Set(items.map(i => i.level))].sort()) {
      box.append(h("section", {},
        h("h2", {}, LEVEL_TITLE[lv] || tr("Уровень {n}", { n: lv })),
        h("div", { class: "theory-grid" }, items.filter(i => i.level === lv).sort((a, b) => a.ord - b.ord).map(i => {
          const href = `#/theory/${encodeURIComponent(i.slug)}`, d = i.thumb && parseDiagram(i.thumb);
          return h("article", { class: "theory-card" + (d ? "" : " no-thumb"), "data-slug": i.slug },
            d ? h("a", { href, class: "thumb", "aria-label": i.title, tabindex: "-1" }, diagramBoard(d, { small: true })) : null,
            h("div", {},
              h("h3", {}, h("a", { href }, i.title)),
              i.summary ? h("p", {}, i.summary) : null,
              i.drills.length ? drillLinks(i.drills, techs) : null));
        }))));
    }
  }).catch(e => { box.textContent = ""; box.append(errorBox(e)); });
}

export function mountPage(el, [slug]) {
  const box = h("div", {}, h("p", { class: "hint" }, tr("Загрузка…")));
  el.append(h("p", { class: "hint" }, h("a", { href: "#/theory" }, tr("← вся теория"))), box);
  let disposeExample = () => {};
  Promise.all([getTheoryPage(slug), drillTechniques().catch(() => [])]).then(([p, techs]) => {
    box.textContent = "";
    if (p.drills.length) box.append(h("div", { class: "bar theory-bar" }, drillLinks(p.drills, techs, { big: true }),
      h("span", { class: "hint", style: "margin:0" }, tr("уровень {n}", { n: p.level }))));
    const article = h("article", { class: "md card", html: renderMarkdown(p.body_md) });
    hydrateDiagrams(article);
    box.append(article);
    if (p.drills.length) {
      const ex = exampleSection(slug, p.drills, techs);
      disposeExample = ex.dispose;
      box.append(ex.el);
    }
  }).catch(e => { box.textContent = ""; box.append(errorBox(e)); });
  return () => disposeExample();
}

/** «Пример из упражнений»: a drill position; «Шаг» opens where to look → the pattern → the move. */
function exampleSection(slug, drills, techs) {
  const titles = new Map(techs.map(t => [t.technique, t.title]));
  let technique = drills[0], n = Math.floor(Math.random() * 150), ex = null, step = 0, seq = 0;
  const boardEl = h("div", { class: "example-board" }), board = createBoard(boardEl, { interactive: false });
  const text = h("div", { class: "example-steps", id: "exampleSteps" });
  const prev = h("button", { type: "button", id: "examplePrev", onclick: () => go(step - 1) }, tr("← назад"));
  const next = h("button", { type: "button", class: "primary", id: "exampleNext", onclick: () => go(step + 1) });
  const another = h("button", { type: "button", id: "exampleMore", onclick: () => { n++; load(); } }, tr("Ещё пример"));
  const solve = h("a", { class: "btn", id: "exampleDrill" }, tr("Решать такие →"));
  const tabs = drills.length > 1 ? h("div", { class: "chips" }, drills.map(d => h("button", { type: "button", "data-tech": d,
    onclick: () => { technique = d; load(); } }, SHORT[d] || titles.get(d) || d))) : null;
  const el = h("section", { class: "card example", id: "theoryExample" },
    h("h2", {}, tr("Пример из упражнений")),
    h("p", { class: "hint" }, tr("Позиция из базы упражнений. Сначала найди ход сам, потом открывай шаги.")),
    tabs, h("div", { class: "example-body" }, boardEl, h("div", {}, text, h("div", { class: "bar" }, prev, next, another, solve))));

  // ladder levels 2..4 (1 only names the technique, the page already does): 0 — the bare position
  const steps = () => (ex ? ex.levels.length - 1 : 0);
  function render() {
    if (!ex) return;
    const view = step ? ladderView(ex, step + 1) : null, values = toDigits(ex.board);
    board.render({
      values, given: values.map(Boolean), highlight: true, digit: view?.digit || 0, ghost: view?.ghost,
      cellClass: i => (view ? view.cellClass(i) : []),
      notes: ex.tier > 1 ? i => (values[i] ? null : bits(ex.cands[i])) : null,
      candClass: (i, v) => (view?.elims.get(i)?.includes(v) ? "c-x" : ""),
    });
    text.textContent = "";
    text.append(...ex.levels.slice(1, step + 1).map((l, k) => h("p", { class: "ladder-step" }, h("b", {}, `${k + 1}. `), l.text)));
    if (!step) text.append(h("p", { class: "hint" }, ex.tier > 1 ? tr("Кандидаты расставлены — ищи узор.") : tr("Найди, куда ставится цифра.")));
    prev.disabled = !step;
    next.disabled = step >= steps();
    next.textContent = step >= steps() ? tr("Всё") : tr("Шаг {n}/{max} →", { n: step + 1, max: steps() });
    tabs?.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.tech === technique));
  }
  const go = k => { step = Math.max(0, Math.min(steps(), k)); render(); };
  function load() {
    const my = ++seq;
    solve.href = `#/drills?technique=${encodeURIComponent(technique)}`;
    getTheoryExample(slug, technique, n).then(r => {
      if (my !== seq) return;
      ex = r; n = r.n; step = 0;
      render();
    }).catch(e => { if (my === seq) { text.textContent = ""; text.append(errorBox(e)); } });
  }
  load();
  return { el, dispose: () => { seq++; } };
}
