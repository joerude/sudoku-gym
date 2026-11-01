// Sudoku Gym end-to-end check (plain node script, no test runner).
//   node tests/e2e/gym.spec.mjs [screenshot-dir]
// Starts server.py on a free port against a TEMP copy of data/sudoku.db, drives Chromium through every page,
// prints PASS/FAIL lines and exits non-zero on any failure or console/page error.
// Env: PLAYWRIGHT_CORE (dir of playwright-core's node_modules), CHROME (executable), SHOTS (screenshot dir).
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRATCH = "/tmp/claude-1000/-home-joerude-Desktop-sudoku-tutor-mentor-rus/eb1bf9c6-5de8-4277-b49d-66d9d7f9cdc9/scratchpad";
const NM = [process.env.PLAYWRIGHT_CORE, `${SCRATCH}/node_modules`, path.join(ROOT, "node_modules"),
  "/home/joerude/.npm-global/lib/node_modules/rea-agents/node_modules"].filter(Boolean)
  .find(d => existsSync(path.join(d, "playwright-core")));
if (!NM) { console.log("FAIL playwright-core not found (set PLAYWRIGHT_CORE)"); process.exit(2); }
const { chromium, firefox } = createRequire(path.join(NM, "noop.js"))("playwright-core");
// BROWSER=firefox runs the same checks in Playwright's Firefox build (`playwright-core install firefox`)
const BROWSER = process.env.BROWSER || "chromium";
const CHROME = process.env.CHROME || "/home/joerude/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const SHOTS = process.argv[2] || process.env.SHOTS || SCRATCH;
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${!cond && extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
  return cond;
};

// --- temp DB + server ---------------------------------------------------------------------
const tmp = mkdtempSync(path.join(existsSync(SCRATCH) ? SCRATCH : tmpdir(), "gym-e2e-"));
const DB = path.join(tmp, "gym.db");
const py = (code, ...args) => execFileSync("python3", ["-c", code, ...args], { cwd: ROOT, encoding: "utf-8" });
py(`import sqlite3, sys
src = sqlite3.connect("file:data/sudoku.db?mode=ro", uri=True); dst = sqlite3.connect(sys.argv[1])
src.backup(dst)
# a few finished games on earlier days so the daily chart has >= 2 days
pid = dst.execute("SELECT id FROM puzzles WHERE level='medium' LIMIT 1").fetchone()[0]
for day, mode, ms in [("2026-10-25", "hardcore", 470000), ("2026-10-26", "hardcore", 430000), ("2026-10-27", "hardcore", 400000),
                      ("2026-10-26", "original", 380000), ("2026-10-27", "original", 350000)]:
    dst.execute("INSERT INTO games (puzzle_id, mode, mistake_limit, started_at, finished_at, status, time_ms, mistakes,"
                " corrections, checks, note_actions, first_move_ms, max_pause_ms, long_pauses)"
                " VALUES (?, ?, NULL, ?, ?, 'solved', ?, 1, 0, 0, 0, 9000, 40000, 2)",
                (pid, mode, day + "T10:00:00+00:00", day + "T10:08:00+00:00", ms))
dst.commit(); dst.close(); src.close()`, DB);

const server = spawn("python3", ["server.py", "--port", "0", "--db", DB], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
let serverErr = "";
server.stderr.on("data", d => { serverErr += d; });
const BASE = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("server did not start")), 15000);
  server.stdout.on("data", d => {
    const m = /http:\/\/([\d.]+):(\d+)\//.exec(String(d));
    if (m) { clearTimeout(t); resolve(`http://${m[1]}:${m[2]}`); }
  });
  server.on("exit", c => reject(new Error(`server exited ${c}: ${serverErr}`)));
});
const api = async (p, opts) => (await fetch(BASE + p, opts)).json();
const post = (p, body) => api(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const dbJson = (sql, ...args) => JSON.parse(py(`import sqlite3, sys, json
c = sqlite3.connect(sys.argv[1]); print(json.dumps(c.execute(sys.argv[2], sys.argv[3:]).fetchall()))`, DB, sql, ...args.map(String)));

const browser = BROWSER === "firefox" ? await firefox.launch() : await chromium.launch({ executablePath: CHROME });
const problems = [];
async function newPage(viewport, extra = {}) {
  if (BROWSER === "firefox") delete extra.isMobile;  // not supported by Playwright's Firefox
  const ctx = await browser.newContext({ viewport, locale: "ru-RU", ...extra });  // the UI follows the browser language
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
  return page;
}
const shot = (page, name, full = true) => page.screenshot({ path: path.join(SHOTS, `gym-${name}.png`), fullPage: full });

const cellSel = i => `#board .cell[data-cell="${i}"]`;

async function setSelect(page, id, value) { await page.selectOption(`#${id}`, value); }
/** «⚙ Настройки» on #/play is folded by default: open it before touching level, technique, mode or limit. */
const openSetup = page => page.evaluate(() => { document.querySelector("#setupMore").open = true; });

/** Run action (a click / paste), wait for the POST /api/games it causes and for the board to show the givens. */
async function waitGame(page, action) {
  const resp = page.waitForResponse(r => r.url().endsWith("/api/games") && r.request().method() === "POST", { timeout: 15000 });
  await action();
  const { id } = await (await resp).json();
  const g = await api(`/api/games/${id}`);
  await page.waitForFunction(givens => [...document.querySelectorAll("#board .cell")]
    .map(c => c.textContent.trim() || "0").join("") === givens, g.givens);
  return g;
}

async function startGame(page, { level, mode, limit, grade }) {
  await openSetup(page);
  if (level) await setSelect(page, "level", level);
  if (grade !== undefined) await setSelect(page, "grade", grade);
  if (mode) await setSelect(page, "mode", mode);
  if (limit === "none") await page.check("#noLimit");
  else if (limit) { await page.uncheck("#noLimit"); await page.fill("#limit", limit); await page.dispatchEvent("#limit", "change"); }
  return waitGame(page, () => page.click("#newGame"));
}
const typeAt = async (page, i, v) => { await page.click(cellSel(i)); await page.keyboard.press(String(v)); };

try {
  const page = await newPage({ width: 1100, height: 900 });

  // --- 1. hardcore game solved by typing the solution -----------------------------------
  await page.goto(`${BASE}/#/play`);
  await page.waitForSelector("#grade option[value=\"1\"]", { state: "attached" });
  const g1 = await startGame(page, { level: "easy", mode: "hardcore", grade: "" });
  ok(g1.mode === "hardcore" && g1.mistake_limit === null, "hardcore game created");
  const empties = [...g1.givens].map((c, i) => (c === "0" ? i : -1)).filter(i => i >= 0);
  const first = empties[0], right = +g1.solution[first], wrong = right % 9 + 1;
  await typeAt(page, first, wrong);
  ok((await page.textContent(cellSel(first))).trim() === String(wrong), "wrong digit typed");
  ok(!(await page.$eval(cellSel(first), e => e.classList.contains("bad"))), "hardcore: wrong digit is not highlighted");
  ok((await page.textContent("#errors")).trim() === "", "hardcore: no mistakes counter");
  await page.keyboard.press(String(right));
  for (const i of empties.slice(1, -1)) await typeAt(page, i, g1.solution[i]);
  await shot(page, "play-desktop");
  await typeAt(page, empties.at(-1), g1.solution[empties.at(-1)]);
  await page.waitForSelector("#resultsCard");
  const card = await page.textContent("#resultsCard");
  ok(/решено/.test(card) && /До первого хода/.test(card) && /Пауз > 20 с/.test(card) && /Исправления/.test(card), "results card shown");
  const s1 = await api(`/api/games/${g1.id}`);
  ok(s1.status === "solved" && s1.mistakes === 1 && s1.corrections === 1, "server: solved, 1 mistake, 1 correction",
     JSON.stringify([s1.status, s1.mistakes, s1.corrections]));
  ok(s1.moves.length === empties.length + 1 && s1.moves.every((m, k) => m.seq === k + 1), "all moves stored in order");
  ok(s1.moves.every((m, k) => k === 0 || m.t_ms >= s1.moves[k - 1].t_ms), "move times are monotonic");
  ok(await page.$eval("#timer", e => e.classList.contains("done")), "timer stopped");
  // reward: green page + a dialog with the numbers fades in; Esc closes it, the green stays with the results
  await page.waitForSelector("#reward.in");
  ok((await page.textContent("#rewardTime")).trim() === (await page.textContent("#timer")).trim(), "reward: shows the solve time");
  await page.waitForFunction(() => !/^…$/.test(document.querySelector(".reward-compare").textContent));
  ok(/рекорд/.test(await page.textContent(".reward-compare")), "reward: a game without «Проверить» claims the record",
     await page.textContent(".reward-compare"));
  ok(await page.evaluate(() => document.body.classList.contains("won")), "reward: page turns green");
  await page.waitForSelector("#reward #speedChart .sc-pace");
  ok(await page.evaluate(() => {
    const c = document.querySelector("#reward #speedChart");
    return c.querySelector(".sc-pace").getAttribute("d").length > 10 && c.querySelector(".sc-raw")
      && c.querySelectorAll(".sc-err").length === 1 && c.querySelectorAll(".sc-legend span").length === 4;
  }), "reward: speed chart with pace, all moves, the 1 mistake and a legend");
  const svgBox = await page.$eval("#reward .speed-svg", e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  await page.mouse.move(svgBox[0] + svgBox[2] * 0.6, svgBox[1] + svgBox[3] / 2);
  ok(await page.$eval("#reward .sc-tip", e => !e.hidden && /верные:.*\/мин/.test(e.textContent)), "speed chart: hover tooltip");
  await page.waitForTimeout(400);  // let the fade-in finish
  await shot(page, "play-reward");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#reward", { state: "detached" });
  ok(await page.evaluate(() => document.body.classList.contains("won")), "reward: Esc closes the dialog, green stays");
  // record line: the solved game is the record of the level × mode being played, linked to its review
  await page.waitForFunction(id => !!document.querySelector(`#recordLine a[href="#/review/${id}"]`), g1.id);
  ok(/^Рекорд лёгкий · hardcore: /.test(await page.textContent("#recordLine")), "record line: new record of the current level × mode");
  ok(!(await page.$("#records")), "play: the full records table lives on #/stats only");
  await shot(page, "play-solved");
  await page.click("#reviewLink");
  await page.waitForSelector("#noPauses, .pause-item");
  ok(!!(await page.$("#speedChart .sc-pace")), "review: speed chart shown");
  ok(/Разбор партии/.test(await page.textContent("h1")), "review page opens from results");
  ok(page.url().endsWith(`#/review/${g1.id}`), "review URL");

  // --- review with a long pause (moves posted through the API) ----------------------------
  const pz = await api("/api/puzzle?level=medium&grade=2");
  const { id: gp } = await post("/api/games", { puzzle_id: pz.id, mode: "original" });
  const em = [...pz.givens].map((c, i) => (c === "0" ? i : -1)).filter(i => i >= 0);
  const wrongV = +pz.solution[em[1]] % 9 + 1;
  await post(`/api/games/${gp}/moves`, { moves: [
    { seq: 1, t_ms: 4000, cell: em[0], value: +pz.solution[em[0]], kind: "place" },
    { seq: 2, t_ms: 6000, cell: em[1], value: wrongV, kind: "place" },
    { seq: 3, t_ms: 41000, cell: em[2], value: +pz.solution[em[2]], kind: "place" }] });
  await post(`/api/games/${gp}/finish`, { status: "abandoned", t_ms: 50000 });
  await page.goto(`${BASE}/#/review/${gp}`);
  await page.waitForSelector(".pause-item", { timeout: 5000 }).catch(async e => {
    console.log("DEBUG", await page.textContent("main"), JSON.stringify(await api(`/api/games/${gp}/review`)).slice(0, 400)); throw e; });
  const pt = await page.textContent(".pause-item");
  ok(/Пауза 0:35 после хода 2/.test(pt) && /Тут был доступен: /.test(pt), "review: pause with available step", pt.slice(0, 120));
  ok(await page.$$eval(".pause-item .cell.bad", els => els.length === 1), "review: wrong cell marked");
  ok(await page.$$eval(".pause-item .cell.ghost, .pause-item .c-x", els => els.length > 0), "review: step highlighted on board");
  await shot(page, "review");
  await page.goto(`${BASE}/#/review/1`);
  await page.waitForSelector("#noMoves");
  ok(/Ходов нет/.test(await page.textContent("#noMoves")), "review of migrated game 1: «ходов нет»");

  // --- 2. original, limit 3: three mistakes → failed + locked -------------------------------
  await page.goto(`${BASE}/#/play`);
  await page.waitForSelector("#grade option[value=\"1\"]", { state: "attached" });
  const g2 = await startGame(page, { level: "easy", mode: "original", limit: "3", grade: "" });
  ok(g2.mistake_limit === 3, "original game with limit 3");
  const e2 = [...g2.givens].map((c, i) => (c === "0" ? i : -1)).filter(i => i >= 0);
  const bad = i => +g2.solution[i] % 9 + 1;
  await typeAt(page, e2[0], bad(e2[0]));
  ok(await page.$eval(cellSel(e2[0]), e => e.classList.contains("bad")), "original: wrong digit is red");
  ok((await page.textContent("#errors")).includes("Ошибки 1/3"), "original: counter 1/3");
  await typeAt(page, e2[1], bad(e2[1]));
  await typeAt(page, e2[2], bad(e2[2]));
  await page.waitForSelector("#resultsCard");
  ok(/провал/.test(await page.textContent("#resultsCard")), "original: failed after 3 mistakes");
  ok(await page.$eval("#board .grid", e => e.classList.contains("locked")), "board locked");
  ok(!(await page.$("#reward")) && !(await page.evaluate(() => document.body.classList.contains("won"))), "no reward for a failed game");
  await page.click(cellSel(e2[3])); await page.keyboard.press(g2.solution[e2[3]]);
  ok((await page.textContent(cellSel(e2[3]))).trim() === "", "locked board ignores input");
  const s2 = await api(`/api/games/${g2.id}`);
  ok(s2.status === "failed" && s2.mistakes === 3, "server: failed with 3 mistakes");

  // --- 2b. own mistake limit: any n, remembered; «без лимита» ---------------------------------
  const g2b = await startGame(page, { mode: "original", limit: "7" });
  ok(g2b.mistake_limit === 7, "original: own limit 7", JSON.stringify(g2b.mistake_limit));
  ok((await page.textContent("#errors")).includes("Ошибки 0/7"), "original: counter 0/7");
  await page.reload();
  await page.waitForSelector("#grade option[value=\"1\"]", { state: "attached" });
  ok(await page.inputValue("#limit") === "7", "own limit survives a reload");
  ok(/^▶\sИграть · .* · original · лимит\s7$/.test(await page.textContent("#newGame")), "the play button names the remembered settings",
     await page.textContent("#newGame"));
  const g2c = await startGame(page, { limit: "none" });
  ok(g2c.mistake_limit === null && await page.$eval("#limit", e => e.disabled), "«без лимита»: no limit, field disabled");
  await page.uncheck("#noLimit");
  ok(await page.inputValue("#limit") === "7" && !(await page.$eval("#limit", e => e.disabled)), "unchecking «без лимита» brings 7 back");
  await page.fill("#limit", "0"); await page.dispatchEvent("#limit", "change");
  ok(await page.inputValue("#limit") === "7", "invalid limit reverts to the last valid one");

  // --- 3. 🎲 random game; starting another abandons it --------------------------------------
  const g3 = await waitGame(page, () => page.click("#randomGame"));
  ok(g3.status === "active" && ["easy", "medium", "hard", "expert"].includes(g3.level), "🎲 game started");
  ok((await page.textContent("#badge")).includes("техника скрыта"), "🎲 badge hides the technique");
  // notes, notes mode, undo, check → the right move kinds reach the server
  const c3 = g3.givens.indexOf("0");
  await page.click(cellSel(c3));
  await page.keyboard.press("Shift+Digit3");
  ok((await page.textContent(`${cellSel(c3)} .notes`)).includes("3"), "Shift+digit adds a note");
  await page.keyboard.press("n");
  ok(await page.$eval("#notesBtn", e => e.classList.contains("on")), "N toggles notes mode");
  ok(await page.evaluate(() => {
    const label = document.querySelector("#notesLabel"), btn = document.querySelector("#notesBtn");
    return document.querySelector(".layout").classList.contains("notes-on") && getComputedStyle(label).display !== "none"
      && /вкл/.test(btn.textContent) && btn.closest(".bar").contains(document.querySelector("#timer"))
      && getComputedStyle(document.querySelector("#board .grid")).outlineStyle === "dashed";
  }), "notes mode is visible: toggle «вкл» next to the timer, label above the pad, dashed board");
  await shot(page, "play-notes");
  await page.keyboard.press("7");
  await page.keyboard.press("Space");
  ok(!(await page.$eval("#notesBtn", e => e.classList.contains("on"))), "Space toggles notes mode off");
  ok(await page.evaluate(() => !document.querySelector(".layout").classList.contains("notes-on")
    && getComputedStyle(document.querySelector("#notesLabel")).display === "none"), "notes mode off: indicators gone");
  await page.keyboard.press(g3.solution[c3]);
  ok((await page.textContent(cellSel(c3))).trim() === g3.solution[c3], "digit placed");
  await page.keyboard.press("Control+z");
  ok((await page.textContent(`${cellSel(c3)} .notes`)).replace(/\s/g, "") === "37", "Ctrl+Z restores the empty cell with its notes");
  await page.click("#checkBtn");
  ok(/Ошибок нет/.test(await page.textContent("#msg")), "«Проверить» reports no errors");
  await page.waitForTimeout(1600);
  const mv3 = (await api(`/api/games/${g3.id}`)).moves.map(m => `${m.kind}:${m.cell ?? "-"}:${m.value ?? "-"}`);
  ok(mv3.join(" ") === `note:${c3}:3 note:${c3}:7 place:${c3}:${g3.solution[c3]} undo:${c3}:0 check:-:-`,
     "move log: note, note, place, undo (restored 0), check — flushed by the 1 s queue", mv3.join(" "));
  // redo: Ctrl+Y / Ctrl+Shift+Z bring back what Ctrl+Z took; a new action clears it
  await page.keyboard.press("Control+y");
  ok((await page.textContent(cellSel(c3))).trim() === g3.solution[c3], "Ctrl+Y brings the undone digit back");
  ok(await page.$eval("#redoBtn", e => e.disabled), "«вернуть» disabled when there is nothing to redo");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z");
  ok((await page.textContent(cellSel(c3))).trim() === g3.solution[c3], "Ctrl+Shift+Z redoes too");
  await page.keyboard.press("Control+z");
  ok(!(await page.$eval("#redoBtn", e => e.disabled)), "«вернуть» enabled after an undo");
  await page.keyboard.press("Shift+Digit5");
  ok(await page.$eval("#redoBtn", e => e.disabled), "a new action clears the redo history");
  await page.click("#redoBtn", { force: true }).catch(() => {});
  ok((await page.textContent(cellSel(c3))).trim() !== g3.solution[c3], "nothing comes back after a new action");
  // no game after a reload: a digit explains what to do, Enter starts a game
  await page.reload();
  await page.waitForSelector("#newGame");
  await page.keyboard.press("Digit5");
  ok(/Партия не начата/.test(await page.textContent("#msg")), "no game: a digit says the game is not started");
  const gEnter = await waitGame(page, () => page.keyboard.press("Enter"));
  ok(gEnter.status === "active", "no game: Enter starts a new game");
  const cE = gEnter.givens.indexOf("0");
  // focus stuck on a select (Firefox keeps it when the same option is picked again) must not swallow digits
  await page.click(cellSel(cE));
  await openSetup(page);
  await page.focus("#level");
  await page.keyboard.press(`Digit${gEnter.solution[cE]}`);
  ok((await page.textContent(cellSel(cE))).trim() === gEnter.solution[cE], "digit reaches the board while a select has focus");
  ok(await page.evaluate(() => document.activeElement.id !== "level"), "the select lets go of focus");
  ok(await page.$eval("#level", e => e.value) !== gEnter.solution[cE], "the digit did not change the select");
  // «＋ новая» and zen sit next to the timer; mid-game the first click only asks
  ok(await page.$eval("#newGameTop", e => e.closest(".bar").contains(document.querySelector("#timer"))), "new game + zen next to the timer");
  ok(await page.$$eval(".main-col .bar .zen-btn", els => els.length === 1), "zen toggle above the board, not below");
  await page.click("#newGameTop");
  ok((await page.textContent("#newGameTop")).includes("Бросить"), "«＋ новая» mid-game asks first");
  await page.waitForTimeout(3200);
  ok((await page.textContent("#newGameTop")).includes("новая"), "«＋ новая» disarms after 3 s");
  // the same digit again clears the cell (keyboard and pad)
  await page.keyboard.press(`Digit${gEnter.solution[cE]}`);
  ok((await page.textContent(cellSel(cE))).trim() === "", "same digit again clears the cell");
  await page.click(`.pad button[data-digit="${gEnter.solution[cE]}"]`);
  await page.click(`.pad button[data-digit="${gEnter.solution[cE]}"]`);
  ok((await page.textContent(cellSel(cE))).trim() === "", "same pad digit twice: placed, then cleared");
  await page.waitForTimeout(1300);
  const kinds = (await api(`/api/games/${gEnter.id}`)).moves.slice(-3).map(m => m.kind).join(" ");
  ok(kinds === "erase place erase", "clearing by the same digit is logged as erase", kinds);
  await typeAt(page, c3, 5);
  // Esc mid-game asks first: the dialog takes the keyboard, Esc keeps playing, Enter abandons
  await page.click(cellSel(cE));
  await page.keyboard.press("Escape");
  await page.waitForSelector("#confirm");
  const beforeEsc = (await page.textContent(cellSel(cE))).trim();
  await page.keyboard.press(`Digit${gEnter.solution[cE]}`);
  ok((await page.textContent(cellSel(cE))).trim() === beforeEsc, "Esc mid-game: confirm dialog open, digits don't reach the board",
     `c3=${c3} cE=${cE} before=${beforeEsc}`);
  await shot(page, "play-esc-confirm");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#confirm", { state: "detached" });
  ok((await api(`/api/games/${gEnter.id}`)).status === "active", "Esc in the dialog: the game goes on");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#confirm");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#resultsCard");
  ok(/брошена/.test(await page.textContent("#resultsCard")) && (await api(`/api/games/${gEnter.id}`)).status === "abandoned",
     "Enter in the dialog abandons the game");
  await page.keyboard.press("Escape");
  ok(!(await page.$("#confirm")), "Esc with no game in progress: nothing to ask");
  // «Играть» is the main page: the empty route and Esc from any other page lead there
  await page.goto(`${BASE}/#/stats`);
  await page.waitForSelector("#nav a.active[data-route=stats]");
  await page.keyboard.press("Escape");
  ok(await page.waitForFunction(() => location.hash === "#/play").then(() => true, () => false), "Esc on another page goes to «Играть»");
  await page.goto(`${BASE}/`);
  ok(await page.waitForSelector("#nav a.active[data-route=play]").then(() => true, () => false), "the main page is «Играть»");

  // --- 4. Ctrl+V of an ASCII grid → custom puzzle -------------------------------------------
  const ascii = `1 . . | . . 6 | . . .
6 . . | . 3 5 | 1 2 .
. 3 2 | . . . | . . .
------+-------+------
. . . | 1 4 . | . 3 .
8 6 . | . . . | . 9 2
. 5 . | . 2 9 | . . .
------+-------+------
. . . | . . . | 3 7 .
. 1 3 | 5 9 . | . . 8
. . . | 4 . . | . . 5`;
  // Firefox drops clipboardData from a synthetic ClipboardEvent, so the paste path is checked in Chromium only.
  const own = "100006000600035120032000000000140030860000092050029000000000370013590008000400005";
  const boardDigits = () => page.$$eval("#board .cell", els => els.map(c => c.textContent.trim() || "0").join(""));
  if (BROWSER === "chromium") {
    // the pasted grid opens in the editor first, to look it over and pick the level; Enter starts it
    await page.evaluate(text => {
      const dt = new DataTransfer(); dt.setData("text/plain", text);
      document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    }, ascii);
    await page.waitForSelector("#customEditor:not([hidden])");
    ok(await boardDigits() === own && (await page.textContent("#badge")).includes("ввод условия"), "Ctrl+V opens the grid in the editor");
    await setSelect(page, "customLevel", "custom");
    const g4full = await waitGame(page, () => page.keyboard.press("Enter"));
    ok((await page.textContent("#badge")).includes("своя сетка"), "custom badge");
    ok(g4full.level === "custom" && g4full.givens === "100006000600035120032000000000140030860000092050029000000000370013590008000400005",
       "Ctrl+V ASCII grid loads a custom puzzle");
    ok((await api(`/api/games/${gEnter.id}`)).status === "abandoned", "previous active game finished as abandoned");
    ok((await page.textContent(cellSel(0))).trim() === "1" && (await page.textContent(cellSel(5))).trim() === "6", "custom grid on board");
  }

  // --- 4c. «✎ Своя сетка»: the grid typed in, repeats are red, it starts as a game of the chosen level ---
  await page.click("#customGame");
  await page.waitForSelector("#customEditor:not([hidden])");
  ok(await boardDigits() === "0".repeat(81), "editor opens empty");
  await page.click(cellSel(0));
  await page.keyboard.type(own);
  ok(await boardDigits() === own, "typing 81 digits (0 = empty) fills the grid row by row");
  await page.click(cellSel(1)); await page.keyboard.press("1");
  ok(await page.$eval(cellSel(0), c => c.classList.contains("bad")) && await page.$eval("#customStart", b => b.disabled),
     "a repeated digit is red and blocks the start");
  await page.keyboard.press("Backspace");  // the cursor moved on to an empty cell: Backspace erases the one before
  ok(await boardDigits() === own && !(await page.$eval("#customStart", b => b.disabled)), "Backspace takes the repeat back");
  await setSelect(page, "customLevel", "medium");
  await setSelect(page, "customMode", "hardcore");
  const g4c = await waitGame(page, () => page.click("#customStart"));
  ok(g4c.level === "medium" && g4c.mode === "hardcore" && g4c.givens === own && g4c.status === "active",
     "own grid starts as a game of the chosen level and mode");
  ok(await page.$eval("#customEditor", e => e.hidden), "the editor closes when the game starts");
  await page.click("#customGame");  // a game without moves is let go without asking
  await page.waitForSelector("#customEditor:not([hidden])");
  ok((await api(`/api/games/${g4c.id}`)).status === "abandoned", "opening the editor abandons a game without moves");
  await page.keyboard.press("Escape");
  ok(await page.$eval("#customEditor", e => e.hidden) && await boardDigits() === own, "Esc closes the editor, back to the last board");

  // --- 4b. «Очистить» wipes own digits and notes (one undo brings them back); «Сдаться» asks twice ---
  const g4b = await startGame(page, { level: "easy", mode: "hardcore", grade: "" });
  const e4 = [...g4b.givens].map((c, i) => (c === "0" ? i : -1)).filter(i => i >= 0);
  await typeAt(page, e4[0], g4b.solution[e4[0]]);
  await typeAt(page, e4[1], +g4b.solution[e4[1]] % 9 + 1);
  await page.click(cellSel(e4[2])); await page.keyboard.press("Shift+Digit5");
  await page.click("#clearBtn");
  ok(await page.$$eval(e4.slice(0, 3).map(cellSel).join(","), els => els.every(e => !e.textContent.trim())),
     "«Очистить» empties own digits and notes");
  ok(await page.$$eval("#board .cell", (els, g) => els.every((e, i) => g[i] === "0" || e.textContent.trim() === g[i]), g4b.givens),
     "«Очистить» keeps the givens");
  await page.keyboard.press("Control+z");
  ok((await page.textContent(cellSel(e4[0]))).trim() === g4b.solution[e4[0]] &&
     (await page.textContent(`${cellSel(e4[2])} .notes`)).includes("5"), "one Ctrl+Z restores the whole cleared board");
  await page.click("#clearBtn");
  await page.click("#giveUpBtn");
  ok((await page.textContent("#giveUpBtn")).includes("Точно") && !(await page.$("#resultsCard")),
     "«Сдаться»: first click only asks");
  await page.click("#giveUpBtn");
  await page.waitForSelector("#resultsCard");
  ok(/брошена/.test(await page.textContent("#resultsCard")), "«Сдаться»: second click ends the game");
  ok(await page.$eval("#giveUpBtn", e => e.disabled) && await page.$eval("#clearBtn", e => e.disabled),
     "clear / give up disabled after the game ends");
  const s4b = await api(`/api/games/${g4b.id}`);
  ok(s4b.status === "abandoned" && s4b.moves.filter(m => m.kind === "erase").length === 6,
     "server: abandoned, each clear logged as erases", JSON.stringify([s4b.status, s4b.moves.map(m => m.kind)]));

  // --- 5. drills: place + eliminate ---------------------------------------------------------
  const drillResp = () => page.waitForResponse(r => r.url().includes("/api/drills/next"));
  const info = id => {
    const [[answers, solution, board]] = dbJson("SELECT d.answers, p.solution, d.board FROM drills d JOIN puzzles p ON p.id = d.puzzle_id WHERE d.id = ?", id);
    return { answers: JSON.parse(answers), solution, board };
  };
  await page.evaluate(() => localStorage.setItem("gym.drills.autoNext", "0"));  // manual «Дальше» for the checks below
  let rp = drillResp();
  await page.goto(`${BASE}/#/drills?technique=naked_single`);
  let d = await (await rp).json();
  await page.waitForFunction(() => document.querySelector("#prompt").textContent.length > 5);
  ok(d.technique === "naked_single" && d.kind === "place", "place drill loaded from query");
  ok(!(await page.$eval("#showCands", e => e.checked)), "place drill: candidates hidden by default");
  ok(await page.$eval("#drillGate", e => !e.hidden), "drill gate: first drill waits for start");
  await page.waitForTimeout(700);
  ok((await page.textContent("#drillTimer")).trim() === "0.0 с", "drill gate: timer does not run before start");
  await page.locator("body").press("Space");
  ok(await page.$eval("#drillGate", e => e.hidden), "drill gate: Space starts");
  await shot(page, "drills-place");
  let inf = info(d.id);
  await page.click(`#drillBoard .cell[data-cell="${inf.answers[0][0]}"]`);
  await page.keyboard.press(String(inf.answers[0][1]));
  await page.waitForSelector("#drillMsg.ok");
  ok(await page.$eval(`#drillBoard .cell[data-cell="${inf.answers[0][0]}"]`, e => e.classList.contains("ok")), "place drill: correct → green");
  rp = drillResp();
  await page.keyboard.press("Enter");
  d = await (await rp).json();
  inf = info(d.id);
  const cands = d.candidates;
  const wc = cands.findIndex((c, i) => d.board[i] === "0" && c.length < 9 && !inf.answers.some(([a]) => a === i));
  const wv = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(v => !cands[wc].includes(v));
  await page.click(`#drillBoard .cell[data-cell="${wc}"]`);
  await page.click(`.pad button[data-digit="${wv}"]`);
  await page.waitForSelector("#drillMsg.bad");
  ok(await page.$eval(`#drillBoard .cell[data-cell="${wc}"]`, e => e.classList.contains("bad")), "place drill: wrong → red");
  ok(await page.$$eval("#drillBoard .cell.ans", els => els.length >= 1), "place drill: answers highlighted");

  rp = drillResp();
  await page.click('#picker button[data-tech="pointing"]');
  d = await (await rp).json();
  await page.waitForFunction(() => document.querySelector("#drillTech").textContent.includes("Pointing"));
  ok(d.kind === "eliminate" && await page.$eval("#showCands", e => e.checked && e.disabled), "eliminate drill: candidates shown");
  await shot(page, "drills-eliminate");
  inf = info(d.id);
  const [ec, ev] = inf.answers[0];
  await page.click(`#drillBoard .cell[data-cell="${ec}"] span[data-v="${ev}"]`);
  await page.waitForSelector("#drillMsg.ok");
  ok(await page.$$eval("#drillBoard span.c-ok", els => els.length === 1), "eliminate drill: correct → green");
  ok(/Почему:.*убираем/.test(await page.textContent("#drillWhy")), "eliminate drill: explanation shown");
  ok(await page.$$eval("#drillBoard .cell.pat", els => els.length >= 2), "eliminate drill: pattern cells highlighted");
  ok((await page.getAttribute("#drillTheory", "href")) === "#/theory/pointing-claiming", "drill: theory link");
  ok(await page.$eval('#picker button[data-tech="x_wing"]', e => e.textContent.includes("🔒")), "drill picker: locked tier marked");
  await shot(page, "drills-eliminate-answered");
  rp = drillResp();
  await page.locator("body").press("Space");  // Space = next
  d = await (await rp).json();
  ok(await page.$eval("#drillWhy", e => e.hidden), "Space loads the next drill and clears the explanation");
  inf = info(d.id);
  const sc = [...d.board].findIndex((c, i) => c === "0" && d.candidates[i].length > 1);
  await page.click(`#drillBoard .cell[data-cell="${sc}"] span[data-v="${inf.solution[sc]}"]`);
  await page.waitForSelector("#drillMsg.bad");
  ok(await page.$$eval("#drillBoard span.c-bad", els => els.length === 1), "eliminate drill: wrong → red");
  ok(await page.$$eval("#drillBoard span.c-ans", els => els.length >= 1), "eliminate drill: answers shown");
  ok(/Решено: 2\/4/.test(await page.textContent("#session")), "session strip counts attempts");
  rp = drillResp();
  await page.locator("body").press("Space");
  d = await (await rp).json();
  inf = info(d.id);
  ok(await page.$eval("#drillBoard + .pad, .pad", e => e.hidden), "eliminate drill: pad hidden until a cell is picked");
  const [kc, kv] = inf.answers[0];
  await page.$eval(`#drillBoard .cell[data-cell="${kc}"]`, e => e.click());  // the cell itself, not a candidate
  ok(!(await page.$eval(".pad", e => e.hidden)), "eliminate drill: pad shown after picking a cell");
  await page.locator("body").press(`Digit${kv}`);
  await page.waitForSelector("#drillMsg.ok");
  ok(true, "eliminate drill: cell + keyboard digit answers");

  // focus: a mouse click on a checkbox or chip must not swallow digits / Space (Firefox on Linux keeps focus)
  rp = drillResp();
  await page.click('#picker button[data-tech="hidden_single_row"]');
  d = await (await rp).json();
  ok(await page.evaluate(() => document.activeElement === document.body), "focus: clicked chip releases focus");
  await page.click("#showCands");  // toggle on…
  await page.click("#showCands");  // …and off again
  ok(await page.evaluate(() => document.activeElement === document.body), "focus: clicked checkbox releases focus");
  inf = info(d.id);
  const [fc, fv] = inf.answers[0];
  await page.click(`#drillBoard .cell[data-cell="${fc}"]`);
  await page.locator("body").press(`Digit${fv}`);
  await page.waitForSelector("#drillMsg.ok");
  ok(true, "focus: digit after clicking a checkbox reaches the board");

  // a true move by another technique is amber, not red
  rp = drillResp();
  await page.locator("body").press("Space");
  d = await (await rp).json();
  inf = info(d.id);
  const ansCells = new Set(inf.answers.map(a => a[0]));
  const oc = [...d.board].findIndex((c, i) => c === "0" && !ansCells.has(i));
  await page.click(`#drillBoard .cell[data-cell="${oc}"]`);
  await page.locator("body").press(`Digit${inf.solution[oc]}`);
  await page.waitForSelector("#drillMsg.other");
  ok(await page.$eval(`#drillBoard .cell[data-cell="${oc}"]`, e => e.classList.contains("other") && !e.classList.contains("bad")),
     "valid other move: amber, not red");

  // auto-advance after a correct answer
  await page.click("#autoNext");
  rp = drillResp();
  await page.locator("body").press("Space");
  d = await (await rp).json();
  inf = info(d.id);
  const [ac, av] = inf.answers[0];
  const auto = drillResp();
  await page.click(`#drillBoard .cell[data-cell="${ac}"]`);
  await page.locator("body").press(`Digit${av}`);
  const t0 = Date.now();
  const nd = await (await auto).json();
  ok(nd.id !== d.id && Date.now() - t0 < 2000, "auto-advance: next drill after a correct answer");

  // --- 6. stats -------------------------------------------------------------------------------
  await page.goto(`${BASE}/#/stats`);
  await page.waitForSelector("#gamesTable");
  const byLevel = await page.textContent("#byLevel");
  ok(/лёгкий/.test(byLevel) && /hardcore/.test(byLevel) && /original/.test(byLevel), "stats: level/mode table");
  await page.waitForSelector("#recordsStats table.records");
  ok(await page.$$eval("#recordsStats td[data-rec] a", as => as.length >= 1), "stats: records table with links to the record games");
  ok(await page.$$eval("#gamesTable tbody tr", r => r.length >= 5), "stats: recent games listed");
  ok(await page.$(`#gamesTable a[href="#/review/${g1.id}"]`) !== null, "stats: review link for the solved game");
  ok(await page.$("#chart svg polyline") !== null, "stats: daily chart drawn");
  ok(/Голая одиночка/.test(await page.textContent("#techTable")), "stats: techniques table");
  await shot(page, "stats");

  // --- 7. theory ------------------------------------------------------------------------------
  await page.goto(`${BASE}/#/theory`);
  await page.waitForSelector(".toc a");
  ok(await page.$$eval(".toc li", l => l.length) === 10, "theory list: 10 articles");
  await shot(page, "theory-list");
  await page.click('a[href="#/theory/pointing-claiming"]');
  await page.waitForSelector("article.md h1");
  ok(await page.$$eval("article.md h2", e => e.length >= 2) && await page.$("article.md pre") && await page.$("article.md ol li")
     && await page.$("article.md code"), "theory page renders markdown (headings, pre, lists, code)");
  ok(!(await page.textContent("article.md")).includes("**"), "no raw markdown left");
  await shot(page, "theory-page");
  await page.click("#trainLink");
  await page.waitForFunction(() => location.hash === "#/drills?technique=pointing");
  await page.waitForSelector('#picker button[data-tech="pointing"].on');
  ok(true, "«Тренировать» opens the pointing drill");
  await page.waitForSelector("#drillGate:not([hidden])");
  await page.mouse.click(...await page.$eval("#drillBoard", e => { const r = e.getBoundingClientRect(); return [r.x + 30, r.y + 30]; }));
  ok(await page.$eval("#drillGate", e => e.hidden), "drill gate: a click on the blurred board starts");

  // --- 8. today's line on #/play (the home page; «Сегодня» is gone) ------------------------------
  ok(await page.$$eval("#nav a", as => !as.some(a => a.getAttribute("href") === "#/today")) && await page.textContent("#nav a") === "Играть",
     "nav: no «Сегодня», «Играть» first");
  await page.goto(`${BASE}/#/today`);
  await page.waitForFunction(() => location.hash === "#/play");
  await page.waitForSelector("#dayStrip:not([hidden]) #dayReview");
  ok(await page.$('#dayStrip a[href="#/drills"]') !== null, "today's line: warm-up and last-game review links; old #/today lands here");
  const mh = n => new RegExp(`${n}/2 medium · hardcore`);
  const n0 = +(await page.textContent("#dayStrip")).match(/(\d)\/2/)[1];
  const g5 = await startGame(page, { level: "medium", mode: "hardcore", grade: "" });
  for (const [i, c] of [...g5.givens].entries()) if (c === "0") await typeAt(page, i, g5.solution[i]);
  await page.waitForSelector("#resultsCard");
  await page.keyboard.press("Escape");
  await page.waitForFunction(re => new RegExp(re).test(document.querySelector("#dayStrip").textContent), mh(Math.min(n0 + 1, 2)).source);
  ok(await page.$eval("#dayReview", (a, id) => a.getAttribute("href") === `#/review/${id}`, g5.id),
     "today's line: a solved medium hardcore game counts, review link moves to it");
  await shot(page, "play-home");

  // --- 8b. look settings ----------------------------------------------------------------------
  await page.goto(`${BASE}/#/settings`);
  await page.waitForSelector("#lookBoard .cell");
  const look = () => page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement), cell = document.querySelector("#lookBoard .cell");
    return { theme: document.documentElement.dataset.theme || null, bg: getComputedStyle(document.body).backgroundColor,
             font: getComputedStyle(document.body).fontFamily, cellPx: parseFloat(getComputedStyle(cell).fontSize),
             surface: cs.getPropertyValue("--surface").trim() };
  });
  const l0 = await look();
  ok(/JetBrains Mono/.test(l0.font), "look: JetBrains Mono is the default font", l0.font);
  ok(await page.evaluate(() => document.fonts.check('16px "JetBrains Mono"', "123 Вид")), "look: bundled JetBrains Mono loaded");
  await page.click('#themes [data-theme-id="nord"]');
  const l1 = await look();
  ok(l1.theme === "dark" && l1.bg === "rgb(46, 52, 64)", "look: nord theme recolours the page", JSON.stringify(l1));
  await page.click('#fonts [data-font="inter"]');
  await page.fill("#digitScale", "1.4");
  await page.dispatchEvent("#digitScale", "input");
  const l2 = await look();
  ok(/Inter/.test(l2.font) && l2.cellPx > l0.cellPx * 1.3, "look: font and digit size apply", JSON.stringify([l0.cellPx, l2.cellPx, l2.font]));
  await page.$eval('#customColors input[data-key="bg"]', e => { e.value = "#102030"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  const l3 = await look();
  ok(l3.bg === "rgb(16, 32, 48)" && l3.surface === "#3b4252" &&
     await page.$eval('#themes [data-theme-id="custom"]', b => b.classList.contains("on")), "look: editing a colour makes «Своя» from nord", JSON.stringify(l3));
  await page.reload();
  await page.waitForSelector("#lookBoard .cell");
  const l4 = await look();
  ok(l4.bg === l3.bg && /Inter/.test(l4.font) && Math.abs(l4.cellPx - l2.cellPx) < 0.5, "look: settings survive a reload", JSON.stringify(l4));
  await shot(page, "settings");
  await page.click("#lookReset");
  const l5 = await look();
  ok(l5.theme === null && /JetBrains Mono/.test(l5.font) && Math.abs(l5.cellPx - l0.cellPx) < 0.5, "look: reset restores the default look", JSON.stringify(l5));
  const marks = () => page.evaluate(() => ["peer", "same"].map(c => document.querySelectorAll(`#lookBoard .cell.${c}`).length)
    .concat(document.querySelectorAll("#lookBoard .notes span.hl, #lookBoard .row-nums span.on").length));
  const m0 = await marks();
  for (const id of ["peers", "same", "notes", "labels"]) await page.click(`#hints input[data-hint="${id}"]`);
  await page.reload();
  await page.waitForSelector("#lookBoard .cell");
  const m1 = await marks();
  ok(m0.every(n => n > 0) && m1.every(n => n === 0), "look: board highlights switch off and stay off after a reload", JSON.stringify([m0, m1]));
  await page.click("#lookReset");
  ok((await marks()).every(n => n > 0), "look: reset turns highlights back on");
  // --- 8b'. export / import of the look and favourites -----------------------------------------
  const favPid = (await api("/api/puzzle?level=easy")).id;
  await fetch(`${BASE}/api/favorites/puzzle/${favPid}`, { method: "PUT" });
  await page.click('#themes [data-theme-id="nord"]');
  const dl = page.waitForEvent("download");
  await page.click("#exportBtn");
  const file = await (await dl).path();
  const exported = JSON.parse(readFileSync(file, "utf-8"));
  ok(exported.app === "sudoku-gym" && exported.appearance.theme === "nord" && exported.favorites.puzzles.length >= 1,
     "export: file has the look and favourites", JSON.stringify(exported).slice(0, 200));
  await page.click("#lookReset");
  await fetch(`${BASE}/api/favorites/puzzle/${favPid}`, { method: "DELETE" });
  await page.setInputFiles("#importFile", file);
  await page.waitForSelector("#confirm");
  await page.click("#confirmOk");
  await page.waitForFunction(() => /добавлено/.test(document.querySelector("#transferMsg").textContent));
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem("gym-appearance")).theme)) === "nord" && (await api("/api/favorites")).puzzle >= 1,
     "import: nord and the favourite are back");
  await page.setInputFiles("#importFile", { name: "x.json", mimeType: "application/json", buffer: Buffer.from("{\"a\":1}") });
  await page.waitForFunction(() => /не файл настроек/.test(document.querySelector("#transferMsg").textContent));
  ok(!(await page.$("#confirm")), "import: a foreign file is refused without a dialog");
  await page.click("#lookReset");
  await fetch(`${BASE}/api/favorites/puzzle/${favPid}`, { method: "DELETE" });

  // --- 8c. board pages: board in the middle on a wide screen, panel right by default, left from #/settings ------
  const wide = await newPage({ width: 1440, height: 900 });
  const sides = async () => {
    await wide.goto(`${BASE}/#/drills`);
    await wide.waitForSelector("#picker button");
    return wide.evaluate(() => {
      const b = document.querySelector(".layout .grid").getBoundingClientRect(), s = document.querySelector("#picker").getBoundingClientRect();
      return { mid: Math.round(b.left + b.width / 2 - document.documentElement.clientWidth / 2), panelRight: s.left > b.right };
    });
  };
  const side0 = await sides();
  ok(Math.abs(side0.mid) <= 12 && side0.panelRight, "wide: board centred, panel on the right", JSON.stringify(side0));
  await wide.goto(`${BASE}/#/settings`);
  await wide.click('#sides [data-side="left"]');
  const side1 = await sides();
  ok(Math.abs(side1.mid) <= 12 && !side1.panelRight, "wide: «← слева» moves the panel left, board stays centred", JSON.stringify(side1));
  await wide.reload();
  await wide.waitForSelector("#picker button");
  ok(await wide.evaluate(() => document.documentElement.dataset.side) === "left", "wide: panel side survives a reload");
  await shot(wide, "drills-wide-left");
  await wide.keyboard.press("z");
  const zenHome = await wide.evaluate(() => {
    const a = document.querySelector(".zen-home"), r = a.getBoundingClientRect(), g = document.querySelector(".layout .grid").getBoundingClientRect();
    return { zen: document.body.classList.contains("zen"), header: getComputedStyle(document.querySelector(".top")).display,
             shown: r.width > 0, clear: r.right < g.left };
  });
  ok(zenHome.zen && zenHome.header === "none" && zenHome.shown && zenHome.clear, "zen: header hidden, «← Играть» in the free corner", JSON.stringify(zenHome));
  await wide.click(".zen-home");
  const home = await wide.waitForFunction(() => location.hash === "#/play" && document.body.classList.contains("zen")
    && getComputedStyle(document.querySelector(".zen-home")).display === "none", null, { timeout: 3000 }).then(() => true, () => false);
  ok(home, "zen: «← Играть» goes home, zen stays for the board, no link to itself");
  await wide.evaluate(() => localStorage.setItem("gym-zen", "0"));
  await wide.context().close();

  // --- 9. mobile 390px -------------------------------------------------------------------------
  const mob = await newPage({ width: 390, height: 844 }, { deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mob.goto(`${BASE}/#/play`);
  await mob.waitForSelector("#grade option[value=\"1\"]", { state: "attached" });
  await waitGame(mob, () => mob.click("#newGame"));
  const sw = await mob.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok(sw[0] <= sw[1], "390px: no horizontal scroll on #/play", sw.join(" > "));
  await shot(mob, "play-mobile");
  for (const r of ["drills", "stats", "theory/pointing-claiming", "settings"]) {
    await mob.goto(`${BASE}/#/${r}`);
    await mob.waitForTimeout(700);
    const w = await mob.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    ok(w[0] <= w[1], `390px: no horizontal scroll on #/${r}`, w.join(" > "));
  }
  await shot(mob, "theory-mobile");
  await mob.goto(`${BASE}/#/drills?technique=pointing`);
  await mob.waitForTimeout(700);
  await shot(mob, "drills-mobile");

  // dark mode look
  const dark = await newPage({ width: 1100, height: 900 }, { colorScheme: "dark" });
  await dark.goto(`${BASE}/#/review/${gp}`);
  await dark.waitForSelector(".pause-item");
  await shot(dark, "review-dark");
  await dark.goto(`${BASE}/#/play`);
  await dark.waitForSelector("#grade option[value=\"1\"]", { state: "attached" });
  await waitGame(dark, () => dark.click("#newGame"));
  await dark.click(cellSel(40));
  await shot(dark, "play-dark");

  // --- English: an English browser gets the English UI, RU/EN in the header switches it -------------------------
  const en = await newPage({ width: 1440, height: 900 }, { locale: "en-US" });
  const russianLeft = () => en.evaluate(() => {
    const txt = document.body.innerText + " " + [...document.querySelectorAll("[title],[aria-label]")]
      .filter(e => e.id !== "langBtn").map(e => `${e.title} ${e.getAttribute("aria-label") || ""}`).join(" ");
    return [...new Set(txt.match(/\S*[А-Яа-яЁё]\S*/g) || [])].slice(0, 8);
  });
  for (const r of ["play", "drills", "stats", "theory", "theory/x-wing", `review/${gp}`, "settings"]) {
    await en.goto(`${BASE}/#/${r}`);
    await en.waitForTimeout(800);
    const left = await russianLeft();
    ok(left.length === 0 || left.every(w => w === "Русский"), `en: no Russian on #/${r}`, left.join(" | "));
  }
  await en.goto(`${BASE}/#/drills`);
  await en.click("#startDrill");
  await en.click("#hintBtn");
  await en.waitForSelector("#drillWhy:not([hidden])");
  ok(/^Hint: /.test(await en.textContent("#drillWhy")), "en: drill hint in English", await en.textContent("#drillWhy"));
  ok(await en.textContent("#nav a") === "Play" && await en.evaluate(() => document.documentElement.lang) === "en", "en: nav and <html lang>");
  await shot(en, "drills-en");
  await en.click("#langBtn");
  await en.waitForFunction(() => document.documentElement.lang === "ru");
  ok(await en.textContent("#nav a") === "Играть", "en: «RU» in the header switches to Russian");
} catch (e) {
  ok(false, "unexpected exception", e.stack);
} finally {
  ok(problems.length === 0, "no console errors / page errors", problems.join(" | "));
  await browser.close();
  server.kill();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
