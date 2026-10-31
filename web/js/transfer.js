// Moving the look (appearance prefs + language) and the starred puzzles and drills to another browser or machine:
// one JSON file. Import replaces the look, only adds favourites, and leaves out what the file does not have.
import { LANGS, lang, setLang, tr } from "./i18n.js";
import { exportFavorites, importFavorites } from "./api.js";
import { loadPrefs, normalizePrefs, savePrefs } from "./appearance.js";
import { confirmDialog, h } from "./ui.js";

const APP = "sudoku-gym", VERSION = 1;

/** The file's contents for what is stored now. */
async function buildExport() {
  return { app: APP, version: VERSION, exported_at: new Date().toISOString(),
           appearance: loadPrefs(), lang, favorites: await exportFavorites() };
}

/** {appearance, lang, favorites} from the file text, each null when absent or unusable; throws on a foreign file. */
export function parseImport(text) {
  let d = null;
  try { d = JSON.parse(text); } catch { /* not JSON */ }
  if (!d || typeof d !== "object" || d.app !== APP) throw new Error(tr("Это не файл настроек Sudoku Gym"));
  const fav = d.favorites && typeof d.favorites === "object" ? d.favorites : null;
  return {
    appearance: d.appearance && typeof d.appearance === "object" ? normalizePrefs(d.appearance) : null,
    lang: LANGS.some(l => l.id === d.lang) ? d.lang : null,
    favorites: fav && { puzzles: Array.isArray(fav.puzzles) ? fav.puzzles : [], drills: Array.isArray(fav.drills) ? fav.drills : [] },
  };
}

/** «Перенос настроек» section. onLook(prefs) — the look was replaced by an import. */
export function transferSection({ onLook }) {
  const msg = h("p", { class: "msg", id: "transferMsg", role: "status" });
  const say = (text, cls = "") => { msg.textContent = text; msg.className = `msg ${cls}`; };

  function download(data) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = h("a", { href: url, download: `sudoku-gym-settings-${new Date().toLocaleDateString("sv")}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(tr("Сохранено: вид, язык и избранное ({p} задач, {d} упражнений)",
      { p: data.favorites.puzzles.length, d: data.favorites.drills.length }), "ok");
  }

  async function apply(d) {
    if (d.favorites) {
      const r = await importFavorites(d.favorites);
      say(tr("Избранное: добавлено {added}, не найдено {missing}", r), r.missing ? "other" : "ok");
    } else say(tr("Вид применён"), "ok");
    if (d.appearance) { savePrefs(d.appearance); onLook(d.appearance); }
    if (d.lang && d.lang !== lang) setLang(d.lang);  // reloads the page: last
  }

  function ask(text) {
    const d = parseImport(text);
    const parts = [];
    if (d.appearance) parts.push(tr("вид будет заменён"));
    if (d.lang && d.lang !== lang) parts.push(tr("язык сменится, страница перезагрузится"));
    if (d.favorites) parts.push(tr("в избранное добавится до {p} задач и {d} упражнений",
      { p: d.favorites.puzzles.length, d: d.favorites.drills.length }));
    if (!parts.length) throw new Error(tr("В файле нечего импортировать"));
    confirmDialog({ title: tr("Импортировать настройки?"), text: parts.join("; "), ok: tr("Импортировать"), cancel: tr("Отмена"),
      onOk: () => apply(d).catch(e => say(e.message, "bad")) });
  }

  const file = h("input", { type: "file", id: "importFile", accept: ".json,application/json", hidden: true, onchange: () => {
    const f = file.files[0];
    file.value = "";  // the same file can be picked again
    if (f) f.text().then(ask).catch(e => say(e.message, "bad"));
  } });
  return h("section", {}, h("h2", {}, tr("Перенос настроек")),
    h("p", { class: "hint" }, tr("Файл с видом, языком и избранным — для другого браузера или компьютера. Импорт заменяет вид и только добавляет в избранное.")),
    h("div", { class: "bar" },
      h("button", { type: "button", id: "exportBtn", onclick: () => buildExport().then(download).catch(e => say(e.message, "bad")) },
        tr("⬇ Экспорт")),
      h("button", { type: "button", id: "importBtn", onclick: () => file.click() }, tr("⬆ Импорт")), file),
    msg);
}
