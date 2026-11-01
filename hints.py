"""Hint engine: what is wrong in a position, the next step as a ladder of hints (L1 technique … L4 the move),
and the solve line from any position. Candidates come from the digits; the player's notes only flag a struck-out
right digit and let eliminations the player already made count as done."""

from drills import THEORY_SLUG, cells_text, explain_step, hint_step, in_unit, rc
from i18n import tr
from sudoku_core import BOX_OF, PEERS, TECH_TITLE, UNITS, Step, candidates, easiest_steps

TIER1_ORDER = {"hidden_single_box": 0, "hidden_single_row": 1, "hidden_single_col": 2, "naked_single": 3}
SOLUTION = "solution"  # a line step the core can't find by logic: the digit is taken from the solution
MAX_FOLLOW = 20


def masks(cands) -> list:
    return [sum(1 << v for v in c) for c in cands]


def _digits(mask: int) -> set:
    return {v for v in range(1, 10) if mask >> v & 1}


def _marked(board: list, notes: list, cell: int, v: int) -> bool:
    """The notes track v in the cell's box: v is noted in some empty cell there. Full candidates and Snyder marks
    alike then say «v is only where it is noted» for that box; a box without a v note says nothing."""
    return any(not board[c] and notes[c] >> v & 1 for c in UNITS[BOX_OF[cell]])


def position_issues(givens: str, solution: str, board: list, notes=None) -> dict:
    """wrong_cells: the player's digits that differ from the solution; bad_notes: [cell, digit] where the cell has
    notes but not its solution digit, while that digit is noted elsewhere in its box. A cell without notes or a
    box without the digit says nothing: Snyder marks and half-filled candidates are no errors."""
    wrong = [i for i in range(81) if board[i] and givens[i] == "0" and board[i] != int(solution[i])]
    bad = [
        [i, v]
        for i, v in ((i, int(solution[i])) for i in range(81))
        if notes and not board[i] and notes[i] and not notes[i] >> v & 1 and _marked(board, notes, i, v)
    ]
    return {"wrong_cells": wrong, "bad_notes": bad}


def cands_for(board: list, solution: str, cands=None) -> list:
    """Candidates from the digits, narrowed by masks (an analysis branch) unless they drop a solution digit."""
    out = candidates(board)
    if cands is None:
        return out
    narrowed = [c & _digits(m) if m else c for c, m in zip(out, cands, strict=True)]
    ok = all(board[i] or int(solution[i]) in narrowed[i] for i in range(81))
    return narrowed if ok else out


def _pick(steps):
    return min(steps, key=lambda s: (TIER1_ORDER.get(s.technique, 9), 81 if s.cell is None else s.cell))


def _apply(g, cands, s):
    if s.cell is not None:
        g[s.cell] = s.value
        cands[s.cell] = set()
        for p in PEERS[s.cell]:
            cands[p].discard(s.value)
    for c, v in s.eliminations:
        cands[c].discard(v)


def _next_step(g, cands, notes=None):
    """The easiest step; eliminations the player's notes already show are applied to cands (in place) and skipped."""
    while True:
        steps = easiest_steps(g, cands)
        if not steps:
            return None
        s = _pick(steps)
        if (
            s.cell is None
            and s.eliminations
            and notes
            and all(notes[c] and not notes[c] >> v & 1 and _marked(g, notes, c, v) for c, v in s.eliminations)
        ):
            for c, v in s.eliminations:
                cands[c].discard(v)
            continue
        return s


def _follow(g, cands, s):
    """The first placement the solver reaches after the elimination step s."""
    g, cands = g[:], [set(c) for c in cands]
    _apply(g, cands, s)
    for _ in range(MAX_FOLLOW):
        nxt = _next_step(g, cands)
        if nxt is None or nxt.cell is not None:
            return nxt
        _apply(g, cands, nxt)
    return None


def _level(text, unit=None, digit=None, cells=(), place=None, elims=()):
    return {
        "text": text,
        "unit": unit,
        "digit": digit,
        "cells": list(cells),
        "place": place,
        "elims": [list(e) for e in elims],
    }


def _ladder(kind, levels, technique=None, title=None):
    return {
        "kind": kind,
        "technique": technique,
        "title": title or tr(TECH_TITLE[technique]),
        "theory": THEORY_SLUG.get(technique),
        "max_level": len(levels),
        "levels": levels,
    }


def _step_levels(s, cands, follow):
    t, hn, expl = s.technique, hint_step(s, cands), explain_step(s, cands)
    first = _level(tr("Следующий ход: {title}.", title=tr(TECH_TITLE[t])))
    second = _level(hn["hint"], unit=hn["unit"], digit=hn["digit"], cells=hn["cells"])
    if t == "naked_single":
        third = _level(
            tr("Клетка — {cell}: какая цифра ей осталась?", cell=rc(s.cell)), unit=hn["unit"], cells=[s.cell]
        )
        fourth = _level(expl, cells=[s.cell], place=[s.cell, s.value])
    elif t.startswith("hidden_single"):
        third = _level(
            tr("Ищи место для цифры {v} в {unit}.", v=s.value, unit=in_unit(s.unit)), unit=s.unit, digit=s.value
        )
        fourth = _level(expl, unit=s.unit, digit=s.value, cells=[s.cell], place=[s.cell, s.value])
    else:
        if t in ("naked_pair", "hidden_pair"):
            a, b = s.pattern[:2]
            if t == "naked_pair":
                x, y = sorted(cands[a])
            else:
                x, y = sorted((cands[a] & cands[b]) - {v for _, v in s.eliminations})[:2]
            d = None
            third = _level(
                tr("Узор: {cells}, цифры {x} и {y}.", cells=cells_text(s.pattern), x=x, y=y),
                unit=hn["unit"],
                cells=s.pattern,
            )
        else:
            d = s.eliminations[0][1]
            third = _level(
                tr("Узор: {cells}, цифра {d}.", cells=cells_text(s.pattern), d=d),
                unit=hn["unit"],
                digit=d,
                cells=s.pattern,
            )
        if follow is not None:
            expl += " " + tr("Это даёт: {cell} = {v}.", cell=rc(follow.cell), v=follow.value)
        fourth = _level(expl, digit=d, cells=s.pattern, elims=s.eliminations)
    return [first, second, third, fourth]


def _stuck_cell(g, cands):
    return min((i for i in range(81) if not g[i]), key=lambda i: (len(cands[i]), i))


def next_ladder(givens: str, solution: str, board: list, notes=None, cands=None) -> dict:
    """The hint ladder for a position: board errors, then notes errors, then the easiest step; «stuck» when the core
    finds no logical step, «solved» on a full board."""
    issues = position_issues(givens, solution, board, notes)
    wrong, bad = issues["wrong_cells"], issues["bad_notes"]
    if wrong:
        return _ladder(
            "error",
            [
                _level(tr("На доске неверных цифр: {n}. Пока они стоят, логика не сходится.", n=len(wrong))),
                _level(tr("Неверные цифры: {cells}. Сотри их.", cells=cells_text(wrong)), cells=wrong),
            ],
            title=tr("Ошибка на доске"),
        )
    if bad:
        return _ladder(
            "notes",
            [
                _level(tr("В заметках вычеркнута верная цифра — из-за этого ход не находится.")),
                _level(
                    ", ".join(tr("в {cell} нет заметки {v}", cell=rc(c), v=v) for c, v in bad),
                    cells=[c for c, _ in bad],
                ),
            ],
            title=tr("Ошибка в заметках"),
        )
    if 0 not in board:
        return _ladder("solved", [_level(tr("Позиция решена."))], title=tr("Решено"))
    cs = cands_for(board, solution, cands)
    s = _next_step(board, cs, notes)
    if s is None:
        i = _stuck_cell(board, cs)
        v = int(solution[i])
        return _ladder(
            "stuck",
            [
                _level(tr("Одиночки, пересечения, пары, X-Wing и Y-Wing здесь хода не дают — нужна техника сложнее.")),
                _level(tr("Цифра из решения: {cell} = {v}.", cell=rc(i), v=v), cells=[i], place=[i, v]),
            ],
            title=tr("Нужна техника сложнее"),
        )
    follow = _follow(board, cs, s) if s.cell is None else None
    return _ladder("step", _step_levels(s, cs, follow), technique=s.technique)


def _line_item(s, cands):
    if s.technique == SOLUTION:
        title = tr("Цифра из решения")
        text = tr("Логикой хода нет — цифра из решения: {cell} = {v}.", cell=rc(s.cell), v=s.value)
    else:
        title, text = tr(TECH_TITLE[s.technique]), explain_step(s, cands)
    return {
        "technique": s.technique,
        "title": title,
        "cell": s.cell,
        "value": s.value,
        "unit": s.unit,
        "eliminations": [list(e) for e in s.eliminations],
        "pattern": list(s.pattern),
        "explanation": text,
        "cands": masks(cands),
    }


def solve_line(givens: str, solution: str, board: list, cands=None, limit: int = 200) -> dict:
    """Steps from the position to the end (wrong digits taken off first); where logic stops, a digit of the solution."""
    wrong = position_issues(givens, solution, board)["wrong_cells"]
    g = [0 if i in wrong else v for i, v in enumerate(board)]
    cs = cands_for(g, solution, None if wrong else cands)
    steps = []
    while 0 in g and len(steps) < limit:
        s = _next_step(g, cs)
        if s is None:
            i = _stuck_cell(g, cs)
            s = Step(SOLUTION, cell=i, value=int(solution[i]), pattern=[i])
        steps.append(_line_item(s, cs))
        _apply(g, cs, s)
    return {"wrong_cells": wrong, "steps": steps, "solved": 0 not in g}
