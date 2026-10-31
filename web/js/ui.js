// Small shared UI helpers: element builder, labels, metrics card, favourite star, zen mode, theme.
import { setFavorite } from "./api.js";
import { THEMES, loadPrefs, palette, savePrefs } from "./appearance.js";
import { fmtTime } from "./board.js";

export const LEVEL_NAME = { easy: "лёгкий", medium: "средний", hard: "сложный", expert: "эксперт", custom: "своя сетка",
                            random: "🎲 случайный" };
export const MODE_NAME = { original: "original", hardcore: "hardcore" };
export const STATUS_NAME = { active: "идёт", solved: "решено", failed: "провал", abandoned: "брошена" };
export const TIER_NAME = { 1: "Одиночки", 2: "Блок и линия", 3: "Пары", 4: "Крылья" };

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** h("div", {class: "x", onclick}, child, "text", ...) */
export function h(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false)
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}

// Keys typed into a text field are not game input; checkboxes, buttons and selects are not text fields.
export function typingInto(e) {
  const el = e.target;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "range"].includes(el.type);
}

// Whether a keydown is not meant for the board. A digit typed while a select still has focus (Firefox keeps it
// focused when the same option is picked again) goes to the board, and the select lets go of focus.
export function ignoreKey(e) {
  keyTrace.skip = null;
  if (typingInto(e)) {
    keyTrace.skip = e.target.isContentEditable ? "страница редактируемая (contentEditable)" : "фокус в поле ввода";
    return true;
  }
  if (e.target.tagName !== "SELECT") return false;
  if (!/^(?:Digit|Numpad)\d$/.test(e.code)) { keyTrace.skip = "фокус на выпадающем списке"; return true; }
  e.target.blur();
  return false;
}

/** A yes/no question over the page. Enter confirms, Esc or a click outside cancels, and no key reaches the page
 *  underneath while it is open. Returns close(), so a page can drop the dialog when it unmounts. */
export function confirmDialog({ title, text, ok, cancel = "Продолжить", onOk, onClose = () => {} }) {
  const okBtn = h("button", { type: "button", class: "danger", id: "confirmOk" }, ok);
  const card = h("div", { class: "confirm-card", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "confirmTitle", tabindex: "-1" },
    h("h2", { id: "confirmTitle" }, title),
    text && h("p", { class: "hint", style: "margin:0" }, text),
    h("div", { class: "bar" }, h("button", { type: "button", id: "confirmCancel", onclick: () => close() }, cancel), okBtn),
    h("p", { class: "hint", style: "margin:0" }, h("kbd", {}, "Enter"), ` — ${ok.toLowerCase()}, `, h("kbd", {}, "Esc"), ` — ${cancel.toLowerCase()}`));
  const overlay = h("div", { class: "confirm", id: "confirm", onclick: e => { if (e.target === overlay) close(); } }, card);
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    window.removeEventListener("keydown", onKey, true);
    overlay.remove();
    onClose();
  };
  const onKey = e => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Enter") { e.preventDefault(); close(); onOk(); }
  };
  okBtn.onclick = () => { close(); onOk(); };
  window.addEventListener("keydown", onKey, true);
  document.body.append(overlay);
  card.focus();
  return close;
}

/** What the page keyboard handler did with the last key — shown by the ?debug key log. */
export const keyTrace = { page: null, skip: null };

export const sec = ms => ms === null || ms === undefined ? "—" : `${(ms / 1000).toFixed(1)} с`;
export const pct = x => x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`;
export const dateRu = iso => iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit",
  hour: "2-digit", minute: "2-digit" }) : "—";

/** Metrics tiles for a finished game (finish response or game row). */
export function metricsGrid(g) {
  const items = [
    ["Время", fmtTime(g.time_ms)],
    ["До первого хода", fmtTime(g.first_move_ms)],
    ["Макс. пауза", fmtTime(g.max_pause_ms)],
    ["Пауз > 20 с", g.long_pauses ?? "—"],
    ["Ошибки", g.mistakes ?? "—"],
    ["Исправления", g.corrections ?? "—"],
    ["Проверки", g.checks ?? "—"],
  ];
  return h("div", { class: "metrics" }, items.map(([k, v]) => h("div", { class: "metric" }, h("b", {}, v), h("span", {}, k))));
}

export function statusLine(g) {
  const txt = g.status === "failed" && g.mode === "original" && g.mistake_limit !== null && g.mistakes >= g.mistake_limit
    ? `провал: лимит ошибок ${g.mistakes}/${g.mistake_limit}` : STATUS_NAME[g.status] || g.status;
  return h("span", { class: `status-${g.status}` }, txt);
}

export function errorBox(e) {
  return h("p", { class: "msg bad", role: "alert" }, e?.message || String(e));
}

/** ☆/★ toggle for one puzzle or drill. set(id, fav) when a new one is shown; toggle() is also bound to F.
 *  onChange({fav, counts}) after the server stored it. label: show «в избранное» next to the star. */
export function createFav(kind, { onChange, label = false } = {}) {
  let id = null, fav = false, busy = false;
  const el = h("button", { type: "button", class: "fav", id: `fav-${kind}`, onclick: () => toggle() });
  const paint = () => {
    el.hidden = id === null;
    el.textContent = (fav ? "★" : "☆") + (label ? (fav ? " в избранном" : " в избранное") : "");
    el.classList.toggle("on", fav);
    el.setAttribute("aria-pressed", fav);
    el.title = fav ? "Убрать из избранного (F)" : "Добавить в избранное (F)";
  };
  async function toggle() {
    if (id === null || busy) return;
    busy = true;
    const target = id;
    try {
      const r = await setFavorite(kind, target, !fav);
      if (id === target) fav = r.fav;
      onChange?.(r);
    } catch (e) {
      el.title = e.message;
    } finally { busy = false; paint(); }
  }
  paint();
  return { el, toggle, set(newId, isFav) { if (newId === id) return; id = newId; fav = !!isFav; paint(); } };
}

// Zen mode (as on lichess): on the play and drills pages only the board, its timer and the controls stay.
// The router marks those pages with body.zen-page; Z toggles, Esc leaves; the choice is remembered.
const ZEN_KEY = "gym-zen";
export const isZen = () => document.body.classList.contains("zen");
function paintZen(b) {
  const on = isZen();
  b.textContent = on ? "✕ zen" : "☯ zen";
  b.title = on ? "Выйти из zen-режима (Z или Esc)" : "Zen-режим: только доска (Z)";
  b.setAttribute("aria-pressed", on);
}
export function setZen(on) {
  document.body.classList.toggle("zen", on);
  try { localStorage.setItem(ZEN_KEY, on ? "1" : "0"); } catch { /* no storage */ }
  for (const b of document.querySelectorAll(".zen-btn")) paintZen(b);
}
export function initZen() {
  let on = false;
  try { on = localStorage.getItem(ZEN_KEY) === "1"; } catch { /* no storage */ }
  document.body.classList.toggle("zen", on);
}
export function zenButton(extraClass = "") {
  const b = h("button", { type: "button", class: `zen-btn ${extraClass}`.trim(), onclick: () => setZen(!isZen()) });
  paintZen(b);
  return b;
}

// Header theme switch: auto (system) → light → dark, through the same look settings as #/settings (js/appearance.js).
// A preset or own theme from #/settings is shown by name; the next press goes to light or dark, whichever it is not.
const QUICK = ["auto", "light", "dark"];
export function themeButton() {
  const b = h("button", { type: "button", class: "theme-toggle", id: "themeBtn" });
  const sync = () => {
    const prefs = loadPrefs(), t = THEMES.find(x => x.id === prefs.theme);
    const icon = prefs.theme === "auto" ? "◐" : palette(prefs).dark ? "☾" : "☀";
    b.textContent = `${icon} ${prefs.theme === "auto" ? "авто" : t.name.toLowerCase()}`;
    b.title = `Тема: ${t.name}. Нажми, чтобы сменить (авто → светлая → тёмная)`;
  };
  b.onclick = () => {
    const prefs = loadPrefs(), k = QUICK.indexOf(prefs.theme);
    const theme = k >= 0 ? QUICK[(k + 1) % QUICK.length] : palette(prefs).dark ? "light" : "dark";
    savePrefs({ ...prefs, theme });
    sync();
  };
  sync();
  return Object.assign(b, { sync });
}

/** Two-column pages: move the side column down so its top lines up with the board's top border (desktop only).
 *  What sits above the board (timer row, column numbers, the drill's task) varies, so it is measured. */
export function alignSideToBoard(layout) {
  const wide = matchMedia("(min-width: 821px)");  // same breakpoint as the one-column layout in style.css
  const sync = () => {
    const grid = layout.querySelector(".main-col .grid");
    const off = wide.matches && grid ? grid.getBoundingClientRect().top - layout.getBoundingClientRect().top : 0;
    layout.style.setProperty("--side-offset", `${Math.max(0, Math.round(off))}px`);
  };
  const ro = new ResizeObserver(sync);
  ro.observe(layout.querySelector(".main-col"));
  wide.addEventListener("change", sync);
  sync();
  return () => { ro.disconnect(); wide.removeEventListener("change", sync); };
}
