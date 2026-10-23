"""Tests for scripts/reda_import.py. No network: downloads are faked, or served by a throw-away local http server.
  "$HOME/Library/Application Support/estudio-video/venv/bin/python" -I scripts/test_reda_import.py
"""
import copy, hashlib, http.server, io, json, os, shutil, subprocess, sys, tempfile, threading, time, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from PIL import Image  # noqa: E402
import reda_import as R  # noqa: E402

FIX = HERE.parent / "engine" / "test-fixtures" / "reda"
PRODUCTS_MJS = HERE.parent / "engine" / "studio" / "products.mjs"


def load(name):
    return json.loads((FIX / name).read_text("utf-8"))


def png_for(url, size=(900, 600)):
    """A distinct, deterministic photo per URL."""
    h = hashlib.sha256(url.encode()).digest()
    im = Image.new("RGB", size, (h[0], h[1], h[2]))
    for x in range(0, size[0], 50):
        im.paste((h[3], h[4], x % 255), (x, 0, x + 25, size[1]))
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


class FakeFetch:
    def __init__(self, fail=(), same=None):
        self.calls, self.fail, self.same = [], set(fail), same

    def __call__(self, url):
        self.calls.append(url)
        if url in self.fail:
            raise R.DownloadError("HTTP 404")
        return png_for(self.same or url)


def run_import(run, data, argv=(), fetch=None, name="in.json"):
    inp = Path(run) / name
    inp.write_text(json.dumps(data), "utf-8")
    import contextlib
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = R.main([str(inp), "--run", str(run), *argv], fetch=fetch or FakeFetch())
    try:
        res = json.loads(out.getvalue())
    except ValueError:
        res = None
    return code, res, err.getvalue()


def doc_of(run):
    return json.loads((Path(run) / "products.json").read_text("utf-8"))


def by_id(doc):
    return {p["id"]: p for p in doc["products"]}


class UrlRules(unittest.TestCase):
    def test_accepts_reda_https_resources(self):
        for u in ("https://reda.mx/recursos/a.png", "https://www.reda.mx/recursos/x/y.md.png", "https://API.Reda.MX/recursos/z.png"):
            self.assertIsNone(R.check_url(u), u)

    def test_rejects_everything_else(self):
        for u in ("http://reda.mx/recursos/a.png", "https://evilreda.mx/recursos/a.png", "https://reda.mx.evil.com/recursos/a.png",
                  "https://reda.mx@evil.com/recursos/a.png", "https://user:pw@reda.mx/recursos/a.png", "https://reda.mx:8443/recursos/a.png",
                  "https://reda.mx/otra/a.png", "file:///etc/passwd", "ftp://reda.mx/recursos/a.png", "https://127.0.0.1/recursos/a.png", ""):
            self.assertIsNotNone(R.check_url(u), u)


class _H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        p = self.path
        if p == "/ok.png":
            body = png_for("ok")
            self.send_response(200); self.send_header("Content-Type", "image/png"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
        elif p == "/html":
            self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers(); self.wfile.write(b"<html>no</html>")
        elif p == "/big.png":  # no Content-Length: the streaming cap must stop it
            self.send_response(200); self.send_header("Content-Type", "image/png"); self.end_headers()
            try:
                for _ in range(200):
                    self.wfile.write(b"0" * 65536)
            except OSError:
                pass
        elif p == "/slow.png":
            self.send_response(200); self.send_header("Content-Type", "image/png"); self.end_headers(); time.sleep(3)
        elif p == "/redir-out":
            self.send_response(302); self.send_header("Location", "https://evil.example.com/recursos/a.png"); self.end_headers()
        elif p == "/redir-ok":
            self.send_response(302); self.send_header("Location", "/ok.png"); self.end_headers()
        else:
            self.send_response(404); self.end_headers()


class FetcherLocal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _H)
        cls.base = f"http://127.0.0.1:{cls.srv.server_port}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def fetcher(self, **kw):
        # tests only: production keeps check_url (https + reda.mx); here the local server is allowed, anything else is not
        return R.Fetcher(url_ok=lambda u: None if u.startswith(self.base) else "host no permitido", retries=0, **kw)

    def test_downloads_an_image(self):
        self.assertEqual(self.fetcher()(self.base + "/ok.png")[:4], b"\x89PNG")

    def test_rejects_non_image_content_type(self):
        with self.assertRaisesRegex(R.DownloadError, "tipo de contenido"):
            self.fetcher()(self.base + "/html")

    def test_size_cap_without_content_length(self):
        with self.assertRaisesRegex(R.DownloadError, "demasiado grande"):
            self.fetcher(max_bytes=1024 * 1024)(self.base + "/big.png")

    def test_timeout(self):
        with self.assertRaises(R.DownloadError):
            self.fetcher(timeout=0.5)(self.base + "/slow.png")

    def test_404(self):
        with self.assertRaisesRegex(R.DownloadError, "404"):
            self.fetcher()(self.base + "/nope.png")

    def test_redirect_to_another_host_is_rejected_and_same_host_followed(self):
        with self.assertRaisesRegex(R.DownloadError, "redirección rechazada"):
            self.fetcher()(self.base + "/redir-out")
        self.assertEqual(self.fetcher()(self.base + "/redir-ok")[:4], b"\x89PNG")

    def test_production_fetcher_never_touches_the_network_for_foreign_urls(self):
        for u in ("http://127.0.0.1:1/x.png", "https://example.com/recursos/a.png"):
            with self.assertRaises(R.DownloadError):
                R.Fetcher()(u)


class Import(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.run_dir = Path(self.tmp.name) / "RUN"
        self.run_dir.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_project_602_mapping(self):
        code, res, _ = run_import(self.run_dir, load("project-602.json"))
        self.assertEqual(code, 0, res)
        doc = doc_of(self.run_dir)
        P = by_id(doc)
        self.assertEqual(set(P), {"reda-602", "reda-602-m1351", "reda-602-m1352", "reda-602-remarketing"})
        m = P["reda-602-m1352"]
        self.assertEqual((m["name"], m["source"], m["currency"], m["priceNote"], m["priceBasis"]), ("Rimac", "reda", "MXN", "desde", "precioModeloFinal"))
        self.assertEqual(m["price"], 1184804.5)
        self.assertEqual(m["attributes"]["recámaras"], 3)
        self.assertEqual(m["attributes"]["baños"], 1.5)
        self.assertEqual(m["attributes"]["m²"], 82)
        self.assertEqual(m["attributes"]["disponibles"], 11)
        self.assertIn("brochure-modelo.pdf", m["attributes"]["brochure"])
        self.assertEqual(len(m["images"]), 1)  # model cover only (this model has no gallery)
        self.assertEqual(m["images"][0]["redaUrl"], "https://reda.mx/recursos/proyectos-empresa/1/602/1352/modelo.png")
        self.assertEqual(m["images"][0]["redaRole"], "model-cover")
        self.assertEqual(P["reda-602-m1351"]["attributes"]["disponibles"], 0)
        proj = P["reda-602"]
        self.assertEqual((proj["name"], proj["price"], proj["priceNote"], proj["priceBasis"]), ("Villa D Paracas", 1458329.5, "desde", "project_catalog_range"))
        self.assertIn("Alberca", proj["attributes"]["amenidades"])
        self.assertTrue(proj["attributes"]["brochure"].endswith("brochure.pdf"))
        # cover + 6 gallery ORIGINALS (not the .md.png)
        urls = [i["redaUrl"] for i in proj["images"]]
        self.assertEqual(len(urls), 7)
        self.assertTrue(all(u.endswith("galeria%d.png" % n) and ".md." not in u for n, u in enumerate(urls[1:], 1)), urls)
        self.assertTrue(urls[0].endswith("img-bloque.png"))
        self.assertTrue(doc["products"][0]["fetchedAt"].startswith("2026-10-22T17:48"))
        rem = P["reda-602-remarketing"]
        self.assertEqual(len(rem["images"]), R.DEFAULT_MAX_IMAGES)
        self.assertEqual(rem["images"][0]["audience"], "TIBIO")
        self.assertEqual(rem["images"][0]["shareUrl"], "https://api-crm.reda.mx/promo/3237")
        self.assertIn("title", rem["images"][0])
        self.assertNotIn("reda-602-amenidades", P)  # no amenity images exist for 602 (icons are opt-in)
        # files are content-addressed and exist
        for p in doc["products"]:
            for i in p["images"]:
                self.assertRegex(i["src"], r"^assets/products/[0-9a-f]{8}\.(jpg|png)$")
                self.assertEqual(i["id"], Path(i["src"]).stem)
                self.assertTrue((self.run_dir / i["src"]).is_file())
        self.node_validates()

    def test_project_794_zero_prices_are_not_shown(self):
        code, res, _ = run_import(self.run_dir, load("project-794.json"))
        self.assertEqual(code, 0)
        P = by_id(doc_of(self.run_dir))
        b = P["reda-794-m1591"]
        self.assertNotIn("price", b)
        self.assertNotIn("priceNote", b)
        self.assertEqual(b["priceBasis"], "precioModelo")
        self.assertNotIn("recámaras", b["attributes"])  # 0 means "not set"
        self.assertEqual(b["attributes"]["baños"], 2)
        self.assertEqual(len(b["images"]), 6)  # cover + 5 gallery
        self.assertEqual(P["reda-794"]["price"], 41109)
        self.assertEqual(P["reda-794"]["attributes"]["precio máximo"], 59355)
        self.node_validates()

    def test_inventory_unit_prices_only_when_complete(self):
        data = load("project-602.json")
        _, res, _ = run_import(self.run_dir, data)
        self.assertTrue(any("parcial" in n for n in res["projects"][0]["notes"]))
        self.assertNotIn("precio unidad desde", by_id(doc_of(self.run_dir))["reda-602-m1352"]["attributes"])
        data = copy.deepcopy(data)
        inv = data["list_inventory"]
        inv["nextCursor"] = None
        inv["summary"]["variantRows"] = len(inv["items"])
        inv["items"][0]["price"] = 1400000.0
        _, res, _ = run_import(self.run_dir, data)
        a = by_id(doc_of(self.run_dir))["reda-602-m1352"]["attributes"]
        self.assertEqual(a["precio unidad desde"], 1400000)
        self.assertEqual(a["precio unidad hasta"], 1458329.5)
        self.assertEqual(a["unidades en inventario"], len(inv["items"]))

    def test_media_only_input(self):
        code, res, _ = run_import(self.run_dir, load("project-717-media-only.json"))
        self.assertEqual(code, 0, res)
        P = by_id(doc_of(self.run_dir))
        self.assertIn("reda-717", P)
        self.assertNotIn("price", P["reda-717"])  # no get_project: no price is invented
        self.assertTrue(any(k.startswith("reda-717-m") for k in P))
        rem = P["reda-717-remarketing"]
        self.assertEqual(rem["attributes"]["audiencias"], "FRIO")
        self.assertIn("3 PDF/video", rem["attributes"]["fotos omitidas"])  # 3 PDF pieces are counted, not downloaded
        self.node_validates()

    def test_rerun_is_idempotent_and_does_not_download_again(self):
        data = load("project-602.json")
        run_import(self.run_dir, data)
        first = (self.run_dir / "products.json").read_text()
        files = sorted(os.listdir(self.run_dir / "assets" / "products"))
        f2 = FakeFetch()
        code, res, _ = run_import(self.run_dir, data, fetch=f2)
        self.assertEqual(code, 0)
        self.assertEqual(f2.calls, [])
        self.assertEqual(res["projects"][0]["imagesAdded"], 0)
        self.assertEqual((self.run_dir / "products.json").read_text(), first)
        self.assertEqual(sorted(os.listdir(self.run_dir / "assets" / "products")), files)

    def test_rerun_updates_price_and_attributes_keeps_user_data(self):
        data = load("project-602.json")
        run_import(self.run_dir, data)
        doc = doc_of(self.run_dir)
        P = by_id(doc)
        P["reda-602-m1352"]["attributes"]["nota interna"] = "mi nota"
        P["reda-602-m1352"]["images"].append({"id": "deadbeef", "src": "assets/products/deadbeef.png", "w": 10, "h": 10})
        (self.run_dir / "products.json").write_text(json.dumps(doc))
        data = copy.deepcopy(data)
        for m in data["get_project"]["models"]:
            if m["id"] == 1352:
                m["price"] = 1250000.0
                m["bedrooms"] = 0  # Reda stopped sending it: must not linger
        run_import(self.run_dir, data)
        m = by_id(doc_of(self.run_dir))["reda-602-m1352"]
        self.assertEqual(m["price"], 1250000)
        self.assertNotIn("recámaras", m["attributes"])
        self.assertEqual(m["attributes"]["nota interna"], "mi nota")
        self.assertEqual(len(m["images"]), 2)  # the user's own photo survives, the Reda one is not duplicated
        data["get_project"]["models"][1]["priceBasis"] = "unavailable"
        run_import(self.run_dir, data)
        m = by_id(doc_of(self.run_dir))["reda-602-m1352"]
        self.assertNotIn("price", m)  # a price Reda no longer offers must not stay on screen

    def test_late_cover_goes_first_and_user_order_is_kept(self):
        data = load("project-794.json")
        f = FakeFetch(fail=["https://reda.mx/recursos/proyectos-empresa/1/794/1591/modelo.png"])
        run_import(self.run_dir, data, fetch=f)
        m = by_id(doc_of(self.run_dir))["reda-794-m1591"]
        self.assertEqual(len(m["images"]), 5)
        run_import(self.run_dir, data)  # the cover answers now
        m = by_id(doc_of(self.run_dir))["reda-794-m1591"]
        self.assertEqual(len(m["images"]), 6)
        self.assertEqual(m["images"][0]["redaRole"], "model-cover")
        doc = doc_of(self.run_dir)
        by_id(doc)["reda-794-m1591"]["images"].reverse()  # the user reordered in the panel
        order = [i["id"] for i in by_id(doc)["reda-794-m1591"]["images"]]
        (self.run_dir / "products.json").write_text(json.dumps(doc))
        run_import(self.run_dir, data)
        self.assertEqual([i["id"] for i in by_id(doc_of(self.run_dir))["reda-794-m1591"]["images"]], order)

    def test_same_photo_under_two_urls_is_stored_once(self):
        _, res, _ = run_import(self.run_dir, load("project-794.json"), fetch=FakeFetch(same="one"))
        self.assertEqual(len(os.listdir(self.run_dir / "assets" / "products")), 1)
        P = by_id(doc_of(self.run_dir))
        self.assertEqual(len(P["reda-794"]["images"]), 1)  # deduped inside a product
        self.assertEqual(len(P["reda-794-m1591"]["images"]), 1)

    def test_original_falls_back_to_medium_and_failures_are_skipped(self):
        data = load("project-794.json")
        orig = "https://reda.mx/recursos/proyectos-empresa/1/794/galeria/galeria1.png"
        medium = "https://reda.mx/recursos/proyectos-empresa/1/794/galeria/galeria1.md.png"
        gone = "https://reda.mx/recursos/proyectos-empresa/1/794/galeria/galeria2.png"
        gone_md = gone.replace(".png", ".md.png")
        f = FakeFetch(fail=[orig, gone, gone_md])
        code, res, _ = run_import(self.run_dir, data, fetch=f)
        self.assertEqual(code, 0)
        urls = [i["redaUrl"] for i in by_id(doc_of(self.run_dir))["reda-794"]["images"]]
        self.assertIn(medium, urls)
        self.assertNotIn(orig, urls)
        self.assertFalse(any("galeria2" in u for u in urls))
        self.assertGreaterEqual(res["projects"][0]["imagesSkipped"], 1)
        self.assertTrue(any("404" in n for n in res["projects"][0]["notes"]))

    def test_foreign_hosts_in_the_input_are_never_fetched(self):
        data = load("project-794.json")
        data["get_project_media"]["gallery"] = [{"kind": "image", "url": "https://evil.example.com/recursos/a.png", "originalUrl": "http://reda.mx/recursos/a.png"}]
        f = FakeFetch()
        _, res, _ = run_import(self.run_dir, data, fetch=f, argv=["--include", "gallery"])
        self.assertFalse(any("evil" in u or u.startswith("http://") for u in f.calls), f.calls)
        self.assertTrue(any("host no permitido" in n or "solo https" in n for n in res["projects"][0]["notes"]))

    def test_models_and_include_filters(self):
        code, res, _ = run_import(self.run_dir, load("project-602.json"), argv=["--models", "1352", "--include", "brochure", "--max-images", "2"])
        self.assertEqual(code, 0)
        P = by_id(doc_of(self.run_dir))
        self.assertEqual(set(P), {"reda-602", "reda-602-m1352"})  # no remarketing / amenities collections, other model skipped
        self.assertEqual(len(P["reda-602"]["images"]), 1)  # cover only: gallery not included
        self.assertNotIn("amenidades", P["reda-602"]["attributes"])
        run_import(self.run_dir, load("project-602.json"), argv=["--include", "remarketing", "--audience", "caliente"])
        rem = by_id(doc_of(self.run_dir))["reda-602-remarketing"]
        self.assertEqual({i["audience"] for i in rem["images"] if i.get("redaRole") == "remarketing" and i["redaUrl"].endswith(".png")}, {"CALIENTE"})
        self.assertEqual(rem["attributes"]["audiencias"], "CALIENTE")

    def test_amenity_images_and_icons(self):
        data = load("project-602.json")
        data = copy.deepcopy(data)
        m = data["get_project_media"]
        m["amenitiesImage"] = {"kind": "image", "url": "https://reda.mx/recursos/landingproyectos/1/602/imagenes/amenidades.png", "originalUrl": None}
        m["amenities"][1]["image"] = {"kind": "image", "url": "https://reda.mx/recursos/amenidades/602/gim.png", "originalUrl": None}
        run_import(self.run_dir, data)
        a = by_id(doc_of(self.run_dir))["reda-602-amenidades"]
        self.assertEqual([i["redaRole"] for i in a["images"]], ["amenities-image", "amenity-image"])
        run_import(self.run_dir, data, argv=["--amenity-icons"])
        a = by_id(doc_of(self.run_dir))["reda-602-amenidades"]
        self.assertIn("amenity-icon", {i["redaRole"] for i in a["images"]})

    def test_corrupt_products_json_is_left_alone(self):
        (self.run_dir / "products.json").write_text("{nope")
        code, res, _ = run_import(self.run_dir, load("project-794.json"))
        self.assertEqual(code, 2)
        self.assertFalse(res["ok"])
        self.assertEqual((self.run_dir / "products.json").read_text(), "{nope")

    def test_bad_input_and_dry_run(self):
        code, res, _ = run_import(self.run_dir, {"hola": 1})
        self.assertEqual(code, 2)
        f = FakeFetch()
        code, res, _ = run_import(self.run_dir, load("project-794.json"), argv=["--dry-run"], fetch=f)
        self.assertEqual((code, f.calls), (0, []))
        self.assertFalse((self.run_dir / "products.json").exists())

    def test_existing_manual_products_are_untouched(self):
        (self.run_dir / "products.json").write_text(json.dumps({"version": 1, "products": [{"id": "sofa", "name": "Sofá", "price": 10, "source": "manual", "images": []}]}))
        run_import(self.run_dir, load("project-794.json"))
        P = by_id(doc_of(self.run_dir))
        self.assertEqual(P["sofa"], {"id": "sofa", "name": "Sofá", "price": 10, "source": "manual", "images": []})
        self.assertIn("reda-794", P)

    def test_cutout_is_off_by_default_and_opt_in(self):
        run_import(self.run_dir, load("project-794.json"))
        self.assertFalse(any("cutout" in i for p in doc_of(self.run_dir)["products"] for i in p["images"]))
        calls = []
        orig = R.run_cutout
        R.run_cutout = lambda run, rec, notes, model=None: calls.append(rec["id"])
        try:
            self.run_dir2 = Path(self.tmp.name) / "RUN2"
            self.run_dir2.mkdir()
            run_import(self.run_dir2, load("project-794.json"), argv=["--cutout"])
        finally:
            R.run_cutout = orig
        self.assertEqual(len(calls), 4)  # the four model covers, nothing else

    def node_validates(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not found")
        code = f"import {{checkProductsDoc}} from {json.dumps('file://' + str(PRODUCTS_MJS))}; import fs from 'node:fs';" \
               f"const e=checkProductsDoc(JSON.parse(fs.readFileSync({json.dumps(str(self.run_dir / 'products.json'))},'utf8'))); if(e){{console.error(e);process.exit(1)}}"
        r = subprocess.run([node, "--input-type=module", "-e", code], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == "__main__":
    unittest.main()
