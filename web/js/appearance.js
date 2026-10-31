// Look settings (theme, font, digit sizes, side of the panel on board pages, board highlights): kept in localStorage,
// applied as CSS variables and data-theme / data-side on <html>; highlights are read by board.js on each render.
// index.html re-applies the last result from BOOT_KEY before first paint, so a page load never flashes the default look.
import { tr } from "./i18n.js";
const KEY = "gym-appearance";
const BOOT_KEY = "gym-appearance-boot";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const FONTS = [
  { id: "jetbrains", name: "JetBrains Mono", mono: true },
  { id: "roboto-mono", name: "Roboto Mono", mono: true },
  { id: "fira-code", name: "Fira Code", mono: true },
  { id: "source-code-pro", name: "Source Code Pro", mono: true },
  { id: "ibm-plex-mono", name: "IBM Plex Mono", mono: true },
  { id: "ubuntu-mono", name: "Ubuntu Mono", mono: true },
  { id: "inter", name: "Inter" },
  { id: "nunito", name: "Nunito" },
  { id: "montserrat", name: "Montserrat" },
  { id: "comfortaa", name: "Comfortaa" },
  { id: "system", name: tr("Системный"), stack: SANS },
];
export const fontStack = f => f.stack || `"${f.name}", ${f.mono ? MONO : SANS}`;

// A palette is 9 base colours; the other tokens (lines, highlights, tinted backgrounds) are mixed from them.
export const BASE = ["bg", "surface", "ink", "muted", "accent", "user", "bad", "ok", "other"];
export const BASE_NAME = { bg: tr("фон"), surface: tr("поверхность"), ink: tr("текст и данные"), muted: tr("приглушённый"), accent: tr("акцент"),
                           user: tr("мои цифры"), bad: tr("ошибка"), ok: tr("верно"), other: tr("другая техника") };
// light/dark are the stylesheet's own tokens (applied by data-theme only); their base colours are listed for previews
// and as the starting point of a custom theme.
export const THEMES = [
  { id: "auto", name: tr("Как в системе") },
  { id: "light", name: tr("Светлая"), builtin: true,
    bg: "#f6f5f1", surface: "#ffffff", ink: "#1d1d1b", muted: "#6b6a66", accent: "#2456a6", user: "#2456a6", bad: "#c0392b", ok: "#1f7a4a", other: "#8a5a00" },
  { id: "dark", name: tr("Тёмная"), builtin: true, dark: true,
    bg: "#161614", surface: "#1f1f1d", ink: "#ecebe6", muted: "#9a9890", accent: "#8db6f0", user: "#8db6f0", bad: "#ff7a6b", ok: "#5fd08f", other: "#f0c060" },
  { id: "serika", name: "serika dark", dark: true,
    bg: "#323437", surface: "#2c2e31", ink: "#d1d0c5", muted: "#7e8083", accent: "#e2b714", user: "#e2b714", bad: "#ca4754", ok: "#8fbf6b", other: "#e0954c" },
  { id: "carbon", name: "carbon", dark: true,
    bg: "#313131", surface: "#2a2a2a", ink: "#f5e6c8", muted: "#8e8a83", accent: "#f66e0d", user: "#f66e0d", bad: "#e05c5c", ok: "#8fc46b", other: "#d9b44a" },
  { id: "8008", name: "8008", dark: true,
    bg: "#333a45", surface: "#2c323b", ink: "#e9ecf0", muted: "#939eae", accent: "#f44c7f", user: "#f44c7f", bad: "#ff6b5b", ok: "#6fd18c", other: "#f4c04c" },
  { id: "nord", name: "nord", dark: true,
    bg: "#2e3440", surface: "#3b4252", ink: "#eceff4", muted: "#9aa5b8", accent: "#88c0d0", user: "#88c0d0", bad: "#bf616a", ok: "#a3be8c", other: "#ebcb8b" },
  { id: "dracula", name: "dracula", dark: true,
    bg: "#282a36", surface: "#303241", ink: "#f8f8f2", muted: "#8f97c4", accent: "#bd93f9", user: "#8be9fd", bad: "#ff5555", ok: "#50fa7b", other: "#f1fa8c" },
  { id: "gruvbox", name: "gruvbox", dark: true,
    bg: "#282828", surface: "#32302f", ink: "#ebdbb2", muted: "#a89984", accent: "#fabd2f", user: "#83a598", bad: "#fb4934", ok: "#b8bb26", other: "#fe8019" },
  { id: "solarized", name: "solarized light",
    bg: "#fdf6e3", surface: "#fffbef", ink: "#073642", muted: "#657b83", accent: "#268bd2", user: "#268bd2", bad: "#dc322f", ok: "#859900", other: "#b58900" },
  { id: "paper", name: "paper",
    bg: "#eeeeee", surface: "#f8f8f8", ink: "#333333", muted: "#7a7a7a", accent: "#444444", user: "#3b6fb6", bad: "#c94040", ok: "#3d8b4f", other: "#a06a00" },
  { id: "custom", name: tr("Своя") },
];
export const SCALE = { min: 0.8, max: 1.4, step: 0.05 };
// highlights on the board around the selected cell / digit; each can be switched off
export const HINTS = [
  { id: "peers", name: tr("ряд, столбец и блок выбранной клетки") },
  { id: "same", name: tr("та же цифра в клетках") },
  { id: "notes", name: tr("та же цифра в кандидатах") },
  { id: "labels", name: tr("номер ряда и столбца у края") },
];
const ALL_HINTS = Object.fromEntries(HINTS.map(x => [x.id, true]));
export const DEFAULTS = { theme: "auto", font: "jetbrains", digit: 1, notes: 1, side: "right", hints: ALL_HINTS, custom: null };
export const SIDES = [{ id: "left", name: tr("← слева") }, { id: "right", name: tr("справа →") }];

const HEX = /^#[0-9a-f]{6}$/i;
const clampScale = v => Number.isFinite(+v) ? Math.min(SCALE.max, Math.max(SCALE.min, +v)) : 1;
function validCustom(c) {
  if (!c || typeof c !== "object") return null;
  return BASE.every(k => HEX.test(c[k])) ? { dark: !!c.dark, ...Object.fromEntries(BASE.map(k => [k, c[k]])) } : null;
}

export function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { /* no storage */ }
  const custom = validCustom(p.custom);
  let theme = THEMES.some(t => t.id === p.theme) ? p.theme : DEFAULTS.theme;
  if (theme === "custom" && !custom) theme = DEFAULTS.theme;
  return { theme, custom, font: FONTS.some(f => f.id === p.font) ? p.font : DEFAULTS.font,
           digit: clampScale(p.digit ?? 1), notes: clampScale(p.notes ?? 1), side: p.side === "left" ? "left" : "right",
           hints: Object.fromEntries(HINTS.map(x => [x.id, p.hints?.[x.id] !== false])) };
}

let hints = ALL_HINTS;
/** Board highlights now in force: {peers, same, notes, labels}. */
export const hintPrefs = () => hints;

const systemDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches;
/** The palette actually on screen: {dark, bg, surface, ...}. */
export function palette(prefs) {
  if (prefs.theme === "custom" && prefs.custom) return prefs.custom;
  const id = prefs.theme === "auto" ? (systemDark() ? "dark" : "light") : prefs.theme;
  return THEMES.find(t => t.id === id);
}

const mix = (c, pct, base = "var(--surface)") => `color-mix(in srgb, ${c} ${pct}%, ${base})`;
function paletteVars(p) {
  return {
    ...Object.fromEntries(BASE.map(k => [`--${k}`, p[k]])),
    "--given": p.ink, "--line": mix(p.ink, 20), "--line-strong": mix(p.ink, 85), "--peer": mix(p.ink, 7),
    "--same": mix(p.accent, 40), "--sel": mix(p.accent, 55), "--bad-bg": mix(p.bad, 22), "--ok-bg": mix(p.ok, 22),
    "--other-bg": mix(p.other, 22), "--unit": mix(p.other, 13), "--accent-ink": p.dark ? p.bg : "#ffffff",
  };
}

export function applyPrefs(prefs) {
  const root = document.documentElement, font = FONTS.find(f => f.id === prefs.font) || FONTS[0];
  hints = { ...ALL_HINTS, ...prefs.hints };
  root.style.cssText = "";
  const vars = { "--font": fontStack(font), "--font-mono": font.mono ? fontStack(font) : fontStack(FONTS[0]),
                 "--digit-scale": prefs.digit, "--note-scale": prefs.notes };
  let attr = null;
  if (prefs.theme !== "auto") {
    const p = palette(prefs);
    attr = p.dark ? "dark" : "light";  // also picks the stylesheet's chart colours and color-scheme
    if (!p.builtin) Object.assign(vars, paletteVars(p));
  }
  if (attr) root.dataset.theme = attr; else delete root.dataset.theme;
  root.dataset.side = prefs.side;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, String(v));
  try { localStorage.setItem(BOOT_KEY, JSON.stringify({ theme: attr, side: prefs.side, style: root.style.cssText })); } catch { /* ignore */ }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  applyPrefs(prefs);
}

export const initAppearance = () => applyPrefs(loadPrefs());
