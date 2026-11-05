"""No-Docker launcher, the Windows twin of ./gym dev: gym.cmd runs it, any OS with Python 3.12+ can too.

Usage: python tools/launch.py [start|backup]   (start is the default)
start: backup the progress DB, download the puzzle bank on the first run, serve, open the browser.
Env: PORT (8765), NO_OPEN=1, BACKUP_DIR (data/backups), KEEP (20).
"""

import os
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from contextlib import closing
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("PORT", "8765"))
URL = f"http://127.0.0.1:{PORT}/"
DB = os.path.join("data", "sudoku.db")
BACKUP_DIR = os.environ.get("BACKUP_DIR", os.path.join("data", "backups"))
KEEP = int(os.environ.get("KEEP", "20"))


def say(msg: str):
    print(msg, flush=True)


def healthy() -> bool:
    try:
        with urllib.request.urlopen(URL + "api/health", timeout=2):
            return True
    except OSError:
        return False


def open_browser():
    if os.environ.get("NO_OPEN") != "1":
        webbrowser.open(URL)


def open_when_ready(limit: int = 30):
    for _ in range(limit * 2):
        if healthy():
            open_browser()
            return
        time.sleep(0.5)


def backup():
    """Consistent copy of the progress DB, then keep the newest KEEP."""
    if not os.path.isfile(DB):
        say(f"бэкап пропущен: нет {DB}")
        return
    os.makedirs(BACKUP_DIR, exist_ok=True)
    out = os.path.join(BACKUP_DIR, f"sudoku-{datetime.now():%Y-%m-%d_%H%M%S}.db")
    if os.path.exists(out):
        return  # one per second is plenty
    with closing(sqlite3.connect(f"file:{DB}?mode=ro", uri=True)) as conn:
        conn.execute("VACUUM INTO ?", (out,))
    old = sorted((f for f in os.listdir(BACKUP_DIR) if f.startswith("sudoku-") and f.endswith(".db")), reverse=True)
    for name in old[KEEP:]:
        os.remove(os.path.join(BACKUP_DIR, name))
    say(f"бэкап: {out}")


def start():
    if healthy():
        say(f"Sudoku Gym уже запущен: {URL}")
        open_browser()
        return
    backup()
    say("проверяю базу задач (первый запуск скачивает банк — пару минут)…")
    subprocess.run([sys.executable, os.path.join("tools", "import_bank.py"), "--if-empty"], check=True)
    threading.Thread(target=open_when_ready, daemon=True).start()
    say(f"Sudoku Gym: {URL} — не закрывай это окно; Ctrl+C или закрытие окна останавливает сервер")
    try:
        code = subprocess.call([sys.executable, "server.py", "--port", str(PORT)])
    except KeyboardInterrupt:
        code = 0
    sys.exit(code)


def main():
    os.chdir(ROOT)
    cmd = sys.argv[1] if len(sys.argv) > 1 else "start"
    if cmd == "start":
        start()
    elif cmd == "backup":
        backup()
    else:
        sys.exit(f"неизвестная команда «{cmd}»: start или backup")


if __name__ == "__main__":
    main()
