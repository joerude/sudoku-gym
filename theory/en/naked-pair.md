---
slug: naked-pair
title: Naked Pair/Triple
level: 3
order: 6
drill: naked_pair
---

# Naked Pair/Triple

Naked pair: two cells of one unit, each with exactly the same two candidates, say `{2,4}` and `{2,4}`. These two digits will take these two cells, so 2 and 4 are crossed out of the other cells of the unit. Naked triple: three cells that together hold only three digits; each cell may have two or three of them.

## Example: a pair

Row 7, the candidates of the empty cells are written out in full:

```
r7:  . 3 . | . 1 . | 9 . 5
```

- `r7c1` — `{2,4}`
- `r7c3` — `{2,4}`
- `r7c4` — `{2,6}`
- `r7c6` — `{6,7,8}`
- `r7c8` — `{4,7,8}`

No single at all: each digit stands in at least two cells. But `r7c1` and `r7c3` are a naked pair `{2,4}`. Cross 2 and 4 out of the other cells of the row:

- `r7c4` becomes `{6}` — place `r7c4 = 6`.
- `r7c8` becomes `{7,8}`, and after the move `r7c6` is `{7,8}` too: a new pair.

Both cells of the pair are also in box 7, so 2 and 4 are crossed out of the other cells of box 7 as well.

## Example: a triple

A column with six empty cells: `{1,5}`, `{5,8}`, `{1,8}`, `{1,3,9}`, `{5,7,9}`, `{3,7,8}`. The first three cells together hold only 1, 5, 8 — a naked triple. The others shrink to `{3,9}`, `{7,9}`, `{3,7}`.

## How to find them fast

1. Look for naked pairs only where the candidates are known in full. Snyder marks are not a full list. Write full candidates only in a unit with 3–5 empty cells left.
2. Look for cells with two candidates and check their row, column and box at once: is there a second cell with the same pair?
3. If the two cells of a pair are in one box and on one line, clear both units.
4. Look for a triple only if there are no pairs: take a unit with 5–6 empty cells and check whether three cells cover just three digits.
5. After clearing, check at once whether some cell has become a naked single. That is the goal.

## Typical mistakes

- Taking cells from different units for a pair. `{2,4}` in `r7c1` and `{2,4}` in `r5c9` give nothing: they share no row, column or box.
- Building a pair from incomplete notes. If a 6 is really still possible in a cell and you did not write it, the conclusion is false — in hardcore this leads to a mistake you won't see.
- Thinking every cell of a triple must hold all three digits. `{1,5}`, `{5,8}`, `{1,8}` is a full triple.
- Crossing the pair's digits out of the pair's own cells.

## Practice

At the end of every medium game, when 10–15 empty cells remain, write full candidates in one unit with 4–5 empty cells and find a pair in it by hand, without looking at the rest of the grid. Time it from writing to the move. The goal: writing candidates in one unit takes a few seconds and does not turn into marking up the whole grid.
