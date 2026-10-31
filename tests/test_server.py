import http.client
import json
import os
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import connect  # noqa: E402
from drills import DRILL_TECHNIQUES, make_drills  # noqa: E402
from fixtures import L1, L2, L3, insert_puzzle, seed_variants  # noqa: E402
from server import make_server  # noqa: E402
from sudoku_core import GRADE_TITLE, grade, parse  # noqa: E402

LEVELS = ["easy", "medium", "hard", "expert"]


def sub(d, keys):
    return {k: d[k] for k in keys}


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        d = cls.tmp.name
        cls.db_path = os.path.join(d, "gym.db")
        conn = connect(cls.db_path)
        cls.easy = {name: insert_puzzle(conn, name, "easy", g, s, grade(parse(g))) for name, g, s in L1}
        cls.medium = seed_variants(conn, 8, seed=21, level="medium", base=L2, tech_grade=2)
        cls.hard = seed_variants(conn, 4, seed=22, level="hard", base=L3, tech_grade=3)
        make_drills(conn, per_technique=2, seed=1)
        conn.execute("INSERT INTO techniques (slug, title, level, ord, drill, body_md) VALUES"
                     " ('naked-single', 'Голая одиночка', 1, 2, 'naked_single', '# Голая одиночка\nтекст')")
        conn.execute("INSERT INTO techniques (slug, title, level, ord, drill, body_md) VALUES"
                     " ('scanning', 'Сканирование', 1, 1, NULL, '# Скан')")
        conn.commit()
        cls.drill_counts = dict(conn.execute("SELECT technique, COUNT(*) FROM drills GROUP BY technique").fetchall())
        conn.close()
        web = os.path.join(d, "web")
        os.makedirs(os.path.join(web, "js"))
        files = {"index.html": "<h1>Sudoku Gym</h1>", "js/app.js": "export const x = 1;",
                 "style.css": "body{}", "icon.svg": "<svg/>", "data.json": "{}"}
        for name, text in files.items():
            with open(os.path.join(web, name), "w", encoding="utf-8") as f:
                f.write(text)
        with open(os.path.join(d, "secret.txt"), "w") as f:
            f.write("secret")
        cls.server = make_server(cls.db_path, 0, web_dir=web)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()

    # --- helpers -------------------------------------------------------
    def raw(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        conn.request(method, path, body=body, headers={"Content-Type": "application/json"} if body else {})
        r = conn.getresponse()
        data = r.read()
        conn.close()
        return r.status, r.getheader("Content-Type"), data

    def api(self, method, path, body=None, status=200):
        code, ctype, data = self.raw(method, path, body)
        self.assertEqual(code, status, data)
        self.assertTrue(ctype.startswith("application/json"), ctype)
        out = json.loads(data)
        if status >= 400:
            self.assertIsInstance(out["error"], str)
            self.assertTrue(out["error"])
        return out

    def new_game(self, puzzle_id, mode="original", **extra):
        return self.api("POST", "/api/games", {"puzzle_id": puzzle_id, "mode": mode, **extra})["id"]

    # --- tests ---------------------------------------------------------
    def test_health_and_options(self):
        self.assertEqual(self.api("GET", "/api/health"), {"ok": True, "puzzles": 15})
        opts = self.api("GET", "/api/puzzle/options")
        self.assertEqual(opts["levels"], [
            {"level": "easy", "grades": {"1": 3}},
            {"level": "medium", "grades": {"2": 8}},
            {"level": "hard", "grades": {"3": 4}},
            {"level": "expert", "grades": {}},
        ])
        self.assertEqual(opts["grade_titles"], {str(k): v for k, v in GRADE_TITLE.items()})

    def test_puzzle_selection(self):
        p = self.api("GET", "/api/puzzle?level=easy")
        self.assertEqual(set(p), {"id", "level", "givens", "solution", "tech_grade", "grade_title"})
        self.assertIn(p["id"], self.easy.values())
        self.assertEqual((p["level"], p["tech_grade"], p["grade_title"]), ("easy", 1, GRADE_TITLE[1]))
        name = next(n for n, i in self.easy.items() if i == p["id"])
        self.assertEqual((p["givens"], p["solution"]), next((g, s) for n, g, s in L1 if n == name))
        h = self.api("GET", "/api/puzzle?level=hard&grade=3")
        self.assertIn(h["id"], self.hard)
        r = self.api("GET", "/api/puzzle?level=random&grade=2")
        self.assertIn(r["id"], self.medium)
        self.assertIn(self.api("GET", "/api/puzzle?level=random")["level"], LEVELS)
        self.assertEqual(self.api("GET", "/api/puzzle")["level"], "medium")  # default level
        self.api("GET", "/api/puzzle?level=hard&grade=1", status=404)
        self.api("GET", "/api/puzzle?level=expert", status=404)
        self.api("GET", "/api/puzzle?level=bogus", status=400)
        self.api("GET", "/api/puzzle?level=easy&grade=x", status=400)
        self.api("GET", "/api/puzzle?level=easy&grade=9", status=400)

    def test_full_cycle(self):
        _, P, S = L1[0]  # cells 1..4 empty, solution 4 7 2 8
        gid = self.new_game(self.easy["L1-1"], "original", mistake_limit=3)
        moves = [
            {"seq": 1, "t_ms": 5000, "cell": 1, "value": 4, "kind": "note"},
            {"seq": 2, "t_ms": 13800, "cell": 1, "value": 4, "kind": "place"},
            {"seq": 3, "t_ms": 16000, "cell": 2, "value": 9, "kind": "place"},
            {"seq": 4, "t_ms": 18000, "cell": 2, "value": 7, "kind": "place"},
            {"seq": 5, "t_ms": 19000, "cell": None, "value": None, "kind": "check"},
            {"seq": 6, "t_ms": 45000, "cell": 3, "value": 2, "kind": "place"},
        ]
        self.assertEqual(self.api("POST", f"/api/games/{gid}/moves", {"moves": moves[:4]}),
                         {"ok": True, "stored": 4, "mistakes": 1})
        # retry of an overlapping batch is idempotent
        self.assertEqual(self.api("POST", f"/api/games/{gid}/moves", {"moves": moves}),
                         {"ok": True, "stored": 6, "mistakes": 1})
        g = self.api("GET", f"/api/games/{gid}")
        self.assertEqual((g["id"], g["status"], g["mode"], g["mistake_limit"], g["givens"], g["solution"], g["level"]),
                         (gid, "active", "original", 3, P, S, "easy"))
        self.assertEqual([m["correct"] for m in g["moves"]], [None, 1, 0, 1, None, 1])
        self.assertEqual([m["seq"] for m in g["moves"]], [1, 2, 3, 4, 5, 6])
        self.assertRegex(g["started_at"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$")

        fin = self.api("POST", f"/api/games/{gid}/finish", {"status": "solved", "t_ms": 90000})
        self.assertEqual({k: fin[k] for k in ("id", "status", "time_ms", "first_move_ms", "max_pause_ms",
                                               "long_pauses", "mistakes", "corrections", "checks", "note_actions")},
                         {"id": gid, "status": "solved", "time_ms": 90000, "first_move_ms": 13800,
                          "max_pause_ms": 27000, "long_pauses": 1, "mistakes": 1, "corrections": 1,
                          "checks": 1, "note_actions": 1})
        g = self.api("GET", f"/api/games/{gid}")
        self.assertEqual((g["status"], g["time_ms"], g["long_pauses"]), ("solved", 90000, 1))
        self.assertIsNotNone(g["finished_at"])

        rv = self.api("GET", f"/api/games/{gid}/review")
        self.assertEqual(rv["game"]["id"], gid)
        self.assertEqual(len(rv["pauses"]), 1)
        pause = rv["pauses"][0]
        self.assertEqual((pause["after_seq"], pause["start_ms"], pause["duration_ms"], pause["had_errors"]),
                         (4, 18000, 27000, False))
        self.assertEqual(pause["board"][:5], "14700")
        self.assertTrue(pause["steps"])
        for st in pause["steps"]:
            self.assertEqual(int(S[st["cell"]]), st["value"])

        # original with limit 2: two mistakes -> stored as failed whatever the client says
        g2 = self.new_game(self.easy["L1-2"], "original", mistake_limit=2)
        bad = [{"seq": i, "t_ms": 1000 * i, "cell": 0, "value": 1 if i == 1 else 2, "kind": "place"} for i in (1, 2)]
        self.api("POST", f"/api/games/{g2}/moves", {"moves": bad})
        self.assertEqual(self.api("POST", f"/api/games/{g2}/finish", {"status": "abandoned", "t_ms": 5000})["status"],
                         "failed")
        # hardcore: no limit even if one is sent
        g3 = self.new_game(self.easy["L1-1"], "hardcore", mistake_limit=1)
        self.assertIsNone(self.api("GET", f"/api/games/{g3}")["mistake_limit"])
        self.api("POST", f"/api/games/{g3}/moves", {"moves": [
            {"seq": i, "t_ms": 1000 * i, "cell": 1, "value": 9, "kind": "place"} for i in (1, 2, 3)]})
        fin3 = self.api("POST", f"/api/games/{g3}/finish", {"status": "solved", "t_ms": 120000})
        self.assertEqual((fin3["status"], fin3["mistakes"]), ("solved", 3))
        # original without explicit limit -> default 3; explicit null -> no limit
        self.assertEqual(self.api("GET", f"/api/games/{self.new_game(self.hard[0])}")["mistake_limit"], 3)
        self.assertIsNone(self.api("GET", f"/api/games/{self.new_game(self.hard[0], mistake_limit=None)}")["mistake_limit"])

        # only L1-3 among easy puzzles is still unplayed
        for _ in range(5):
            self.assertEqual(self.api("GET", "/api/puzzle?level=easy")["id"], self.easy["L1-3"])

        st = self.api("GET", "/api/stats")
        easy = [x for x in st["by_level_mode"] if x["level"] == "easy"]
        self.assertEqual(easy, [
            {"level": "easy", "mode": "hardcore", "n": 1, "solved": 1, "median_ms": 120000, "best_ms": 120000,
             "mistakes_per_game": 3.0, "fail_rate": 0.0},
            {"level": "easy", "mode": "original", "n": 2, "solved": 1, "median_ms": 90000, "best_ms": 90000,
             "mistakes_per_game": 1.5, "fail_rate": 0.5},
        ])
        self.assertEqual(sum(x["n"] for x in st["daily"]), 3)
        self.assertEqual([t["technique"] for t in st["techniques"]], DRILL_TECHNIQUES)

        recent = self.api("GET", "/api/games?limit=2")
        self.assertEqual([x["id"] for x in recent], sorted([x["id"] for x in recent], reverse=True))
        self.assertEqual(len(recent), 2)
        self.assertEqual(set(recent[0]), {"id", "puzzle_id", "level", "mode", "status", "started_at", "finished_at",
                                          "time_ms", "mistakes"})

    def test_drills(self):
        techs = self.api("GET", "/api/drills/techniques")
        self.assertEqual([t["technique"] for t in techs], DRILL_TECHNIQUES)
        self.assertEqual({t["technique"]: t["n"] for t in techs if t["n"]}, self.drill_counts)
        self.assertEqual(sub(techs[0], ("technique", "kind", "tier", "n", "unlocked", "theory")),
                         {"technique": "naked_single", "kind": "place", "tier": 1,
                          "n": self.drill_counts["naked_single"], "unlocked": True, "theory": "naked-single"})
        d = self.api("GET", "/api/drills/next?technique=hidden_single_box")
        self.assertEqual(set(d), {"id", "technique", "kind", "prompt", "title", "board", "candidates"})
        self.assertEqual((d["technique"], d["kind"], len(d["board"]), len(d["candidates"])),
                         ("hidden_single_box", "place", 81, 81))
        self.assertIn(self.api("GET", "/api/drills/next?technique=random")["technique"], self.drill_counts)
        self.assertIn(self.api("GET", "/api/drills/next")["technique"], self.drill_counts)
        self.api("GET", "/api/drills/next?technique=swordfish", status=400)

        conn = connect(self.db_path)
        answers = json.loads(conn.execute("SELECT answers FROM drills WHERE id=?", (d["id"],)).fetchone()[0])
        conn.close()
        cell, value = answers[0]
        res = self.api("POST", f"/api/drills/{d['id']}/attempt", {"time_ms": 3500, "cell": cell, "value": value})
        self.assertEqual(sub(res, ("correct", "valid_other_move", "answers")), {"correct": True, "valid_other_move": False, "answers": answers})
        res = self.api("POST", f"/api/drills/{d['id']}/attempt", {"time_ms": 3500, "cell": cell, "value": value % 9 + 1})
        self.assertEqual((res["correct"], res["valid_other_move"]), (False, False))
        stats = {t["technique"]: t for t in self.api("GET", "/api/stats")["techniques"]}
        self.assertEqual((stats["hidden_single_box"]["n"], stats["hidden_single_box"]["accuracy"]), (2, 0.5))

        if "pointing" in self.drill_counts:
            e = self.api("GET", "/api/drills/next?technique=pointing")
            self.assertEqual(e["kind"], "eliminate")
        self.api("POST", "/api/drills/99999/attempt", {"time_ms": 1, "cell": 0, "value": 1}, status=404)
        self.api("POST", f"/api/drills/{d['id']}/attempt", {"cell": 0, "value": 1}, status=400)
        self.api("POST", f"/api/drills/{d['id']}/attempt", {"time_ms": 1, "cell": 81, "value": 1}, status=400)

    def test_theory(self):
        self.assertEqual(self.api("GET", "/api/theory"), [
            {"slug": "scanning", "title": "Сканирование", "level": 1, "ord": 1, "drill": None},
            {"slug": "naked-single", "title": "Голая одиночка", "level": 1, "ord": 2, "drill": "naked_single"},
        ])
        page = self.api("GET", "/api/theory/naked-single")
        self.assertEqual(page["body_md"], "# Голая одиночка\nтекст")
        self.assertEqual(page["drill"], "naked_single")
        self.api("GET", "/api/theory/nope", status=404)

    def test_errors(self):
        self.api("GET", "/api/games/9999", status=404)
        self.api("GET", "/api/games/9999/review", status=404)
        self.api("POST", "/api/games/9999/finish", {"status": "solved", "t_ms": 1}, status=404)
        self.api("POST", "/api/games/9999/moves", {"moves": []}, status=404)
        self.api("POST", "/api/games", "{bad json", status=400)
        self.api("POST", "/api/games", [1, 2], status=400)
        self.api("POST", "/api/games", {"mode": "original"}, status=400)
        self.api("POST", "/api/games", {"puzzle_id": self.hard[1], "mode": "easy"}, status=400)
        self.api("POST", "/api/games", {"puzzle_id": self.hard[1], "mode": "original", "mistake_limit": 0}, status=400)
        self.api("POST", "/api/games", {"puzzle_id": 9999, "mode": "original"}, status=404)
        gid = self.new_game(self.hard[1], "hardcore")
        self.api("POST", f"/api/games/{gid}/finish", {"status": "won", "t_ms": 1}, status=400)
        self.api("POST", f"/api/games/{gid}/finish", {"status": "solved"}, status=400)
        self.api("POST", f"/api/games/{gid}/moves", {"moves": [{"seq": 1, "t_ms": 1, "cell": 0, "value": 1,
                                                                 "kind": "jump"}]}, status=400)
        self.api("POST", f"/api/games/{gid}/moves", {"moves": [{"seq": 1, "t_ms": 1, "cell": 81, "value": 1,
                                                                 "kind": "place"}]}, status=400)
        self.api("POST", f"/api/games/{gid}/moves", {"moves": [{"seq": 1, "t_ms": 1, "cell": 3, "value": 0,
                                                                 "kind": "place"}]}, status=400)
        self.api("POST", f"/api/games/{gid}/moves", {"moves": "nope"}, status=400)
        self.api("POST", f"/api/games/{gid}/moves", {"moves": [{"seq": 1, "cell": 3, "value": 1,
                                                                 "kind": "place"}]}, status=400)
        # a rejected batch stores nothing
        self.assertEqual(self.api("GET", f"/api/games/{gid}")["moves"], [])
        self.api("GET", "/api/nope", status=404)
        self.api("DELETE", "/api/games/1", status=404)

    def test_static(self):
        code, ctype, body = self.raw("GET", "/")
        self.assertEqual((code, ctype, body), (200, "text/html; charset=utf-8", b"<h1>Sudoku Gym</h1>"))
        expected = {"/js/app.js": "application/javascript; charset=utf-8", "/style.css": "text/css; charset=utf-8",
                    "/icon.svg": "image/svg+xml", "/data.json": "application/json; charset=utf-8",
                    "/index.html?v=2": "text/html; charset=utf-8"}
        for path, ct in expected.items():
            code, ctype, _ = self.raw("GET", path)
            self.assertEqual((code, ctype), (200, ct), path)
        for path in ("/missing.js", "/../secret.txt", "/%2e%2e/secret.txt", "/js/../../secret.txt", "/js"):
            code, _, body = self.raw("GET", path)
            self.assertEqual(code, 404, path)
            self.assertNotIn(b"secret", body)

    def test_zz_custom_puzzle(self):  # runs last: adds puzzles, which other tests count
        name, givens, solution = L1[1]
        rows = [" | ".join(" ".join(givens[r * 9 + b:r * 9 + b + 3]) for b in (0, 3, 6)).replace("0", ".")
                for r in range(9)]
        art = "\n".join(rows[:3] + ["------+-------+------"] + rows[3:6] + ["------+-------+------"] + rows[6:])
        p = self.api("POST", "/api/puzzles", {"givens": art})
        self.assertEqual(set(p), {"id", "level", "givens", "solution", "tech_grade", "grade_title"})
        self.assertEqual((p["level"], p["givens"], p["solution"], p["tech_grade"], p["grade_title"]),
                         ("custom", givens, solution, 1, GRADE_TITLE[1]))
        self.assertNotEqual(p["id"], self.easy[name])
        again = self.api("POST", "/api/puzzles", {"givens": givens.replace("0", ".")})
        self.assertEqual(again["id"], p["id"])  # idempotent
        gid = self.new_game(p["id"], "hardcore")
        self.assertEqual(self.api("GET", f"/api/games/{gid}")["level"], "custom")
        # never served by level selection, and not listed among options
        for _ in range(20):
            self.assertEqual(self.api("GET", "/api/puzzle?level=random&grade=1")["level"], "easy")
        self.api("GET", "/api/puzzle?level=custom", status=400)
        self.assertEqual([x["level"] for x in self.api("GET", "/api/puzzle/options")["levels"]], LEVELS)
        bad = self.api("POST", "/api/puzzles", {"givens": "11" + "0" * 79}, status=400)
        self.assertEqual(bad["error"], "нет решения")
        multi = self.api("POST", "/api/puzzles", {"givens": "1" + "0" * 80}, status=400)
        self.assertEqual(multi["error"], "решение не единственное")
        self.api("POST", "/api/puzzles", {"givens": "123"}, status=400)
        self.api("POST", "/api/puzzles", {}, status=400)
        self.api("POST", "/api/puzzles", {"givens": 5}, status=400)

    def test_concurrent_moves(self):
        gid = self.new_game(self.hard[2], "hardcore")
        errors = []

        def send(i):
            try:
                code, _, _ = self.raw("POST", f"/api/games/{gid}/moves",
                                      {"moves": [{"seq": i, "t_ms": i * 100, "cell": i % 81, "kind": "note", "value": 5}]})
                if code != 200:
                    errors.append(code)
            except Exception as e:  # pragma: no cover
                errors.append(e)

        threads = [threading.Thread(target=send, args=(i,)) for i in range(1, 31)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])
        self.assertEqual(len(self.api("GET", f"/api/games/{gid}")["moves"]), 30)


if __name__ == "__main__":
    unittest.main()
