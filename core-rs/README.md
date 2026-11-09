# core-rs — ядро судоку на Rust

Порт `sudoku_core.py`: кандидаты, 10 техник до Y-Wing, решатель, `grade` и цепочки (X-Chain, AIC). Эксперимент: тренажёр его пока не использует.

## Совпадение с Python

`tools/export_golden.py` выгружает ответы Python-ядра в `core-rs/golden/` (не в git), `tests/parity.rs` сверяет с ними: `grade`, решение и число решений всех головоломок; кандидаты, `find_steps` и `easiest_steps` позиций из партий; `find_steps` и `chain_step` головоломок, где техники 1–4 кончаются. Исключения сравниваются отсортированными: в Y-Wing и в открытых парах Python обходит `frozenset` в порядке хеш-таблицы.

Сначала нужны эталонные данные: без `golden/` `cargo test` падает с сообщением об этом.

```bash
python3.14 tools/export_golden.py --db ../data/sudoku.db
cargo test --release --manifest-path core-rs/Cargo.toml
```

## Скорость

Миллисекунды на вызов, 2026-11-09, Intel Core i7-10510U @ 1.80GHz. Каждая цифра — один прогон без разогрева. `grade`, `solve`, `count_solutions` включают разбор строки сетки, `chain_step` работает на готовых кандидатах. В скобках — во сколько раз быстрее Python.

| | Python 3.14 | Rust | WASM (Node 22) |
| --- | --- | --- | --- |
| `grade` | 2.0928 | 0.0752 (×28) | 0.1219 (×17) |
| `solve` | 0.8672 | 0.0183 (×47) | 0.0242 (×36) |
| `count_solutions` | 1.6310 | 0.0324 (×50) | 0.0419 (×39) |
| `chain_step` | 2.4932 | 0.1433 (×17) | 0.2176 (×11) |

```bash
python3.14 tools/bench_core.py
cargo run --release --manifest-path core-rs/Cargo.toml --example bench
node core-rs/demo/bench.mjs
```

## WASM

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.100 --locked
cargo build --release --manifest-path core-rs/Cargo.toml --target wasm32-unknown-unknown --features wasm
wasm-bindgen --target web --out-dir core-rs/pkg core-rs/target/wasm32-unknown-unknown/release/sudoku_core.wasm
python3.14 -m http.server -d core-rs 8790   # демо: http://127.0.0.1:8790/demo/
```

JS: `grade(givens)`, `solve(givens)`, `countSolutions(givens, limit)`, `candidates(grid)` → `Uint16Array`, `easiestSteps(grid)` → JSON, `chainStep(cands)` → JSON или `"null"`.
