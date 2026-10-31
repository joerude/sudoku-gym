// #/drills — "find the move" drills: place (cell + digit) and eliminate (click the removed candidate).
import { drillTechniques, nextDrill, sendAttempt } from "./api.js";
import { ROW, COL, cellName, createBoard, createPad, toDigits } from "./board.js";
import { TIER_NAME, errorBox, h, pct, sec } from "./ui.js";

const UNLOCK = 15;  // drills.UNLOCK_MIN_CORRECT
const progress = t => t.mastered ? "✓" : t.unlocked ? `${Math.min(t.correct, UNLOCK)}/${UNLOCK}` : "";

let choice = "adaptive";  // 'adaptive' | 'random' | slug
let showCands = false;     // place drills only; eliminate drills always show candidates
const session = { n: 0, correct: 0, times: [] };

const median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function mount(el, params, query) {
  if (query.technique) choice = query.technique;
  let drill = null, values = [], start = 0, sel = -1, result = null, picked = null, techs = [], loading = false;

  const boardEl = h("div", { id: "drillBoard" }), padEl = h("div");
  const prompt = h("p", { class: "prompt", id: "prompt" }, "Загрузка…");
  const title = h("span", { class: "badge", id: "drillTech" });
  const timer = h("span", { class: "timer", id: "drillTimer" }, "0.0 с");
  const msg = h("div", { class: "msg", id: "drillMsg", role: "status" });
  const strip = h("div", { class: "strip", id: "session" });
  const candBox = h("input", { type: "checkbox", id: "showCands", onchange: e => { showCands = e.target.checked; render(); } });
  const nextBtn = h("button", { type: "button", id: "nextDrill", onclick: () => load() }, "Дальше");
  const theoryLink = h("a", { id: "drillTheory", class: "hint", style: "margin:0" }, "Как это работает?");
  const why = h("div", { class: "why", id: "drillWhy", hidden: true });
  const chips = h("div", { id: "picker" });

  const board = createBoard(boardEl, { onCell: i => onCell(i), onCandidate: (i, v) => answer(i, v) });
  const pad = createPad(padEl, { onDigit: v => onDigit(v) });
  pad.update(null);

  el.append(h("div", { class: "layout" },
    h("div", { class: "main-col" },
      h("div", { class: "bar", style: "margin-bottom:4px" }, title, theoryLink, timer), prompt,
      h("p", { class: "hint", id: "drillHow" }), boardEl, padEl,
      h("div", { class: "bar", style: "margin-top:10px" }, h("label", { class: "check" }, candBox, "Показывать кандидатов"), nextBtn,
        h("span", { class: "hint", style: "margin:0" }, h("kbd", {}, "Enter"), " / ", h("kbd", {}, "Пробел"), " — дальше")),
      msg, why, strip),
    h("section", {}, h("h2", {}, "Техника"), chips)));
  const how = el.querySelector("#drillHow");

  function renderChips() {
    chips.textContent = "";
    const chip = (key, label, t) => h("button", { type: "button", class: choice === key ? "on" : "", "data-tech": key,
      "aria-pressed": choice === key, disabled: t?.n === 0,
      title: t && !t.unlocked ? "Ещё не открыта в адаптивном режиме, но потренировать можно" : null,
      onclick: () => { choice = key; renderChips(); load(); } },
      t && !t.unlocked ? "🔒 " : null, label, t ? h("small", {}, progress(t)) : null);
    chips.append(h("div", { class: "chips" }, chip("adaptive", "Адаптивно"), chip("random", "🎲 Случайная")));
    for (const tier of [...new Set(techs.map(t => t.tier))].sort()) {
      chips.append(h("div", { class: "tier-name" }, TIER_NAME[tier] || `Тир ${tier}`),
        h("div", { class: "chips" }, techs.filter(t => t.tier === tier).map(t => chip(t.technique, t.title, t))));
    }
    chips.append(h("p", { class: "hint", style: "margin:8px 0 0" },
      "Адаптивно и 🎲 дают только открытые техники; адаптивно — самую медленную или ошибочную. " +
      `Следующая группа открывается, когда каждая техника текущей решена верно ${UNLOCK} раз с точностью от 80%. ` +
      "🔒-технику всё равно можно выбрать вручную."));
  }

  function refreshTechs() {
    drillTechniques().then(list => { techs = list; renderChips(); }).catch(() => {});
  }

  function renderStrip() {
    strip.textContent = "";
    strip.append(h("span", {}, "Решено: ", h("b", {}, `${session.correct}/${session.n}`)),
      h("span", {}, "Точность: ", h("b", {}, session.n ? pct(session.correct / session.n) : "—")),
      h("span", {}, "Медиана: ", h("b", {}, sec(median(session.times)))));
  }

  function render() {
    if (!drill) return;
    const elim = drill.kind === "eliminate";
    const ans = new Map((result?.answers || []).map(([c, v]) => [c, v]));
    const ansSet = new Set((result?.answers || []).map(([c, v]) => `${c}:${v}`));
    const ghost = new Map();
    if (!elim && result) {
      for (const [c, v] of ans) ghost.set(c, v);
      if (picked) ghost.set(picked[0], picked[1]);
    }
    candBox.checked = elim || showCands;
    candBox.disabled = elim;
    board.render({
      values, given: values.map(Boolean), sel: result ? -1 : sel, highlight: !elim || sel >= 0,
      notes: i => (elim || showCands ? drill.candidates[i] : null), notesBig: elim, pickable: elim && !result,
      ghost,
      cellClass: i => {
        if (!result) return [];
        const pat = (result.pattern || []).includes(i) ? ["pat"] : [];
        if (elim) return pat;
        if (picked && picked[0] === i) return [result.correct ? "ok" : "bad"];
        return ans.has(i) ? ["ans", ...pat] : pat;
      },
      candClass: (i, v) => {
        if (!result) return "";
        if (picked && picked[0] === i && picked[1] === v) return result.correct ? "c-ok" : "c-bad";
        return ansSet.has(`${i}:${v}`) ? "c-ans" : "";
      },
    });
    padEl.hidden = elim && (sel < 0 || !!result);
    nextBtn.textContent = result ? "Дальше" : "Пропустить";
  }

  async function load() {
    if (loading) return;
    loading = true;
    msg.textContent = ""; msg.className = "msg";
    try {
      drill = await nextDrill(choice === "adaptive" ? undefined : choice);
      values = toDigits(drill.board); sel = -1; result = null; picked = null;
      title.textContent = drill.title;
      why.hidden = true; why.textContent = "";
      const slug = techs.find(t => t.technique === drill.technique)?.theory;
      theoryLink.hidden = !slug;
      if (slug) theoryLink.href = `#/theory/${slug}`;
      prompt.textContent = drill.prompt;
      how.textContent = drill.kind === "eliminate"
        ? "Нажми на кандидата, который убирается, — или выбери клетку, затем цифру (клавиатура или кнопки)."
        : "Выбери клетку, затем цифру (клавиатура или кнопки).";
      start = performance.now();
      render();
    } catch (e) {
      prompt.textContent = "";
      msg.textContent = e.message; msg.className = "msg bad";
    } finally { loading = false; }
  }

  function onCell(i) {
    if (!drill || result || values[i]) return;
    sel = i; render();
  }
  function onDigit(v) {
    if (!drill || result) return;
    if (sel < 0 || values[sel]) { msg.textContent = "Сначала выбери пустую клетку"; msg.className = "msg"; return; }
    if (drill.kind === "eliminate" && !drill.candidates[sel].includes(v)) {
      msg.textContent = `В ${cellName(sel)} нет кандидата ${v}`; msg.className = "msg"; return;
    }
    answer(sel, v);
  }

  let sending = false;
  async function answer(cell, value) {
    if (!drill || result || sending) return;
    sending = true;
    const ms = performance.now() - start;
    try {
      const res = await sendAttempt(drill.id, ms, cell, value);
      result = res; picked = [cell, value];
      timer.textContent = sec(ms);
      session.n++;
      if (res.correct) { session.correct++; session.times.push(ms); }
      const list = res.answers.map(([c, v]) => drill.kind === "eliminate" ? `${v} из ${cellName(c)}` : `${cellName(c)} = ${v}`);
      if (res.correct) { msg.textContent = `Верно · ${sec(ms)}`; msg.className = "msg ok"; }
      else {
        msg.textContent = (res.valid_other_move ? `Верный ход, но это не ${drill.title}. ` : "Неверно. ")
          + `Ответ${list.length > 1 ? "ы" : ""}: ${list.join(", ")}`;
        msg.className = "msg bad";
      }
      if (res.explanation) {
        why.textContent = "";
        why.append(h("b", {}, "Почему: "), res.explanation, " ",
          res.theory ? h("a", { href: `#/theory/${res.theory}` }, "Теория →") : null);
        why.hidden = false;
      }
      renderStrip(); render(); refreshTechs();
    } catch (e) {
      msg.textContent = e.message; msg.className = "msg bad";
    } finally { sending = false; }
  }

  const onKey = e => {
    const t = e.target.tagName;
    if (t === "INPUT" || t === "SELECT" || t === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter" || e.code === "Space") {
      if (t === "BUTTON" && e.target !== nextBtn) return;
      e.preventDefault(); load(); return;
    }
    const d = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (d) { onDigit(+d[1]); e.preventDefault(); return; }
    if (e.key.startsWith("Arrow") && drill && !result) {
      const i = sel < 0 ? 0 : sel, r = ROW(i), k = COL(i);
      sel = { ArrowUp: ((r + 8) % 9) * 9 + k, ArrowDown: ((r + 1) % 9) * 9 + k,
              ArrowLeft: r * 9 + (k + 8) % 9, ArrowRight: r * 9 + (k + 1) % 9 }[e.key];
      e.preventDefault(); render();
    }
  };
  const tick = setInterval(() => { if (drill && !result) timer.textContent = `${((performance.now() - start) / 1000).toFixed(1)} с`; }, 100);
  document.addEventListener("keydown", onKey);

  renderStrip();
  drillTechniques().then(list => {
    techs = list;
    if (!["adaptive", "random"].includes(choice) && !techs.some(t => t.technique === choice)) choice = "adaptive";
    renderChips();
    load();
  }).catch(e => chips.append(errorBox(e)));
  return () => { document.removeEventListener("keydown", onKey); clearInterval(tick); };
}
