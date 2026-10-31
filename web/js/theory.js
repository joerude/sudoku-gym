// #/theory and #/theory/{slug}
import { getTheory, getTheoryPage } from "./api.js";
import { renderMarkdown } from "./md.js";
import { errorBox, h } from "./ui.js";

const LEVEL_TITLE = { 1: "Уровень 1 — основа", 2: "Уровень 2 — пересечения и заметки", 3: "Уровень 3 — пары и крылья" };

export function mountList(el) {
  el.append(h("h1", {}, "Теория"));
  const box = h("div", {}, h("p", { class: "hint" }, "Загрузка…"));
  el.append(box);
  getTheory().then(items => {
    box.textContent = "";
    if (!items.length) { box.append(h("p", { class: "hint" }, "Статей пока нет.")); return; }
    const levels = [...new Set(items.map(i => i.level))].sort();
    for (const lv of levels) {
      box.append(h("section", {},
        h("h2", {}, LEVEL_TITLE[lv] || `Уровень ${lv}`),
        h("ul", { class: "toc" }, items.filter(i => i.level === lv).sort((a, b) => a.ord - b.ord).map(i =>
          h("li", {}, h("a", { href: `#/theory/${encodeURIComponent(i.slug)}` }, i.title),
            i.drill ? h("a", { href: `#/drills?technique=${i.drill}`, class: "hint", style: "margin:0" }, "тренировать →") : null)))));
    }
  }).catch(e => { box.textContent = ""; box.append(errorBox(e)); });
}

export function mountPage(el, [slug]) {
  const box = h("div", {}, h("p", { class: "hint" }, "Загрузка…"));
  el.append(h("p", { class: "hint" }, h("a", { href: "#/theory" }, "← вся теория")), box);
  getTheoryPage(slug).then(p => {
    box.textContent = "";
    if (p.drill) box.append(h("div", { class: "bar" },
      h("a", { class: "btn primary", id: "trainLink", href: `#/drills?technique=${encodeURIComponent(p.drill)}` }, "Тренировать"),
      h("span", { class: "hint", style: "margin:0" }, `уровень ${p.level}`)));
    box.append(h("article", { class: "md card", html: renderMarkdown(p.body_md) }));
  }).catch(e => { box.textContent = ""; box.append(errorBox(e)); });
}
