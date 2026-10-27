#!/usr/bin/env python3
"""Reda -> Estudio product importer. Merges a Reda project (its models, photos, amenities, remarketing pieces) into RUN/products.json.

  <skill venv python> -I scripts/reda_import.py INPUT.json --run RUN   (<skill venv python> = python3 scripts/paths.py --python)
        [--models all|ID,ID] [--include remarketing,gallery,amenities,brochure] [--max-images N]
        [--audience frio,tibio,caliente] [--amenity-icons] [--cutout] [--dry-run]

INPUT.json holds the RAW results of the read-only Reda MCP tools, saved by the assistant:
  {"list_projects": {...}, "get_project": {...}, "get_project_media": {...}, "list_inventory": {...}}
Only get_project_media is required (a bare get_project_media result is accepted too); get_project adds price / bedrooms / bathrooms /
m2 / amenities names, list_projects adds the cover and price range, list_inventory adds unit availability and unit prices.
A JSON list of such objects imports several projects in one go. Nothing is invented: a field Reda did not send is left out.

What it writes (all with source "reda", fetchedAt = the tool's asOf, deterministic ids so a re-run updates instead of duplicating):
  reda-<project>               the project: price = minPrice with priceNote "desde", cover + gallery originals, amenities/brochure/... in attributes
  reda-<project>-m<model>      one per model: model price (priceNote "desde"), recamaras / banos / m2 / disponibles, model cover + model gallery
  reda-<project>-remarketing   "collection" product: the active remarketing pieces (images; PDFs/videos are only counted), each image
  reda-<project>-amenidades    keeps title / audience / shareUrl, so the Media panel (which lists every product photo) shows them
Images: https only, host reda.mx or *.reda.mx under /recursos/, redirects re-checked, <= 25 MB, timeout, image/* content type, then
validate_asset.process_product (sniff, EXIF, sRGB, <= 2048 px) -> RUN/assets/products/<sha8>.<ext> (content-addressed, deduped by sha).
Every image record keeps redaUrl (the URL it came from), redaId and redaRole. PDFs are never downloaded: only their URL is recorded.
Real-estate photos get NO background removal unless --cutout (then only model covers, via scripts/cutout.py).

Prints one JSON summary on stdout (human notes go to stderr). Exit 0 = merged (warnings possible), 1 = nothing written, 2 = bad input.
"""
import argparse, datetime, http.client, json, os, re, ssl, subprocess, sys, tempfile, urllib.error, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))  # python -I does not add the script directory
import validate_asset as V  # noqa: E402

MAX_BYTES = 25 * 1024 * 1024
TIMEOUT = 30
DEFAULT_MAX_IMAGES = 12
INCLUDES = ("remarketing", "gallery", "amenities", "brochure")
IMAGE_TYPES = ("image/png", "image/jpeg", "image/jpg", "image/webp")
PRICE_NOTE = "desde"
# attribute keys this importer owns: refreshed (and dropped when Reda no longer sends them) on every re-run; other keys are the user's
OWNED = {"recámaras", "baños", "m²", "disponibles", "proyecto", "ubicación", "desarrolladora", "estatus", "precio máximo", "amenidades", "equipamiento",
         "brochure", "precio unidad desde", "precio unidad hasta", "unidades en inventario", "tipo", "piezas", "audiencias", "fotos omitidas"}
OWNED_FIELDS = ("sku", "price", "currency", "priceNote", "priceBasis", "url", "fetchedAt")


class ImportError_(Exception):
    pass


# ---------------------------------------------------------------- downloads
def check_url(url, need_resources=True):
    """-> None when the URL may be fetched, else the reason (Spanish-free, for logs)."""
    try:
        u = urllib.parse.urlsplit(url)
        port = u.port
    except ValueError:
        return "URL inválida"
    if u.scheme != "https":
        return "solo https"
    host = (u.hostname or "").lower()
    if not (host == "reda.mx" or host.endswith(".reda.mx")):
        return f"host no permitido ({host or '?'})"
    if u.username or u.password:
        return "URL con credenciales"
    if port not in (None, 443):
        return "puerto no permitido"
    if need_resources and not u.path.startswith("/recursos/"):
        return "fuera de /recursos/"
    return None


class DownloadError(Exception):
    pass


def tls_context():
    """Verified TLS context = the Python default store + certifi when importable. Needed in practice: reda.mx chains to the Sectigo R46 root,
    which macOS's /etc/ssl/cert.pem (what python.org / venv builds read) does not carry, while certifi does. Verification is never turned off."""
    ctx = ssl.create_default_context()
    try:
        import certifi
        ctx.load_verify_locations(certifi.where())
    except (ImportError, OSError):
        pass
    return ctx


class _Redirects(urllib.request.HTTPRedirectHandler):
    def __init__(self, url_ok):
        self.url_ok = url_ok

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        why = self.url_ok(newurl)
        if why:
            raise DownloadError(f"redirección rechazada ({why})")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Fetcher:
    """Bounded downloader. `url_ok` is injectable so tests can point it at a local server; production keeps check_url."""

    def __init__(self, timeout=TIMEOUT, max_bytes=MAX_BYTES, url_ok=check_url, retries=1):
        self.timeout, self.max_bytes, self.url_ok, self.retries = timeout, max_bytes, url_ok, retries

    def __call__(self, url):
        why = self.url_ok(url)
        if why:
            raise DownloadError(why)
        opener = urllib.request.build_opener(_Redirects(self.url_ok), urllib.request.HTTPSHandler(context=tls_context()))
        last = None
        for attempt in range(self.retries + 1):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "estudio-video-reda-import/1", "Accept": "image/*"})
                with opener.open(req, timeout=self.timeout) as r:
                    ctype = (r.headers.get_content_type() or "").lower()
                    if ctype not in IMAGE_TYPES:
                        raise DownloadError(f"tipo de contenido no permitido ({ctype or 'desconocido'})")
                    declared = r.headers.get("Content-Length")
                    if declared and declared.isdigit() and int(declared) > self.max_bytes:
                        raise DownloadError(f"archivo demasiado grande ({int(declared) / 1e6:.0f} MB)")
                    buf = bytearray()
                    while True:
                        chunk = r.read(64 * 1024)
                        if not chunk:
                            break
                        buf += chunk
                        if len(buf) > self.max_bytes:
                            raise DownloadError(f"archivo demasiado grande (> {self.max_bytes // (1024 * 1024)} MB)")
                    return bytes(buf)
            except DownloadError:
                raise
            except urllib.error.HTTPError as e:
                last = f"HTTP {e.code}"
                if e.code < 500:
                    break
            except (urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException) as e:
                last = f"red: {getattr(e, 'reason', e)}"
        raise DownloadError(last or "descarga fallida")


# ---------------------------------------------------------------- input normalisation
def unwrap(raw):
    """Accept {list_projects,get_project,get_project_media,list_inventory} or a bare get_project_media -> normalized dict."""
    if not isinstance(raw, dict):
        raise ImportError_("el JSON de entrada debe ser un objeto (o una lista de objetos)")
    if "get_project_media" in raw or "get_project" in raw or "list_projects" in raw or "list_inventory" in raw:
        d = {k: raw.get(k) for k in ("list_projects", "get_project", "get_project_media", "list_inventory")}
    elif "projectId" in raw and ("gallery" in raw or "models" in raw or "cover" in raw):
        d = {"get_project_media": raw}
    elif "project" in raw and "models" in raw:
        d = {"get_project": raw}
    else:
        raise ImportError_("no reconozco el JSON: faltan get_project_media / get_project (guarda los resultados crudos de las herramientas de Reda)")
    return d


def project_of(d):
    """-> (id, name, summary dict from get_project / list_projects or {})."""
    media = d.get("get_project_media") or {}
    gp = (d.get("get_project") or {}).get("project") or {}
    pid = gp.get("id") or media.get("projectId")
    summary = dict(gp)
    if pid is None:
        raise ImportError_("no encuentro el id del proyecto")
    if not gp:
        for it in (d.get("list_projects") or {}).get("items", []) or []:
            if it.get("id") == pid:
                summary = dict(it)
    if not summary.get("coverUrl"):
        for it in (d.get("list_projects") or {}).get("items", []) or []:
            if it.get("id") == pid and it.get("coverUrl"):
                summary["coverUrl"] = it["coverUrl"]
    if not isinstance(pid, int):
        raise ImportError_("id de proyecto inválido")
    name = str(summary.get("name") or media.get("projectName") or f"Proyecto {pid}").strip()
    return pid, name, summary


def fetched_at(d):
    for k in ("get_project", "get_project_media", "list_inventory", "list_projects"):
        v = (d.get(k) or {}).get("asOf")
        if isinstance(v, str):
            m = re.match(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$", v)
            if m:
                return m.group(1) + (m.group(2) or "")[:4] + (m.group(3) or "Z")
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- mapping
def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def money(v):
    v = num(v)
    return round(v, 2) if v is not None and v > 0 else None


def trunc(s, n):
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def asset_urls(a, prefer_original=True):
    """MediaAsset -> candidate URLs, best first (original, then medium). Only images."""
    if not isinstance(a, dict) or a.get("kind") != "image":
        return []
    out = []
    for u in ((a.get("originalUrl") if prefer_original else None), a.get("url")):
        if isinstance(u, str) and u and u not in out:
            out.append(u)
    return out


def redaid(pid, *parts, url=""):
    stem = re.sub(r"\.(md\.)?[a-z0-9]+$", "", urllib.parse.urlsplit(url).path.rsplit("/", 1)[-1], flags=re.I) if url else ""
    return ":".join(str(x) for x in (f"p{pid}", *parts, stem) if x != "")


def inventory_stats(d):
    """modelId -> {count, min, max}; only when the list_inventory page is the COMPLETE inventory (else unit prices could mislead)."""
    inv = d.get("list_inventory")
    if not isinstance(inv, dict):
        return {}, None
    items = inv.get("items") or []
    total = (inv.get("summary") or {}).get("variantRows")
    if inv.get("nextCursor") or (isinstance(total, int) and total != len(items)):
        return {}, f"list_inventory es parcial ({len(items)} de {total if total is not None else '?'} unidades): no se importan precios de unidad (vuelve a pedirlo con limit mayor)"
    st = {}
    for u in items:
        if u.get("status") != "disponible" or u.get("modelId") is None:
            continue
        s = st.setdefault(u["modelId"], {"count": 0, "prices": []})
        s["count"] += 1
        p = money(u.get("price"))
        if p is not None and u.get("priceBasis") != "unavailable":
            s["prices"].append(p)
    return st, None


class Plan:
    """Products to write, before any download: {id: {"fields":..., "attrs":..., "images":[ImageRef]}}."""

    def __init__(self):
        self.products = {}

    def add(self, pid, name, fields, attrs, images):
        self.products[pid] = {"name": name, "fields": fields, "attrs": attrs, "images": images}


def img(urls, role, rid, **meta):
    return {"urls": urls, "role": role, "redaId": rid, **meta}


def build_plan(d, include, models_sel, audiences, amenity_icons, max_images, notes):
    pid, pname, summary = project_of(d)
    media = d.get("get_project_media") or {}
    detail = d.get("get_project") or {}
    stamp = fetched_at(d)
    cur = (summary.get("currency") or "MXN")
    cur = cur.upper() if isinstance(cur, str) and re.fullmatch(r"[A-Za-z]{3}", cur) else "MXN"
    inv, inv_note = inventory_stats(d)
    if inv_note:
        notes.append(inv_note)
    plan = Plan()
    base = {"source": "reda", "fetchedAt": stamp}

    # ---- models
    mmedia = {m.get("modelId"): m for m in media.get("models") or [] if isinstance(m, dict)}
    mdetail = {m.get("id"): m for m in detail.get("models") or [] if isinstance(m, dict)}
    ids = list(dict.fromkeys([*mdetail.keys(), *mmedia.keys()]))
    if models_sel is not None:
        missing = [m for m in models_sel if m not in ids]
        if missing:
            notes.append(f"modelos no encontrados en el proyecto {pid}: {', '.join(map(str, missing))}")
        ids = [m for m in ids if m in models_sel]
    for mid in ids:
        md, mm = mdetail.get(mid, {}), mmedia.get(mid, {})
        name = str(md.get("name") or mm.get("name") or f"Modelo {mid}").strip()
        fields = {**base, "sku": f"reda-{pid}-{mid}"}
        basis = md.get("priceBasis")
        price = money(md.get("price"))
        if price is not None and basis != "unavailable":
            fields.update(price=price, currency=cur, priceNote=PRICE_NOTE)
        if basis:
            fields["priceBasis"] = basis
        attrs = {"proyecto": pname}
        for key, src in (("recámaras", "bedrooms"), ("baños", "bathrooms"), ("m²", "areaM2")):
            v = num(md.get(src))
            if v is not None and v > 0:
                attrs[key] = v
        if num(md.get("availableUnits")) is not None:
            attrs["disponibles"] = md["availableUnits"]
        if mid in inv:
            attrs["unidades en inventario"] = inv[mid]["count"]
            if inv[mid]["prices"]:
                attrs["precio unidad desde"] = min(inv[mid]["prices"])
                if max(inv[mid]["prices"]) != min(inv[mid]["prices"]):
                    attrs["precio unidad hasta"] = max(inv[mid]["prices"])
        if "brochure" in include and isinstance(mm.get("brochure"), dict) and mm["brochure"].get("url"):
            attrs["brochure"] = mm["brochure"]["url"]
        images = []
        cover = asset_urls(mm.get("image")) or ([md["imageUrl"]] if md.get("imageUrl") else [])
        if cover:
            images.append(img(cover, "model-cover", redaid(pid, f"m{mid}", url=cover[0]), cover=True))
        if "gallery" in include:
            for a in mm.get("gallery") or []:
                u = asset_urls(a)
                if u:
                    images.append(img(u, "model-gallery", redaid(pid, f"m{mid}", url=u[0])))
        plan.add(f"reda-{pid}-m{mid}", name, fields, attrs, images)

    # ---- project
    fields = {**base, "sku": f"reda-{pid}"}
    lo, hi = money(summary.get("minPrice")), money(summary.get("maxPrice"))
    if lo is not None:
        fields.update(price=lo, currency=cur, priceNote=PRICE_NOTE)
    if summary.get("priceBasis"):
        fields["priceBasis"] = summary["priceBasis"]
    attrs = {}
    if summary.get("location"):
        attrs["ubicación"] = trunc(summary["location"], 200)
    if summary.get("ownerName"):
        attrs["desarrolladora"] = trunc(summary["ownerName"], 200)
    if summary.get("status"):
        attrs["estatus"] = trunc(summary["status"], 200)
    if num(summary.get("availableUnits")) is not None:
        attrs["disponibles"] = summary["availableUnits"]
    if hi is not None and lo is not None and hi != lo:
        attrs["precio máximo"] = hi
    if "amenities" in include:
        names = [str(a.get("name")).strip() for a in (detail.get("amenities") or media.get("amenities") or []) if isinstance(a, dict) and a.get("name")]
        if names:
            attrs["amenidades"] = trunc(", ".join(names), 200)
    eq = [str(e.get("name")).strip() for e in (detail.get("equipment") or media.get("equipment") or []) if isinstance(e, dict) and e.get("name")]
    if eq:
        attrs["equipamiento"] = trunc(", ".join(eq), 200)
    if "brochure" in include and isinstance(media.get("brochure"), dict) and media["brochure"].get("url"):
        attrs["brochure"] = media["brochure"]["url"]
    images = []
    cover = asset_urls(media.get("cover")) or ([summary["coverUrl"]] if summary.get("coverUrl") else [])
    if cover:
        images.append(img(cover, "cover", redaid(pid, url=cover[0]), cover=True))
    if "gallery" in include:
        for a in media.get("gallery") or []:
            u = asset_urls(a)
            if u:
                images.append(img(u, "gallery", redaid(pid, url=u[0])))
    plan.add(f"reda-{pid}", pname, fields, attrs, images)

    # ---- remarketing collection
    if "remarketing" in include:
        pieces, skipped, auds, n_pieces = [], 0, [], 0
        for r in media.get("remarketing") or []:
            if not isinstance(r, dict):
                continue
            aud = (r.get("audience") or "").upper() or None
            if audiences and aud not in audiences:
                continue
            assets = [asset_urls(a) for a in (r.get("media") or [])]
            assets = [u for u in assets if u]  # one photo per image asset (a GALERIA piece has several); PDF / video assets are not images
            if not assets:
                skipped += 1  # PDF / video pieces: only counted (their shareUrl stays in Reda)
                continue
            n_pieces += 1
            auds.append(aud or "sin audiencia")
            for k, urls in enumerate(assets):
                pieces.append(img(urls, "remarketing", f"p{pid}:promo{r.get('contentId')}" + (f":{k + 1}" if len(assets) > 1 else ""), title=trunc(r.get("title") or "", 120),
                                  audience=aud, shareUrl=r.get("shareUrl"), contentId=r.get("contentId")))
        if pieces:
            attrs = {"proyecto": pname, "tipo": "Remarketing", "piezas": n_pieces, "audiencias": ", ".join(sorted(set(auds)))}
            if skipped:
                attrs["fotos omitidas"] = f"{skipped} PDF/video"
            plan.add(f"reda-{pid}-remarketing", trunc(f"Remarketing · {pname}", 120), {**base, "sku": f"reda-{pid}-remarketing"}, attrs, pieces)

    # ---- amenity images
    if "amenities" in include:
        pieces = []
        ai = asset_urls(media.get("amenitiesImage"))
        if ai:
            pieces.append(img(ai, "amenities-image", redaid(pid, "amenidades", url=ai[0])))
        for a in media.get("amenities") or []:
            if not isinstance(a, dict):
                continue
            u = asset_urls(a.get("image"))
            if u:
                pieces.append(img(u, "amenity-image", redaid(pid, f"a{a.get('id')}", url=u[0]), title=a.get("name")))
            if amenity_icons:
                u = asset_urls(a.get("icon"), prefer_original=False)
                if u:
                    pieces.append(img(u, "amenity-icon", redaid(pid, f"a{a.get('id')}", "icon", url=u[0]), title=a.get("name")))
        if pieces:
            attrs = {"proyecto": pname, "tipo": "Amenidades", "piezas": len(pieces)}
            plan.add(f"reda-{pid}-amenidades", trunc(f"Amenidades · {pname}", 120), {**base, "sku": f"reda-{pid}-amenidades"}, attrs, pieces)

    for p in plan.products.values():
        if len(p["images"]) > max_images:
            cut = len(p["images"]) - max_images
            p["images"] = p["images"][:max_images]
            more = f"{cut} (límite --max-images {max_images})"
            p["attrs"]["fotos omitidas"] = f"{p['attrs']['fotos omitidas']}; {more}" if "fotos omitidas" in p["attrs"] else more
            notes.append(f"«{p['name']}»: {cut} foto(s) no importadas por --max-images {max_images}")
    return pid, plan


# ---------------------------------------------------------------- merge into products.json
def read_doc(path):
    if not path.exists():
        return {"version": 1, "products": []}
    try:
        doc = json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        raise ImportError_("products.json está dañado; arréglalo antes de importar (no se tocó nada)")
    if not isinstance(doc, dict) or doc.get("version") != 1 or not isinstance(doc.get("products"), list):
        raise ImportError_("products.json no tiene el formato esperado (version 1 + products[])")
    return doc


def write_doc(path, doc):
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=1), "utf-8")
    os.replace(tmp, path)


def check_doc(doc):
    """Python twin of the essentials of products.mjs checkProductsDoc (the node side re-validates when the Estudio opens it)."""
    seen = set()
    for p in doc["products"]:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", str(p.get("id", ""))) or p["id"] in seen:
            return f"id inválido o repetido: {p.get('id')}"
        seen.add(p["id"])
        if not isinstance(p.get("name"), str) or not p["name"].strip() or len(p["name"]) > 120:
            return f"nombre inválido en {p['id']}"
        if "priceNote" in p and len(p["priceNote"]) > 60:
            return f"priceNote largo en {p['id']}"
        for k, v in (p.get("attributes") or {}).items():
            if not (isinstance(v, (int, float)) or (isinstance(v, str) and len(v) <= 200)):
                return f"atributo inválido {k} en {p['id']}"
    return None


def merge_product(doc, pid, spec, images):
    prods = doc["products"]
    p = next((x for x in prods if x.get("id") == pid), None)
    created = p is None
    if created:
        p = {"id": pid, "name": spec["name"], "source": "reda", "images": []}
        prods.append(p)
    p["name"], p["source"] = spec["name"], "reda"
    for k in OWNED_FIELDS:  # Reda is the source of truth for these: a value Reda stopped sending must not linger
        p.pop(k, None)
    p.update(spec["fields"])
    attrs = {k: v for k, v in (p.get("attributes") or {}).items() if k not in OWNED}
    attrs.update(spec["attrs"])
    if attrs:
        p["attributes"] = attrs
    else:
        p.pop("attributes", None)
    by_id = {i["id"]: i for i in p.setdefault("images", [])}
    added = 0
    prev = None  # id of the previous photo of the plan: a NEW photo goes right after it (the cover goes first), existing order is never shuffled
    for rec in images:
        old = by_id.get(rec["id"])
        if old:
            old.update({k: v for k, v in rec.items() if k not in ("src", "w", "h")})
        else:
            at = 0 if prev is None else next((i + 1 for i, x in enumerate(p["images"]) if x["id"] == prev), len(p["images"]))
            p["images"].insert(at, rec)
            by_id[rec["id"]] = rec
            added += 1
        prev = rec["id"]
    order = ["id", "name", "sku", "price", "currency", "priceNote", "priceBasis", "url", "source", "fetchedAt", "attributes", "images"]
    rest = {k: v for k, v in p.items() if k not in order}
    ordered = {k: p[k] for k in order if k in p}
    p.clear()
    p.update(ordered)  # stable key order: a re-run with the same data rewrites the same bytes
    p.update(rest)
    return created, added


def download_image(spec_img, run, outdir, fetch, index, notes):
    """-> image record or None. `index`: redaUrl -> existing record (skip re-download when the file is still there)."""
    last = "sin URL"
    for url in spec_img["urls"]:
        old = index.get(url)
        if old and (run / old["src"]).is_file():
            return {**old, "_reused": True}
        why = None if isinstance(fetch, Fetcher) else check_url(url)  # Fetcher checks itself (its url_ok is injectable for local tests)
        if why:
            last = f"{url}: {why}"
            continue
        try:
            data = fetch(url)
        except DownloadError as e:
            last = f"{url}: {e}"
            continue
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td) / "in.bin"
            tmp.write_bytes(data)
            v = V.process_product(str(tmp), str(outdir))
        if not v.get("ok"):
            last = f"{url}: {v.get('error')}"
            continue
        rec = {"id": v["sha8"], "src": f"assets/products/{v['file']}", "w": v["width"], "h": v["height"], "redaUrl": url, "redaId": spec_img["redaId"], "redaRole": spec_img["role"]}
        for k in ("title", "audience", "shareUrl", "contentId"):
            if spec_img.get(k) not in (None, ""):
                rec[k] = spec_img[k]
        if v.get("warnings"):
            notes.append(f"{url}: {'; '.join(v['warnings'])}")
        return rec
    notes.append(f"foto omitida ({last})")
    return None


def run_cutout(run, rec, notes, model=None):
    cmd = [sys.executable, "-I", str(HERE / "cutout.py"), "--in", str(run / rec["src"]), "--out-dir", str(run / "assets" / "products")]
    if model:
        cmd += ["--model", model]
    try:
        out = json.loads(subprocess.run(cmd, capture_output=True, text=True, timeout=900).stdout)
    except Exception as e:  # noqa: BLE001 - optional step, never blocks the import
        notes.append(f"recorte omitido ({e})")
        return
    if not out.get("ok"):
        notes.append(f"recorte omitido: {out.get('error')}")
        return
    rec.update(cutout=f"assets/products/{out['file']}", cw=out["width"], ch=out["height"], cutoutModel=out.get("model"))
    if out.get("warnings"):
        rec["cutoutWarnings"] = out["warnings"]


def import_one(d, run, args, fetch, doc):
    notes = []
    models_sel = None if args.models == "all" else [int(x) for x in args.models.split(",") if x.strip()]
    include = set(args.include)
    audiences = {a.upper() for a in args.audience} if args.audience else None
    pid, plan = build_plan(d, include, models_sel, audiences, args.amenity_icons, args.max_images, notes)
    outdir = run / "assets" / "products"
    if not args.dry_run:
        assets = run / "assets"
        if assets.exists() and not assets.resolve().is_relative_to(run.resolve()):
            raise ImportError_("la carpeta assets/ del RUN apunta fuera del RUN")
        outdir.mkdir(parents=True, exist_ok=True)
        if not outdir.resolve().is_relative_to(run.resolve()):
            raise ImportError_("assets/products apunta fuera del RUN")
    index = {i["redaUrl"]: i for p in doc["products"] for i in p.get("images", []) if i.get("redaUrl")}
    summary = {"projectId": pid, "products": [], "imagesAdded": 0, "imagesReused": 0, "imagesSkipped": 0}
    staged = []
    for prod_id, spec in plan.products.items():
        recs = []
        for im in spec["images"]:
            if args.dry_run:
                recs.append({"id": f"dry-{len(recs)}", "src": "", "w": 1, "h": 1})
                continue
            rec = download_image(im, run, outdir, fetch, index, notes)
            if rec is None:
                summary["imagesSkipped"] += 1
                continue
            reused = rec.pop("_reused", False)
            summary["imagesReused" if reused else "imagesAdded"] += 1
            index[rec["redaUrl"]] = rec
            if args.cutout and im["role"] == "model-cover" and not reused and "cutout" not in rec:
                run_cutout(run, rec, notes)
            if not any(r["id"] == rec["id"] for r in recs):
                recs.append(rec)
        staged.append((prod_id, spec, recs))
    if not args.dry_run:
        doc = read_doc(run / "products.json")  # re-read: downloads can take a while and the Estudio may have edited meanwhile
        for prod_id, spec, recs in staged:
            created, added = merge_product(doc, prod_id, spec, recs)
            summary["products"].append({"id": prod_id, "name": spec["name"], "created": created, "images": len(recs), "price": spec["fields"].get("price"), "priceNote": spec["fields"].get("priceNote")})
        err = check_doc(doc)
        if err:
            raise ImportError_(f"el resultado no pasa la validación ({err}); no se escribió nada")
        write_doc(run / "products.json", doc)
    else:
        summary["products"] = [{"id": i, "name": s["name"], "images": len(s["images"]), "price": s["fields"].get("price"), "priceNote": s["fields"].get("priceNote")} for i, s in plan.products.items()]
    summary["notes"] = notes
    return summary


def parse_args(argv):
    ap = argparse.ArgumentParser(description="Import a Reda project into RUN/products.json")
    ap.add_argument("input", help="JSON with the raw Reda tool results")
    ap.add_argument("--run", required=True)
    ap.add_argument("--models", default="all", help="all | modelId,modelId")
    ap.add_argument("--include", default=",".join(INCLUDES), help="comma list of: " + ", ".join(INCLUDES))
    ap.add_argument("--max-images", type=int, default=DEFAULT_MAX_IMAGES, help="per product (default %(default)s)")
    ap.add_argument("--audience", default="", help="remarketing audiences to keep: frio,tibio,caliente (default all)")
    ap.add_argument("--amenity-icons", action="store_true", help="also import the small amenity icons")
    ap.add_argument("--cutout", action="store_true", help="remove the background of model covers (off: real-estate photos stay as they are)")
    ap.add_argument("--dry-run", action="store_true", help="plan only: no downloads, nothing written")
    a = ap.parse_args(argv)
    a.include = [x.strip() for x in a.include.split(",") if x.strip()]
    bad = [x for x in a.include if x not in INCLUDES]
    if bad:
        ap.error(f"--include: valores desconocidos {bad}")
    if a.models != "all" and not re.fullmatch(r"\d+(,\d+)*", a.models):
        ap.error("--models: 'all' o ids separados por comas")
    if a.max_images < 1:
        ap.error("--max-images debe ser >= 1")
    a.audience = [x.strip() for x in a.audience.split(",") if x.strip()]
    return a


def main(argv=None, fetch=None):
    args = parse_args(argv if argv is not None else sys.argv[1:])
    run = Path(args.run).expanduser().resolve()
    if not run.is_dir():
        print(json.dumps({"ok": False, "error": f"--run no es una carpeta: {run}"}, ensure_ascii=False))
        return 2
    try:
        raw = json.loads(Path(args.input).read_text("utf-8"))
        items = raw if isinstance(raw, list) else [raw]
        docs = [unwrap(x) for x in items]
        doc = read_doc(run / "products.json")
        fetch = fetch or Fetcher()
        results = [import_one(d, run, args, fetch, doc) for d in docs]
    except (ImportError_, OSError, ValueError) as e:
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        return 2
    for r in results:
        for n in r["notes"]:
            print(f"aviso: {n}", file=sys.stderr)
    wrote = sum(len(r["products"]) for r in results)
    print(json.dumps({"ok": wrote > 0, "run": str(run), "dryRun": args.dry_run, "projects": results}, ensure_ascii=False, indent=1))
    return 0 if wrote else 1


if __name__ == "__main__":
    sys.exit(main())
