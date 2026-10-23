// Minimal static file handler shared by render.mjs and studio/server.mjs.
//   /engine/*  -> the engine directory
//   /_people/*  -> the bundled fictional avatar bank (<skill>/assets/people)
//   /_icons/*   -> the official platform logos (<skill>/assets/brand-icons, index.json = {name: {file, label, shape, color}})
//   /engine/motion-lib/manifest.json -> generated: {"files": [...]} the element-type files of engine/motion-lib (browser discovery, motion-lib/index.js)
//   /<comp>/motion-lib/manifest.json -> generated: the comp-local element files (RUN/<comp>/motion-lib), {"files": []} when there is none
//   everything else -> the run directory (same origin for canvas reads)
//
//   const handler = createStaticHandler({ engineDir, runDir, ranges: false, realpathConfine: false });
//   createServer(handler)            // or call handler(req, res) from a bigger router
//
// Defaults reproduce the original render.mjs server byte for byte. Options (used by the studio only):
//   ranges           honour `Range: bytes=a-b` (206) so <audio> can seek; adds Accept-Ranges
//   realpathConfine  resolve symlinks and refuse any file whose real path leaves the base directory
//   headers          extra response headers (e.g. Cache-Control: no-store)
import { createReadStream, existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";

export const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf"
};

/** Resolve a request pathname to an absolute file inside engineDir/runDir, or null (traversal, missing, not a file, symlink escape). */
export function resolveStaticFile(pathname, { engineDir, runDir, realpathConfine = false }) {
  let path;
  try {
    path = normalize(decodeURIComponent(pathname));
  } catch {
    return null;
  }
  if (path.includes("\0")) return null;
  const isEngine = path.startsWith("/engine/");
  const isPeople = path.startsWith("/_people/"); // read-only avatar bank used by the ui* motion elements
  const isIcons = path.startsWith("/_icons/"); // read-only official platform logos (uiIcons)
  const base = isEngine ? engineDir : isPeople ? join(engineDir, "..", "assets", "people") : isIcons ? join(engineDir, "..", "assets", "brand-icons") : runDir;
  const file = join(base, isEngine ? path.slice("/engine".length) : isPeople ? path.slice("/_people".length) : isIcons ? path.slice("/_icons".length) : path);
  if (!file.startsWith(base + sep) || !existsSync(file) || !statSync(file).isFile()) return null;
  if (realpathConfine) {
    const real = realpathSync(file);
    const realBase = realpathSync(base);
    if (!real.startsWith(realBase + sep)) return null;
  }
  return file;
}

export function createStaticHandler({ engineDir, runDir, ranges = false, realpathConfine = false, headers = {} }) {
  return (req, res) => {
    if (new URL(req.url, "http://x").pathname === "/engine/motion-lib/manifest.json") {
      const files = readdirSync(join(engineDir, "motion-lib")).filter((f) => /^[a-z][A-Za-z0-9]*\.js$/.test(f) && f !== "index.js").sort();
      res.writeHead(200, { "Content-Type": "application/json", ...headers }).end(JSON.stringify({ files }));
      return;
    }
    if (new URL(req.url, "http://x").pathname === "/engine/transitions/manifest.json") {
      const files = readdirSync(join(engineDir, "transitions")).filter((f) => /^[a-z][A-Za-z0-9]*\.js$/.test(f) && f !== "index.js").sort();
      res.writeHead(200, { "Content-Type": "application/json", ...headers }).end(JSON.stringify({ files }));
      return;
    }
    // Comp-local element types (RUN/<comp>/motion-lib/<type>.js): a generated manifest; an absent folder answers an empty list (no 404 noise).
    const local = /^\/([\w.-]+)\/motion-lib\/manifest\.json$/.exec(new URL(req.url, "http://x").pathname);
    if (local && local[1] !== "engine" && local[1] !== "..") {
      const dir = join(runDir, local[1], "motion-lib");
      const files = existsSync(dir) && statSync(dir).isDirectory() ? readdirSync(dir).filter((f) => /^[a-z][A-Za-z0-9]*\.js$/.test(f) && f !== "index.js").sort() : [];
      res.writeHead(200, { "Content-Type": "application/json", ...headers }).end(JSON.stringify({ files }));
      return;
    }
    const file = resolveStaticFile(new URL(req.url, "http://x").pathname, { engineDir, runDir, realpathConfine });
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    const type = { "Content-Type": MIME_TYPES[extname(file)] ?? "application/octet-stream", ...headers };
    const range = ranges && req.headers.range ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range) : null;
    if (ranges) type["Accept-Ranges"] = "bytes";
    if (range && (range[1] || range[2])) {
      const size = statSync(file).size;
      let start = range[1] === "" ? Math.max(0, size - Number(range[2])) : Number(range[1]);
      let end = range[1] === "" || range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
      if (start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
        return;
      }
      res.writeHead(206, { ...type, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, type);
    createReadStream(file).pipe(res);
  };
}
