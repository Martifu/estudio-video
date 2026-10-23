"""Product-screen elements in overlay.py: motion.json validation and ui-skin.json hand-off. Run: python3 -m unittest scripts/test_overlay_ui.py"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import overlay  # noqa: E402

LIST = {"type": "uiList", "in": 1, "out": 4, "rows": [{"title": "501", "value": 1}, {"title": "605", "value": 2}], "select": 1}


def prepare(els):
    with tempfile.TemporaryDirectory() as d:
        run = Path(d)
        comp = run / "c"
        comp.mkdir()
        (run / "m.json").write_text(json.dumps(els))
        return overlay.prepare_motion(run / "m.json", run, comp, 10.0)


class UiMotion(unittest.TestCase):
    def test_valid_elements_pass(self):
        icons = {"type": "uiIcons", "in": 0, "out": 3, "icons": ["whatsapp", "tiktok"]}
        self.assertEqual(len(prepare([LIST, icons])), 2)

    def test_feed_items_without_at_pass(self):
        feed = {"type": "uiFeed", "in": 0, "out": 5, "items": [{"title": "a"}, {"title": "b", "time": "ahora"}]}
        self.assertEqual(len(prepare([feed])), 1)

    def test_library_elements_are_validated_by_their_descriptors(self):
        ok = [{"type": "kineticWord", "in": 1, "out": 3, "text": "VENTAS"}, {"type": "logoSting", "in": 5, "out": 8, "url": "reda.mx"}]
        self.assertEqual(len(prepare(ok)), 2)
        for bad in ({"type": "kineticWord", "in": 1, "out": 3, "text": ""}, {"type": "logoSting", "in": 5, "out": 8, "bg": "red"}):
            with self.assertRaises(SystemExit):
                prepare([bad])

    def test_rejects_bad_content(self):
        bad = [
            {**LIST, "rows": []},
            {**LIST, "select": 5},
            {"type": "uiForm", "in": 0, "out": 5, "steps": [{"title": "x"}]},
            {"type": "uiDoc", "in": 0, "out": 5, "rows": [{"label": "a"}]},
            {"type": "uiStat", "in": 0, "out": 5, "label": "x"},
            {"type": "uiKanban", "in": 0, "out": 5, "columns": [{"name": "a"}], "card": {"name": "m"}},
            {"type": "uiFeed", "in": 0, "out": 5, "items": []},
            {"type": "uiIcons", "in": 0, "out": 5, "icons": ["myspace"]},
            {**LIST, "slot": "left"},
            {"type": "uiStat", "label": "x", "value": 1},  # no in / out
        ]
        for el in bad:
            with self.assertRaises(SystemExit, msg=json.dumps(el)[:60]):
                prepare([el])

    def test_skin_handoff_only_with_ui_elements(self):
        with tempfile.TemporaryDirectory() as d:
            run = Path(d)
            comp = run / "c"
            comp.mkdir()
            self.assertFalse(overlay.prepare_ui_skin(run, comp, [{"type": "keywordPop", "in": 0, "out": 1}]))
            self.assertFalse((comp / "ui-skin.json").exists())
            (run / "brand.json").write_text(json.dumps({"slug": "reda"}))
            self.assertTrue(overlay.prepare_ui_skin(run, comp, [LIST]))  # the brand's own brands/reda/ui-skin.json
            self.assertEqual(json.loads((comp / "ui-skin.json").read_text())["font"]["family"], "Cabin")
            self.assertFalse(overlay.prepare_ui_skin(run, comp, [{**LIST, "hidden": True}]) and False)
            (comp / "ui-skin.json").write_text('{"font": {"family": "Mine"}}')
            self.assertTrue(overlay.prepare_ui_skin(run, comp, [LIST]))
            self.assertEqual(json.loads((comp / "ui-skin.json").read_text())["font"]["family"], "Mine")  # the comp's own wins


if __name__ == "__main__":
    unittest.main()


FIX = Path(__file__).resolve().parent.parent / "engine" / "test-fixtures" / "local-lib"


class LocalElements(unittest.TestCase):
    """Comp-local element types (<comp>/motion-lib/<type>.js): registered for that comp, contract-tested before the render."""

    def tearDown(self):
        overlay.LIB_LOCAL = None
        overlay._LIB_TYPES = None

    def test_a_valid_local_element_is_known_and_validated(self):
        overlay.LIB_LOCAL, overlay._LIB_TYPES = FIX / "good" / "motion-lib", None
        self.assertEqual(overlay.lib_types()["demoBadge"]["category"], "De este video")
        self.assertEqual(len(prepare([{"type": "demoBadge", "in": 1, "out": 3, "text": "NUEVO"}])), 1)
        with self.assertRaises(SystemExit):
            prepare([{"type": "demoBadge", "in": 1, "out": 3, "text": ""}])

    def test_a_broken_local_element_stops_the_render_in_spanish(self):
        overlay.LIB_LOCAL, overlay._LIB_TYPES = FIX / "bad" / "motion-lib", None
        with self.assertRaises(SystemExit) as cm:
            overlay.lib_types()
        msg = str(cm.exception.code)
        self.assertIn("no cumplen el contrato", msg)
        self.assertIn("tinyText.js", msg)
        self.assertIn("uiStat.js", msg)

    def test_without_a_local_folder_nothing_changes(self):
        overlay.LIB_LOCAL, overlay._LIB_TYPES = None, None
        self.assertNotIn("demoBadge", overlay.lib_types())
