# Sudoku Gym

A local trainer for speed sudoku (Russian UI). It has 20,000 puzzles filterable by technique, original and hardcore modes as on usdoku, a review of your pauses after each game, "find the move" drills for 10 techniques with explanations, theory pages and stats. Claude Code coaches through the `sudoku-speed-coach` skill (`.claude/skills/`) and reads progress straight from the database.

Inspired by [Monkeytype](https://monkeytype.com) (themes, fonts, minimal look) and [lichess](https://lichess.org) (zen mode, puzzle-style drills).

## Run

```bash
docker compose up -d --build   # http://127.0.0.1:8765
```

The first start downloads the puzzle bank ([grantm/sudoku-exchange-puzzle-bank](https://github.com/grantm/sudoku-exchange-puzzle-bank), public domain) and generates the drills. Progress lives in `data/sudoku.db` (bind-mounted, not in git). Theory comes from `theory/*.md` and is reloaded on every start.

Without Docker: `python3 tools/import_bank.py --if-empty && python3 server.py`

## Develop

```bash
python3 -m unittest discover -s tests   # unit tests
node tests/e2e/gym.spec.mjs [shots-dir]  # e2e, needs playwright-core
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

Design docs and plans are in `docs/superpowers/`.
