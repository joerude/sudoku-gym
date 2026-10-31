# Sudoku Gym

A local trainer for speed sudoku, in Russian or English (RU/EN in the header; the first visit follows the browser language). It has 20,000 puzzles filterable by technique, original and hardcore modes as on usdoku (original with your own mistake limit), your own grids (type one in or paste it, e.g. a puzzle from usdoku, and play it under a level of your choice), a review of your pauses after each game, "find the move" drills for 10 techniques with explanations, theory pages and stats; the look and favourites export to a JSON file and import on another machine. Claude Code coaches through the `sudoku-speed-coach` skill (`.claude/skills/`) and reads progress straight from the database.

Inspired by [Monkeytype](https://monkeytype.com) (themes, fonts, minimal look) and [lichess](https://lichess.org) (zen mode, puzzle-style drills).

## Run

```bash
./gym start    # build and start the container, wait for the server, open http://127.0.0.1:8765
```

The first start downloads the puzzle bank ([grantm/sudoku-exchange-puzzle-bank](https://github.com/grantm/sudoku-exchange-puzzle-bank), public domain) and generates the drills, which takes a couple of minutes. After that the container comes back by itself whenever Docker starts (`restart: unless-stopped`), so after a reboot `./gym open` is enough. Progress lives in `data/sudoku.db` (bind-mounted, not in git). Theory comes from `theory/*.md` and is reloaded on every start.

| Command | What it does |
|---|---|
| `./gym start` | build and start the container, wait until it answers, open the browser |
| `./gym stop` | stop the container (progress in `data/` stays) |
| `./gym restart` | rebuild and restart, e.g. after code changes |
| `./gym status` | is the server up, how many puzzles are loaded |
| `./gym logs [N]` | follow the container logs |
| `./gym open` | open the trainer in the browser |
| `./gym dev` | run without Docker from the working tree (`PORT=8766 ./gym dev` for another port) |
| `./gym test` | unit tests, then e2e if node and playwright-core are found (`BROWSER=firefox` for Firefox) |

`NO_OPEN=1` skips opening the browser. The plain equivalents: `docker compose up -d --build`, or without Docker `python3 tools/import_bank.py --if-empty && python3 server.py`.

Keyboard not reacting in Firefox? Keyboard extensions such as Vimium take the digit keys before the page sees them: exclude `http://127.0.0.1:8765/*` in their settings. `http://127.0.0.1:8765/?debug` shows where each key press goes.

## Develop

```bash
./gym test                               # both suites below
python3 -m unittest discover -s tests   # unit tests
node tests/e2e/gym.spec.mjs [shots-dir]  # e2e, needs playwright-core (PLAYWRIGHT_CORE=<its node_modules>)
python3 tools/regrade.py                 # recompute tech_grade after technique changes in the core
```

| Module | Role |
|---|---|
| `sudoku_core.py` | candidates, technique-labelled steps, solver, grade 1–5 |
| `db.py` | SQLite schema |
| `analysis.py` | game metrics, pause review, stats |
| `drills.py` | drill generation, adaptive pick, technique unlocks, explanations |
| `server.py` | HTTP API and static files from `web/` |
| `web/` | UI (vanilla JS) |
