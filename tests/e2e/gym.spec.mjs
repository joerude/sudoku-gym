// Sudoku Gym end-to-end check (plain node script, no test runner).
//   node tests/e2e/gym.spec.mjs [screenshot-dir]
// Starts server.py on a free port against a TEMP copy of data/sudoku.db, drives Chromium through every page,
// prints PASS/FAIL lines and exits non-zero on any failure or console/page error.
// Env: PLAYWRIGHT_CORE (dir of playwright-core's node_modules), CHROME (executable), SHOTS (screenshot dir).
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRATCH = "/tmp/claude-1000/-home-joerude-Desktop-sudoku-tutor-mentor-rus/eb1bf9c6-5de8-4277-b49d-66d9d7f9cdc9/scratchpad";
const NM = [process.env.PLAYWRIGHT_CORE, `${SCRATCH}/node_modules`, path.join(ROOT, "node_modules"),
  "/home/joerude/.npm-global/lib/node_modules/rea-agents/node_modules"].filter(Boolean)
  .find(d => existsSync(path.join(d, "playwright-core")));
if (!NM) { console.log("FAIL playwright-core not found (set PLAYWRIGHT_CORE)"); process.exit(2); }
const { chromium } = createRequire(path.join(NM, "noop.js"))("playwright-core");
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

const browser = await chromium.launch({ executablePath: CHROME });
const problems = [];
async function newPage(viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, ...extra });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
  return page;
}
const shot = (page, name, full = true) => page.screenshot({ path: path.join(SHOTS, `gym-${name}.png`), fullPage: full });

const cellSel = i => `#board .cell[data-cell="${i}"]`;

async function setSelect(page, id, value) { await page.selectOption(`#${id}`, value); }

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
  if (level) await setSelect(page, "level", level);
  if (grade !== undefined) await setSelect(page, "grade", grade);
  if (mode) await setSelect(page, "mode", mode);
  if (limit) await setSelect(page, "limit", limit);
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
  await shot(page, "play-solved");
  await page.click("#reviewLink");
  await page.waitForSelector("#noPauses, .pause-item");
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
  await page.click(cellSel(e2[3])); await page.keyboard.press(g2.solution[e2[3]]);
  ok((await page.textContent(cellSel(e2[3]))).trim() === "", "locked board ignores input");
  const s2 = await api(`/api/games/${g2.id}`);
  ok(s2.status === "failed" && s2.mistakes === 3, "server: failed with 3 mistakes");

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
  await page.keyboard.press("7");
  await page.keyboard.press("Space");
  ok(!(await page.$eval("#notesBtn", e => e.classList.contains("on"))), "Space toggles notes mode off");
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
  await typeAt(page, c3, 5);

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
  const g4full = await waitGame(page, () => page.evaluate(text => {
    const dt = new DataTransfer(); dt.setData("text/plain", text);
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  }, ascii));
  ok((await page.textContent("#badge")).includes("своя сетка"), "custom badge");
  ok(g4full.level === "custom" && g4full.givens === "100006000600035120032000000000140030860000092050029000000000370013590008000400005",
     "Ctrl+V ASCII grid loads a custom puzzle");
  ok((await api(`/api/games/${g3.id}`)).status === "abandoned", "previous active game finished as abandoned");
  ok((await page.textContent(cellSel(0))).trim() === "1" && (await page.textContent(cellSel(5))).trim() === "6", "custom grid on board");

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

  // --- 8. today -------------------------------------------------------------------------------
  await page.goto(`${BASE}/#/today`);
  await page.waitForSelector("#plan");
  ok(await page.$("#planReview") !== null, "today: plan with review link");
  await shot(page, "today");
  const g5 = await waitGame(page, () => page.click("#planPlay"));
  ok(g5.level === "medium" && g5.mode === "hardcore", "today: «Начать партию» starts medium hardcore");

  // --- 9. mobile 390px -------------------------------------------------------------------------
  const mob = await newPage({ width: 390, height: 844 }, { deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mob.goto(`${BASE}/#/play`);
  await mob.waitForSelector("#grade option[value=\"1\"]", { state: "attached" });
  await waitGame(mob, () => mob.click("#newGame"));
  const sw = await mob.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok(sw[0] <= sw[1], "390px: no horizontal scroll on #/play", sw.join(" > "));
  await shot(mob, "play-mobile");
  for (const r of ["drills", "stats", "today", "theory/pointing-claiming"]) {
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
