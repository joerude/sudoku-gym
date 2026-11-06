# Sudoku Gym

**English** · [Русский](README.ru.md)

A local trainer for speed sudoku, in English or Russian. Inspired by [Monkeytype](https://monkeytype.com) (themes, fonts, minimal look) and [lichess](https://lichess.org) (zen mode, puzzle drills).

- **Play**: 20,000 puzzles filtered by technique, original and hardcore modes as on usdoku, your own grids (paste one from usdoku), a daily puzzle.
- **Learn from each game**: a review of your pauses, a step-by-step hint when stuck (technique → where → pattern → move), an analysis board, and a solver walkthrough from any moment (`#/solve/{id}`).
- **Drills**: "find the move" for 10 techniques with explanations and a lichess-style rating against your own per-technique norm.
- **Theory**: a page per technique with diagrams, a worked example and your drill progress.
- **Stats**: an activity calendar, a day streak and records. Look and favourites export to JSON.
- **Coach**: Claude Code coaches through the `sudoku-speed-coach` skill (`.claude/skills/`) and reads progress straight from the database.

## Run

```bash
./gym start    # build the Docker container, wait for the server, open http://127.0.0.1:8765
```

The first start downloads the puzzle bank ([grantm/sudoku-exchange-puzzle-bank](https://github.com/grantm/sudoku-exchange-puzzle-bank), public domain) and builds the drills, which takes a couple of minutes. Later the container comes back with Docker, so `./gym open` is enough. Progress lives in `data/sudoku.db` (not in git), and every start backs it up to `data/backups/`.

No Docker? `./gym dev` runs from the working tree on Python 3.14+. If it finds no such Python but finds [uv](https://docs.astral.sh/uv/), it installs one through uv.

**Windows**: clone or download the repo and double-click `gym.cmd`. If Python 3.14+ is missing, it offers to install it via winget. Keep the black window open while you play.

| Command | What it does |
|---|---|
| `./gym start` · `stop` · `restart` | run, stop, rebuild the container (progress in `data/` stays) |
| `./gym open` · `status` · `logs [N]` | open the browser, check the server, follow the logs |
| `./gym dev` | run without Docker (`PORT=8766 ./gym dev` for another port) |
| `./gym backup` | copy `data/sudoku.db` into `data/backups/`, newest 20 kept |

Env: `NO_OPEN=1` skips the browser, `BACKUP_DIR` and `KEEP` move or resize the backup set.

Keys not reacting in Firefox? Extensions like Vimium take the digit keys: exclude `http://127.0.0.1:8765/*` there. `http://127.0.0.1:8765/?debug` shows where each key press goes.

## Develop

Python 3.14+, stdlib only; the UI is vanilla JS in `web/`. Dev tools (ruff, pre-commit) run through `uvx`, so there is nothing to install.

```bash
./gym setup          # once: git hooks (ruff, unit tests, no AI trailers in commit messages)
./gym test           # unit tests, then e2e if node and playwright-core are found
./gym test unit      # unit only; ./gym test e2e for e2e only (BROWSER=firefox)
./gym check          # all hooks on all files
python3.14 tools/regrade.py   # recompute tech_grade after changing techniques in the core
```

| Module | Role |
|---|---|
| `sudoku_core.py` | candidates, technique-labelled steps, solver, grade 1–5 |
| `db.py` | SQLite schema, connection and migrations |
| `analysis.py` | game metrics, pause review, stats, calendar and streaks, daily puzzle |
| `drills.py` | drill generation, adaptive pick, technique unlocks, explanations |
| `hints.py` | board and notes errors, the 4-level hint ladder, the solve line |
| `rating.py` | drill rating: per-technique norms, Elo replayed from attempts |
| `server.py` | HTTP API and static files |
| `theory/*.md` | theory articles; ```` ```sudoku ```` blocks are drawn as boards (format in `web/js/diagram.js`, checked by `tests/test_theory.py`) |
