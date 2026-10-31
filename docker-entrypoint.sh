#!/bin/sh
set -e
DB=/app/data/sudoku.db

# First start downloads the puzzle bank; later starts only refresh theory and fill missing drills.
python3 tools/import_bank.py --db "$DB" --if-empty

exec python3 server.py --host 0.0.0.0 --port 8765 --db "$DB"
