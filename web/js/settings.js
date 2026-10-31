// #/settings — look: colour theme (presets + own colours), font, digit and candidate size, with a live sample board.
import { BASE, BASE_NAME, DEFAULTS, FONTS, SCALE, THEMES, fontStack, loadPrefs, palette, savePrefs } from "./appearance.js";
import { computeCandidates, createBoard, toDigits } from "./board.js";
import { h } from "./ui.js";

const GIVENS = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
// sample state: a few right digits, one wrong (r2c3), r1c3 selected so the 4s light up
const ENTERED = { 2: 4, 3: 6, 10: 7, 11: 3, 19: 8, 28: 5, 37: 2 };
const SAMPLE_SEL = 2;

function sampleView() {
  const values = toDigits(GIVENS), given = values.map(Boolean);
  for (const [i, v] of Object.entries(ENTERED)) values[i] = v;
  const cands = computeCandidates(values);
  return {
    values, given, sel: SAMPLE_SEL, highlight: true,
    notes: i => (i < 27 ? cands[i] : null),
    cellClass: i => (!given[i] && values[i] && values[i] !== +SOLUTION[i] ? ["bad"] : []),
  };
}

const pctLabel = v => `${Math.round(v * 100)}%`;

export function mount(el) {
  let prefs = loadPrefs();
  const set = patch => { prefs = { ...prefs, ...patch }; savePrefs(prefs); refresh(); };

  const themeBtns = THEMES.map(t => h("button", { type: "button", "data-theme-id": t.id, class: "theme-btn",
    onclick: () => (t.id === "custom" && !prefs.custom ? startCustom() : set({ theme: t.id })) }, h("span", {}, t.name)));
  // each button wears its own palette; "Как в системе" and an unset own theme stay in the page's colours
  function paintThemeBtn(b, p) {
    b.style.cssText = p ? `background:${p.bg};color:${p.ink};border-color:${p.muted}` : "";
    b.querySelector(".dots")?.remove();
    if (p) b.append(h("span", { class: "dots" }, ["accent", "user", "bad", "ok"].map(k => h("i", { style: `background:${p[k]}` }))));
  }

  const colorInputs = {};
  const darkBox = h("input", { type: "checkbox", id: "customDark", onchange: () => editCustom({ dark: darkBox.checked }) });
  const colorRows = BASE.map(k => {
    colorInputs[k] = h("input", { type: "color", "data-key": k, oninput: e => editCustom({ [k]: e.target.value }) });
    return h("label", { class: "color-row" }, colorInputs[k], h("span", {}, BASE_NAME[k]));
  });
  // editing any colour turns the theme on screen into the own theme, starting from what is shown now
  function startCustom(patch = {}) {
    const base = palette(prefs);
    set({ theme: "custom", custom: { dark: !!base.dark, ...Object.fromEntries(BASE.map(k => [k, base[k]])), ...patch } });
  }
  function editCustom(patch) {
    if (prefs.theme === "custom" && prefs.custom) set({ custom: { ...prefs.custom, ...patch } });
    else startCustom(patch);
  }

  const fontBtns = FONTS.map(f => h("button", { type: "button", class: "font-btn", "data-font": f.id, style: `font-family:${fontStack(f)}`,
    onclick: () => set({ font: f.id }) }, h("b", {}, "123"), h("span", {}, f.name)));

  const slider = (key, label) => {
    const out = h("output", {});
    const input = h("input", { type: "range", id: `${key}Scale`, min: SCALE.min, max: SCALE.max, step: SCALE.step,
      oninput: e => set({ [key]: +e.target.value }) });
    return { input, out, row: h("label", { class: "field range" }, h("span", {}, label, " ", out), input) };
  };
  const digitS = slider("digit", "Цифры в клетках"), notesS = slider("notes", "Кандидаты");

  const preview = h("div", { id: "lookBoard" });
  el.append(h("h1", {}, "Вид"),
    h("div", { class: "look" },
      h("div", { class: "look-preview" }, preview,
        h("p", { class: "hint", style: "margin:8px 0 0" }, "Пример: выбрана r1c3, ошибка в r2c3, кандидаты в верхних рядах.")),
      h("div", {},
        h("section", {}, h("h2", {}, "Тема"), h("div", { class: "theme-grid", id: "themes" }, themeBtns)),
        h("section", {}, h("h2", {}, "Свои цвета"),
          h("p", { class: "hint" }, "Любое изменение цвета создаёт тему «Своя» на основе текущей."),
          h("div", { class: "color-grid", id: "customColors" }, colorRows),
          h("label", { class: "check", style: "margin-top:8px" }, darkBox, "тёмная (графики и полосы прокрутки)")),
        h("section", {}, h("h2", {}, "Шрифт"), h("div", { class: "font-grid", id: "fonts" }, fontBtns)),
        h("section", {}, h("h2", {}, "Размер"), digitS.row, notesS.row),
        h("button", { type: "button", id: "lookReset", onclick: () => set({ ...DEFAULTS, custom: prefs.custom }) }, "Сбросить вид"))));

  const board = createBoard(preview, { interactive: false });
  board.render(sampleView());

  function refresh() {
    themeBtns.forEach((b, k) => {
      const t = THEMES[k];
      b.classList.toggle("on", prefs.theme === t.id);
      paintThemeBtn(b, t.id === "auto" ? null : t.id === "custom" ? prefs.custom : t);
    });
    const p = palette(prefs);
    for (const k of BASE) colorInputs[k].value = p[k];
    darkBox.checked = !!p.dark;
    fontBtns.forEach(b => b.classList.toggle("on", b.dataset.font === prefs.font));
    for (const [s, key] of [[digitS, "digit"], [notesS, "notes"]]) { s.input.value = prefs[key]; s.out.textContent = pctLabel(prefs[key]); }
  }
  refresh();
  // "Как в системе" follows the OS switch live; the colour pickers should too
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onScheme = () => { if (prefs.theme === "auto") refresh(); };
  mq?.addEventListener("change", onScheme);
  return () => mq?.removeEventListener("change", onScheme);
}
