# Sudoku Gym — дизайн

Дата: 2026-10-30. Статус: утверждён пользователем.

## Цель

Локальный тренажёр скоростного судоку для одного ученика (usdoku.com, medium ~6–8 мин → цель 4 мин). Хранит каждую партию и ход в SQLite, чтобы тренер (Claude Code) анализировал прогресс напрямую. Главные рычаги скорости: разбор пауз и упражнения на распознавание техник.

## Архитектура

| Модуль | Ответственность | Зависит от |
|---|---|---|
| `sudoku_core.py` | Кандидаты, поиск шагов с названием техники, решатель, счёт решений, грейд | — |
| `db.py` | Схема SQLite, подключение, запросы | — |
| `analysis.py` | Метрики партии из ходов, разбор пауз, статистика | core, db |
| `drills.py` | Генерация упражнений «найди ход», адаптивный выбор | core, db |
| `server.py` | `http.server` на 127.0.0.1:8765: статика `web/` + JSON API | всё выше |
| `tools/import_bank.py` | Импорт sudoku-exchange-puzzle-bank, проверка, грейд, сид теории и упражнений | core, db, drills |
| `web/` | Интерфейс на чистом JS (ES-модули, без сборки) | API |
| `theory/*.md` | Исходники теории (frontmatter: slug, title, level, order) | — |

Только стандартная библиотека Python 3. Тесты — `unittest`, UI — Playwright (playwright-core из scratchpad + кэшированный Chromium).

## Данные

```sql
puzzles(id INTEGER PRIMARY KEY, bank_id TEXT UNIQUE, level TEXT,   -- easy|medium|hard|expert
        givens TEXT, solution TEXT, se_rating REAL, tech_grade INTEGER) -- 1 singles, 2 locked, 3 pairs, 4 harder
games(id INTEGER PRIMARY KEY, puzzle_id INTEGER, mode TEXT,          -- original|hardcore
      mistake_limit INTEGER NULL, started_at TEXT, finished_at TEXT,
      status TEXT,                                                   -- active|solved|failed|abandoned
      time_ms INTEGER, mistakes INTEGER, corrections INTEGER, checks INTEGER,
      note_actions INTEGER, first_move_ms INTEGER, max_pause_ms INTEGER, long_pauses INTEGER)
moves(game_id INTEGER, seq INTEGER, t_ms INTEGER, cell INTEGER, value INTEGER,
      kind TEXT,                                                     -- place|erase|note|check|undo
      correct INTEGER NULL, PRIMARY KEY(game_id, seq))
techniques(slug TEXT PRIMARY KEY, title TEXT, level INTEGER, ord INTEGER, body_md TEXT)
drills(id INTEGER PRIMARY KEY, technique TEXT, puzzle_id INTEGER, board TEXT, answers TEXT) -- answers: JSON [[cell,value],...]
drill_attempts(id INTEGER PRIMARY KEY, drill_id INTEGER, at TEXT, time_ms INTEGER, correct INTEGER,
               cell INTEGER, value INTEGER)
```

Метрики партии считает сервер из `moves` (клиенту не доверяем). Пауза — промежуток между последовательными `place`-ходами (и от старта до первого); «длинная» — > 20 с.

Уровни: easy/medium/hard/diabolical банка → easy/medium/hard/expert. 5000 задач на уровень; каждая проверена на единственность решения.

## Техники ядра (поиск шагов)

`naked_single`, `hidden_single_box`, `hidden_single_row`, `hidden_single_col`, `pointing`, `claiming`, `naked_pair`, `hidden_pair`. Шаг: `{technique, cell, value}` для размещений или `{technique, eliminations: [[cell, value]], unit}` для исключений. Кандидаты всегда считаются заново из размещённых цифр (заметки ученика не учитываются).

## API

- `GET /api/puzzle?level=medium` → случайная несыгранная задача `{id, level, givens, solution, tech_grade}`
- `POST /api/games` `{puzzle_id, mode, mistake_limit}` → `{id}`
- `POST /api/games/{id}/moves` `{moves:[{seq,t_ms,cell,value,kind}]}` — отправляется по мере игры
- `POST /api/games/{id}/finish` `{status, t_ms}` → метрики
- `GET /api/games/{id}/review` → паузы > 20 с: позиция до паузы, длительность, доступные шаги
- `GET /api/stats` → медианы по уровню/режиму, тренд по дням, доля ошибок, скорость по техникам
- `GET /api/drills/next?technique=` → упражнение (без `technique` — адаптивно: самая медленная/ошибочная техника)
- `POST /api/drills/{id}/attempt` `{time_ms, cell, value}` → `{correct, answers}`
- `GET /api/theory`, `GET /api/theory/{slug}`

## Игра

- **original**: ошибки подсвечены, счётчик «Ошибки N/лимит», при достижении лимита (по умолчанию 3, можно выключить) — партия `failed`.
- **hardcore**: без подсветки и счётчика, ошибки считаются скрыто, показываются в итогах.
- Подсветка той же цифры, строки/столбца/блока; заметки (Shift+цифра, N/пробел); автоочистка заметок; стрелки; Ctrl+Z; Ctrl+V своей сетки.

## Страницы (hash-роутинг)

`#/today` (разминка 5 мин → 2–3 партии уровня ученика → разбор), `#/play`, `#/review/{id}`, `#/drills`, `#/stats`, `#/theory`, `#/theory/{slug}`.

## Этапы

1. Ядро, БД, импорт, игра с записью ходов.
2. Разбор пауз и статистика.
3. Упражнения на одиночки (затем — на исключения: pointing/claiming/пары).
4. Теория + перенос результатов из `progress.md` в БД.

## Обработка ошибок

API отвечает JSON `{error}` с кодом 400/404. Клиент буферизует ходы и повторяет отправку при ошибке сети; при `finish` дожидается отправки буфера. Импорт идемпотентен (`bank_id UNIQUE`, `INSERT OR IGNORE`).
