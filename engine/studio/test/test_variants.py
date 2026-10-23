"""python3 engine/studio/test/test_variants.py  (override application, slug safety, argv adaptation)"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))
import variants as V  # noqa: E402

NASTY = ['He said "hola"', "a/b\\c ../../x", "emoji 🔥 ñ é", "line'quote", "<b>&amp;</b>"]


class T(unittest.TestCase):
    def axes(self):
        return [{"id": "hook", "label": "Gancho", "target": {"kind": "motion", "index": 0, "field": "text"}, "options": ["A", *NASTY[:2]]},
                {"id": "cta", "label": "Cierre", "target": {"kind": "cta", "field": "title"}, "options": ["C", *NASTY[2:4]]}]

    def test_validate(self):
        e, w, combos = V.validate_doc({"axes": self.axes()})
        self.assertEqual(e, [])
        self.assertEqual(len(combos), 9)
        e, _, _ = V.validate_doc({"axes": self.axes() + self.axes()})
        self.assertTrue(e)

    def test_apply_keeps_unicode_and_leaves_other_fields(self):
        docs = {"motion.json": [{"type": "tagPill", "text": "A", "in": 1, "id": "e1"}, {"type": "tagPill", "text": "Z"}]}
        applied = V.apply_overrides(docs, self.axes(), (2, 1))
        self.assertEqual(docs["motion.json"][0]["text"], NASTY[1])
        self.assertEqual(docs["motion.json"][1]["text"], "Z")
        self.assertEqual(docs["cta.json"], {"title": NASTY[2]})
        self.assertEqual([a["text"] for a in applied], [NASTY[1], NASTY[2]])

    def test_target_by_id_and_missing(self):
        ax = [{"id": "h", "label": "H", "target": {"kind": "motion", "id": "e2", "field": "text"}, "options": ["a", "b"]}]
        docs = {"motion.json": [{"text": "x", "id": "e1"}, {"text": "y", "id": "e2"}]}
        V.apply_overrides(docs, ax, (1,))
        self.assertEqual([e["text"] for e in docs["motion.json"]], ["x", "b"])
        with self.assertRaises(V.VariantError):
            V.apply_overrides({"motion.json": [{"text": "x"}]}, ax, (1,))

    def test_slug_safe(self):
        s = V.variant_slug("corte_v2", (1, 2))
        self.assertEqual(s, "corte_v2__var-12")

    def test_argv(self):
        base = ["python3", "overlay.py", "--name", "c", "--motion", "/r/c/motion.json", "--studio-build", "--cta"]
        a = V.variant_argv(base, "c", "c__var-01", Path("/r/c__var-01/motion.json"))
        self.assertEqual(a[a.index("--name") + 1], "c__var-01")
        self.assertEqual(a[a.index("--motion") + 1], "/r/c__var-01/motion.json")
        self.assertNotIn("--studio-build", a)
        self.assertIn("--reuse-footage", a)


if __name__ == "__main__":
    unittest.main()
