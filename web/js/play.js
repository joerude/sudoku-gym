// #/play — game page: setup controls, board, timer, results. The game survives navigation.
import { tr } from "./i18n.js";
import { addPuzzle, createGame, getFavoritePuzzle, getFavorites, getOptions, getPuzzle } from "./api.js";
import { PEERS, createBoard, createPad, fmtTime, parseGrid, stepCell, toDigits } from "./board.js";
import { startGame } from "./game.js";
import { closeReward, showReward } from "./reward.js";
import { recordsCard } from "./records.js";
import { LEVEL_NAME, alignSideToBoard, confirmDialog, createFav, errorBox, h, ignoreKey, keyTrace, metricsGrid, statusLine, zenButton } from "./ui.js";

const LEVELS = ["easy", "medium", "hard", "expert"];
const PREFS_KEY = "gym-play-prefs";
let prefs = { level: "medium", grade: "", mode: "original", limit: "3", limitN: "3", counts: true, customLevel: "medium" };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; } catch { /* no storage */ }
// limit: "1".."99" or "none"; limitN: the last number, kept while «без лимита» is on
const toLimit = v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 99 ? String(n) : null; };
if (prefs.limit !== "none") prefs.limit = toLimit(prefs.limit) || "3";
prefs.limitN = toLimit(prefs.limitN) || (prefs.limit === "none" ? "3" : prefs.limit);
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

let G = null;          // current game (game.js api)
let meta = {};         // {hideGrade}
let options = null;    // /api/puzzle/options
let ui = null;         // DOM refs while mounted
let pendingMsg = null; // message to show on next refresh
let digit = 0;         // last digit pressed: highlighted everywhere until a filled cell is selected
let favCount = null;   // starred puzzles (null until /api/favorites answers)
let asking = null;     // close() of the open «Бросить партию?» dialog
let edit = null;       // own grid being entered ({vals, sel}); survives navigation like G

const bits = m => { const out = []; for (let v = 1; v <= 9; v++) if (m & (1 << v)) out.push(v); return out; };

function gradeCounts(level) {
  if (!options) return {};
  if (level !== "random") return options.levels.find(l => l.level === level)?.grades || {};
  const sum = {};
  for (const l of options.levels) for (const [g, n] of Object.entries(l.grades)) sum[g] = (sum[g] || 0) + n;
  return sum;
}
const levelTotal = level => Object.values(gradeCounts(level)).reduce((a, b) => a + b, 0);
/** Cells whose digit repeats in their row, column or box. */
const conflicts = vals => new Set(vals.flatMap((v, i) => (v && PEERS[i].some(p => vals[p] === v) ? [i] : [])));

/** Mode select and mistake limit (1–99 or «без лимита») bound to prefs: the setup and the grid editor each have a set. */
function modeFields(ids) {
  const mode = h("select", { id: ids.mode, "aria-label": tr("Режим") },
    h("option", { value: "original" }, tr("original — ошибки видны")), h("option", { value: "hardcore" }, tr("hardcore — без подсветки")));
  const limit = h("input", { type: "number", id: ids.limit, min: 1, max: 99, step: 1, inputmode: "numeric",
    "aria-label": tr("Лимит ошибок"), title: tr("Сколько ошибок можно сделать: 1–99") });
  const noLimit = h("input", { type: "checkbox", id: ids.noLimit });
  const limitField = h("div", { class: "field" }, h("label", { for: ids.limit }, tr("Лимит ошибок")),
    h("span", { class: "limit-row" }, limit, h("label", { class: "check" }, noLimit, tr("без лимита"))));
  const sync = () => {
    mode.value = prefs.mode; limit.value = prefs.limitN;
    noLimit.checked = prefs.limit === "none"; limit.disabled = noLimit.checked;
    limitField.hidden = prefs.mode !== "original";
  };
  mode.onchange = () => { prefs.mode = mode.value; savePrefs(); sync(); markRecord(); };
  // a valid number is taken as you type; leaving the field with a bad one puts the last valid number back
  limit.oninput = () => { const n = toLimit(limit.value); if (n) { prefs.limit = prefs.limitN = n; savePrefs(); } };
  limit.onchange = () => { limit.value = prefs.limitN; };
  noLimit.onchange = () => { prefs.limit = noLimit.checked ? "none" : prefs.limitN; savePrefs(); sync(); };
  sync();
  return { modeField: h("label", { class: "field" }, tr("Режим"), mode), limitField, sync };
}

function setupSection() {
  const lvl = h("select", { id: "level", "aria-label": tr("Уровень") },
    [...LEVELS, "random"].map(l => h("option", { value: l }, l === "random" ? LEVEL_NAME.random : LEVEL_NAME[l])));
  const grade = h("select", { id: "grade", "aria-label": tr("Техника") });
  const fields = modeFields({ mode: "mode", limit: "limit", noLimit: "noLimit" });
  const sync = () => {
    const counts = gradeCounts(lvl.value);
    grade.textContent = "";
    grade.append(h("option", { value: "" }, tr("Любая ({n})", { n: levelTotal(lvl.value) })));
    for (let g = 1; g <= 5; g++) {
      const n = counts[g] || 0;
      grade.append(h("option", { value: String(g), disabled: !n }, `${g} · ${options?.grade_titles[g] ?? ""} (${n})`));
    }
    if (prefs.grade && !(counts[prefs.grade] > 0)) prefs.grade = "";
    grade.value = prefs.grade;
    fields.sync();
    for (const o of lvl.options) o.disabled = !!options && levelTotal(o.value) === 0;
  };
  lvl.value = prefs.level;
  lvl.onchange = () => { prefs.level = lvl.value; savePrefs(); sync(); markRecord(); };
  grade.onchange = () => { prefs.grade = grade.value; savePrefs(); };
  const newBtn = h("button", { type: "button", class: "primary", id: "newGame", onclick: () => newGame(false) }, tr("Новая партия"));
  const rndBtn = h("button", { type: "button", id: "randomGame", onclick: () => newGame(true) }, tr("🎲 Случайная партия"));
  const favBtn = h("button", { type: "button", id: "favGame", title: tr("Задача из избранного: сначала та, что давно не игралась"),
    onclick: () => begin(getFavoritePuzzle, false) });
  const customBtn = h("button", { type: "button", id: "customGame", title: tr("Ввести задачу самому (например, с usdoku) и решить её как обычную партию"),
    onclick: () => openEditor() }, tr("✎ Своя сетка"));
  const syncFav = () => {
    favBtn.textContent = tr("★ Из избранного") + `${favCount === null ? "" : ` (${favCount})`}`;
    favBtn.disabled = !favCount;
  };
  syncFav();
  const box = h("section", { class: "first-mobile" },
    h("h2", {}, tr("Новая партия")),
    h("div", { class: "bar" }, h("label", { class: "field" }, tr("Уровень"), lvl), h("label", { class: "field" }, tr("Техника"), grade)),
    h("div", { class: "bar" }, fields.modeField, fields.limitField),
    h("div", { class: "bar", style: "margin:0" }, newBtn, rndBtn, favBtn, customBtn));
  return { box, sync, syncFav, buttons: [newBtn, rndBtn, favBtn, customBtn] };
}

/** «Своя сетка»: the board becomes an editor of the givens; this panel holds level, mode and start. */
function editorSection() {
  const lvl = h("select", { id: "customLevel", "aria-label": tr("Уровень") },
    [...LEVELS, "custom"].map(l => h("option", { value: l }, LEVEL_NAME[l])));
  lvl.onchange = () => { prefs.customLevel = lvl.value; savePrefs(); markRecord(); };
  const fields = modeFields({ mode: "customMode", limit: "customLimit", noLimit: "customNoLimit" });
  const status = h("p", { class: "hint", id: "customStatus" });
  const startBtn = h("button", { type: "button", class: "primary", id: "customStart", onclick: () => startCustom() }, tr("▶ Начать"));
  const box = h("section", { class: "first-mobile", id: "customEditor" },
    h("h2", {}, tr("Своя сетка")),
    h("p", { class: "hint", html: tr("Кликни клетку и введи цифры условия — например, перепиши задачу с usdoku. " +
      "<kbd>1–9</kbd> — цифра, <kbd>0</kbd> — пусто (курсор идёт дальше, так строку можно набрать подряд), " +
      "<kbd>Backspace</kbd> — стереть, стрелки — перемещение, <kbd>Esc</kbd> — отмена. " +
      "<kbd>Ctrl+V</kbd> вставляет сетку целиком (81 цифра, 0 или . — пусто).") }),
    h("div", { class: "bar" }, h("label", { class: "field" }, tr("Уровень"), lvl), fields.modeField, fields.limitField),
    status,
    h("div", { class: "bar", style: "margin:0" }, startBtn,
      h("button", { type: "button", id: "customClear", onclick: () => { edit.vals.fill(0); edit.sel = 0; setMsg(""); refresh(); } }, tr("Очистить")),
      h("button", { type: "button", id: "customCancel", onclick: () => closeEditor() }, tr("Отмена"))));
  const sync = conf => {
    const n = edit.vals.filter(Boolean).length;
    lvl.value = prefs.customLevel;
    fields.sync();
    startBtn.disabled = busy || n < 17 || conf.size > 0;
    status.style.color = conf.size ? "var(--bad)" : "";
    status.textContent = conf.size ? tr("Цифр: {n} · повторы в строке, столбце или квадрате — исправь красные клетки", { n })
      : n < 17 ? tr("Цифр: {n} · нужно хотя бы 17", { n }) : tr("Цифр: {n} · Enter — начать", { n });
  };
  return { box, sync, startBtn };
}

export function mount(el, params, query) {
  const boardEl = h("div", { id: "board" }), padEl = h("div");
  const notesBtn = h("button", { type: "button", class: "mini notes-toggle", id: "notesBtn", title: tr("Режим заметок (N, Т или пробел)"),
    onclick: () => G?.toggleNotes() }, tr("✎ заметки"));
  const notesLabel = h("div", { class: "notes-label", id: "notesLabel" },
    tr("✎ режим заметок · "), h("kbd", {}, "N"), " / ", h("kbd", {}, tr("пробел")), tr(" — выключить"));
  const autoBox = h("input", { type: "checkbox", id: "autoNotes", checked: true, onchange: e => G?.setAutoNotes(e.target.checked) });
  const countsBox = h("input", { type: "checkbox", id: "padCounts", checked: prefs.counts,
    onchange: e => { prefs.counts = e.target.checked; savePrefs(); refresh(); } });
  const clearBtn = h("button", { type: "button", id: "clearBtn", title: tr("Стереть все свои цифры и заметки (отменяется «↶ отменить»)"),
    onclick: () => G?.clear() }, tr("Очистить"));
  // give up needs a second click within 3 s, so a stray click doesn't end the game
  let armed = null;
  const giveUpBtn = h("button", { type: "button", id: "giveUpBtn", title: tr("Завершить партию как брошенную"), onclick: () => {
    if (!G || G.S.status !== "active") return;
    if (!armed) {
      giveUpBtn.textContent = tr("Точно сдаться?"); giveUpBtn.classList.add("danger");
      armed = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    G.S.msg = { text: tr("Партия сдана"), cls: "bad" };
    endGame("abandoned");
  } }, tr("Сдаться"));
  // «＋ новая» above the board: one click when nothing is at stake, a confirming second click mid-game
  let armedNew = null;
  const newTop = h("button", { type: "button", class: "mini", id: "newGameTop", title: tr("Новая партия с текущими настройками"),
    onclick: () => {
      if (G?.S.status === "active" && G.S.seq > 0 && !armedNew) {
        newTop.textContent = tr("Бросить партию?"); newTop.classList.add("danger");
        armedNew = setTimeout(disarmNew, 3000);
        return;
      }
      disarmNew();
      newGame(false);
    } }, tr("＋ новая"));
  const disarmNew = () => { clearTimeout(armedNew); armedNew = null; newTop.textContent = tr("＋ новая"); newTop.classList.remove("danger"); };
  const disarm = () => { clearTimeout(armed); armed = null; giveUpBtn.textContent = tr("Сдаться"); giveUpBtn.classList.remove("danger"); };
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
  ui.records = recordsCard();
  ui.records.el.classList.add("zen-hide");
  ui.editor = editorSection();
  ui.board = createBoard(boardEl, { onCell: i => {
    if (edit) { edit.sel = i; refresh(); } else if (G) { digit = 0; G.select(i); }
  } });
  ui.pad = createPad(padEl, { onDigit: v => press(v, G?.S.notesMode), onErase: () => (edit ? editCell(0, false) : G?.erase()) });
  ui.root = h("div", { class: "layout" },
    h("div", { class: "main-col" },
      // zen and «new game» sit next to the timer: reachable without scrolling, and in zen where the side panel is hidden
      h("div", { class: "bar" }, ui.badge, fav.el, ui.errs, ui.timer,
        notesBtn, newTop, zenButton("mini")), boardEl, notesLabel, padEl,
      h("div", { class: "bar", style: "margin-top:10px" },
        h("button", { type: "button", id: "undoBtn", title: tr("Отменить (Ctrl+Z)"), onclick: () => G?.undoLast() }, tr("↶ отменить")),
        h("button", { type: "button", id: "redoBtn", title: tr("Вернуть отменённое (Ctrl+Y или Ctrl+Shift+Z)"), onclick: () => G?.redoLast() }, tr("↷ вернуть")),
        h("button", { type: "button", id: "checkBtn", title: tr("Подсветить ошибки (учитывается в итогах)"), onclick: () => G?.check() }, tr("Проверить")),
        clearBtn, giveUpBtn,
        h("label", { class: "check zen-hide" }, autoBox, tr("автоочистка заметок")),
        h("label", { class: "check zen-hide", title: tr("Сколько каждой цифры осталось поставить") }, countsBox, tr("счётчик цифр"))),
      ui.msg),
    setup.box, ui.editor.box,
    h("div", {}, ui.results, ui.records.el,
      h("section", { class: "zen-hide" }, h("h2", {}, tr("Клавиши")), h("p", { class: "hint", style: "margin:0", html:
        tr("<kbd>1–9</kbd> цифра, <kbd>Shift</kbd>+цифра — заметка, <kbd>N</kbd>/<kbd>Т</kbd>/<kbd>пробел</kbd> — режим заметок, " +
        "<kbd>0</kbd>/<kbd>Backspace</kbd>/<kbd>Delete</kbd> — стереть, стрелки — перемещение, <kbd>Ctrl+Z</kbd> — отменить, " +
        "<kbd>Ctrl+Y</kbd> — вернуть, " +
        "<kbd>F</kbd> — в избранное, <kbd>Z</kbd> — zen-режим (<kbd>Esc</kbd> — выйти), <kbd>Esc</kbd> — бросить партию (с подтверждением). " +
        "<kbd>Ctrl+V</kbd> сетки (81 цифра, 0 или . — пусто, можно с <kbd>|</kbd> и <kbd>-</kbd>) открывает её в «Своей сетке».") }))));
  setup.box.classList.add("zen-hide-playing");  // in zen the setup comes back once the game is over
  el.append(ui.root);
  markRecord();
  ui.records.load();
  const unalign = alignSideToBoard(ui.root);

  const onKey = e => handleKey(e);
  window.addEventListener("keydown", onKey, true);  // capture: before extensions or page handlers can swallow it
  keyTrace.page = tr("играть");
  const tick = setInterval(() => { if (G && ui && !edit) ui.timer.textContent = fmtTime(G.elapsed()); }, 100);

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
  if (G?.S.result && !edit) showResults();
  return () => { asking?.(); closeReward(); unalign(); window.removeEventListener("keydown", onKey, true); keyTrace.page = null; clearInterval(tick); clearTimeout(armed); clearTimeout(armedNew); ui = null; };
}

/** Highlight the record for the level and mode being played (or chosen for the next game). */
function markRecord() {
  if (!ui) return;
  if (edit) { ui.records.mark(prefs.customLevel === "custom" ? null : prefs.customLevel, prefs.mode); return; }
  const p = G?.S.puzzle;
  if (p && G.S.status === "active") ui.records.mark(p.level, G.S.mode);
  else ui.records.mark(prefs.level === "random" ? null : prefs.level, prefs.mode);
}

function setMsg(text, cls = "") {
  if (!ui) { pendingMsg = { text, cls }; return; }
  ui.msg.textContent = text || ""; ui.msg.className = "msg" + (cls ? ` ${cls}` : "");
}

function refresh() {
  if (!ui) return;
  ui.root.classList.toggle("playing", G?.S.status === "active");
  ui.setup.box.hidden = !!edit;
  ui.editor.box.hidden = !edit;
  if (edit) { renderEditor(); return; }
  ui.fav.set(G ? G.S.puzzle.id : null, G?.S.puzzle.fav);
  if (!G) {
    ui.board.render({ values: Array(81).fill(0), given: Array(81).fill(false) });
    ui.pad.update(null);
    ui.badge.textContent = tr("партия не начата"); ui.errs.textContent = "";
    ui.root?.classList.remove("notes-on");
    ui.clearBtn.disabled = ui.giveUpBtn.disabled = true;
    ui.root.querySelector("#undoBtn").disabled = ui.root.querySelector("#redoBtn").disabled = true;
    if (pendingMsg) { setMsg(pendingMsg.text, pendingMsg.cls); pendingMsg = null; }
    else if (!ui.msg.textContent) setMsg(tr("Выбери уровень и нажми «Новая партия»."));
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
  ui.badge.textContent = `${LEVEL_NAME[p.level] || p.level} · ${showGrade ? tr("техника: {title}", { title: p.grade_title }) : tr("техника скрыта")} · ${S.mode}`;
  ui.errs.textContent = S.mode === "original" ? tr("Ошибки {n}/{limit}", { n: S.mistakes, limit: S.limit ?? "∞" }) : "";
  ui.errs.classList.toggle("bad", S.mode === "original" && S.mistakes > 0);
  ui.timer.textContent = fmtTime(G.elapsed());
  ui.timer.classList.toggle("done", S.status === "solved");
  // notes mode is visible at a glance: the toggle, a dashed board, pencil-style pad digits and a label above the pad
  ui.notesBtn.classList.toggle("on", !!S.notesMode);
  ui.notesBtn.setAttribute("aria-pressed", !!S.notesMode);
  ui.notesBtn.textContent = S.notesMode ? tr("✎ заметки: вкл") : tr("✎ заметки");
  ui.root.classList.toggle("notes-on", !!S.notesMode && !over);
  ui.clearBtn.disabled = ui.giveUpBtn.disabled = over;
  ui.root.querySelector("#undoBtn").disabled = over || !S.undo.length;
  ui.root.querySelector("#redoBtn").disabled = over || !S.redo.length;
  ui.autoBox.checked = S.autoNotes;
  if (S.msg) setMsg(S.msg.text, S.msg.cls);
  else if (!over) setMsg("");
}

/** The board as an editor of the grid being entered: its digits are the givens, repeats are red. */
function renderEditor() {
  const conf = conflicts(edit.vals);
  ui.fav.set(null);
  ui.board.render({ values: edit.vals, given: edit.vals.map(Boolean), sel: edit.sel, highlight: true,
    cellClass: i => (conf.has(i) ? ["bad"] : []) });
  ui.pad.update(null);
  ui.badge.textContent = tr("своя сетка · ввод условия");
  ui.errs.textContent = "";
  ui.timer.textContent = fmtTime(0);
  ui.timer.classList.remove("done");
  ui.root.classList.remove("notes-on");
  ui.clearBtn.disabled = ui.giveUpBtn.disabled = true;
  ui.root.querySelector("#undoBtn").disabled = ui.root.querySelector("#redoBtn").disabled = true;
  ui.editor.sync(conf);
}

function showResults() {
  if (!ui || !G?.S.result) { if (ui) ui.results.textContent = ""; return; }
  const r = G.S.result, p = G.S.puzzle;
  ui.results.textContent = "";
  ui.results.append(h("section", { id: "resultsCard" },
    h("h2", {}, tr("Итоги партии: "), statusLine(r)),
    h("p", { class: "hint" }, `${LEVEL_NAME[p.level] || p.level} · ${tr("техника: {title}", { title: p.grade_title })} · ${r.mode}`),
    metricsGrid(r),
    h("div", { class: "bar", style: "margin:0" },
      h("a", { class: "btn primary", href: `#/review/${r.id}`, id: "reviewLink" }, tr("Разбор пауз")),
      h("button", { type: "button", onclick: () => newGame(false) }, tr("Новая партия")))));
  if (matchMedia("(max-width: 820px)").matches) ui.results.scrollIntoView({ block: "nearest" });
}

async function endGame(status) {
  try {
    await G.finish(status);
  } catch (e) {
    setMsg(tr("Не удалось сохранить итог: {error}", { error: e.message }), "bad");
  }
  refresh();
  showResults();
  ui?.records.load();
  if (G.S.status === "solved" && G.S.result) showReward(G.S.result, G.S.puzzle, { onNew: () => newGame(false) });
}

let busy = false;
async function begin(getPuzzleFn, hideGrade) {
  if (busy) return;
  busy = true;
  ui?.setup.buttons.forEach(b => { b.disabled = true; });
  if (ui) ui.editor.startBtn.disabled = true;
  try {
    closeReward();
    if (G && G.S.status === "active") await G.finish("abandoned").catch(() => {});
    const puzzle = await getPuzzleFn();
    edit = null;
    const limit = prefs.mode === "original" ? (prefs.limit === "none" ? null : Number(prefs.limit)) : null;
    const { id } = await createGame(puzzle.id, prefs.mode, limit);
    meta = { hideGrade };
    digit = 0;
    G = startGame({
      puzzle, gameId: id, mode: prefs.mode, limit,
      onChange: refresh, onEnd: endGame,
      onQueueError: e => setMsg(tr("Ходы пока не отправлены: {error}. Повторю.", { error: e.message }), "bad"),
    });
    G.setAutoNotes(ui ? ui.autoBox.checked : true);
    markRecord();
    setMsg("");
    if (ui) ui.results.textContent = "";
    refresh();
  } catch (e) {
    setMsg(e.message, "bad");
  } finally {
    busy = false;
    ui?.setup.buttons.forEach(b => { b.disabled = false; });
    ui?.setup.syncFav();
    if (ui && edit) refresh();  // the server turned the grid down: the editor stays, start is clickable again
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

/** Ctrl+V of a grid: it opens in the editor, to look it over and pick the level; Enter starts it. */
export function loadCustom(text) {
  const givens = parseGrid(text);
  if (!givens) { setMsg(tr("Нужно ровно 81 клетку (цифры, 0 или . — пусто)"), "bad"); return; }
  openEditor(givens);
}

/** «✎ Своя сетка» (or a paste): the board turns into an editor, empty or with the pasted grid.
 * A game in progress is abandoned, after a yes in the dialog if it has moves. */
export function openEditor(givens = null) {
  if (asking) return;
  if (edit) {
    if (givens) { edit.vals = toDigits(givens); edit.sel = 0; }
    setMsg("");
    refresh();
    return;
  }
  const go = async () => {
    if (G?.S.status === "active") {
      G.S.msg = { text: tr("Партия брошена"), cls: "bad" };
      await G.finish("abandoned").catch(() => {});
    }
    edit = { vals: givens ? toDigits(givens) : Array(81).fill(0), sel: 0 };
    digit = 0;
    closeReward();
    setMsg("");
    if (ui) ui.results.textContent = "";
    markRecord();
    refresh();
  };
  if (G?.S.status === "active" && G.S.seq > 0) {
    asking = confirmDialog({
      title: tr("Бросить партию?"), text: tr("Партия запишется как брошенная."), ok: tr("Бросить"),
      onOk: go, onClose: () => { asking = null; },
    });
  } else go();
}

/** «Отмена» or Esc in the editor: back to the board as it was (the last game's results, if any). */
function closeEditor() {
  edit = null;
  ui?.setup.sync();  // the editor's own mode/limit fields may have changed the prefs
  setMsg("");
  markRecord();
  refresh();
  showResults();
}

/** A digit (0 = empty) into the selected cell; typed ones move on, so a row of the grid can be typed straight through. */
function editCell(v, advance) {
  if (edit.sel < 0) edit.sel = 0;
  edit.vals[edit.sel] = v;
  if (advance) edit.sel = (edit.sel + 1) % 81;
  setMsg("");
  refresh();
}

function startCustom() {
  if (busy || conflicts(edit.vals).size || edit.vals.filter(Boolean).length < 17) return;
  const givens = edit.vals.join("");
  return begin(() => addPuzzle(givens, prefs.customLevel), false);
}

function editorKey(e) {
  if (e.ctrlKey || e.metaKey) return;  // Ctrl+V goes to the paste handler
  const d = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  if (d) editCell(+d[1], true);
  else if (e.key === "Delete") editCell(0, false);
  else if (e.key === "Backspace") {  // like a text field: on an empty cell it erases the one before
    if (!edit.vals[edit.sel]) edit.sel = (edit.sel + 80) % 81;
    editCell(0, false);
  } else if (e.key.startsWith("Arrow")) { edit.sel = stepCell(edit.sel, e.key); refresh(); }
  else if (e.key === "Enter") startCustom();
  else return;
  e.preventDefault();
}

/** Digit from the pad or keyboard: highlight it on the board, then place it (or toggle the note). */
function press(v, asNote) {
  if (edit) { editCell(v, false); return; }
  if (!G) return;
  digit = v;
  G.input(v, asNote);
  refresh();
}

/** Esc on «Играть» (app.js): a game in progress is thrown away only after a yes in the dialog. */
export function escape() {
  if (!ui || asking) return;
  if (edit) { closeEditor(); return; }
  if (G?.S.status !== "active") return;
  asking = confirmDialog({
    title: tr("Бросить партию?"), text: tr("Партия запишется как брошенная."), ok: tr("Бросить"),
    onOk: () => { if (G?.S.status !== "active") return; G.S.msg = { text: tr("Партия брошена"), cls: "bad" }; endGame("abandoned"); },
    onClose: () => { asking = null; },
  });
}

function handleKey(e) {
  if (asking) return;  // the dialog has the keyboard
  if (ignoreKey(e)) return;
  if (e.altKey) { keyTrace.skip = tr("зажат Alt"); return; }
  if (edit) { editorKey(e); return; }
  if (!G) {  // no game yet (e.g. after a page reload): say so instead of silently ignoring the key
    keyTrace.skip = tr("партия не начата");
    if (e.key === "Enter" && e.target === document.body) { newGame(false); e.preventDefault(); return; }
    if (/^(?:Digit|Numpad)[1-9]$/.test(e.code)) {
      setMsg(tr("Партия не начата — нажми «Новая партия» или Enter."), "bad"); e.preventDefault();
    }
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey))) { G.redoLast(); e.preventDefault(); return; }
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
