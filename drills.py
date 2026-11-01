"""Drills «найди ход»: generation from the puzzle bank and adaptive selection.

Two kinds of drills:
- place:     tier-1 techniques (singles) — answer is a placement [cell, value];
- eliminate: everything else — answer is a candidate removal [cell, value].
Candidates are always computed fresh from the digits on the board.
"""

import json
import random
import statistics
import time

from db import is_favorite, now_iso
from i18n import tr
from sudoku_core import BOX_OF, PEERS, TECH_TIER, TECH_TITLE, candidates, find_steps, parse, to_str

DRILL_TECHNIQUES = list(TECH_TIER)
KIND = {t: "place" if TECH_TIER[t] == 1 else "eliminate" for t in DRILL_TECHNIQUES}
_PROMPTS = {
    "naked_single": "Найди клетку, где остался один кандидат (naked single)",
    "hidden_single_box": "Найди скрытую одиночку (hidden single) в блоке",
    "hidden_single_row": "Найди скрытую одиночку (hidden single) в строке",
    "hidden_single_col": "Найди скрытую одиночку (hidden single) в столбце",
    "pointing": "Найди кандидата, которого убирает указывающая пара (pointing)",
    "claiming": "Найди кандидата, которого убирает захват (claiming)",
    "naked_pair": "Найди кандидата, которого убирает голая пара (naked pair)",
    "hidden_pair": "Найди кандидата, которого убирает скрытая пара (hidden pair)",
    "x_wing": "Найди кандидата, которого убирает X-Wing",
    "y_wing": "Найди кандидата, которого убирает Y-Wing",
}
DRILL_PROMPT = {t: _PROMPTS.get(t, f"Найди ход: {TECH_TITLE.get(t, t)}") for t in DRILL_TECHNIQUES}


def drill_prompt(t: str) -> str:
    """DRILL_PROMPT in the request's language."""
    return tr(_PROMPTS[t]) if t in _PROMPTS else tr("Найди ход: {title}", title=tr(TECH_TITLE.get(t, t)))


SINGLES = [t for t in DRILL_TECHNIQUES if TECH_TIER[t] == 1]
ELIMINATORS = [t for t in DRILL_TECHNIQUES if TECH_TIER[t] > 1]
MAX_TIER = max(TECH_TIER.values())
RECENT_EXCLUDE = 50  # drills attempted most recently are not shown again
MEDIAN_WINDOW = 10  # last N correct attempts for the speed median
ERROR_WINDOW = 20  # last N attempts for the error rate
UNLOCK_MIN_CORRECT = 15  # a technique counts as mastered after this many correct answers…
UNLOCK_MIN_ACCURACY = 0.8  # …with at least this accuracy over the last ERROR_WINDOW attempts
# Neither right nor wrong: a true move by another technique, or the right answer found after a hint.
NEUTRAL = "(a.valid_other = 1 OR (a.hint > 0 AND a.correct = 1))"
THEORY_SLUG = {
    "naked_single": "naked-single",
    "hidden_single_box": "hidden-single",
    "hidden_single_row": "hidden-single",
    "hidden_single_col": "hidden-single",
    "pointing": "pointing-claiming",
    "claiming": "pointing-claiming",
    "naked_pair": "naked-pair",
    "hidden_pair": "hidden-pair",
    "x_wing": "x-wing",
    "y_wing": "y-wing",
}


def _place(g, cands, cell, value):
    g[cell] = value
    cands[cell] = set()
    for p in PEERS[cell]:
        cands[p].discard(value)


def _place_position(givens: str, rng: random.Random):
    """Walk a singles-only solve one random step at a time; stop at a random 20–80% fill point.

    Returns the grid, or None if the singles walk stalls before the target."""
    g = parse(givens)
    empty = g.count(0)
    lo, hi = -(-empty * 20 // 100), empty * 80 // 100
    if empty == 0 or lo > hi:
        return None
    target = rng.randint(lo, hi)
    cands = candidates(g)
    for _ in range(target):
        steps = find_steps(g, cands, SINGLES)
        if not steps:
            return None
        st = rng.choice(steps)
        _place(g, cands, st.cell, st.value)
    return g


def _stuck_positions(givens: str):
    """Logic solve keeping candidate state; yield the board each time singles run out.

    After each yield the eliminations of the easiest available tier are applied and the solve goes on."""
    g = parse(givens)
    cands = candidates(g)
    last = None
    while 0 in g:
        if any(not g[i] and not cands[i] for i in range(81)):
            return
        singles = [s for s in find_steps(g, cands, SINGLES) if not g[s.cell] and s.value in cands[s.cell]]
        if singles:
            for s in singles:
                if not g[s.cell] and s.value in cands[s.cell]:
                    _place(g, cands, s.cell, s.value)
            continue
        board = to_str(g)
        if board != last:
            last = board
            yield g[:]
        for tier in range(2, MAX_TIER + 1):
            steps = find_steps(g, cands, [t for t in ELIMINATORS if TECH_TIER[t] == tier])
            if steps:
                for st in steps:
                    for c, v in st.eliminations:
                        cands[c].discard(v)
                break
        else:
            return


def _answers(technique, steps):
    if KIND[technique] == "place":
        return sorted({(s.cell, s.value) for s in steps})
    return sorted({(c, v) for s in steps for c, v in s.eliminations})


def make_drills(conn, per_technique: int = 150, seed: int = 1, max_seconds: float = 80.0) -> int:
    """Generate drills until each technique has per_technique of them (rare ones may get fewer).

    place drills come from easy/medium puzzles, eliminate drills from medium/hard puzzles (expert too for
    the top tier). Existing drills count towards the quota and identical (technique, board) pairs are
    skipped, so re-running only tops up. Returns the number of rows inserted."""
    rng = random.Random(seed)
    deadline = time.monotonic() + max_seconds
    have = dict.fromkeys(DRILL_TECHNIQUES, 0)
    seen = set()
    for t, board in conn.execute("SELECT technique, board FROM drills"):
        if t in have:
            have[t] += 1
        seen.add((t, board))
    added = 0

    def store(t, pid, board, pairs):
        nonlocal added
        conn.execute(
            "INSERT INTO drills (technique, kind, puzzle_id, board, answers) VALUES (?, ?, ?, ?, ?)",
            (t, KIND[t], pid, board, json.dumps([list(p) for p in pairs])),
        )
        seen.add((t, board))
        have[t] += 1
        added += 1

    def pool(levels, min_grade=1):
        rows = conn.execute(
            f"SELECT id, level, givens, solution FROM puzzles WHERE level IN ({','.join('?' * len(levels))})"
            " AND tech_grade >= ? ORDER BY id",
            (*levels, min_grade),
        ).fetchall()
        rng.shuffle(rows)
        return rows

    # place drills
    for pid, _, givens, solution in pool(("easy", "medium")):
        need = [t for t in SINGLES if have[t] < per_technique]
        if not need or time.monotonic() > deadline:
            break
        g = _place_position(givens, rng)
        if g is None:
            continue
        cands, board = candidates(g), to_str(g)
        for t in need:
            pairs = _answers(t, find_steps(g, cands, [t]))
            if 1 <= len(pairs) <= 3 and (t, board) not in seen and all(int(solution[c]) == v for c, v in pairs):
                store(t, pid, board, pairs)

    # eliminate drills: one per technique per puzzle, taken at the first stuck point where it fits
    # (grade-1 puzzles never get stuck on singles, so they are skipped)
    for pid, level, givens, solution in pool(("medium", "hard", "expert"), min_grade=2):
        if time.monotonic() > deadline or all(have[t] >= per_technique for t in ELIMINATORS):
            break
        need = [t for t in ELIMINATORS if have[t] < per_technique and (level != "expert" or TECH_TIER[t] == MAX_TIER)]
        if not need:
            continue
        for g in _stuck_positions(givens):
            fresh, board = candidates(g), to_str(g)
            for t in list(need):
                steps = find_steps(g, fresh, [t])
                if not 1 <= len(steps) <= 3 or (t, board) in seen:
                    continue
                pairs = _answers(t, steps)
                if pairs and all(int(solution[c]) != v for c, v in pairs):
                    store(t, pid, board, pairs)
                    need.remove(t)
            if not need:
                break
    conn.commit()
    return added


def _score(conn, technique: str):
    """None if never attempted; else median of recent correct times × (1 + recent error rate)."""
    rows = conn.execute(
        "SELECT a.correct FROM drill_attempts a JOIN drills d ON d.id = a.drill_id"
        f" WHERE d.technique = ? AND NOT {NEUTRAL} ORDER BY a.id DESC LIMIT ?",
        (technique, ERROR_WINDOW),
    ).fetchall()
    if not rows:
        return None
    correct_times = [
        r[0]
        for r in conn.execute(
            "SELECT a.time_ms FROM drill_attempts a JOIN drills d ON d.id = a.drill_id"
            " WHERE d.technique = ? AND a.correct = 1 AND a.hint = 0 ORDER BY a.id DESC LIMIT ?",
            (technique, MEDIAN_WINDOW),
        )
    ]
    if not correct_times:
        return float("inf")
    error_rate = sum(1 for r in rows if not r[0]) / len(rows)
    return statistics.median(correct_times) * (1 + error_rate)


def available_techniques(conn) -> list:
    have = {r[0] for r in conn.execute("SELECT DISTINCT technique FROM drills")}
    return [t for t in DRILL_TECHNIQUES if t in have]


def mastery(conn, technique: str) -> dict:
    """{correct, accuracy, mastered}: total correct answers and accuracy over the last ERROR_WINDOW attempts.

    A true move found by another technique and a right answer after a hint are neutral (NEUTRAL);
    a revealed answer is an error."""
    correct = conn.execute(
        "SELECT COUNT(*) FROM drill_attempts a JOIN drills d ON d.id = a.drill_id"
        " WHERE d.technique = ? AND a.correct = 1 AND a.hint = 0",
        (technique,),
    ).fetchone()[0]
    recent = [
        r[0]
        for r in conn.execute(
            "SELECT a.correct FROM drill_attempts a JOIN drills d ON d.id = a.drill_id WHERE d.technique = ?"
            f" AND NOT {NEUTRAL} ORDER BY a.id DESC LIMIT ?",
            (technique, ERROR_WINDOW),
        )
    ]
    accuracy = sum(recent) / len(recent) if recent else None
    return {
        "correct": correct,
        "accuracy": accuracy,
        "mastered": correct >= UNLOCK_MIN_CORRECT and (accuracy or 0) >= UNLOCK_MIN_ACCURACY,
    }


def unlocked_tier(conn) -> int:
    """Tiers open one by one: tier N+1 unlocks once every technique of tier N with drills is mastered."""
    have = set(available_techniques(conn))
    tier = 1
    while tier < MAX_TIER:
        techs = [t for t in DRILL_TECHNIQUES if TECH_TIER[t] == tier and t in have]
        if not all(mastery(conn, t)["mastered"] for t in techs):
            break
        tier += 1
    return tier


def unlocked_techniques(conn) -> list:
    top = unlocked_tier(conn)
    return [t for t in available_techniques(conn) if TECH_TIER[t] <= top]


def pick_technique(conn) -> str | None:
    """Adaptive choice among unlocked techniques: first never attempted, else the worst median × (1 + error rate)."""
    best, best_score = None, None
    for t in unlocked_techniques(conn):
        score = _score(conn, t)
        if score is None:
            return t
        if best_score is None or score > best_score:
            best, best_score = t, score
    return best


def next_drill(conn, technique: str | None = None) -> dict | None:
    """technique: None → adaptive, 'random' → random unlocked technique, 'favorites' → a starred drill of any
    technique, else any slug (explicit choice).

    Raises ValueError on an unknown slug; returns None when there is no drill."""
    if technique == "favorites":
        where, args = "id IN (SELECT ref_id FROM favorites WHERE kind = 'drill')", ()
    else:
        if technique == "random":
            techs = unlocked_techniques(conn)
            technique = random.choice(techs) if techs else None
        elif technique is None:
            technique = pick_technique(conn)
        elif technique not in DRILL_TECHNIQUES:
            raise ValueError(tr("неизвестная техника: {t}", t=technique))
        if technique is None:
            return None
        where, args = "technique = ?", (technique,)
    row = conn.execute(
        f"SELECT id, technique, kind, board FROM drills WHERE {where} AND id NOT IN"
        " (SELECT drill_id FROM drill_attempts ORDER BY id DESC LIMIT ?) ORDER BY RANDOM() LIMIT 1",
        (*args, RECENT_EXCLUDE),
    ).fetchone()
    if row is None:  # everything was attempted recently: take the least recently attempted one
        row = conn.execute(
            "SELECT d.id, d.technique, d.kind, d.board FROM drills d LEFT JOIN drill_attempts a ON a.drill_id = d.id"
            f" WHERE d.{where} GROUP BY d.id ORDER BY MAX(COALESCE(a.id, 0)), RANDOM() LIMIT 1",
            args,
        ).fetchone()
    if row is None:
        return None
    board = row[3]
    return {
        "id": row[0],
        "technique": row[1],
        "kind": row[2],
        "prompt": drill_prompt(row[1]),
        "title": tr(TECH_TITLE[row[1]]),
        "board": board,
        "candidates": [sorted(c) for c in candidates(parse(board))],
        "fav": is_favorite(conn, "drill", row[0]),
    }


def _drill(conn, drill_id: int):
    return conn.execute(
        "SELECT d.board, d.answers, d.kind, p.solution, d.technique FROM drills d JOIN puzzles p ON p.id = d.puzzle_id"
        " WHERE d.id = ?",
        (drill_id,),
    ).fetchone()


def attempt(conn, drill_id: int, time_ms: int, cell: int, value: int, hint: int = 0, rated: int = 1) -> dict | None:
    """Record an answer (hint=1: given after «где искать»; rated=0: answered in «Избранное», kept out of the
    rating). Returns {correct, valid_other_move, answers, …, attempt_id, technique} or None for an unknown drill.

    valid_other_move — a true move not made by the drill's technique: for place drills a correct digit in an
    empty cell; for eliminate drills a fresh candidate that is not the cell's solution."""
    row = _drill(conn, drill_id)
    if row is None:
        return None
    board, answers, kind, solution = row[0], json.loads(row[1]), row[2], row[3]
    correct = [cell, value] in answers
    valid_other = False
    if not correct and 0 <= cell < 81 and board[cell] == "0":
        if kind == "eliminate":
            valid_other = str(value) != solution[cell] and value in candidates(parse(board))[cell]
        else:
            valid_other = solution[cell] == str(value)
    cur = conn.execute(
        "INSERT INTO drill_attempts (drill_id, at, time_ms, correct, cell, value, valid_other, hint, rated)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (drill_id, now_iso(), time_ms, int(correct), cell, value, int(valid_other), hint, rated),
    )
    conn.commit()
    return {
        "correct": correct,
        "valid_other_move": valid_other,
        "answers": answers,
        **explain(board, row[4], answers, (cell, value) if correct else None),
        "theory": THEORY_SLUG.get(row[4]),
        "attempt_id": cur.lastrowid,
        "technique": row[4],
    }


def reveal(conn, drill_id: int, time_ms: int, rated: int = 1) -> dict | None:
    """«Не знаю — покажи ответ»: recorded as a wrong attempt (hint=2, no cell); returns what attempt() returns."""
    row = _drill(conn, drill_id)
    if row is None:
        return None
    answers = json.loads(row[1])
    cur = conn.execute(
        "INSERT INTO drill_attempts (drill_id, at, time_ms, correct, hint, rated) VALUES (?, ?, ?, 0, 2, ?)",
        (drill_id, now_iso(), time_ms, rated),
    )
    conn.commit()
    return {
        "correct": False,
        "valid_other_move": False,
        "answers": answers,
        **explain(row[0], row[4], answers),
        "theory": THEORY_SLUG.get(row[4]),
        "attempt_id": cur.lastrowid,
        "technique": row[4],
    }


def hint(conn, drill_id: int) -> dict | None:
    """«Где искать» without the answer: {hint, unit (0-26 | None), digit | None, cells} for the board highlight."""
    row = _drill(conn, drill_id)
    if row is None:
        return None
    steps, cands = _steps(row[0], row[4], json.loads(row[1]))
    if not steps:
        return {"hint": tr("Ищи: {title}.", title=tr(TECH_TITLE[row[4]])), "unit": None, "digit": None, "cells": []}
    return hint_step(steps[0], cands)


def technique_list(conn) -> list:
    """[{technique, title, kind, tier, n, unlocked, theory, correct, accuracy, mastered}] for every drill technique."""
    counts = dict(conn.execute("SELECT technique, COUNT(*) FROM drills GROUP BY technique").fetchall())
    top = unlocked_tier(conn)
    return [
        {
            "technique": t,
            "title": tr(TECH_TITLE[t]),
            "kind": KIND[t],
            "tier": TECH_TIER[t],
            "n": counts.get(t, 0),
            "unlocked": TECH_TIER[t] <= top,
            "theory": THEORY_SLUG.get(t),
            **mastery(conn, t),
        }
        for t in DRILL_TECHNIQUES
    ]


def rc(c: int) -> str:
    return f"r{c // 9 + 1}c{c % 9 + 1}"


def in_unit(u: int) -> str:
    return tr(("строке {n}", "столбце {n}", "блоке {n}")[u // 9], n=u % 9 + 1)


def cells_text(cells) -> str:
    return ", ".join(rc(c) for c in cells)


def _elims(elims) -> str:
    digits = {v for _, v in elims}
    if len(digits) == 1:
        return tr("{v} из {cells}", v=next(iter(digits)), cells=cells_text(c for c, _ in elims))
    return ", ".join(tr("{v} из {cells}", v=v, cells=rc(c)) for c, v in elims)


def explain_step(s, cands) -> str:
    t = s.technique
    if t == "naked_single":
        return tr(
            "В {cell} остался один кандидат — {v}: остальные цифры уже стоят в её строке, столбце или блоке.",
            cell=rc(s.cell),
            v=s.value,
        )
    if t.startswith("hidden_single"):
        return tr("В {unit} цифра {v} может стоять только в {cell}.", unit=in_unit(s.unit), v=s.value, cell=rc(s.cell))
    v, elims = s.eliminations[0][1], _elims(s.eliminations)
    if t == "pointing":
        same_row = len({c // 9 for c in s.pattern}) == 1
        line = tr("строке {n}", n=s.pattern[0] // 9 + 1) if same_row else tr("столбце {n}", n=s.pattern[0] % 9 + 1)
        this = tr("этой строке") if same_row else tr("этом столбце")
        return tr(
            "В {unit} цифра {v} может стоять только в {line} ({cells}). "
            "Значит, в {this} вне блока {v} быть не может → убираем {elims}.",
            unit=in_unit(s.unit),
            v=v,
            line=line,
            cells=cells_text(s.pattern),
            this=this,
            elims=elims,
        )
    if t == "claiming":
        box = BOX_OF[s.pattern[0]]
        return tr(
            "В {unit} цифра {v} может стоять только внутри блока {box} ({cells}). "
            "Значит, в остальных клетках блока {box} её быть не может → убираем {elims}.",
            unit=in_unit(s.unit),
            v=v,
            box=box - 17,
            cells=cells_text(s.pattern),
            elims=elims,
        )
    if t == "naked_pair":
        a, b = s.pattern
        x, y = sorted(cands[a])
        return tr(
            "В {unit} клетки {a} и {b} содержат только {x} и {y} — эти две цифры займут именно их → убираем {elims}.",
            unit=in_unit(s.unit),
            a=rc(a),
            b=rc(b),
            x=x,
            y=y,
            elims=elims,
        )
    if t == "hidden_pair":
        a, b = s.pattern
        removed = {v for _, v in s.eliminations}
        x, y = sorted((cands[a] & cands[b]) - removed)[:2]
        return tr(
            "В {unit} цифры {x} и {y} могут стоять только в {a} и {b} → эти клетки "
            "заняты ими, остальные кандидаты оттуда убираем: {elims}.",
            unit=in_unit(s.unit),
            x=x,
            y=y,
            a=rc(a),
            b=rc(b),
            elims=elims,
        )
    if t == "x_wing":
        rows = sorted({c // 9 + 1 for c in s.pattern})
        cols = sorted({c % 9 + 1 for c in s.pattern})
        by_rows = all((c % 9 + 1) in cols for c, _ in s.eliminations)
        in_rows, in_cols = tr("строках {a} и {b}", a=rows[0], b=rows[1]), tr("столбцах {a} и {b}", a=cols[0], b=cols[1])
        base, cover = (in_rows, in_cols) if by_rows else (in_cols, in_rows)
        return tr(
            "В {base} цифра {v} может стоять только в {cover} (углы: {cells}). В каждой из этих линий "
            "{v} займёт один из углов → убираем {elims}.",
            base=base,
            v=v,
            cover=cover,
            cells=cells_text(s.pattern),
            elims=elims,
        )
    if t == "y_wing":
        p, a, b = s.pattern
        fmt = lambda c: f"{rc(c)} ({'/'.join(map(str, sorted(cands[c])))})"  # noqa: E731
        return tr(
            "Опора {p} видит крылья {a} и {b}. Что бы ни встало в опору, в одном из крыльев "
            "окажется {v} → {v} нельзя там, где клетка видит оба крыла: убираем {elims}.",
            p=fmt(p),
            a=fmt(a),
            b=fmt(b),
            v=v,
            elims=elims,
        )
    return tr("{title}: убираем {elims}.", title=tr(TECH_TITLE[t]), elims=elims)


def hint_step(s, cands) -> dict:
    t = s.technique
    unit, digit, cells = s.unit, None, []
    if t == "naked_single":
        unit = BOX_OF[s.cell]
        text = tr(
            "Смотри в {unit}: там есть пустая клетка, где строка, столбец и блок уже закрыли все цифры, кроме одной.",
            unit=in_unit(unit),
        )
    elif t.startswith("hidden_single"):
        text = tr(
            "Смотри в {unit}: одной из недостающих цифр там осталось только одно место. "
            "Для каждой недостающей цифры вычеркни клетки, которые она «видит».",
            unit=in_unit(unit),
        )
    elif t == "pointing":
        digit = s.eliminations[0][1]
        text = tr(
            "Смотри цифру {d} в {unit}: внутри блока она возможна только на одной линии.", d=digit, unit=in_unit(unit)
        )
    elif t == "claiming":
        digit = s.eliminations[0][1]
        text = tr(
            "Смотри цифру {d} в {unit}: в этой линии она возможна только внутри одного блока.",
            d=digit,
            unit=in_unit(unit),
        )
    elif t == "naked_pair":
        text = tr("Смотри в {unit}: у двух клеток там одна и та же пара кандидатов.", unit=in_unit(unit))
    elif t == "hidden_pair":
        text = tr("Смотри в {unit}: две цифры там возможны только в двух одних и тех же клетках.", unit=in_unit(unit))
    elif t == "x_wing":
        unit, digit = None, s.eliminations[0][1]
        text = tr(
            "Смотри цифру {d}: найди две строки (или два столбца), где она возможна ровно в двух "
            "одинаковых позициях — получится прямоугольник.",
            d=digit,
        )
    elif t == "y_wing":
        unit, cells = None, [s.pattern[0]]
        x, y = sorted(cands[s.pattern[0]])
        text = tr(
            "Опора — {cell} ({x}/{y}). Найди две клетки-крыла, которые она видит: у каждой два "
            "кандидата, один общий с опорой, а второй — одинаковый у обоих крыльев.",
            cell=rc(s.pattern[0]),
            x=x,
            y=y,
        )
    else:
        text = tr("Ищи: {title}.", title=tr(TECH_TITLE[t]))
    return {"hint": text, "unit": unit, "digit": digit, "cells": cells}


def _steps(board: str, technique: str, answers: list):
    """Steps of `technique` on the board that give one of the answers, and the board's candidates."""
    g = parse(board)
    cands = candidates(g)
    want = {tuple(a) for a in answers}
    return [
        s for s in find_steps(g, cands, [technique]) if (s.cell, s.value) in want or want & set(s.eliminations)
    ], cands


def explain(board: str, technique: str, answers: list, picked=None) -> dict:
    """{explanation, pattern}: why the answers follow, for the step matching `picked` (or the first answer)."""
    steps, cands = _steps(board, technique, answers)
    if picked:
        steps.sort(key=lambda s: picked not in {(s.cell, s.value), *s.eliminations})
    if not steps:
        return {"explanation": None, "pattern": []}
    s = steps[0]
    text = explain_step(s, cands)
    if len(steps) > 1:
        text += tr(" (Здесь таких ходов {n}, засчитывается любой.)", n=len(steps))
    return {"explanation": text, "pattern": list(s.pattern)}
