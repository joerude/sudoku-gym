"""Every text marked for translation has an English version: tr("…") keys in web/js against web/js/en.js,
tr("…") templates in the Python code against i18n.EN; and English output has no Russian left."""

import ast
import json
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from test_drills import seeded_conn  # noqa: E402

import i18n  # noqa: E402
from drills import explain, hint, make_drills, next_drill, technique_list  # noqa: E402
from i18n import EN, set_lang, tr  # noqa: E402
from sudoku_core import GRADE_TITLE, TECH_TITLE, unit_name  # noqa: E402

CYR = re.compile(r"[А-Яа-яЁё]")
LIT = r'"(?:[^"\\\n]|\\.)*"'
JS_CALL = re.compile(r"\btr\(\s*(" + LIT + r"(?:\s*\+\s*" + LIT + r")*)\s*[,)]")
JS_TERNARY = re.compile(r"\btr\([^\"()]*\?\s*(" + LIT + r")\s*:\s*(" + LIT + r")")


def js_keys():
    keys = set()
    js = os.path.join(ROOT, "web", "js")
    for name in os.listdir(js):
        if not name.endswith(".js") or name in ("en.js", "i18n.js"):
            continue
        with open(os.path.join(js, name), encoding="utf-8") as f:
            text = f.read()
        for m in JS_CALL.finditer(text):
            keys.add("".join(json.loads(x) for x in re.findall(LIT, m.group(1))))
        for m in JS_TERNARY.finditer(text):
            keys.update(json.loads(x) for x in m.groups())
    return keys


def en_js():
    with open(os.path.join(ROOT, "web", "js", "en.js"), encoding="utf-8") as f:
        text = f.read()
    return {
        json.loads(k): json.loads(v)
        for k, v in re.findall(r"^\s*(" + LIT + r"):\s*(?:\n\s*)?(" + LIT + r"),?$", text, re.M)
    }


def py_keys():
    keys = set()
    for name in ("server.py", "drills.py", "analysis.py", "sudoku_core.py"):
        with open(os.path.join(ROOT, name), encoding="utf-8") as f:
            tree = ast.parse(f.read())
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "tr" and node.args:
                arg = node.args[0]
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    keys.add(arg.value)
                elif isinstance(arg, ast.Subscript) and isinstance(arg.value, ast.Tuple):  # tr(("a", "b")[i], …)
                    keys.update(e.value for e in arg.value.elts)
    return keys


class TestI18n(unittest.TestCase):
    def tearDown(self):
        set_lang("ru")

    def test_every_js_key_has_english(self):
        en, keys = en_js(), js_keys()
        self.assertGreater(len(keys), 200)
        self.assertEqual(sorted(k for k in keys if k not in en), [])
        self.assertEqual(sorted(k for k, v in en.items() if CYR.search(v) and "<kbd>" not in v), [])

    def test_every_python_template_has_english(self):
        keys = py_keys() | set(TECH_TITLE.values()) | set(GRADE_TITLE.values())
        self.assertEqual(sorted(k for k in keys if CYR.search(k) and k not in EN), [])
        self.assertEqual(sorted(k for k, v in EN.items() if CYR.search(v)), [])

    def test_placeholders_match(self):
        ph = lambda s: sorted(re.findall(r"\{(\w+)\}", s))  # noqa: E731
        self.assertEqual([k for k, v in EN.items() if ph(k) != ph(v)], [])
        self.assertEqual([k for k, v in en_js().items() if ph(k) != ph(v)], [])

    def test_drills_in_english_have_no_russian(self):
        conn, _ = seeded_conn()
        make_drills(conn, per_technique=3, seed=5)
        set_lang("en")
        rows = conn.execute("SELECT id, technique, board, answers FROM drills").fetchall()
        for did, t, board, answers in rows:
            texts = [explain(board, t, json.loads(answers))["explanation"], hint(conn, did)["hint"]]
            d = next_drill(conn, t)
            texts += [d["prompt"], d["title"]]
            for x in texts:
                self.assertIsNone(CYR.search(x), f"{t}: {x}")
        self.assertFalse([x["title"] for x in technique_list(conn) if CYR.search(x["title"])])

    def test_every_theory_page_has_english(self):
        theory = os.path.join(ROOT, "theory")

        def head(path):
            with open(path, encoding="utf-8") as f:
                return dict(line.split(":", 1) for line in f.read().split("---")[1].strip().splitlines())

        names = sorted(n for n in os.listdir(theory) if n.endswith(".md"))
        self.assertEqual(names, sorted(os.listdir(os.path.join(theory, "en"))))
        for n in names:
            ru, en = head(os.path.join(theory, n)), head(os.path.join(theory, "en", n))
            self.assertEqual(
                {k: ru[k].strip() for k in ("slug", "level", "order", "drill")},
                {k: en[k].strip() for k in ("slug", "level", "order", "drill")},
                n,
            )
            with open(os.path.join(theory, "en", n), encoding="utf-8") as f:
                self.assertIsNone(CYR.search(f.read()), n)

    def test_tr_follows_the_request_language(self):
        self.assertEqual(tr("блок {n}", n=3), "блок 3")
        set_lang("en")
        self.assertEqual(i18n.get_lang(), "en")
        self.assertEqual(unit_name(20), "box 3")
        self.assertEqual(tr(TECH_TITLE["pointing"]), "Pointing")
        set_lang("xx")
        self.assertEqual(i18n.get_lang(), "ru")


if __name__ == "__main__":
    unittest.main()
