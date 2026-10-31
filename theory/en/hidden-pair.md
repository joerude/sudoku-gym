---
slug: hidden-pair
title: Hidden Pair/Triple
level: 3
order: 7
drill: hidden_pair
---

# Hidden Pair/Triple

Hidden pair: two digits that have the same two possible places in a unit. Those cells are taken by these two digits, so every other candidate is crossed out of them. The pair is "hidden" because the cells hold extra candidates besides it. Hidden triple: three digits that can go only in three cells of a unit.

## Example

Row 2, full candidates:

```
r2:  . . 4 | . 9 . | . 2 .
```

- `r2c1` — `{1,5,6}`
- `r2c2` — `{1,5,6,7}`
- `r2c4` — `{1,6,7}`
- `r2c6` — `{3,5,7,8}`
- `r2c7` — `{1,5,6,7}`
- `r2c9` — `{1,3,6,8}`

No singles. But 3 appears only in `r2c6` and `r2c9`, and so does 8. That is a hidden pair `{3,8}`:

- `r2c6` becomes `{3,8}` (5 and 7 crossed out);
- `r2c9` becomes `{3,8}` (1 and 6 crossed out).

Now it is a naked pair. It works only in row 2: the cells are in different columns and different boxes. The other four cells of the row form a naked quad `{1,5,6,7}` at the same time.

## Link to Snyder notation

With Snyder notes a hidden pair shows without writing candidates: if in a box the marks of 3 and 8 are in the same two cells, that is a hidden pair. Nothing else goes into those cells — leave them out when looking for places for the other digits of the box.

## How to find them fast

1. Don't go through cells — go through digits. For a unit, name the missing digits and count the places of each. Remember the digits with two places as pairs of cells.
2. If two digits gave the same pair of cells, the hidden pair is found.
3. Hidden and naked groups complement each other: if a unit has 6 empty cells and a hidden pair, the other 4 cells form a naked quad. Look for whichever is smaller.
4. Check for a hidden triple only when there are neither pairs nor pointing: take three digits with 2–3 places and check whether all their places fit into three cells.
5. Right after crossing out, check the neighbouring units of the pair's cells — a hidden single often opens there.

## Typical mistakes

- Seeing one digit with two places and calling it a pair. You need two digits with the same two places.
- Forgetting to cross the extra candidates out of the pair's cells. Without that the technique gives nothing.
- Looking for hidden groups with incomplete candidates. A hidden pair in a row requires knowing every place of the digit in the row, not only the box marks.

## Practice

Take a unit with 5–6 empty cells in a medium game where the singles have run out. For each missing digit, name its places in one phrase: "3 — six and nine, 8 — six and nine". Saying it aloud makes you compare pairs of cells, not cells. Time each unit; when the time is steady, do the same with Snyder marks in boxes, without writing candidates.
