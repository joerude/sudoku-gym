// #/play — game page: setup controls, board, timer, results. The game survives navigation.
import { addPuzzle, createGame, getFavoritePuzzle, getFavorites, getOptions, getPuzzle } from "./api.js";
import { createBoard, createPad, fmtTime, parseGrid } from "./board.js";
import { startGame } from "./game.js";
import { LEVEL_NAME, createFav, errorBox, h, ignoreKey, metricsGrid, statusLine, zenButton } from "./ui.js";

const LEVELS = ["easy", "medium", "hard", "expert"];
const PREFS_KEY = "gym-play-prefs";
let prefs = { level: "medium", grade: "", mode: "original", limit: "3", counts: true };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; } catch { /* no storage */ }
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

let G = null;          // current game (game.js api)
let meta = {};         // {hideGrade}
let options = null;    // /api/puzzle/options
let ui = null;         // DOM refs while mounted
let pendingMsg = null; // message to show on next refresh
let digit = 0;         // last digit pressed: highlighted everywhere until a filled cell is selected
let favCount = null;   // starred puzzles (null until /api/favorites answers)

const bits = m => { const out = []; for (let v = 1; v <= 9; v++) if (m & (1 << v)) out.push(v); return out; };

function gradeCounts(level) {
  if (!options) return {};
  if (level !== "random") return options.levels.find(l => l.level === level)?.grades || {};
  const sum = {};
  for (const l of options.levels) for (const [g, n] of Object.entries(l.grades)) sum[g] = (sum[g] || 0) + n;
  return sum;
}
const levelTotal = level => Object.values(gradeCounts(level)).reduce((a, b) => a + b, 0);

function setupSection() {
  const lvl = h("select", { id: "level", "aria-label": "Уровень" },
    [...LEVELS, "random"].map(l => h("option", { value: l }, l === "random" ? LEVEL_NAME.random : LEVEL_NAME[l])));
  const grade = h("select", { id: "grade", "aria-label": "Техника" });
  const mode = h("select", { id: "mode", "aria-label": "Режим" },
    h("option", { value: "original" }, "original — ошибки видны"), h("option", { value: "hardcore" }, "hardcore — без подсветки"));
  const limit = h("select", { id: "limit", "aria-label": "Лимит ошибок" },
    h("option", { value: "3" }, "3"), h("option", { value: "5" }, "5"), h("option", { value: "none" }, "без лимита"));
  const limitField = h("label", { class: "field" }, "Лимит ошибок", limit);
  const sync = () => {
    const counts = gradeCounts(lvl.value);
    grade.textContent = "";
    grade.append(h("option", { value: "" }, `Любая (${levelTotal(lvl.value)})`));
    for (let g = 1; g <= 5; g++) {
      const n = counts[g] || 0;
      grade.append(h("option", { value: String(g), disabled: !n }, `${g} · ${options?.grade_titles[g] ?? ""} (${n})`));
    }
    if (prefs.grade && !(counts[prefs.grade] > 0)) prefs.grade = "";
    grade.value = prefs.grade;
    limitField.hidden = mode.value !== "original";
    for (const o of lvl.options) o.disabled = !!options && levelTotal(o.value) === 0;
  };
  lvl.value = prefs.level; mode.value = prefs.mode; limit.value = prefs.limit;
  lvl.onchange = () => { prefs.level = lvl.value; savePrefs(); sync(); };
  grade.onchange = () => { prefs.grade = grade.value; savePrefs(); };
  mode.onchange = () => { prefs.mode = mode.value; savePrefs(); sync(); };
  limit.onchange = () => { prefs.limit = limit.value; savePrefs(); };
  const newBtn = h("button", { type: "button", class: "primary", id: "newGame", onclick: () => newGame(false) }, "Новая партия");
  const rndBtn = h("button", { type: "button", id: "randomGame", onclick: () => newGame(true) }, "🎲 Случайная партия");
  const favBtn = h("button", { type: "button", id: "favGame", title: "Задача из избранного: сначала та, что давно не игралась",
    onclick: () => begin(getFavoritePuzzle, false) });
  const syncFav = () => {
    favBtn.textContent = `★ Из избранного${favCount === null ? "" : ` (${favCount})`}`;
    favBtn.disabled = !favCount;
  };
  syncFav();
  const box = h("section", { class: "first-mobile" },
    h("h2", {}, "Новая партия"),
    h("div", { class: "bar" }, h("label", { class: "field" }, "Уровень", lvl), h("label", { class: "field" }, "Техника", grade)),
    h("div", { class: "bar" }, h("label", { class: "field" }, "Режим", mode), limitField),
    h("div", { class: "bar", style: "margin:0" }, newBtn, rndBtn, favBtn));
  return { box, sync, syncFav, buttons: [newBtn, rndBtn, favBtn] };
}

export function mount(el, params, query) {
  const boardEl = h("div", { id: "board" }), padEl = h("div");
  const notesBtn = h("button", { type: "button", id: "notesBtn", title: "Режим заметок (N, Т или пробел)", onclick: () => G?.toggleNotes() }, "✎ заметки");
  const autoBox = h("input", { type: "checkbox", id: "autoNotes", checked: true, onchange: e => G?.setAutoNotes(e.target.checked) });
  const countsBox = h("input", { type: "checkbox", id: "padCounts", checked: prefs.counts,
    onchange: e => { prefs.counts = e.target.checked; savePrefs(); refresh(); } });
  const clearBtn = h("button", { type: "button", id: "clearBtn", title: "Стереть все свои цифры и заметки (отменяется «↶ отменить»)",
    onclick: () => G?.clear() }, "Очистить");
  // give up needs a second click within 3 s, so a stray click doesn't end the game
  let armed = null;
  const giveUpBtn = h("button", { type: "button", id: "giveUpBtn", title: "Завершить партию как брошенную", onclick: () => {
    if (!G || G.S.status !== "active") return;
    if (!armed) {
      giveUpBtn.textContent = "Точно сдаться?"; giveUpBtn.classList.add("danger");
      armed = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    G.S.msg = { text: "Партия сдана", cls: "bad" };
    endGame("abandoned");
  } }, "Сдаться");
  const disarm = () => { clearTimeout(armed); armed = null; giveUpBtn.textContent = "Сдаться"; giveUpBtn.classList.remove("danger"); };
  const setup = setupSection();
  const fav = createFav("puzzle", { onChange: r => {
    if (G) G.S.puzzle.fav = r.fav;
    favCount = r.counts.puzzle; setup.syncFav();
  } });
  ui = {
    fav, badge: h("span", { class: "badge", id: "badge" }), errs: h("span", { class: "counter", id: "errors" }),
    timer: h("span", { class: "timer", id: "timer" }, "0:00.0"), msg: h("div", { class: "msg", id: "msg", role: "status" }),
    results: h("div", { id: "results" }), autoBox, notesBtn, clearBtn, giveUpBtn, setup,
  };
  ui.board = createBoard(boardEl, { onCell: i => { if (G) { digit = 0; G.select(i); } } });
  ui.pad = createPad(padEl, { onDigit: v => press(v, G?.S.notesMode), onErase: () => G?.erase() });
  ui.root = h("div", { class: "layout" },
    h("div", { class: "main-col" },
      h("div", { class: "bar" }, ui.badge, fav.el, ui.errs, ui.timer), boardEl, padEl,
      h("div", { class: "bar", style: "margin-top:10px" }, notesBtn,
        h("button", { type: "button", id: "undoBtn", onclick: () => G?.undoLast() }, "↶ отменить"),
        h("button", { type: "button", id: "checkBtn", title: "Подсветить ошибки (учитывается в итогах)", onclick: () => G?.check() }, "Проверить"),
        clearBtn, giveUpBtn, zenButton(),
        h("label", { class: "check zen-hide" }, autoBox, "автоочистка заметок"),
        h("label", { class: "check zen-hide", title: "Сколько каждой цифры осталось поставить" }, countsBox, "счётчик цифр")),
      ui.msg),
    setup.box,
    h("div", {}, ui.results,
      h("section", { class: "zen-hide" }, h("h2", {}, "Клавиши"), h("p", { class: "hint", style: "margin:0", html:
        "<kbd>1–9</kbd> цифра, <kbd>Shift</kbd>+цифра — заметка, <kbd>N</kbd>/<kbd>Т</kbd>/<kbd>пробел</kbd> — режим заметок, " +
        "<kbd>0</kbd>/<kbd>Backspace</kbd>/<kbd>Delete</kbd> — стереть, стрелки — перемещение, <kbd>Ctrl+Z</kbd> — отменить, " +
        "<kbd>F</kbd> — в избранное, <kbd>Z</kbd> — zen-режим (<kbd>Esc</kbd> — выйти). " +
        "<kbd>Ctrl+V</kbd> сетки (81 цифра, 0 или . — пусто, можно с <kbd>|</kbd> и <kbd>-</kbd>) загружает свою задачу." }))));
  setup.box.classList.add("zen-hide-playing");  // in zen the setup comes back once the game is over
  el.append(ui.root);

  const onKey = e => handleKey(e);
  window.addEventListener("keydown", onKey, true);  // capture: before extensions or page handlers can swallow it
  const tick = setInterval(() => { if (G && ui) ui.timer.textContent = fmtTime(G.elapsed()); }, 100);

  const ready = options ? Promise.resolve(options) : getOptions().then(o => { options = o; });
  ready.then(() => {
    setup.sync();
    if (query.level || query.mode) {
      if ([...LEVELS, "random"].includes(query.level)) prefs.level = query.level;
      if (["original", "hardcore"].includes(query.mode)) prefs.mode = query.mode;
      prefs.grade = query.grade || "";
      savePrefs();
      setup.box.querySelector("#level").value = prefs.level;
      setup.box.querySelector("#mode").value = prefs.mode;
      setup.sync();
    }
    if (query.start === "1") { history.replaceState(null, "", "#/play"); newGame(false); }
  }).catch(e => setMsg(e.message, "bad"));
  getFavorites().then(c => { favCount = c.puzzle; setup.syncFav(); }).catch(() => {});
  refresh();
  if (G?.S.result) showResults();
  return () => { window.removeEventListener("keydown", onKey, true); clearInterval(tick); clearTimeout(armed); ui = null; };
}

function setMsg(text, cls = "") {
  if (!ui) { pendingMsg = { text, cls }; return; }
  ui.msg.textContent = text || ""; ui.msg.className = "msg" + (cls ? ` ${cls}` : "");
}

function refresh() {
  if (!ui) return;
  ui.root.classList.toggle("playing", G?.S.status === "active");
  ui.fav.set(G ? G.S.puzzle.id : null, G?.S.puzzle.fav);
  if (!G) {
    ui.board.render({ values: Array(81).fill(0), given: Array(81).fill(false) });
    ui.pad.update(null);
    ui.badge.textContent = "партия не начата"; ui.errs.textContent = "";
    ui.clearBtn.disabled = ui.giveUpBtn.disabled = true;
    if (pendingMsg) { setMsg(pendingMsg.text, pendingMsg.cls); pendingMsg = null; }
    else if (!ui.msg.textContent) setMsg("Выбери уровень и нажми «Новая партия».");
    return;
  }
  const S = G.S, over = S.status !== "active";
  ui.board.render({
    values: S.vals, given: S.given, sel: over ? -1 : S.sel, highlight: true, locked: over && S.status !== "solved", digit,
    notes: i => (S.vals[i] ? null : bits(S.notes[i])),
    cellClass: i => (G.isWrong(i) && (S.mode === "original" || S.showBad.has(i) || over) ? ["bad"] : []),
  });
  ui.pad.update(prefs.counts ? S.vals : null);
  const p = S.puzzle, showGrade = !meta.hideGrade || over;
  ui.badge.textContent = `${LEVEL_NAME[p.level] || p.level} · ${showGrade ? `техника: ${p.grade_title}` : "техника скрыта"} · ${S.mode}`;
  ui.errs.textContent = S.mode === "original" ? `Ошибки ${S.mistakes}/${S.limit ?? "∞"}` : "";
  ui.errs.classList.toggle("bad", S.mode === "original" && S.mistakes > 0);
  ui.timer.textContent = fmtTime(G.elapsed());
  ui.timer.classList.toggle("done", S.status === "solved");
  ui.notesBtn.classList.toggle("on", S.notesMode);
  ui.clearBtn.disabled = ui.giveUpBtn.disabled = over;
  ui.autoBox.checked = S.autoNotes;
  if (S.msg) setMsg(S.msg.text, S.msg.cls);
  else if (!over) setMsg("");
}

function showResults() {
  if (!ui || !G?.S.result) { if (ui) ui.results.textContent = ""; return; }
  const r = G.S.result, p = G.S.puzzle;
  ui.results.textContent = "";
  ui.results.append(h("section", { id: "resultsCard" },
    h("h2", {}, "Итоги партии: ", statusLine(r)),
    h("p", { class: "hint" }, `${LEVEL_NAME[p.level] || p.level} · техника: ${p.grade_title} · ${r.mode}`),
    metricsGrid(r),
    h("div", { class: "bar", style: "margin:0" },
      h("a", { class: "btn primary", href: `#/review/${r.id}`, id: "reviewLink" }, "Разбор пауз"),
      h("button", { type: "button", onclick: () => newGame(false) }, "Новая партия"))));
  if (matchMedia("(max-width: 820px)").matches) ui.results.scrollIntoView({ block: "nearest" });
}

async function endGame(status) {
  try {
    await G.finish(status);
  } catch (e) {
    setMsg(`Не удалось сохранить итог: ${e.message}`, "bad");
  }
  refresh();
  showResults();
}

let busy = false;
async function begin(getPuzzleFn, hideGrade) {
  if (busy) return;
  busy = true;
  ui?.setup.buttons.forEach(b => { b.disabled = true; });
  try {
    if (G && G.S.status === "active") await G.finish("abandoned").catch(() => {});
    const puzzle = await getPuzzleFn();
    const limit = prefs.mode === "original" ? (prefs.limit === "none" ? null : Number(prefs.limit)) : null;
    const { id } = await createGame(puzzle.id, prefs.mode, limit);
    meta = { hideGrade };
    digit = 0;
    G = startGame({
      puzzle, gameId: id, mode: prefs.mode, limit,
      onChange: refresh, onEnd: endGame,
      onQueueError: e => setMsg(`Ходы пока не отправлены: ${e.message}. Повторю.`, "bad"),
    });
    G.setAutoNotes(ui ? ui.autoBox.checked : true);
    setMsg("");
    if (ui) ui.results.textContent = "";
    refresh();
  } catch (e) {
    setMsg(e.message, "bad");
  } finally {
    busy = false;
    ui?.setup.buttons.forEach(b => { b.disabled = false; });
    ui?.setup.syncFav();
  }
}

function newGame(random) {
  if (!random) {
    const hide = prefs.level === "random" && !prefs.grade;
    return begin(() => getPuzzle(prefs.level, prefs.grade || undefined), hide);
  }
  return begin(() => {
    const levels = LEVELS.filter(l => levelTotal(l) > 0);
    const level = levels[Math.floor(Math.random() * levels.length)] || "medium";
    const grades = Object.entries(gradeCounts(level)).filter(([, n]) => n > 0).map(([g]) => g);
    return getPuzzle(level, grades[Math.floor(Math.random() * grades.length)]);
  }, true);
}

/** Ctrl+V of a grid: validate on the server and start it as a custom puzzle. */
export function loadCustom(text) {
  const givens = parseGrid(text);
  if (!givens) { setMsg("Нужно ровно 81 клетку (цифры, 0 или . — пусто)", "bad"); return Promise.resolve(); }
  return begin(() => addPuzzle(givens), false);
}

/** Digit from the pad or keyboard: highlight it on the board, then place it (or toggle the note). */
function press(v, asNote) {
  if (!G) return;
  digit = v;
  G.input(v, asNote);
  refresh();
}

function handleKey(e) {
  if (ignoreKey(e) || e.altKey || !G) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" || (e.ctrlKey && e.code === "KeyZ")) {
    G.undoLast(); e.preventDefault(); return;
  }
  if (e.ctrlKey || e.metaKey) return;
  if (e.code === "KeyF") { ui?.fav.toggle(); e.preventDefault(); return; }
  const d = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  if (d && d[1] !== "0") { press(+d[1], e.shiftKey || G.S.notesMode); e.preventDefault(); return; }
  if (e.key.startsWith("Arrow")) { digit = 0; G.move(e.key); e.preventDefault(); return; }
  if (e.key === "Backspace" || e.key === "Delete" || (d && d[1] === "0")) { G.erase(); e.preventDefault(); return; }
  if ("nNтТ".includes(e.key) && e.key.length === 1 || e.code === "Space") { G.toggleNotes(); e.preventDefault(); }
}
