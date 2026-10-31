// #/drills — "find the move" drills: place (cell + digit) and eliminate (click the removed candidate).
import { drillHint, drillTechniques, nextDrill, revealDrill, sendAttempt } from "./api.js";
import { ROW, COL, cellName, createBoard, createPad, toDigits, unitCells } from "./board.js";
import { TIER_NAME, errorBox, h, pct, sec, typingInto } from "./ui.js";

const UNLOCK = 15;  // drills.UNLOCK_MIN_CORRECT
const progress = t => t.mastered ? "✓" : t.unlocked ? `${Math.min(t.correct, UNLOCK)}/${UNLOCK}` : "";

let choice = "adaptive";  // 'adaptive' | 'random' | slug
let showCands = false;     // place drills only; eliminate drills always show candidates
const AUTO_KEY = "gym.drills.autoNext";
const readAuto = () => { try { return localStorage.getItem(AUTO_KEY) !== "0"; } catch { return true; } };
const AUTO_DELAY = 600;     // ms to see the green flash before the next drill
const session = { n: 0, correct: 0, times: [] };

const median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function mount(el, params, query) {
  let autoNext = readAuto();
  if (query.technique) choice = query.technique;
  let drill = null, values = [], start = 0, sel = -1, result = null, picked = null, techs = [], loading = false;
  let digit = 0;  // last digit pressed or filled cell clicked: highlighted on the board
  let hinted = null;  // «где искать» shown for this drill: {hint, unit, digit, cells}; a right answer after it is neutral

  const boardEl = h("div", { id: "drillBoard" }), padEl = h("div");
  const prompt = h("p", { class: "prompt", id: "prompt" }, "Загрузка…");
  const title = h("span", { class: "badge", id: "drillTech" });
  const timer = h("span", { class: "timer", id: "drillTimer" }, "0.0 с");
  const msg = h("div", { class: "msg", id: "drillMsg", role: "status" });
  const strip = h("div", { class: "strip", id: "session" });
  const candBox = h("input", { type: "checkbox", id: "showCands", onchange: e => { showCands = e.target.checked; render(); } });
  const nextBtn = h("button", { type: "button", id: "nextDrill", onclick: () => load() }, "Дальше");
  const hintBtn = h("button", { type: "button", id: "hintBtn", title: "Подсказка (H): сначала где искать, потом ответ",
    onclick: () => onHint() }, "💡 Подсказка");
  const autoBox = h("input", { type: "checkbox", id: "autoNext", onchange: e => {
    autoNext = e.target.checked;
    try { localStorage.setItem(AUTO_KEY, autoNext ? "1" : "0"); } catch {}
  } });
  autoBox.checked = autoNext;
  let autoTimer = null;
  const theoryLink = h("a", { id: "drillTheory", class: "hint", style: "margin:0" }, "Как это работает?");
  const why = h("div", { class: "why", id: "drillWhy", hidden: true });
  const chips = h("div", { id: "picker" });

  const board = createBoard(boardEl, { onCell: i => onCell(i), onCandidate: (i, v) => answer(i, v) });
  const pad = createPad(padEl, { onDigit: v => onDigit(v) });
  // The first drill after opening the page waits for «Начать»: reading the page is not solving time.
  let gated = true, pausedMs = 0, hiddenAt = null;
  const gate = h("div", { class: "gate", id: "drillGate" },
    h("button", { type: "button", class: "primary", id: "startDrill", onclick: () => begin() }, "Начать"),
    h("span", { class: "hint", style: "margin:0" }, h("kbd", {}, "Пробел"), " / ", h("kbd", {}, "Enter")));
  const boardWrap = h("div", { class: "board-wrap" }, boardEl, gate);
  const elapsed = () => performance.now() - start - pausedMs;
  pad.update(null);

  el.append(h("div", { class: "layout" },
    h("div", { class: "main-col" },
      h("div", { class: "bar head", style: "margin-bottom:4px" }, title, theoryLink, timer), prompt,
      h("p", { class: "hint", id: "drillHow" }), boardWrap, padEl,
      h("div", { class: "bar", style: "margin-top:10px" }, nextBtn,
        h("span", { class: "hint", style: "margin:0" }, h("kbd", {}, "Пробел"), " / ", h("kbd", {}, "Enter")),
        hintBtn, h("span", { class: "hint", style: "margin:0" }, h("kbd", {}, "H"))),
      h("div", { class: "bar", style: "margin-top:6px" },
        h("label", { class: "check" }, autoBox, "Автопереход после верного"),
        h("label", { class: "check" }, candBox, "Показывать кандидатов")),
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
      `Адаптивно — твоя самая медленная техника. 🔒 откроется после ${UNLOCK} верных на каждой технике группы выше.`));
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
    const look = new Set(hinted && !result && hinted.unit !== null ? unitCells(hinted.unit) : []);
    if (!elim && result) {
      for (const [c, v] of ans) ghost.set(c, v);
      if (picked) ghost.set(picked[0], picked[1]);
    }
    candBox.checked = elim || showCands;
    candBox.disabled = elim;
    board.render({
      values, given: values.map(Boolean), sel: result ? -1 : sel, highlight: !elim || sel >= 0 || !!digit, digit,
      notes: i => (elim || showCands ? drill.candidates[i] : null), notesBig: elim, pickable: elim && !result,
      ghost,
      cellClass: i => {
        if (!result) return [look.has(i) ? "unit" : "", hinted?.cells.includes(i) ? "pat" : ""].filter(Boolean);
        const pat = (result.pattern || []).includes(i) ? ["pat"] : [];
        if (elim) return pat;
        if (picked && picked[0] === i) return [result.correct ? "ok" : result.valid_other_move ? "other" : "bad"];
        return ans.has(i) ? ["ans", ...pat] : pat;
      },
      candClass: (i, v) => {
        if (!result) return "";
        if (picked && picked[0] === i && picked[1] === v) return result.correct ? "c-ok" : result.valid_other_move ? "c-other" : "c-bad";
        return ansSet.has(`${i}:${v}`) ? "c-ans" : "";
      },
    });
    padEl.hidden = elim && (sel < 0 || !!result);
    nextBtn.textContent = result ? "Дальше" : "Пропустить";
    hintBtn.hidden = !!result;
    hintBtn.textContent = hinted ? "Показать ответ" : "💡 Подсказка";
  }

  async function load() {
    clearTimeout(autoTimer); autoTimer = null;
    if (loading) return;
    loading = true;
    msg.textContent = ""; msg.className = "msg";
    try {
      drill = await nextDrill(choice === "adaptive" ? undefined : choice);
      values = toDigits(drill.board); sel = -1; result = null; picked = null; digit = 0; hinted = null;
      title.textContent = drill.title; title.title = drill.title;
      why.hidden = true; why.textContent = "";
      const slug = techs.find(t => t.technique === drill.technique)?.theory;
      theoryLink.hidden = !slug;
      if (slug) theoryLink.href = `#/theory/${slug}`;
      prompt.textContent = drill.prompt;
      how.textContent = drill.kind === "eliminate"
        ? "Нажми на кандидата, который убирается, — или выбери клетку, затем цифру (клавиатура или кнопки)."
        : "Выбери клетку, затем цифру (клавиатура или кнопки).";
      start = performance.now(); pausedMs = 0; hiddenAt = null;
      timer.textContent = "0.0 с";
      gate.hidden = !gated;
      render();
    } catch (e) {
      prompt.textContent = "";
      msg.textContent = e.message; msg.className = "msg bad";
    } finally { loading = false; }
  }

  function begin() {
    if (!gated) return;
    gated = false; gate.hidden = true;
    start = performance.now(); pausedMs = 0;
  }

  function onCell(i) {
    if (!drill || result || gated) return;
    if (values[i]) { digit = values[i]; sel = -1; } else sel = i;
    render();
  }
  function onDigit(v) {
    if (!drill || result || gated) return;
    digit = v;
    if (sel < 0 || values[sel]) { render(); return; }
    if (drill.kind === "eliminate" && !drill.candidates[sel].includes(v)) {
      msg.textContent = `В ${cellName(sel)} нет кандидата ${v}`; msg.className = "msg"; return;
    }
    answer(sel, v);
  }

  let sending = false;
  /** First press: where to look (no answer). Second press: show the answer — counted as an error. */
  async function onHint() {
    if (!drill || result || sending || gated) return;
    sending = true;
    const id = drill.id;
    try {
      if (!hinted) {
        const hn = await drillHint(id);
        if (!drill || drill.id !== id || result) return;
        hinted = hn;
        if (hn.digit) digit = hn.digit;
        why.textContent = "";
        why.append(h("b", {}, "Подсказка: "), hn.hint, " ", h("span", { class: "hint" },
          "Ответ после подсказки не идёт в зачёт, но и ошибкой не считается."));
        why.hidden = false;
        render();
        return;
      }
      const ms = elapsed();
      const res = await revealDrill(id, ms);
      if (!drill || drill.id !== id) return;
      result = res; picked = null;
      timer.textContent = sec(ms);
      session.n++;
      const list = res.answers.map(([c, v]) => drill.kind === "eliminate" ? `${v} из ${cellName(c)}` : `${cellName(c)} = ${v}`);
      msg.textContent = `Ответ показан — засчитано как ошибка. ${list.join(", ")}`; msg.className = "msg bad";
      showWhy(res);
      renderStrip(); render(); refreshTechs();
    } catch (e) {
      msg.textContent = e.message; msg.className = "msg bad";
    } finally { sending = false; }
  }

  function showWhy(res) {
    if (!res.explanation) return;
    why.textContent = "";
    why.append(h("b", {}, "Почему: "), res.explanation, " ",
      res.theory ? h("a", { href: `#/theory/${res.theory}` }, "Теория →") : null);
    why.hidden = false;
  }

  async function answer(cell, value) {
    if (!drill || result || sending || gated) return;
    sending = true;
    const ms = elapsed();
    try {
      const res = await sendAttempt(drill.id, ms, cell, value, hinted ? 1 : 0);
      result = res; picked = [cell, value];
      timer.textContent = sec(ms);
      session.n++;
      if (res.correct && !hinted) { session.correct++; session.times.push(ms); }
      const list = res.answers.map(([c, v]) => drill.kind === "eliminate" ? `${v} из ${cellName(c)}` : `${cellName(c)} = ${v}`);
      const answersText = `Ответ${list.length > 1 ? "ы" : ""} этой техникой: ${list.join(", ")}`;
      if (res.correct && hinted) { msg.textContent = `Верно с подсказкой · ${sec(ms)} — не в зачёт`; msg.className = "msg ok"; }
      else if (res.correct) { msg.textContent = `Верно · ${sec(ms)}`; msg.className = "msg ok"; }
      else if (res.valid_other_move) {
        msg.textContent = `Ход верный, но найден другой техникой — засчитано нейтрально. ${answersText}`;
        msg.className = "msg other";
      } else { msg.textContent = `Неверно. ${answersText}`; msg.className = "msg bad"; }
      const advance = res.correct && autoNext;
      if (advance) autoTimer = setTimeout(load, AUTO_DELAY);
      if (!advance) showWhy(res);
      renderStrip(); render(); refreshTechs();
    } catch (e) {
      msg.textContent = e.message; msg.className = "msg bad";
    } finally { sending = false; }
  }

  const onKey = e => {
    if (typingInto(e) || e.target.tagName === "SELECT" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter" || e.code === "Space") {
      // a control focused from the keyboard (Tab) keeps its own Enter/Space; one focused by a mouse click does not
      if (e.target !== nextBtn && e.target.matches("button:focus-visible, input:focus-visible")) return;
      e.preventDefault();
      if (gated) begin(); else load();
      return;
    }
    const d = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (d) { onDigit(+d[1]); e.preventDefault(); return; }
    if (e.code === "KeyH") { onHint(); e.preventDefault(); return; }
    if (e.key.startsWith("Arrow") && drill && !result) {
      // only empty cells take an answer, so the arrows jump over filled ones (wrapping within the row / column)
      if (sel < 0) sel = values.indexOf(0);
      else {
        const [dr, dk] = { ArrowUp: [8, 0], ArrowDown: [1, 0], ArrowLeft: [0, 8], ArrowRight: [0, 1] }[e.key];
        for (let n = 1, r = ROW(sel), k = COL(sel); n < 9; n++) {
          r = (r + dr) % 9; k = (k + dk) % 9;
          if (!values[r * 9 + k]) { sel = r * 9 + k; break; }
        }
      }
      digit = 0;
      e.preventDefault(); render();
    }
  };
  const tick = setInterval(() => {
    if (drill && !result && !gated && hiddenAt === null) timer.textContent = `${(elapsed() / 1000).toFixed(1)} с`;
  }, 100);
  // time while the tab is hidden (another tab, minimised window) does not count
  const onVisibility = () => {
    if (document.hidden) hiddenAt = performance.now();
    else if (hiddenAt !== null) { pausedMs += performance.now() - hiddenAt; hiddenAt = null; }
  };
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("keydown", onKey);

  renderStrip();
  drillTechniques().then(list => {
    techs = list;
    if (!["adaptive", "random"].includes(choice) && !techs.some(t => t.technique === choice)) choice = "adaptive";
    renderChips();
    load();
  }).catch(e => chips.append(errorBox(e)));
  return () => {
    document.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVisibility);
    clearInterval(tick); clearTimeout(autoTimer);
  };
}
