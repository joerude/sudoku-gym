// Small shared UI helpers: element builder, labels, metrics card.
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
  if (typingInto(e)) return true;
  if (e.target.tagName !== "SELECT") return false;
  if (!/^(?:Digit|Numpad)\d$/.test(e.code)) return true;
  e.target.blur();
  return false;
}

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
