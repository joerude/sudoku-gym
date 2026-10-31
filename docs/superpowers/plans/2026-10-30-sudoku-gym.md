# Sudoku Gym Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Локальный тренажёр скоростного судоку с SQLite-историей ходов, разбором пауз, адаптивными упражнениями и теорией.

**Architecture:** Python-stdlib сервер (`server.py`) отдаёт `web/` и JSON API поверх `sudoku.db`. Логика судоку — в `sudoku_core.py` (шаги с названием техники). Аналитика и упражнения — отдельные модули, которые принимают `sqlite3.Connection`.

**Tech Stack:** Python 3 stdlib (`sqlite3`, `http.server`, `unittest`), vanilla JS ES-модули, Playwright (playwright-core из scratchpad) для UI-тестов.

Спецификация: `docs/superpowers/specs/2026-10-30-sudoku-gym-design.md`.

## Global Constraints

- Только стандартная библиотека Python 3; никаких pip-зависимостей.
- Сервер: `--host` (по умолчанию `127.0.0.1`; в Docker `0.0.0.0`, публикуется как `127.0.0.1:8765`), порт по умолчанию `8765`.
- БД по умолчанию: `data/sudoku.db` (в Docker — bind mount `./data:/app/data`, теория — `./theory:/app/theory:ro`).
- Весь UI-текст — на русском; термины техник с английским названием в скобках.
- Клетки индексируются 0..80 (строка*9 + столбец); юниты 0..26: строки 0–8, столбцы 9–17, блоки 18–26. Пользователю всё показывается 1-based.
- Сетка в строковом виде — 81 символ, `0` = пусто.
- Пауза «длинная», если > 20 000 мс.
- Импорт задач — из `grantm/sudoku-exchange-puzzle-bank` (public domain), 5000 на уровень; уровни `easy|medium|hard|expert` (= easy/medium/hard/diabolical).
- Режимы `original|hardcore`; лимит ошибок по умолчанию 3 (только original, может быть `null`).
- Git-репозитория нет — шаги «commit» пропускаются.
- Тесты: `python3 -m unittest discover -s tests -v` из корня проекта.

## File Structure

```
sudoku_core.py          ядро: парсинг, кандидаты, шаги, решатель, грейд
db.py                   схема и подключение SQLite
analysis.py             метрики партии, паузы, разбор, статистика
drills.py               генерация и адаптивный выбор упражнений
server.py               HTTP: статика web/ + API
tools/import_bank.py    импорт банка + сид теории + сид упражнений
theory/*.md             теория (frontmatter)
web/index.html, web/style.css, web/js/*.js
tests/test_core.py, test_analysis.py, test_drills.py, test_server.py
tests/e2e/gym.spec.mjs  Playwright
```

---

### Task 1: Ядро `sudoku_core.py`

**Files:** Create `sudoku_core.py`, `tests/test_core.py`

**Interfaces — Produces:**
```python
Grid = list[int]                       # 81 ints, 0 = empty
UNITS: list[list[int]]                 # 27 юнитов (строки, столбцы, блоки)
PEERS: list[frozenset[int]]
TECH_TIER: dict[str, int]              # naked_single/hidden_single_{box,row,col}:1, pointing/claiming:2, naked_pair/hidden_pair:3
TECH_TITLE: dict[str, str]             # русское название с англ. в скобках
def parse(s: str) -> Grid              # цифры и '.', прочее игнорирует; ValueError если не 81
def to_str(g: Grid) -> str
def candidates(g: Grid) -> list[set[int]]
def count_solutions(g: Grid, limit: int = 2) -> int
def solve(g: Grid) -> Grid | None
def unit_name(u: int) -> str           # "строка 3" / "столбец 5" / "блок 7"
@dataclass class Step: technique: str; cell: int | None = None; value: int | None = None;
                       unit: int | None = None; eliminations: list[tuple[int, int]] = field(default_factory=list)
def find_steps(g: Grid, cands: list[set[int]] | None = None, techniques=None) -> list[Step]
def easiest_steps(g: Grid, cands=None) -> list[Step]   # шаги минимального доступного тира
def grade(g: Grid) -> int              # 1..3 по тирам, 4 если логикой ядра не решается
```

- [ ] **Step 1: Тесты** — `tests/test_core.py`:
```python
import unittest
from sudoku_core import *

P = "100006000600035120032000000000140030860000092050029000000000370013590008000400005"
S = "147286953698735124532914867279148536861357492354629781425861379713592648986473215"

class Core(unittest.TestCase):
    def test_parse_ascii(self):
        art = "1 . . | . . 6 | . . .\n" + "\n".join(["- - -"] ) + "\n"
        self.assertEqual(to_str(parse(P)), P)
        self.assertEqual(to_str(parse(P.replace("0", "."))), P)
        with self.assertRaises(ValueError): parse("123")
    def test_units_peers(self):
        self.assertEqual(len(UNITS), 27); self.assertEqual(len(PEERS[0]), 20)
        self.assertEqual(unit_name(0), "строка 1"); self.assertEqual(unit_name(9), "столбец 1"); self.assertEqual(unit_name(26), "блок 9")
    def test_solve_unique(self):
        self.assertEqual(to_str(solve(parse(P))), S)
        self.assertEqual(count_solutions(parse(P)), 1)
        self.assertEqual(count_solutions([0] * 81), 2)
    def test_steps_are_correct(self):
        g, sol = parse(P), parse(S)
        steps = find_steps(g)
        self.assertTrue(steps)
        for st in steps:
            if st.cell is not None: self.assertEqual(sol[st.cell], st.value, st)
            for c, v in st.eliminations: self.assertNotEqual(sol[c], v, st)
    def test_hidden_single_box(self):
        g = parse(P)
        hs = [s for s in find_steps(g, techniques=["hidden_single_box"])]
        for s in hs: self.assertEqual(s.unit, 18 + (s.cell // 27) * 3 + (s.cell % 9) // 3)
    def test_grade(self):
        self.assertEqual(grade(parse(P)), 1)
        L2 = "000030607001002050502060000800090063000000000620070004000020908080600300405080000"
        L3 = "000009050080030000705200001850060200020000010006050043100005304000040060070300000"
        self.assertEqual(grade(parse(L2)), 2); self.assertEqual(grade(parse(L3)), 3)
    def test_easiest(self):
        self.assertTrue(all(TECH_TIER[s.technique] == 1 for s in easiest_steps(parse(P))))
```
- [ ] **Step 2:** `python3 -m unittest tests.test_core -v` → FAIL (ImportError).
- [ ] **Step 3:** Реализация (по образцу `tools/gen_puzzles.py`: `logic_solve` + `count_solutions`), шаги — чистые функции от `(g, cands)`; `grade` применяет тиры по возрастанию, поддерживая состояние `cands`.
- [ ] **Step 4:** Тесты → PASS.

### Task 2: БД и импорт банка

**Files:** Create `db.py`, `tools/import_bank.py`; Test `tests/test_db.py`

**Interfaces — Produces:**
```python
# db.py
SCHEMA: str                                  # DDL из спецификации + индексы games(puzzle_id), moves(game_id)
def connect(path: str = "sudoku.db") -> sqlite3.Connection   # row_factory=Row, schema applied, WAL
# tools/import_bank.py
LEVELS = {"easy": "easy", "medium": "medium", "hard": "hard", "diabolical": "expert"}
def import_level(conn, bank_file: str, level: str, n: int) -> int  # скачивает первые n*100 байт (HTTP Range), проверяет, INSERT OR IGNORE
def seed_theory(conn, theory_dir="theory") -> int
CLI: python3 tools/import_bank.py [--n 5000] [--db sudoku.db] [--theory-only]
```
- [ ] **Step 1:** `tests/test_db.py`: `connect(":memory:")` создаёт 6 таблиц; повторный `connect` к тому же файлу не падает.
- [ ] **Step 2:** FAIL → реализация → PASS.
- [ ] **Step 3:** Импорт: запись банка = 12 hex + пробел + 81 цифра + пробел + рейтинг; `solution = solve(...)`, отбросить если `count_solutions != 1`; `tech_grade = grade(...)`.
- [ ] **Step 4:** Запуск `python3 tools/import_bank.py --n 5000` → по 5000 на уровень; проверка `SELECT level, COUNT(*), AVG(tech_grade) FROM puzzles GROUP BY level`.

### Task 3: Аналитика `analysis.py`

**Files:** Create `analysis.py`, `tests/test_analysis.py`

**Interfaces:**
- Consumes: `sudoku_core.parse, easiest_steps, TECH_TITLE, unit_name`; `db.connect`.
- Produces:
```python
LONG_PAUSE_MS = 20000
def replay(givens: str, moves: list[dict], upto_seq: int | None = None) -> Grid
    # place → value; erase → 0; undo → value (0 = пусто); note/check — без изменения сетки
def compute_metrics(moves: list[dict], end_ms: int) -> dict
    # keys: time_ms, first_move_ms, max_pause_ms, long_pauses, mistakes, corrections, checks, note_actions
    # mistakes = place с correct=0; corrections = place/erase поверх непустой пользовательской клетки
def pauses(moves: list[dict], threshold: int = LONG_PAUSE_MS) -> list[dict]  # {after_seq, start_ms, duration_ms}
def review(conn, game_id: int) -> dict
    # {game, pauses: [{after_seq, start_ms, duration_ms, board, had_errors, steps: [{technique, title, cell, value, unit, unit_name}]}]}
def stats(conn) -> dict
    # {by_level_mode: [{level, mode, n, median_ms, best_ms, mistakes_per_game, fail_rate}],
    #  daily: [{day, level, mode, n, median_ms}], techniques: [{technique, title, n, median_ms, accuracy}]}
```
- [ ] **Step 1:** Тесты: синтетические ходы → метрики (первый ход, макс. пауза, длинные паузы, ошибки/исправления); `replay` с undo; `review` на in-memory БД находит шаг в позиции паузы и шаг верен по решению; `stats` медиана на 3 партиях.
- [ ] **Step 2–4:** FAIL → реализация → PASS.

### Task 4: Упражнения `drills.py`

**Files:** Create `drills.py`, `tests/test_drills.py`

**Interfaces:**
- Produces:
```python
DRILL_TECHNIQUES = ["naked_single", "hidden_single_box", "hidden_single_row", "hidden_single_col"]
DRILL_PROMPT: dict[str, str]   # "Найди скрытую одиночку (hidden single) в блоке" и т.п.
def make_drills(conn, per_technique: int = 150, seed: int = 1) -> int
    # из easy/medium задач: решаем одиночками, в случайной точке 20–80% пустых клеток берём позицию,
    # где у техники T 1..3 шага; answers = [[cell, value], ...] шагов T
def next_drill(conn, technique: str | None = None) -> dict   # {id, technique, prompt, board}
    # адаптивно: техника без попыток → она; иначе max(медиана последних 10 верных * (1 + доля ошибок))
    # исключаем 50 последних показанных упражнений
def attempt(conn, drill_id: int, time_ms: int, cell: int, value: int) -> dict
    # {correct, valid_other_move, answers}; valid_other_move — верный ход по решению, но не той техники
```
- [ ] **Step 1:** Тесты: `make_drills` на 20 задачах создаёт упражнения всех 4 техник; ответы каждого упражнения верны по решению задачи; `attempt` верного/неверного ответа; адаптивный выбор отдаёт технику с худшей медианой.
- [ ] **Step 2–4:** FAIL → реализация → PASS. В `tools/import_bank.py` вызвать `make_drills` после импорта.

### Task 5: Сервер `server.py`

**Files:** Create `server.py`, `tests/test_server.py`

**Interfaces:** маршруты из спецификации; `def make_server(db_path: str, port: int, web_dir="web") -> ThreadingHTTPServer`; CLI `python3 server.py [--port 8765] [--db sudoku.db]`. `POST /moves` проставляет `correct` по решению. `POST /finish` считает метрики через `compute_metrics`, для original проверяет лимит, сохраняет в `games`.
- [ ] **Step 1:** Тесты поднимают сервер на порту 0 с временной БД (3 задачи + сид упражнений): полный цикл puzzle → game → moves → finish → review → stats; 404 на неизвестную игру; 400 на битый JSON.
- [ ] **Step 2–4:** FAIL → реализация → PASS.

### Task 6: Веб — игра

**Files:** Create `web/index.html`, `web/style.css`, `web/js/{app,api,board,play,md}.js`

**Interfaces:** `api.js` экспортирует `getPuzzle(level)`, `createGame(puzzleId, mode, limit)`, `sendMoves(gameId, moves)` (буфер + повтор), `finishGame(gameId, status, tMs)`, `getReview(id)`, `getStats()`, `nextDrill(tech)`, `sendAttempt(id, timeMs, cell, value)`, `getTheory()`, `getTheoryPage(slug)`. `board.js` экспортирует `createBoard(el, {givens, solution, mode, onMove})` — рендер, выделение, ввод (клавиатура/пэд), заметки, undo, подсветка по режиму; возвращает `{setMode, destroy}`.
- [ ] Перенести UI из `trainer.html`; уровень, режим, лимит; счётчик «Ошибки N/3» в original; failed при достижении лимита; по завершении — итоги + кнопка «Разбор пауз».

### Task 7: Веб — разбор, статистика, упражнения, теория, «Сегодня»

**Files:** Create `web/js/{review,stats,drills,theory,today}.js`
- [ ] `#/review/{id}`: список пауз, мини-доска позиции с подсветкой клетки шага и подписью «Тут был доступен: …».
- [ ] `#/stats`: таблица по уровню/режиму, SVG-линия медианы по дням, таблица техник.
- [ ] `#/drills`: доска упражнения, подсказка-задание, клик клетки + цифра, таймер; ответ → зелёный/красный + показ правильных ответов; «дальше» (Enter).
- [ ] `#/theory`, `#/theory/{slug}`: рендер markdown (`md.js`), кнопка «Тренировать» → `#/drills?technique=`.
- [ ] `#/today`: план — 5 мин упражнений → 2 партии уровня (по умолчанию medium hardcore) → ссылка на разбор последней.

### Task 8: Теория (параллельно, субагент)

**Files:** Create `theory/*.md` — 10 файлов: `scanning`, `naked-single`, `hidden-single`, `snyder-notation`, `pointing-claiming`, `naked-pair`, `hidden-pair`, `x-wing`, `y-wing`, `speed-habits`. Frontmatter: `slug`, `title`, `level` (1–3), `order`, `drill` (ключ из `DRILL_TECHNIQUES` или пусто).

### Task 9: Docker

**Files:** Create `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, `.dockerignore`
- [ ] `Dockerfile`: `python:3.12-slim`, `WORKDIR /app`, копирует код (без `data/`), непривилегированный пользователь с UID/GID из build-args (по умолчанию 1000), чтобы файлы в `./data` принадлежали хозяину.
- [ ] `docker-entrypoint.sh`: если в БД нет задач — `python3 tools/import_bank.py`; всегда `seed_theory`; затем `exec python3 server.py --host 0.0.0.0 --db /app/data/sudoku.db`.
- [ ] `docker-compose.yml`: сервис `sudoku-gym`, `ports: 127.0.0.1:8765:8765`, `volumes: ./data:/app/data, ./theory:/app/theory:ro`, `restart: unless-stopped`.
- [ ] Проверка: `docker compose up -d --build` → `curl 127.0.0.1:8765/api/stats` → 200; `docker compose restart` сохраняет партии.

### Task 10: Интеграция

- [ ] Перенести партию L1-1 из `progress.md` в `games` (ходы не сохранились — только метрики, `puzzle_id` = импортированная L1-1 как `level='easy'`, `bank_id='diag-L1-1'`).
- [ ] Обновить `.claude/skills/sudoku-speed-coach/SKILL.md`: источник данных — `sudoku.db` (примеры SQL), запуск `python3 server.py`.
- [ ] Playwright E2E `tests/e2e/gym.spec.mjs`: партия до конца в hardcore и original (лимит 3 → failed), разбор пауз открывается, упражнение принимает ответ, теория рендерится; без ошибок консоли.
- [ ] Финальный прогон всех тестов.
