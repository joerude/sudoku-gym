# Sudoku Gym

Локальный тренажёр скоростного судоку: 20 000 задач с фильтром по технике, режимы original/hardcore как на usdoku, разбор пауз, упражнения «найди ход» по 10 техникам с объяснениями, теория и статистика. Тренер — Claude Code со skill `sudoku-speed-coach` (`.claude/skills/`), читает прогресс прямо из базы.

## Запуск

```bash
docker compose up -d --build   # http://127.0.0.1:8765
```

Первый старт скачивает банк задач ([grantm/sudoku-exchange-puzzle-bank](https://github.com/grantm/sudoku-exchange-puzzle-bank), public domain) и генерирует упражнения. Прогресс — в `data/sudoku.db` (bind mount, в git не попадает); теория — `theory/*.md`, подхватывается при каждом старте.

Без Docker: `python3 tools/import_bank.py --if-empty && python3 server.py`.

## Разработка

```bash
python3 -m unittest discover -s tests          # юнит-тесты
node tests/e2e/gym.spec.mjs [папка-скриншотов]  # e2e (нужен playwright-core)
python3 tools/regrade.py                        # пересчитать tech_grade после изменения техник в ядре
```

| Модуль | Что делает |
|---|---|
| `sudoku_core.py` | кандидаты, шаги с названием техники, решатель, грейд 1–5 |
| `db.py` | схема SQLite |
| `analysis.py` | метрики партии, разбор пауз, статистика |
| `drills.py` | генерация упражнений, адаптивный выбор, открытие техник, объяснения |
| `server.py` | HTTP API + статика `web/` |
| `web/` | интерфейс (vanilla JS) |

Дизайн и план: `docs/superpowers/`.
