// Brand-agnostic overlay helpers for deterministic 9:16 compositions. Everything drawn is a pure function of t.
// Driven by <run>/brand.json (see brands/_template/brand.json). Usage from a comp:
//   import * as B from "/engine/brand-layer.js";
//   const brand = await B.loadBrand("../brand.json");   // also applies CSS vars + fonts + preloads logos
//   B.setCanvas(ctx);                                   // helpers draw on this 2D context
//   ... in render(t): B.captions(words, t); B.hookTitle("text", t, 0.2, 3); B.ctaCard(t, {...});

import { drawFootage } from "./footage.js";
import { uiResolveRef, resolveSkin } from "./ui-motion.js";
import * as Lib from "./motion-lib/index.js";
import { boxLuminance } from "./motion-lib/_kit.js";

export const isLib = Lib.isLib; // motion-lib element (engine/motion-lib/<type>.js)
export const captionsHidden = Lib.captionsHidden;
export const logoHideWindows = Lib.logoHideWindows;
export const captionHideWindows = Lib.captionHideWindows;
export const isFullFrame = Lib.isFullFrame;

export const W = 1080;
export const H = 1920;
export const SAFE_TOP = 220; // platform UI at the top (search, tabs)
export const SAFE_BOTTOM = 380; // platform UI at the bottom (caption, buttons)
export const SAFE = { x0: 60, x1: W - 60, y0: SAFE_TOP, y1: H - SAFE_BOTTOM };
// Fixed vertical bands (documented in README): header = logo bug (+ tagPill on the opposite side); toasts start below it;
// panel box 1180-1520; captions (default 1430, lifted above a panel by captionsY); nothing above 220 or below 1540.
export const BANDS = { header: { y0: 230, y1: 330 }, toastTop: 350, panel: { y0: 1180, y1: 1520 }, bottom: 1540 };
// Platform zones (the studio edits them; defaults reproduce the constants above exactly). top/bottom = px reserved by the platform UI,
// left/right = side margins of the free area. SAFE and BANDS are mutated in place so every draw function and the planner see them.
export const DEFAULT_ZONES = { top: 220, bottom: 380, left: 60, right: 60 };
let ZONES = { ...DEFAULT_ZONES };
export const getZones = () => ({ ...ZONES });
export function setZones(z = {}) {
  ZONES = { ...DEFAULT_ZONES, ...z };
  const { top, bottom, left, right } = ZONES;
  SAFE.x0 = left;
  SAFE.x1 = W - right;
  SAFE.y0 = top;
  SAFE.y1 = H - bottom;
  BANDS.header = { y0: top + 10, y1: top + 110 };
  BANDS.toastTop = top + 130;
  BANDS.bottom = H - bottom;
  BANDS.panel = { y0: BANDS.bottom - 360, y1: BANDS.bottom - 20 };
}

// ---------- easing / math ----------
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const lerp = (a, b, x) => a + (b - a) * x;
export const expoOut = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const expoIn = (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));
export const expoInOut = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2);
export const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const outBack = (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
// Fade-in then fade-out envelope between a and b.
export const env = (t, a, b, fin = 0.35, fout = 0.35) => Math.min(inOut(seg(t, a, a + fin)), 1 - inOut(seg(t, b - fout, b)));

// ---------- state ----------
let BRAND = null;
let CTX = null;
const IMGS = {}; // logo key -> HTMLImageElement ("custom" = per-comp logo.json `src`, see setLogoSrc)
// Asset problems found while loading (logo images...). render.mjs aborts when ASSET_ERRORS is not empty (never ship a silent text
// fallback); the studio shows them in a banner. ASSET_WARNINGS never block. Both live on globalThis so the comp / studio can read them.
export const ASSET_ERRORS = (globalThis.ASSET_ERRORS = []);
export const ASSET_WARNINGS = (globalThis.ASSET_WARNINGS = []);
const addIssue = (list, kind, path, error) => { if (!list.some((e) => e.kind === kind && e.path === path)) list.push({ kind, path, error }); };
const assetError = (kind, path, error) => addIssue(ASSET_ERRORS, kind, path, error);
export const checkCtaLogoVariant = (v) => { if (v && v !== "auto" && !IMGS[v]) assetError("cta-logo", v, `cta.json: la variante de logo "${v}" no está disponible`); };
export const hasCustomLogo = () => !!IMGS.custom;
export const clearAssetIssues = (kind) => dropIssues(kind);
const dropIssues = (kind) => { for (const list of [ASSET_ERRORS, ASSET_WARNINGS]) for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].kind === kind) list.splice(i, 1); };
export const setCanvas = (ctx) => {
  CTX = ctx;
};
export const getBrand = () => BRAND;
const need = () => {
  if (!CTX) throw new Error("brand-layer: call setCanvas(ctx) first");
  return CTX;
};

// ---------- brand loading ----------
const resolveUrl = (rel, base) => new URL(rel, base).href;
const isRemote = (s) => /^https?:\/\//.test(s);

export async function loadBrand(url = "../brand.json") {
  const abs = new URL(url, document.baseURI).href;
  const res = await fetch(abs);
  if (!res.ok) throw new Error(`brand.json not found: ${abs}`);
  BRAND = await res.json();
  BRAND._base = abs;
  applyBrandCss(BRAND);
  await Promise.all([loadFonts(BRAND), loadLogos(BRAND)]);
  return BRAND;
}

// CSS vars on :root. Fonts: font families only; the faces themselves are registered by loadFonts().
export function applyBrandCss(brand = BRAND) {
  const c = brand.colors ?? {};
  const r = document.documentElement.style;
  if (c.primary) r.setProperty("--brand-primary", c.primary);
  if (c.ink) r.setProperty("--brand-ink", c.ink);
  if (c.paper) r.setProperty("--brand-paper", c.paper);
  if (c.accent) r.setProperty("--brand-accent", c.accent);
  const f = brand.fonts ?? {};
  if (f.display?.family) r.setProperty("--brand-display", `"${f.display.family}", system-ui, sans-serif`);
  if (f.body?.family) r.setProperty("--brand-body", `"${f.body.family}", system-ui, sans-serif`);
}

// Local woff2/ttf paths (relative to brand.json) become @font-face; Google Fonts CSS URLs become a <link>.
export async function loadFonts(brand = BRAND) {
  const jobs = [];
  for (const spec of Object.values(brand.fonts ?? {})) {
    if (!spec?.family) continue;
    if (spec.src && isRemote(spec.src) && spec.src.includes("fonts.googleapis.com")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = spec.src;
      document.head.appendChild(link);
      jobs.push(new Promise((ok) => ((link.onload = ok), (link.onerror = ok))));
    } else if (spec.src) {
      const face = new FontFace(spec.family, `url(${resolveUrl(spec.src, brand._base)})`, { weight: spec.weight ?? "100 900" });
      jobs.push(face.load().then((f) => document.fonts.add(f)).catch((e) => console.error(`font ${spec.family}: ${e.message}`)));
    }
  }
  await Promise.all(jobs);
  // Make sure every declared family is actually resolved at every weight we draw with (canvas does not wait for loads: the first
  // draw of a face that is still "unloaded" silently uses the fallback font and only then starts fetching it, which made the first
  // frames of e.g. a toast (500) differ between renders). 500 and 700 were missing here; weights without a face map to the nearest one.
  await warmFonts(FONT_WEIGHTS, FONT_SAMPLE_TEXT, Object.values(brand.fonts ?? {}).map((s) => s?.family));
  await document.fonts.ready;
}

// Weights drawn by the engine (brand layer + ui skin) and a text sample that pulls in the Latin / Latin-Ext / Cyrillic subsets of
// unicode-range faces (Google Fonts splits families per script; document.fonts.load only fetches the subsets that cover `text`).
export const FONT_WEIGHTS = [400, 500, 600, 700, 800];
const FONT_SAMPLE_TEXT = "AaZz09 áéíóúüñÁÉÍÓÚÑ¿¡€£¥·•–—“”‘’…ĀāČčŠšŽžА";
const WARMED_TEXT = new Set();
/** Resolves every (weight, family) face for `text`; failures are ignored (the drawing code has its own fallbacks). */
async function warmFonts(weights, text, families) {
  await Promise.all([...new Set(families.filter(Boolean))].flatMap((f) => weights.map((w) => document.fonts.load(`${w} 40px "${f}"`, text).catch(() => null))));
}
// Every string of the motion elements, so a face / subset used only by a late element (a toast, a ui screen...) is loaded before its
// first frame instead of during it. Idempotent per text; cheap when nothing changed (called from drawMotion).
async function warmMotionFonts(elements) {
  const strings = [];
  const walk = (v) => (typeof v === "string" ? strings.push(v) : v && typeof v === "object" && Object.values(v).forEach(walk));
  walk(elements);
  const text = [...new Set(strings.join("").split(""))].join("");
  if (!text || WARMED_TEXT.has(text)) return;
  WARMED_TEXT.add(text);
  await warmFonts(FONT_WEIGHTS, text, [BRAND?.fonts?.display?.family, BRAND?.fonts?.body?.family]);
  await document.fonts.ready;
}

async function loadLogos(brand) {
  const logo = { ...(brand.logo ?? {}) };
  if (brand.characters?.rex?.image) logo.rex = brand.characters.rex.image; // avatar for chatBubbles
  await Promise.all(
    ["color", "white", "mark", "rex"].filter((k) => logo[k]).map(async (k) => {
      const img = new Image();
      img.src = resolveUrl(logo[k], brand._base);
      try {
        await img.decode();
        IMGS[k] = img;
      } catch {
        console.error(`logo ${k} failed to load: ${img.src}`);
        assetError("logo", logo[k], `brand.json: el logo "${k}" (${logo[k]}) no existe o no se puede decodificar`);
      }
    })
  );
  if (!logo.color && !logo.white && !logo.mark) addIssue(ASSET_WARNINGS, "logo-missing", "brand.json", "brand.json no define logo: se dibuja el nombre de la marca como texto");
}

// Per-comp logo override (logo.json `src`, a path relative to the RUN dir like brand.json's logo paths). Loaded into IMGS.custom and
// never over the brand variants, so the CTA card keeps using the brand logo unless it asks for "custom". Resolves true when usable.
let CUSTOM_URL = null;
export async function setLogoSrc(rel) {
  if (!rel) {
    dropIssues("logo-src");
    delete IMGS.custom;
    CUSTOM_URL = null;
    return false;
  }
  if (isRemote(rel) || rel.startsWith("/") || rel.split("/").includes("..")) {
    dropIssues("logo-src");
    delete IMGS.custom;
    CUSTOM_URL = null;
    assetError("logo-src", rel, "logo.json: la ruta del logo debe ser relativa al RUN");
    return false;
  }
  const url = resolveUrl(rel, BRAND?._base ?? document.baseURI);
  if (CUSTOM_URL === url && IMGS.custom) return true;
  dropIssues("logo-src");
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    IMGS.custom = img;
    CUSTOM_URL = url;
    return true;
  } catch {
    delete IMGS.custom;
    CUSTOM_URL = null;
    assetError("logo-src", rel, `logo.json: el logo ${rel} no existe o no se puede decodificar`);
    return false;
  }
}
// Variant used when none is requested (today's rule) and the requested one when it is not loaded.
const defaultLogoVariant = () => (IMGS.white ? "white" : IMGS.mark ? "mark" : "color");

// ---------- text helpers ----------
// Canvas does not resolve var(); read the family once from the root style.
const fam = (which) => getComputedStyle(document.documentElement).getPropertyValue(`--brand-${which}`).trim();
const font = (which, px, w) => `${w} ${px}px ${fam(which)}`;

export function wrapLines(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(next).width > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function strokeFill(ctx, str, x, y, fill, stroke, lw) {
  if (stroke) {
    ctx.lineJoin = "round";
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
}

const colors = () => {
  const c = BRAND?.colors ?? {};
  // on_primary: text on primary fills (pills); accent_on_paper: accent text on light backgrounds.
  const primary = c.primary ?? "#111111", paper = c.paper ?? "#ffffff", accent = c.accent ?? "#ffcc00";
  return { primary, ink: c.ink ?? "#111111", paper, accent, on_primary: c.on_primary ?? null, accent_on_paper: c.accent_on_paper ?? accent };
};

// ---------- karaoke captions ----------
// words: [{word|text, start, end}] in seconds. Phrases break at maxWords, at gaps > gap, or after sentence punctuation.
export function groupPhrases(words, { maxWords = 3, maxChars = 22, gap = 0.45 } = {}) {
  const ws = words.map((w) => ({ text: String(w.word ?? w.text ?? "").trim(), start: w.start, end: w.end })).filter((w) => w.text);
  const phrases = [];
  let cur = [];
  const flush = () => {
    if (cur.length) phrases.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  ws.forEach((w) => {
    const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
    if (cur.length && (cur.length >= maxWords || chars > maxChars || w.start - cur[cur.length - 1].end > gap)) flush();
    cur.push(w);
    if (/[.!?¿¡]$/.test(w.text) || /[,;:]$/.test(w.text) && cur.length >= 2) flush();
  });
  flush();
  return phrases;
}

// ---------- highlightWords (caption option) ----------
// Case-, accent- and punctuation-insensitive matching ("DIA" = "día", "2,40" = "2.40"). A list entry may span several words ("2.40 m").
export const normWord = (s) =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/(\d)[,.](?=\d)/g, "$1.").replace(/[^a-z0-9.]/g, "").replace(/^\.+|\.+$/g, "");
// words: caption word texts in order; list: entries to highlight. Returns boolean[] (true = highlighted).
export function matchHighlights(words, list = []) {
  const norms = words.map(normWord);
  const flags = norms.map(() => false);
  for (const entry of list) {
    const toks = String(entry).split(/\s+/).map(normWord).filter(Boolean);
    if (!toks.length) continue;
    const compact = toks.join("");
    for (let i = 0; i < norms.length; i += 1) {
      if (toks.length > 1 && norms[i] === compact) flags[i] = true; // ASR delivered "2.40m" as one word
      if (toks.every((tk, k) => norms[i + k] === tk)) for (let k = 0; k < toks.length; k += 1) flags[i + k] = true;
    }
  }
  return flags;
}
// Collects {"type":"highlightWords","words":[...],"style":"underline"|"box","color"} elements into the `highlight` option of captions().
export function highlightOptions(elements = []) {
  const els = elements.filter((e) => e.type === "highlightWords" && !e.hidden);
  if (!els.length) return null;
  return { words: els.flatMap((e) => e.words ?? []), style: els[els.length - 1].style ?? "underline", color: els[els.length - 1].color };
}

const phraseCache = new WeakMap();
// Studio hooks: bounding box of the caption block drawn by the last captions() call (null when nothing was drawn), and conversion of
// edited caption segments [{in,out,text,words?:[{text,start,end}],hidden}] to the phrase shape captions() draws (`phrases` option).
let lastCaptionRect = null;
export const getCaptionRect = () => lastCaptionRect;
export function segmentsToPhrases(segments = []) {
  const out = [];
  for (const sg of segments) {
    if (sg.hidden) continue;
    const toks = String(sg.text ?? "").split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    const known = sg.words?.length === toks.length ? sg.words : null;
    const total = toks.reduce((n, x) => n + x.length, 0) || 1;
    let at = sg.in;
    const words = toks.map((tx, i) => {
      if (known) return { text: tx, start: known[i].start, end: known[i].end };
      const d = ((sg.out - sg.in) * tx.length) / total;
      const w = { text: tx, start: at, end: at + d };
      at += d;
      return w;
    });
    out.push({ words, start: sg.in, end: sg.out });
  }
  return out;
}
// opts: { y (center, default 1180), size 78, maxW 900, color, active, stroke, upper true, hold 0.3, maxWords, maxChars }
export function captions(words, t, opts = {}) {
  const ctx = need();
  const o = { y: 1180, size: 78, maxW: W - 2 * 90, upper: true, hold: 0.3, ...opts };
  const hlWords = o.highlight?.words?.length ? o.highlight.words : null;
  const key = `${o.maxWords}|${o.maxChars}|${hlWords ? hlWords.join("|") : ""}`;
  const src = o.phrases ?? words; // `phrases`: pre-grouped (edited segments) instead of grouping the voice words
  let cached = phraseCache.get(src);
  if (!cached || cached.key !== key) {
    cached = { key, phrases: o.phrases ?? groupPhrases(words, { maxWords: o.maxWords, maxChars: o.maxChars }) };
    if (hlWords) {
      const flat = cached.phrases.flatMap((p) => p.words);
      matchHighlights(flat.map((w) => w.text), hlWords).forEach((f, i) => (flat[i].hl = f));
    }
    phraseCache.set(src, cached);
  }
  const ph = cached.phrases;
  // Current phrase: the last one that started (a phrase stays up `hold` s past its end unless the next one starts).
  let idx = -1;
  for (let i = 0; i < ph.length; i += 1) if (t >= ph[i].start - 0.04) idx = i;
  lastCaptionRect = null;
  if (idx < 0) return;
  const p = ph[idx];
  if (t > p.end + o.hold) return;
  // A phrase that STARTED while the captions were hidden (a screen / word element on top) must not pop up half-spoken when they come back:
  // it stays out and the captions return with the next phrase ("normal entry"). hiddenWindows = motion-lib captionHideWindows(elements).
  if (o.hiddenWindows?.some(([a, b]) => p.start >= a - 0.04 && p.start < b && t >= b)) return;
  const c = colors();
  const fillBase = o.color ?? c.paper;
  const fillActive = o.active ?? c.accent;
  const stroke = o.stroke ?? c.ink;
  const a = expoOut(seg(t, p.start - 0.04, p.start + 0.12)) * (1 - seg(t, p.end + o.hold - 0.1, p.end + o.hold));
  // Keep inside the safe zone: clamp the block's vertical extent.
  const size = o.size;
  ctx.save();
  ctx.font = font("display", size, 800);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const parts = p.words.map((w) => (o.upper ? w.text.toUpperCase() : w.text));
  const space = ctx.measureText(" ").width;
  // Wrap the phrase into lines that fit maxW.
  const lines = [[]];
  let lw = 0;
  parts.forEach((s, i) => {
    const w = ctx.measureText(s).width;
    if (lines[lines.length - 1].length && lw + space + w > o.maxW) {
      lines.push([]);
      lw = 0;
    }
    lines[lines.length - 1].push({ s, w, i });
    lw += (lw ? space : 0) + w;
  });
  const lh = size * 1.18;
  const blockH = lines.length * lh;
  const yc = clamp(o.y, SAFE.y0 + blockH / 2, SAFE.y1 - blockH / 2);
  ctx.globalAlpha = a;
  let capL = null, capR = null;
  lines.forEach((ln, li) => {
    const total = ln.reduce((n, x) => n + x.w, 0) + space * (ln.length - 1);
    let x = ((o.cx ?? W / 2) * 2 - total) / 2;
    const y = yc - blockH / 2 + lh * (li + 0.5) + (1 - a) * 14;
    const lr = { x, w: total };
    capL = capL === null ? lr.x : Math.min(capL, lr.x);
    capR = capR === null ? lr.x + total : Math.max(capR, lr.x + total);
    for (const { s, w, i } of ln) {
      const wd = p.words[i];
      const active = t >= wd.start - 0.02 && t < wd.end + 0.02;
      const pop = active ? 1 + 0.08 * (1 - seg(t, wd.start, wd.start + 0.12)) : 1;
      ctx.save();
      ctx.translate(x + w / 2, y);
      ctx.scale(pop, pop);
      ctx.textAlign = "center";
      let fill = active ? fillActive : fillBase;
      if (wd.hl && hlWords) {
        // Highlighted word: brand underline swipe (or box) wiping left to right as the word starts.
        const sw = expoOut(seg(t, wd.start - 0.05, wd.start + 0.25));
        const hc = o.highlight.color ?? c.primary;
        if (sw > 0) {
          if (o.highlight.style === "box") {
            const pad = size * 0.14;
            ctx.fillStyle = hc;
            rr(ctx, -w / 2 - pad, -size * 0.58, (w + pad * 2) * sw, size * 1.12, size * 0.16);
            ctx.fill();
            fill = c.on_primary ?? c.ink;
          } else {
            const uh = size * 0.15, uy = size * 0.4;
            ctx.fillStyle = c.ink;
            rr(ctx, -w / 2 - 4, uy - 4, (w + 8) * sw, uh + 8, uh);
            ctx.fill();
            ctx.fillStyle = hc;
            rr(ctx, -w / 2, uy, w * sw, uh, uh / 2);
            ctx.fill();
            fill = fillBase; // lime text on a lime underline would vanish
          }
        }
        strokeFill(ctx, s, 0, 0, fill, o.highlight.style === "box" && sw > 0.3 ? null : stroke, size * 0.16);
      } else strokeFill(ctx, s, 0, 0, fill, stroke, size * 0.16);
      ctx.restore();
      x += w + space;
    }
  });
  lastCaptionRect = capL === null ? null : { x: capL, y: yc - blockH / 2, w: capR - capL, h: blockH };
  ctx.restore();
}

// ---------- hook title ----------
// Big display text in the upper safe zone, visible between inAt and outAt. opts: { y (top, default 360, below the logo bug), size 104, maxW, color, align }
export function hookTitle(text, t, inAt, outAt, opts = {}) {
  const a = env(t, inAt, outAt, 0.4, 0.3);
  if (a <= 0.001) return;
  const ctx = need();
  const c = colors();
  const o = { y: SAFE.y0 + 140, size: 104, maxW: W - 2 * 80, color: c.paper, stroke: c.ink, ...opts };
  ctx.save();
  ctx.font = font("display", o.size, 800);
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  const lines = wrapLines(ctx, o.text ?? text, o.maxW);
  const lh = o.size * 1.08;
  const rise = (1 - expoOut(seg(t, inAt, inAt + 0.5))) * 60;
  ctx.globalAlpha = a;
  lines.forEach((ln, i) => {
    const d = expoOut(seg(t, inAt + i * 0.08, inAt + i * 0.08 + 0.45));
    ctx.globalAlpha = a * d;
    strokeFill(ctx, ln, W / 2, o.y + i * lh + rise * (1 - d * 0.5), o.color, o.stroke, o.size * 0.14);
  });
  ctx.restore();
}

// ---------- lower third ----------
// { title, subtitle } slides in from the left between inAt and outAt, sitting just above the bottom safe band.
export function lowerThird({ title, subtitle = "" }, t, inAt, outAt, opts = {}) {
  const a = env(t, inAt, outAt, 0.5, 0.4);
  if (a <= 0.001) return;
  const ctx = need();
  const c = colors();
  const o = { y: SAFE.y1 - 190, h: 150, ...opts };
  const slide = (1 - expoOut(seg(t, inAt, inAt + 0.55))) * -520;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(slide, 0);
  ctx.fillStyle = c.primary;
  ctx.fillRect(SAFE.x0, o.y, 12, o.h);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(SAFE.x0 + 12, o.y, 700, o.h);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = c.paper;
  ctx.font = font("display", 54, 800);
  ctx.fillText(title, SAFE.x0 + 44, o.y + (subtitle ? 68 : 92));
  if (subtitle) {
    ctx.fillStyle = c.accent;
    ctx.font = font("body", 36, 500);
    ctx.fillText(subtitle, SAFE.x0 + 44, o.y + 118);
  }
  ctx.restore();
}

// ---------- logo ----------
function drawLogo(ctx, key, cx, cy, maxW, maxH) {
  const img = IMGS[key];
  if (!img) return false;
  const k = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  ctx.drawImage(img, cx - (img.naturalWidth * k) / 2, cy - (img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
  return true;
}

// Logo bug geometry: always inside the header band (y 230-330), 240 px wide by default. Used by logoBug() and the layout planner.
// Extra opts (logo.json): x / y = explicit top-left (px, overrides the corner / the header band), variant "custom" = logo.json `src`.
export function logoBox(opts = {}) {
  const set = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined && v !== null));
  const o = { corner: "tr", variant: defaultLogoVariant(), w: 240, h: 90, ...set };
  if (!IMGS[o.variant] && set.variant) {
    addIssue(ASSET_WARNINGS, "logo-variant", o.variant, `la variante de logo "${o.variant}" no está disponible; se usa "${defaultLogoVariant()}"`);
    o.variant = defaultLogoVariant();
  }
  const img = IMGS[o.variant];
  const k = img ? Math.min(o.w / img.naturalWidth, o.h / img.naturalHeight) : 1;
  const w = img ? img.naturalWidth * k : o.w;
  const h = img ? img.naturalHeight * k : 54;
  const x = Number.isFinite(o.x) ? o.x : o.corner === "tl" ? SAFE.x0 : SAFE.x1 - w;
  const y = Number.isFinite(o.y) ? o.y : BANDS.header.y0 + (BANDS.header.y1 - BANDS.header.y0 - h) / 2;
  return { x, y, w, h, variant: o.variant, corner: o.corner };
}

// Corner bug from inAt on (until outAt if given). Falls back to the brand name as text. A soft dark scrim plus a drop shadow keep it
// legible on bright backgrounds. opts: { corner 'tr'|'tl', variant 'white'|'color'|'mark'|'custom', w 240, h 90, hide [[from, to], ...] }
// `hide` = windows (s) where the bug fades out (a toast or other motion would overlap it); the layout planner fills it.
// logo.json extras (all optional; omitted = the look above, pixel-identical): hidden, x / y (top-left px), opacity 0..1,
// enter 'fade'|'pop'|'slide'|'none', fadeDur (s, default 0.4), scrim (false = no dark halo), shadow ({blur, alpha} | false).
// 'pop' is a subtle 1.04 overshoot (counts as one of the video's two allowed bounces, references/motion-reglas.md); no glow effects.
export function logoBug(t, inAt = 0, outAt = Infinity, opts = {}) {
  if (opts.hidden) return;
  const fd = opts.enter === "none" ? 0.02 : Math.max(0.02, opts.fadeDur ?? 0.4);
  let a = Number.isFinite(outAt) ? env(t, inAt, outAt, fd, fd) : inOut(seg(t, inAt, inAt + fd));
  for (const [h0, h1] of opts.hide ?? []) a *= 1 - env(t, h0, h1, 0.25, 0.25);
  if (a <= 0.001) return;
  const ctx = need();
  const b = logoBox(opts);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  ctx.save();
  ctx.globalAlpha = a * (opts.opacity ?? 1);
  if (opts.enter === "pop" || opts.enter === "slide") {
    const p = seg(t, inAt, inAt + Math.max(fd, 0.3));
    if (opts.enter === "pop") {
      const s = p < 0.6 ? lerp(0.9, 1.04, expoOut(p / 0.6)) : lerp(1.04, 1, inOut((p - 0.6) / 0.4));
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
    } else ctx.translate((cx < W / 2 ? -1 : 1) * 60 * (1 - expoOut(p)), 0); // glides in from the nearest side edge
  }
  // Scrim: radial dark glow behind the mark (soft edges, no visible box).
  if (opts.scrim !== false) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.w * 0.78);
    g.addColorStop(0, "rgba(0,0,0,0.5)");
    g.addColorStop(0.6, "rgba(0,0,0,0.26)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, (b.h * 1.5) / (b.w * 0.78 * 2) * 1.4);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    ctx.fillRect(cx - b.w, cy - b.w, b.w * 2, b.w * 2);
    ctx.restore();
  }
  if (opts.shadow !== false) {
    const sh = { blur: 14, alpha: 0.6, ...(opts.shadow ?? {}) };
    ctx.shadowColor = `rgba(0,0,0,${sh.alpha})`;
    ctx.shadowBlur = sh.blur;
    ctx.shadowOffsetY = 3;
  }
  if (!drawLogo(ctx, b.variant, cx, cy, b.w, b.h)) {
    // Never silent: a brand with no usable logo image draws its name, and the studio / render report it.
    addIssue(ASSET_WARNINGS, "logo-missing", "brand.json", "no hay imagen de logo: se dibuja el nombre de la marca como texto");
    const left = Number.isFinite(opts.x) || b.corner === "tl";
    ctx.font = font("display", 48, 800);
    ctx.textAlign = left ? "left" : "right";
    ctx.textBaseline = "middle";
    strokeFill(ctx, BRAND?.name ?? "", Number.isFinite(opts.x) ? b.x : b.corner === "tl" ? SAFE.x0 : SAFE.x1, cy, colors().paper, colors().ink, 6);
  }
  ctx.restore();
}

// "Contenido generado con IA" style label, above the bottom safe band. Drawn only when brand.ai_label is true, unless `force`
// (true/false, e.g. from overlay.py --ai-label/--no-ai-label) overrides the brand setting. Draws nothing when off.
export function aiLabel(t, inAt = 0, outAt = Infinity, text = "Contenido generado con IA", force = null) {
  if (!(force ?? BRAND?.ai_label)) return;
  const a = Number.isFinite(outAt) ? env(t, inAt, outAt, 0.3, 0.3) : seg(t, inAt, inAt + 0.3);
  if (a <= 0.001) return;
  const ctx = need();
  ctx.save();
  ctx.globalAlpha = a * 0.85;
  ctx.font = font("body", 28, 500);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  strokeFill(ctx, text, SAFE.x0, SAFE.y1 - 6, colors().paper, colors().ink, 6);
  ctx.restore();
}

// ---------- CTA end card ----------
// Full-bleed brand card that animates in from opts.at (default 0). Contact falls back to brand.cta (primary / secondary / web / phone / email).
// { title, subtitle, contact } contact: string | string[].
export function ctaCard(t, { title, subtitle = "", contact } = {}, opts = {}) {
  const at = opts.at ?? 0;
  const k = expoOut(seg(t, at, at + 0.5));
  if (k <= 0.001) return;
  const ctx = need();
  const c = colors();
  const cta = BRAND?.cta ?? {};
  const bg = opts.bg ?? c.ink;
  const fg = opts.fg ?? c.paper;
  const lines = (Array.isArray(contact) ? contact : contact ? [contact] : [cta.web, cta.phone, cta.email]).filter(Boolean);
  ctx.save();
  // Wipe-up reveal of the card background.
  ctx.beginPath();
  ctx.rect(0, H * (1 - k), W, H * k + 2);
  ctx.clip();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = c.primary;
  ctx.fillRect(0, SAFE.y0 + 60, W, 10);

  const item = (i) => {
    const e = expoOut(seg(t, at + 0.25 + i * 0.12, at + 0.25 + i * 0.12 + 0.5));
    return { a: e, dy: (1 - e) * 40 };
  };
  // Logo
  let y = 560;
  const lg = item(0);
  ctx.globalAlpha = lg.a;
  let variant = fg === c.paper && IMGS.white ? "white" : IMGS.color ? "color" : IMGS.white ? "white" : "mark";
  if (opts.logoVariant && opts.logoVariant !== "auto") { // cta.json logoVariant: a missing one is reported, never silently swapped
    if (IMGS[opts.logoVariant]) variant = opts.logoVariant;
    else assetError("cta-logo", opts.logoVariant, `cta.json: la variante de logo "${opts.logoVariant}" no está disponible`);
  }
  if (!drawLogo(ctx, variant, W / 2, y + lg.dy, 560, 220)) {
    ctx.font = font("display", 120, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = fg;
    ctx.fillText(BRAND?.name ?? "", W / 2, y + lg.dy);
  }
  // Title (wrapped)
  y = 860;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = font("display", 98, 800);
  const tl = item(1);
  ctx.globalAlpha = tl.a;
  ctx.fillStyle = fg;
  const tLines = wrapLines(ctx, title ?? cta.primary ?? "", W - 2 * 100);
  tLines.forEach((ln, i) => ctx.fillText(ln, W / 2, y + tl.dy + i * 108));
  y += tLines.length * 108 + 30;
  if (subtitle) {
    const sl = item(2);
    ctx.globalAlpha = sl.a;
    ctx.font = font("body", 46, 500);
    ctx.fillStyle = bg === c.paper ? c.accent_on_paper : c.accent;
    wrapLines(ctx, subtitle, W - 2 * 100).forEach((ln, i) => ctx.fillText(ln, W / 2, y + sl.dy + i * 60));
    y += wrapLines(ctx, subtitle, W - 2 * 100).length * 60 + 40;
  }
  // Contact pill(s) stay above the bottom safe band.
  lines.forEach((ln, i) => {
    const cl = item(3 + i);
    ctx.globalAlpha = cl.a;
    ctx.font = font("body", 44, 600);
    const w = ctx.measureText(ln).width + 80;
    const py = Math.min(y + i * 96, SAFE.y1 - 100 - (lines.length - 1 - i) * 0) + cl.dy;
    ctx.fillStyle = c.primary;
    ctx.beginPath();
    ctx.roundRect((W - w) / 2, py, w, 76, 38);
    ctx.fill();
    ctx.fillStyle = c.on_primary ?? bg;
    ctx.textBaseline = "middle";
    ctx.fillText(ln, W / 2, py + 40);
    ctx.textBaseline = "top";
  });
  ctx.restore();
}

// =====================================================================================================================
// Motion-graphics overlays: pure functions of t, no-ops outside their [inAt, outAt) window. All coordinates are in the
// 1080x1920 canvas. Nothing important is placed above y 220 or below y 1540 (panels end at 1520).
// SFX sync: MOTION_EVENTS is filled once from the config by motionEvents(elements) (never by render calls) and the comp copies
// it into window.TIMELINE.events. Event x is the horizontal screen position in [-1, 1] (-1 = left edge).
// =====================================================================================================================
export const MOTION_EVENTS = [];

// Scale overshoot 0.6 -> 1.08 -> 1, then a quick scale-down + fade at the end. Returns null outside the window.
const popIn = (p) => (p < 0.6 ? lerp(0.6, 1.08, expoOut(p / 0.6)) : lerp(1.08, 1, inOut((p - 0.6) / 0.4)));
// Per-element animation speed (>1 = faster intro/outro, 1 = unchanged; `speed` key of the motion element, clamped 0.25..4).
const speedOf = (o) => Math.min(4, Math.max(0.25, Number(o?.speed) || 1));
function popEnv(t, inAt, outAt, din = 0.32, dout = 0.2, sp = 1) {
  if (t < inAt || t >= outAt) return null;
  const p = seg(t, inAt, inAt + din / sp);
  const q = seg(t, outAt - dout / sp, outAt);
  return { p, q, s: popIn(p) * (1 - 0.35 * q * q), a: clamp(p * 5) * (1 - q * q) };
}
const textColorOnPrimary = () => colors().on_primary ?? colors().ink;
// Shrinks `px` until `str` fits maxW (font set on ctx). Returns the px used.
function fitFont(ctx, which, w, str, px, maxW, min = 22) {
  let s = px;
  ctx.font = font(which, s, w);
  while (s > min && ctx.measureText(str).width > maxW) {
    s -= 2;
    ctx.font = font(which, s, w);
  }
  return s;
}
const rr = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

// ---------- keywordPop ----------
// Text layout shared by keywordPop() and the layout planner: shrinks a too-wide single word, then wraps to maxW.
function keywordLayout(ctx, text, o) {
  const str = String(text).toUpperCase();
  const padX = o.size * 0.3;
  ctx.font = font("display", o.size, 800);
  let size = o.size;
  const longestW = Math.max(...str.split(/\s+/).map((w) => ctx.measureText(w).width));
  if (longestW + padX * 2 > o.maxW) size = Math.floor((o.size * (o.maxW - padX * 2)) / longestW);
  ctx.font = font("display", size, 800);
  const lines = wrapLines(ctx, str, o.maxW - padX * 2);
  const lh = size * 1.14;
  const lineW = lines.map((ln) => ctx.measureText(ln).width);
  return { str, size, padX, lines, lh, blockH: lines.length * lh, lineW };
}
const KEYWORD_DEFAULTS = { style: "box", rotate: -3, x: W / 2, y: 760, size: 150, maxW: W - 2 * 100 };

// Visual bounds {w, h} of a keywordPop (rotation, the 1.08 overshoot and the shadow included) plus the fitted size and line count.
export function measureKeywordPop(text, opts = {}) {
  const ctx = need();
  const o = { ...KEYWORD_DEFAULTS, ...opts };
  ctx.save();
  ctx.textAlign = "center";
  const L = keywordLayout(ctx, text, o);
  ctx.restore();
  const bw = Math.max(...L.lineW) + L.padX * 2;
  const r = (Math.abs(o.rotate) * Math.PI) / 180;
  const w = (bw * Math.cos(r) + L.blockH * Math.sin(r)) * 1.08 + 24;
  const h = (L.blockH * Math.cos(r) + bw * Math.sin(r)) * 1.08 + 24;
  return { w, h, size: L.size, lines: L.lines.length };
}

// Big punchy word/phrase burst. opts: { style 'box'|'stroke', rotate -3 (deg), x (center, 540), y (center, 760), size 150, maxW 880 }
export function keywordPop(text, t, inAt, outAt, opts = {}) {
  const sp = speedOf(opts);
  const e = popEnv(t, inAt, outAt, 0.32, 0.2, sp);
  if (!e) return;
  const ctx = need();
  const c = colors();
  const o = { ...KEYWORD_DEFAULTS, ...opts };
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const { size, padX, lines, lh, blockH } = keywordLayout(ctx, text, o);
  const cy = clamp(o.y, SAFE.y0 + blockH / 2, SAFE.y1 - blockH / 2);
  const rot = ((o.rotate * (1 + 0.9 * (1 - expoOut(e.p)))) * Math.PI) / 180;
  ctx.globalAlpha = e.a;
  ctx.translate(o.x, cy);
  ctx.rotate(rot);
  ctx.scale(e.s, e.s);
  lines.forEach((ln, i) => {
    const y = -blockH / 2 + lh * (i + 0.5);
    const lw = ctx.measureText(ln).width;
    if (o.style === "box") {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.38)";
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = c.primary;
      rr(ctx, -lw / 2 - padX, y - lh / 2 + lh * 0.04, lw + padX * 2, lh * 0.92, size * 0.2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = textColorOnPrimary();
      ctx.fillText(ln, 0, y + size * 0.03);
    } else {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 10;
      strokeFill(ctx, ln, 0, y + size * 0.03, c.paper, c.ink, size * 0.2);
      ctx.restore();
    }
  });
  ctx.restore();
}

// ---------- wordStack ----------
// items: [{text, at}] pop in one by one as a vertical stack of brand pills; all leave at opts.outAt.
// opts: { outAt (required), x (anchor, 80), align 'left'|'center'|'right', y (top of the first pill, 520), size 58, h 100, gap 18 }
const stackItem = (ctx, text, o) => {
  const str = String(text).toUpperCase();
  const size = fitFont(ctx, "display", 800, str, o.size, W - 2 * 80 - o.h * 1.4);
  const tw = ctx.measureText(str).width;
  return { str, size, tw, w: tw + o.h * 0.5 + o.h * 0.62 + 20 }; // check circle + text + padding
};
const STACK_DEFAULTS = { x: 80, align: "left", y: 520, size: 58, h: 100, gap: 18 };
// Bounds {w, h} of the whole stack (all items visible).
export function measureWordStack(items, opts = {}) {
  const ctx = need();
  const o = { ...STACK_DEFAULTS, ...opts };
  ctx.save();
  ctx.textBaseline = "middle";
  const w = Math.max(...items.map((it) => stackItem(ctx, it.text, o).w));
  ctx.restore();
  return { w, h: items.length * o.h + (items.length - 1) * o.gap };
}
export function wordStack(items, t, opts = {}) {
  const sp = speedOf(opts);
  const outAt = opts.outAt ?? Infinity;
  if (!items?.length || t >= outAt || t < items[0].at) return;
  const ctx = need();
  const c = colors();
  const o = { ...STACK_DEFAULTS, ...opts };
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  items.forEach((it, i) => {
    if (t < it.at) return;
    const p = seg(t, it.at, it.at + 0.4 / sp);
    const q = seg(t, outAt - 0.25 / sp - 0, outAt);
    const { str, size, w } = stackItem(ctx, it.text, o);
    const left = o.align === "center" ? o.x - w / 2 : o.align === "right" ? o.x - w : o.x;
    const top = o.y + i * (o.h + o.gap);
    const k = outBack(p);
    const slide = (1 - k) * -140 - q * q * 200;
    ctx.save();
    ctx.globalAlpha = clamp(p * 4) * (1 - q * q);
    ctx.translate(left + w / 2 + slide, top + o.h / 2);
    ctx.scale(lerp(0.8, 1, clamp(k)) * (1 - 0.15 * q), lerp(0.8, 1, clamp(k)) * (1 - 0.15 * q));
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = c.primary;
    rr(ctx, -w / 2, -o.h / 2, w, o.h, o.h / 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    // Check mark in an ink circle.
    const cr = o.h * 0.31;
    const cx = -w / 2 + o.h * 0.5;
    ctx.fillStyle = c.ink;
    ctx.beginPath();
    ctx.arc(cx, 0, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.primary;
    ctx.lineWidth = cr * 0.28;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx - cr * 0.42, cr * 0.02);
    ctx.lineTo(cx - cr * 0.1, cr * 0.34);
    ctx.lineTo(cx + cr * 0.46, -cr * 0.3);
    ctx.stroke();
    ctx.fillStyle = textColorOnPrimary();
    ctx.font = font("display", size, 800);
    ctx.fillText(str, cx + cr + 22, o.h * 0.02);
    ctx.restore();
  });
  ctx.restore();
}

// ---------- chatBubbles ----------
// Big readable chat conversation, no phone chrome. items: [{from:'client'|'rex', text, at}] pop in one by one (slide + scale), the
// stack grows upward from `bottom` (newer bubbles at the bottom, older ones shift up), at most `max` (3) visible: the oldest fades
// when the next one arrives; everything leaves at opts.outAt. Client bubbles: white, left. Rex bubbles: light lime (variant 'brand' =
// primary), right, each with the round Rex avatar (brand.characters.rex.image) beside it and a small "Rex IA" tag on the first one.
// opts: { outAt (required), x (left edge of the stack, 90), y (bottom of the stack, 1340), maxW (bubble width incl. padding, 760),
//         size (text px, 52; keep >= 46), avatar 124, max 3, gap 22, rexFill '#E4F3C2', variant 'tint'|'brand', label 'Rex IA' }
const CHAT_DEFAULTS = { x: 90, y: 1340, maxW: 760, size: 52, avatar: 124, max: 3, gap: 22, variant: "tint", rexFill: "#E4F3C2", label: "Rex IA" };
function chatLayout(ctx, items, o) {
  const padX = 34, padY = 26, lh = o.size * 1.2;
  ctx.font = font("body", o.size, 600);
  const bubbles = items.map((it) => {
    const lines = wrapLines(ctx, it.text, o.maxW - padX * 2);
    const tw = Math.max(...lines.map((ln) => ctx.measureText(ln).width));
    return { ...it, lines, w: Math.min(o.maxW, tw + padX * 2), h: lines.length * lh + padY * 2, rex: it.from === "rex" };
  });
  const av = o.avatar + 16;
  const cw = Math.max(0, ...bubbles.filter((b) => !b.rex).map((b) => b.w));
  const rw = Math.max(0, ...bubbles.filter((b) => b.rex).map((b) => b.w + av));
  const w = Math.min(o.maxW + av, Math.max(cw + 90, rw, 360));
  // Tallest stack that is ever visible at once (any `max` consecutive bubbles).
  let h = 0;
  for (let i = 0; i < bubbles.length; i += 1) {
    const grp = bubbles.slice(i, i + o.max);
    h = Math.max(h, grp.reduce((n, b) => n + Math.max(b.h, b.rex ? o.avatar : 0), 0) + (grp.length - 1) * o.gap);
  }
  return { bubbles, w, h: h + (bubbles.some((b) => b.rex) ? 18 : 0), padX, lh, padY };
}
// Bounds {w, h} of the full stack (all pops included). The stack's bottom edge is opts.y.
export function measureChatBubbles(items, opts = {}) {
  const ctx = need();
  ctx.save();
  const L = chatLayout(ctx, items, { ...CHAT_DEFAULTS, ...opts });
  ctx.restore();
  // hAt(t): height of the bubbles actually on screen at t (older ones fade once `max` newer ones exist), for time-aware placement.
  const o = { ...CHAT_DEFAULTS, ...opts };
  const hAt = (t) => {
    const vis = L.bubbles.filter((b, i) => b.at <= t && !(L.bubbles[i + o.max] && L.bubbles[i + o.max].at <= t));
    if (!vis.length) return 0;
    return vis.reduce((n, b) => n + Math.max(b.h, b.rex ? o.avatar : 0), 0) + (vis.length - 1) * o.gap + (vis.some((b) => b.rex) ? 18 : 0) + 20;
  };
  return { w: L.w + 20, h: L.h + 20, hAt };
}
export function chatBubbles(items, t, opts = {}) {
  const sp = speedOf(opts);
  const outAt = opts.outAt ?? Infinity;
  if (!items?.length || t >= outAt || t < items[0].at) return;
  const ctx = need();
  const c = colors();
  const o = { ...CHAT_DEFAULTS, ...opts };
  ctx.save();
  const L = chatLayout(ctx, items, o);
  const x0 = o.x, x1 = o.x + L.w;
  const av = o.avatar;
  const q = seg(t, outAt - 0.3 / sp, outAt);
  const rexFill = o.variant === "brand" ? c.primary : o.rexFill;
  const rexText = o.variant === "brand" ? textColorOnPrimary() : c.ink;
  let firstRex = L.bubbles.findIndex((b) => b.rex);
  L.bubbles.forEach((b, i) => {
    if (t < b.at) return;
    const p = seg(t, b.at, b.at + 0.38 / sp);
    const fadeAt = L.bubbles[i + o.max]?.at ?? Infinity;
    const fade = 1 - inOut(seg(t, fadeAt, fadeAt + 0.3));
    if (fade <= 0.001) return;
    // Vertical position: bottom of the stack minus the (eased) height of every newer bubble.
    let lift = 0;
    for (let j = i + 1; j < L.bubbles.length; j += 1) {
      const nb = L.bubbles[j];
      lift += (Math.max(nb.h, nb.rex ? av : 0) + o.gap) * expoOut(seg(t, nb.at, nb.at + 0.28 / sp)); // older bubbles clear the way before the new one grows
    }
    const rowH = Math.max(b.h, b.rex ? av : 0);
    const bottom = o.y - lift;
    const side = b.rex ? 1 : -1;
    const bx = b.rex ? x1 - av - 16 - b.w : x0;
    const by = bottom - b.h;
    const k = popIn(p);
    ctx.save();
    ctx.globalAlpha = clamp((p - 0.2) * 4) * fade * (1 - q * q);
    ctx.translate((b.rex ? bx + b.w : bx) + side * (1 - expoOut(p)) * 70, bottom + (1 - expoOut(p)) * 24 + q * 20);
    ctx.scale(k, k);
    ctx.translate(-(b.rex ? bx + b.w : bx), -bottom);
    ctx.shadowColor = "rgba(0,0,0,0.34)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = b.rex ? rexFill : "#FFFFFF";
    ctx.beginPath();
    // Chat-bubble corners: the corner nearest the speaker is squarer.
    const R = 44, r = 14;
    ctx.roundRect(bx, by, b.w, b.h, b.rex ? [R, R, r, R] : [R, R, R, r]);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = b.rex ? rexText : "#0A0F0B";
    ctx.font = font("body", o.size, 600);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    b.lines.forEach((ln, li) => ctx.fillText(ln, bx + L.padX, by + L.padY + L.lh * (li + 0.5) + o.size * 0.02));
    ctx.restore();
    if (b.rex) {
      // Avatar: pops in slightly after the bubble, then bobs.
      const ap = seg(t, b.at + 0.08 / sp, b.at + 0.5 / sp);
      const bob = Math.sin((t - b.at) * 3.4) * 4 * clamp(ap);
      const ax = x1 - av, ay = bottom - av + bob;
      const ak = popIn(ap);
      ctx.save();
      ctx.globalAlpha = clamp(ap * 5) * fade * (1 - q * q);
      ctx.translate(ax + av / 2, ay + av / 2);
      ctx.scale(ak, ak);
      ctx.shadowColor = "rgba(0,0,0,0.38)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 8;
      if (!drawLogo(ctx, "rex", 0, 0, av, av)) {
        ctx.fillStyle = c.ink;
        ctx.beginPath();
        ctx.arc(0, 0, av / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      if (i === firstRex && o.label) {
        ctx.save();
        ctx.globalAlpha = clamp(ap * 5) * fade * (1 - q * q);
        ctx.font = font("display", 26, 800);
        const tw = ctx.measureText(o.label).width + 30;
        ctx.translate(ax + av / 2, ay + av + 4);
        ctx.fillStyle = c.ink;
        rr(ctx, -tw / 2, -20, tw, 40, 20);
        ctx.fill();
        ctx.fillStyle = c.primary;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(o.label, 0, 1);
        ctx.restore();
      }
    }
  });
  ctx.restore();
}

// ---------- counterBadge ----------
// Notification-style badge whose number counts up (eased). { from, to, dur (count time, s), label }.
// opts: { x (right edge, SAFE.x1), y (top, 340), color (default notification red #FF3B30; variant 'brand' = primary) }
const badgeDefaults = () => ({ x: SAFE.x1, y: BANDS.toastTop - 10, numSize: 124, labelSize: 38, variant: "red" });
function badgeSize(ctx, from, to, label, o) {
  ctx.font = font("display", o.numSize, 800);
  const numW = ctx.measureText(String(Math.max(Math.abs(to), Math.abs(from)))).width;
  const lsize = label ? fitFont(ctx, "body", 600, label, o.labelSize, W - 2 * SAFE.x0 - 100) : 0;
  const labW = label ? ctx.measureText(label).width : 0;
  return { lsize, w: Math.max(numW + 90, labW + 80, 220), h: o.numSize * 1.02 + (label ? lsize * 1.5 : 0) + 50 };
}
// Bounds {w, h} of a counterBadge (pulse/shake margin included). spec = { from, to, label }.
export function measureCounterBadge({ from = 0, to = 10, label = "" } = {}, opts = {}) {
  const ctx = need();
  ctx.save();
  const b = badgeSize(ctx, from, to, label, { ...badgeDefaults(), ...opts });
  ctx.restore();
  return { w: b.w * 1.06 + 20, h: b.h * 1.06 + 20 };
}
export function counterBadge(t, inAt, outAt, { from = 0, to = 10, dur = 1.6, label = "" } = {}, opts = {}) {
  const sp = speedOf(opts);
  const e = popEnv(t, inAt, outAt, 0.35, 0.22, speedOf(opts));
  if (!e) return;
  const ctx = need();
  const c = colors();
  const o = { ...badgeDefaults(), ...opts };
  const bg = o.color ?? (o.variant === "brand" ? c.primary : "#FF3B30");
  const fg = o.variant === "brand" ? textColorOnPrimary() : "#FFFFFF";
  const k = expoOut(seg(t, inAt + 0.15 / sp, inAt + 0.15 / sp + dur));
  const v = lerp(from, to, k);
  const n = Math.round(v);
  // Shake + pulse each time the number ticks over, during the last part of the count.
  const late = seg(k, 0.55, 0.9);
  const frac = v - Math.floor(v);
  const hit = late > 0 && n !== to ? Math.pow(1 - frac, 3) * late : 0;
  const shake = Math.sin(v * 38) * 9 * hit;
  const pulse = 1 + 0.05 * hit;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  const { lsize, w, h } = badgeSize(ctx, from, to, label, o);
  const cx = o.x - w / 2;
  const cy = o.y + h / 2;
  ctx.globalAlpha = e.a;
  ctx.translate(cx + shake, cy);
  ctx.scale(e.s * pulse, e.s * pulse);
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = bg;
  rr(ctx, -w / 2, -h / 2, w, h, 44);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = font("display", o.numSize, 800);
  ctx.fillText(String(n), 0, -h / 2 + 25 + o.numSize * 0.82);
  if (label) {
    ctx.font = font("body", lsize, 600);
    ctx.globalAlpha = e.a * 0.95;
    ctx.fillText(label, 0, h / 2 - 28);
  }
  ctx.restore();
}

// ---------- tagPill ----------
// Small corner label sliding in from the left. opts: { variant 'ink'|'brand'|'paper', x (SAFE.x0), y (top, 250; never above 230), size 44 }
// Bounds {w, h} of a tagPill.
export function measureTagPill(text, opts = {}) {
  const ctx = need();
  const size = opts.size ?? 44;
  ctx.save();
  ctx.font = font("display", size, 800);
  ctx.letterSpacing = `${(size * 0.06).toFixed(1)}px`;
  const w = ctx.measureText(String(text).toUpperCase()).width + size * 1.4;
  ctx.restore();
  return { w, h: size * 1.9 };
}
export function tagPill(text, t, inAt, outAt, opts = {}) {
  const sp = speedOf(opts);
  if (t < inAt || t >= outAt) return;
  const ctx = need();
  const c = colors();
  const o = { variant: "ink", x: SAFE.x0, y: BANDS.header.y0 + 16, size: 44, ...opts };
  const y = Math.max(o.y, BANDS.header.y0);
  const str = String(text).toUpperCase();
  ctx.save();
  ctx.font = font("display", o.size, 800);
  ctx.letterSpacing = `${(o.size * 0.06).toFixed(1)}px`;
  const h = o.size * 1.9;
  const w = ctx.measureText(str).width + o.size * 1.4;
  const v = {
    ink: { bg: c.ink, fg: c.paper, line: "rgba(255,255,255,0.45)" },
    brand: { bg: c.primary, fg: textColorOnPrimary(), line: null },
    paper: { bg: c.paper, fg: c.ink, line: null }
  }[o.variant] ?? { bg: c.ink, fg: c.paper, line: null };
  // Slides in from the nearer side edge (left unless the pill sits on the right half).
  const dir = o.x + w / 2 > W / 2 ? 1 : -1;
  const away = dir < 0 ? w + o.x + 40 : W - o.x + 40;
  const slide = dir * ((1 - expoOut(seg(t, inAt, inAt + 0.4 / sp))) * away + expoIn(seg(t, outAt - 0.3 / sp, outAt)) * away);
  ctx.translate(o.x + slide, y);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = v.bg;
  rr(ctx, 0, 0, w, h, h / 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  if (v.line) {
    ctx.strokeStyle = v.line;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = v.fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(str, w / 2 + o.size * 0.03, h / 2 + o.size * 0.04);
  ctx.restore();
}

// ---------- toast ----------
// iOS-like notification banner: slides down from the top to opts.y (350, below the header band; never higher) and holds. { title, body }.
// opts: { y 350, x 90, w 900, time 'ahora', icon 'mark' (logo key) }
export function toast(t, inAt, outAt, { title = "", body = "" } = {}, opts = {}) {
  const sp = speedOf(opts);
  if (t < inAt || t >= outAt) return;
  const ctx = need();
  const c = colors();
  const o = { y: BANDS.toastTop, x: 90, w: W - 180, h: 150, time: "ahora", icon: "mark", ...opts };
  o.y = Math.max(o.y, BANDS.toastTop);
  const inK = outBack(seg(t, inAt, inAt + 0.5 / sp), 1.2);
  const outK = expoIn(seg(t, outAt - 0.35 / sp, outAt));
  const y = lerp(-o.h - 40, o.y, inK) - outK * (o.y + o.h + 40);
  const pad = 26;
  const ic = 92;
  ctx.save();
  ctx.globalAlpha = clamp(seg(t, inAt, inAt + 0.15 / sp)) * (1 - outK);
  ctx.shadowColor = "rgba(0,0,0,0.38)";
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  rr(ctx, o.x, y, o.w, o.h, 38);
  ctx.fill();
  ctx.shadowColor = "transparent";
  // App icon tile
  const ix = o.x + pad;
  const iy = y + (o.h - ic) / 2;
  ctx.fillStyle = c.ink;
  rr(ctx, ix, iy, ic, ic, 24);
  ctx.fill();
  if (!drawLogo(ctx, o.icon, ix + ic / 2, iy + ic / 2, ic * 0.66, ic * 0.66)) {
    ctx.fillStyle = c.primary;
    ctx.font = font("display", 52, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((BRAND?.name ?? "").slice(0, 1), ix + ic / 2, iy + ic / 2);
  }
  const tx = ix + ic + 22;
  const maxW = o.x + o.w - pad - tx;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#0A0A0A";
  fitFont(ctx, "body", 700, title, 37, maxW - 110);
  ctx.fillText(title, tx, y + o.h / 2 - 8);
  ctx.fillStyle = "#4A4A4F";
  fitFont(ctx, "body", 500, body, 33, maxW);
  ctx.fillText(body, tx, y + o.h / 2 + 40);
  if (o.time) {
    ctx.fillStyle = "#8A8A8E";
    ctx.font = font("body", 26, 500);
    ctx.textAlign = "right";
    ctx.fillText(o.time, o.x + o.w - pad, y + o.h / 2 - 12);
  }
  ctx.restore();
}

// ---------- floatingPanel ----------
// Rounded card with a soft shadow that slides up from the bottom into the lower third with a slight 3D tilt-in.
// drawContent(ctx, box, localT) draws inside a clipped region (ctx is an offscreen canvas; box = {x:0, y:0, w, h}; localT = t - inAt)
// and may return a promise. opts: { box {x:140,y:1180,w:800,h:340} (bottom is clamped to y 1540), radius 40, tilt 22 (deg) }
let PANEL_CANVAS = null;
export async function floatingPanel(t, inAt, outAt, drawContent, opts = {}) {
  const sp = speedOf(opts);
  if (t < inAt || t >= outAt) return;
  const ctx = need();
  const c = colors();
  const o = { radius: 40, tilt: 22, ...opts };
  const box = { x: 140, y: BANDS.panel.y0, w: 800, h: 340, ...(opts.box ?? {}) };
  box.y = Math.min(box.y, BANDS.bottom - box.h);
  const lt = t - inAt;
  const kIn = expoOut(seg(t, inAt, inAt + 0.65 / sp));
  const kOut = expoIn(seg(t, outAt - 0.4 / sp, outAt));
  const tiltK = 1 - expoOut(seg(t, inAt, inAt + 0.85 / sp));
  const slide = (1 - kIn) * (H - box.y + 20) * 0.45 + kOut * (H - box.y + 20) * 0.5;
  const alpha = clamp(seg(t, inAt, inAt + 0.2 / sp)) * (1 - kOut);

  if (!PANEL_CANVAS) PANEL_CANVAS = document.createElement("canvas");
  if (PANEL_CANVAS.width !== box.w || PANEL_CANVAS.height !== box.h) {
    PANEL_CANVAS.width = box.w;
    PANEL_CANVAS.height = box.h;
  }
  const oc = PANEL_CANVAS.getContext("2d");
  oc.clearRect(0, 0, box.w, box.h);
  oc.save();
  rr(oc, 0, 0, box.w, box.h, o.radius);
  oc.clip();
  oc.fillStyle = c.ink;
  oc.fillRect(0, 0, box.w, box.h);
  await drawContent(oc, { x: 0, y: 0, w: box.w, h: box.h }, lt);
  oc.restore();
  oc.save();
  rr(oc, 2, 2, box.w - 4, box.h - 4, o.radius - 2);
  oc.strokeStyle = "rgba(255,255,255,0.9)";
  oc.lineWidth = 4;
  oc.stroke();
  oc.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  const tilt = tiltK * (o.tilt / 22);
  if (tilt < 0.004) {
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 22;
    ctx.drawImage(PANEL_CANVAS, box.x, box.y + slide);
  } else {
    // Fake rotateX with perspective: horizontal strips, narrower and squashed toward the receding top edge.
    const top = 1 - 0.2 * tilt;
    const fv = 1 - 0.22 * tilt;
    const bottom = box.y + slide + box.h;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 22;
    ctx.fillStyle = "rgba(0,0,0,0.001)";
    const sw = box.w * (1 - 0.1 * tilt);
    rr(ctx, box.x + (box.w - sw) / 2, bottom - box.h * fv, sw, box.h * fv, o.radius);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();
    const step = 2;
    for (let r = 0; r < box.h; r += step) {
      const u = (r + step / 2) / box.h;
      const sc = lerp(top, 1, u);
      const dw = box.w * sc;
      ctx.drawImage(PANEL_CANVAS, 0, r, box.w, step, box.x + (box.w - dw) / 2, bottom - (box.h - r) * fv, dw, step * fv + 0.6);
    }
  }
  ctx.restore();
}

// Content helper for floatingPanel: frames of a footage sequence (made by overlay.py), optionally cropped to a source rect.
// opts: { clipStart (s into the clip when the panel appears, 0), crop {x,y,w,h} in 1080x1920 frame pixels, fit 'cover'|'contain', n }
export function panelFootage(dir, { clipStart = 0, crop, fit = "cover", n } = {}) {
  return (ctx, box, lt) => drawFootage(ctx, dir, clipStart + lt, { start: 0, fps: 30, fit, crop, box, n });
}

// ---------- dimensionLine ----------
// Animated measurement callout tied to a physical spot in the footage (e.g. a 2.40 m table): two end ticks and a line that draws itself
// from the centre outward, with a label pill on the middle. NOT auto-placed: `from`/`to` are canvas px (any angle: horizontal, vertical,
// diagonal). Optional `track` = [{t, from:{x,y}, to:{x,y}}, ...] (seconds on the video timeline) moves the ends with linear
// interpolation (held before the first / after the last key) for a product that drifts a little in the footage.
// spec: { label ("2.40 m"), from, to, track }. opts: { thickness 7, tick 34 (half length of the end ticks), size 54 (label px), color }
const DIM_DEFAULTS = { thickness: 7, tick: 34, size: 54 };
// Ends {from, to} at time t (track interpolation, or the static from/to).
export function dimensionEnds(spec, t) {
  const tr = Array.isArray(spec.track) && spec.track.length ? [...spec.track].sort((a, b) => a.t - b.t) : null;
  if (!tr) return { from: spec.from, to: spec.to };
  if (t <= tr[0].t) return { from: tr[0].from, to: tr[0].to };
  const last = tr[tr.length - 1];
  if (t >= last.t) return { from: last.from, to: last.to };
  let i = 0;
  while (i < tr.length - 2 && t >= tr[i + 1].t) i += 1;
  const a = tr[i], b = tr[i + 1];
  const k = (t - a.t) / (b.t - a.t || 1);
  const P = (p, q) => ({ x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k) });
  return { from: P(a.from, b.from), to: P(a.to, b.to) };
}
// Bounding rect {x,y,w,h} of a dimensionLine over its whole track (ticks, outline and label pill included).
export function measureDimensionLine(spec, opts = {}) {
  const ctx = need();
  const o = { ...DIM_DEFAULTS, ...opts };
  ctx.save();
  ctx.font = font("display", o.size, 800);
  const pw = ctx.measureText(String(spec.label ?? "")).width + o.size * 1.1, ph = o.size * 1.5;
  ctx.restore();
  const keys = Array.isArray(spec.track) && spec.track.length ? spec.track : [spec];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of keys) {
    for (const p of [k.from, k.to]) {
      x0 = Math.min(x0, p.x - o.tick - 8); x1 = Math.max(x1, p.x + o.tick + 8);
      y0 = Math.min(y0, p.y - o.tick - 8); y1 = Math.max(y1, p.y + o.tick + 8);
    }
    const cx = (k.from.x + k.to.x) / 2, cy = (k.from.y + k.to.y) / 2;
    x0 = Math.min(x0, cx - pw / 2 - 8); x1 = Math.max(x1, cx + pw / 2 + 8);
    y0 = Math.min(y0, cy - ph / 2 - 8); y1 = Math.max(y1, cy + ph / 2 + 8);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export function dimensionLine(t, inAt, outAt, spec = {}, opts = {}) {
  const sp = speedOf(opts);
  if (t < inAt || t >= outAt || !((spec.from && spec.to) || spec.track?.length)) return;
  const ctx = need();
  const c = colors();
  const o = { ...DIM_DEFAULTS, ...opts };
  const color = o.color ?? c.primary;
  const draw = expoOut(seg(t, inAt, inAt + 0.8 / sp));
  const q = seg(t, outAt - 0.3 / sp, outAt);
  const { from, to } = dimensionEnds(spec, t);
  const cx = (from.x + to.x) / 2, cy = (from.y + to.y) / 2;
  const L = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const ux = (to.x - from.x) / L, uy = (to.y - from.y) / L;
  const half = (L / 2) * draw;
  const ends = [[cx - ux * half, cy - uy * half], [cx + ux * half, cy + uy * half]];
  const tk = o.tick * outBack(seg(t, inAt, inAt + 0.3 / sp), 1.4);
  ctx.save();
  ctx.globalAlpha = clamp((t - inAt) * 8) * (1 - q * q);
  ctx.lineCap = "round";
  const stroke = (col, w) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(ends[0][0], ends[0][1]);
    ctx.lineTo(ends[1][0], ends[1][1]);
    for (const [ex, ey] of ends) {
      ctx.moveTo(ex - uy * tk, ey + ux * tk);
      ctx.lineTo(ex + uy * tk, ey - ux * tk);
    }
    ctx.stroke();
  };
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  stroke(c.ink, o.thickness + 8); // dark outline keeps the line legible on any footage
  ctx.shadowColor = "transparent";
  stroke(color, o.thickness);
  // Label pill on the middle of the line (always horizontal text), pops in just after the line starts to draw.
  const lp = seg(t, inAt + 0.1 / sp, inAt + 0.5 / sp);
  if (spec.label && lp > 0) {
    const size = fitFont(ctx, "display", 800, String(spec.label), o.size, W - 2 * SAFE.x0 - o.size * 1.1);
    const pw = ctx.measureText(String(spec.label)).width + size * 1.1, ph = size * 1.5;
    const py = clamp(cy, SAFE.y0 + ph / 2, BANDS.bottom - ph / 2);
    ctx.translate(cx, py);
    const k = popIn(lp);
    ctx.scale(k, k);
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = color;
    rr(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 5;
    ctx.strokeStyle = c.ink;
    ctx.stroke();
    ctx.fillStyle = textColorOnPrimary();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(spec.label), 0, size * 0.04);
  }
  ctx.restore();
}

// ---------- specCard ----------
// Feature/spec card: title + 2-4 rows (check or dot icon, label, value), rows staggering in. Auto-placed (top-left = opts.x, opts.y).
// spec: { title, rows:[{label, value, icon:'check'|'dot'} | "text"] }. opts: { x 90, y 520, size 40 (label px; keep >= 32), maxW 820, rowDelay 0.2 }
const SPEC_DEFAULTS = { x: 90, y: 520, size: 40, maxW: 820, rowDelay: 0.2 };
function specLayout(ctx, spec, o) {
  const rows = (spec.rows ?? []).slice(0, 4).map((r) => (typeof r === "string" ? { label: r } : r));
  const title = spec.title ? String(spec.title).toUpperCase() : "";
  const at = (size) => {
    const padX = size * 0.9, padY = size * 0.7, ic = size * 0.95, gap = size * 1.1;
    const tSize = size * 1.1;
    ctx.font = font("display", tSize, 800);
    const tw = title ? ctx.measureText(title).width + tSize * 0.6 : 0;
    const rw = rows.map((r) => {
      ctx.font = font(r.value ? "body" : "display", size, r.value ? 600 : 800);
      const lw = r.label ? ctx.measureText(String(r.label)).width : 0;
      ctx.font = font("display", size * 1.05, 800);
      const vw = r.value ? ctx.measureText(String(r.value)).width : 0;
      return ic + size * 0.6 + lw + (r.value && r.label ? gap : 0) + vw;
    });
    const w = Math.max(tw, ...rw, size * 8) + padX * 2;
    const titleH = title ? tSize * 1.5 : 0, rowH = size * 1.9;
    return { size, padX, padY, ic, tSize, titleH, rowH, w, h: padY * 2 + titleH + rows.length * rowH, rows, title };
  };
  let s = o.size, L = at(s);
  while (L.w > o.maxW && s > 30) {
    s -= 2;
    L = at(s);
  }
  return L;
}
export function measureSpecCard(spec, opts = {}) {
  const ctx = need();
  ctx.save();
  const L = specLayout(ctx, spec, { ...SPEC_DEFAULTS, ...opts });
  ctx.restore();
  return { w: L.w + 40, h: L.h + 40, size: L.size };
}
export function specCard(t, inAt, outAt, spec = {}, opts = {}) {
  const sp = speedOf(opts);
  if (t < inAt || t >= outAt) return;
  const ctx = need();
  const c = colors();
  const o = { ...SPEC_DEFAULTS, ...opts };
  ctx.save();
  const L = specLayout(ctx, spec, o);
  const p = seg(t, inAt, inAt + 0.45 / sp);
  const q = seg(t, outAt - 0.3 / sp, outAt);
  const k = lerp(0.9, 1, outBack(p, 1.1)) * (1 - 0.1 * q * q);
  ctx.globalAlpha = clamp(p * 4) * (1 - q * q);
  ctx.translate(o.x + L.w / 2, o.y + L.h / 2);
  ctx.scale(k, k);
  ctx.translate(-L.w / 2, -L.h / 2);
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  rr(ctx, 0, 0, L.w, L.h, 40);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let y = L.padY;
  if (L.title) {
    ctx.fillStyle = c.primary;
    rr(ctx, L.padX, y + L.tSize * 0.2, 12, L.tSize * 1.1, 6);
    ctx.fill();
    ctx.fillStyle = c.ink;
    ctx.font = font("display", L.tSize, 800);
    ctx.fillText(L.title, L.padX + 12 + L.tSize * 0.4, y + L.titleH / 2);
    y += L.titleH;
  }
  L.rows.forEach((r, i) => {
    const rp = seg(t, inAt + 0.3 / sp + i * o.rowDelay, inAt + 0.3 / sp + i * o.rowDelay + 0.4);
    const e = expoOut(rp);
    const cy = y + L.rowH * (i + 0.5);
    ctx.save();
    ctx.globalAlpha *= clamp(rp * 3);
    ctx.translate((1 - e) * 60, 0);
    // separator
    if (i > 0) {
      ctx.fillStyle = "rgba(10,15,11,0.10)";
      ctx.fillRect(L.padX, y + L.rowH * i - 1, L.w - L.padX * 2, 2);
    }
    // icon: check in a brand circle (default) or a plain dot
    const ix = L.padX + L.ic / 2;
    ctx.fillStyle = c.primary;
    ctx.beginPath();
    ctx.arc(ix, cy, L.ic / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = textColorOnPrimary();
    ctx.fillStyle = textColorOnPrimary();
    if (r.icon === "dot") {
      ctx.beginPath();
      ctx.arc(ix, cy, L.ic * 0.16, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const cr = L.ic / 2;
      ctx.lineWidth = cr * 0.28;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(ix - cr * 0.42, cy + cr * 0.02);
      ctx.lineTo(ix - cr * 0.1, cy + cr * 0.34);
      ctx.lineTo(ix + cr * 0.46, cy - cr * 0.3);
      ctx.stroke();
    }
    const tx = L.padX + L.ic + L.size * 0.6;
    if (r.label) {
      ctx.textAlign = "left";
      ctx.fillStyle = r.value ? "#4A4A4F" : c.ink;
      ctx.font = font(r.value ? "body" : "display", L.size, r.value ? 600 : 800);
      ctx.fillText(String(r.label), tx, cy + L.size * 0.03);
    }
    if (r.value) {
      ctx.textAlign = "right";
      ctx.fillStyle = c.ink;
      ctx.font = font("display", L.size * 1.05, 800);
      ctx.fillText(String(r.value), L.w - L.padX, cy + L.size * 0.03);
    }
    ctx.restore();
  });
  ctx.restore();
}

// ---------- onomatopoeia ----------
// Comic-style word burst ("¡WOW!", "¡CRACK!", "¡ZAS!"): jagged starburst in brand colors behind the word, overshoot pop, a damped
// shake and an optional tilt. Auto-placed away from the face. opts: { x 540, y 760 (centre), size 170, rotate -6 (deg), points 14, maxW 860 }
const ONO_DEFAULTS = { x: W / 2, y: 760, size: 170, rotate: -6, points: 14, maxW: 860 };
const onoPop = (p) => (p < 0.55 ? lerp(0, 1.22, expoOut(p / 0.55)) : lerp(1.22, 1, inOut((p - 0.55) / 0.45)));
function onoLayout(ctx, text, o) {
  const str = String(text).toUpperCase();
  let size = o.size;
  const dims = (s) => {
    ctx.font = font("display", s, 800);
    const tw = ctx.measureText(str).width;
    return { Rx: tw / 2 + s * 0.62, Ry: s * 0.95 };
  };
  let d = dims(size);
  while (size > 40 && 2 * d.Rx * 1.14 > o.maxW) {
    size -= 4;
    d = dims(size);
  }
  return { str, size, ...d };
}
// Deterministic jagged outline: [x, y] vertices around an ellipse (Rx, Ry), seeded by the text so a word always looks the same.
function burstPoints(str, n, Rx, Ry) {
  let seed = 0;
  for (const ch of str) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
  const rnd = (i) => {
    const v = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const pts = [];
  for (let i = 0; i < n * 2; i += 1) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const f = i % 2 === 0 ? 1 + (rnd(i) - 0.5) * 0.26 : 0.74 + (rnd(i) - 0.5) * 0.1;
    pts.push([Math.cos(a) * Rx * f, Math.sin(a) * Ry * f]);
  }
  return pts;
}
export function measureOnomatopoeia(text, opts = {}) {
  const ctx = need();
  const o = { ...ONO_DEFAULTS, ...opts };
  ctx.save();
  const L = onoLayout(ctx, text, o);
  ctx.restore();
  const r = (Math.abs(o.rotate) * Math.PI) / 180;
  const rw = 2 * L.Rx * 1.14, rh = 2 * L.Ry * 1.14;
  return { w: (rw * Math.cos(r) + rh * Math.sin(r)) * 1.08 + 34, h: (rw * Math.sin(r) + rh * Math.cos(r)) * 1.08 + 34, size: L.size };
}
export function onomatopoeia(text, t, inAt, outAt, opts = {}) {
  const sp = speedOf(opts);
  if (t < inAt || t >= outAt) return;
  const ctx = need();
  const c = colors();
  const o = { ...ONO_DEFAULTS, ...opts };
  const p = seg(t, inAt, inAt + 0.4 / sp);
  const q = seg(t, outAt - 0.2 / sp, outAt);
  const age = t - inAt;
  const decay = Math.exp(-age * 4.5);
  const L = onoLayout(ctx, text, o);
  const pts = burstPoints(L.str, o.points, L.Rx, L.Ry);
  const cy = clamp(o.y, SAFE.y0 + L.Ry, BANDS.bottom - L.Ry);
  const s = onoPop(p) * (1 - 0.35 * q * q);
  const rot = ((o.rotate * (1 + 0.9 * (1 - expoOut(p)))) * Math.PI) / 180 + Math.sin(age * 40) * 0.05 * decay;
  const path = (k = 1) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
    ctx.closePath();
  };
  ctx.save();
  ctx.globalAlpha = clamp(p * 6) * (1 - q * q);
  ctx.translate(o.x + Math.sin(age * 62) * 9 * decay, cy + Math.cos(age * 53) * 7 * decay);
  ctx.rotate(rot);
  ctx.scale(Math.max(s, 0.001), Math.max(s, 0.001));
  ctx.lineJoin = "round";
  // ink block shadow behind the burst
  ctx.save();
  ctx.translate(L.size * 0.07, L.size * 0.09);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 26;
  ctx.fillStyle = c.ink;
  path(1.02);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = c.primary;
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = L.size * 0.07;
  path(1);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.22)"; // inner highlight ring
  path(0.8);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font("display", L.size, 800);
  strokeFill(ctx, L.str, 0, L.size * 0.04, c.paper, c.ink, L.size * 0.16);
  ctx.restore();
}

// ---------- config-driven layer ----------
// =====================================================================================================================
// Product elements: productCard, productPop, carousel. Images come ONLY from the RUN's products.json (content-addressed files under
// assets/products/, never remote URLs). products.json is fetched by the comp template and registered with setProducts(doc); a
// motion element references products by id (`product`, optional `image` id). Cutout preferred unless the image has `preferOriginal`.
// Every image used by a visible element is decoded by loadProductImages() before READY / before a frame is captured
// (productsReady()); a missing or broken file lands in ASSET_ERRORS (render.mjs exits 2, /api/preflight reports it in Spanish).
// =====================================================================================================================
let PRODUCTS = { version: 1, products: [] };
const PIMGS = new Map(); // RUN-relative src -> decoded HTMLImageElement
let PENDING_IMAGES = Promise.resolve();
export const productsReady = () => PENDING_IMAGES;
export function setProducts(doc) {
  PRODUCTS = doc && Array.isArray(doc.products) ? doc : { version: 1, products: [] };
}
export const getProducts = () => PRODUCTS;
export const PRODUCT_TYPES = ["productCard", "productPop", "carousel"];
const productById = (id) => PRODUCTS.products.find((p) => p.id === id) ?? null;

/** Resolve {product, image?} against products.json -> {product, entry, src, w, h, cut} or null. */
export function resolveProductImage(ref) {
  const p = ref ? productById(ref.product) : null;
  if (!p) return null;
  const entry = (ref.image ? p.images?.find((i) => i.id === ref.image) : p.images?.[0]) ?? null;
  if (!entry) return { product: p, entry: null, src: null, w: 0, h: 0, cut: false };
  const cut = !!entry.cutout && !entry.preferOriginal;
  return { product: p, entry, src: cut ? entry.cutout : entry.src, w: cut ? entry.cw ?? entry.w : entry.w, h: cut ? entry.ch ?? entry.h : entry.h, cut };
}
/** Refs (one per drawn image) of a product element: [{product, image?}]. */
export const productRefs = (el) => (el.type === "carousel" ? (el.slides ?? []) : [{ product: el.product, image: el.image }]);

export function formatPrice(price, currency) {
  if (price === undefined || price === null || price === "") return "";
  if (typeof price === "string") return price;
  const n = Math.round(price * 100) / 100;
  const [i, f] = String(n).split(".");
  const num = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? `.${f.padEnd(2, "0")}` : "");
  const sym = currency === "USD" ? "US$" : "$";
  return `${sym}${num}${currency && currency !== "MXN" && currency !== "USD" ? ` ${currency}` : ""}`;
}
const relOk = (rel) => typeof rel === "string" && rel && !isRemote(rel) && !rel.startsWith("/") && !rel.split(/[\\/]/).includes("..");

/** Decode every image the visible product elements use. Errors -> ASSET_ERRORS (kinds "product" / "product-image"). */
export function loadProductImages(elements = []) {
  dropIssues("product");
  dropIssues("product-image");
  const jobs = [];
  const seen = new Set();
  for (const el of elements) {
    if (!PRODUCT_TYPES.includes(el.type) || el.hidden) continue;
    for (const ref of productRefs(el)) {
      const r = resolveProductImage(ref);
      if (!r) { assetError("product", String(ref?.product), `Un elemento usa el producto "${ref?.product}", que ya no existe en products.json`); continue; }
      if (!r.entry || !r.src) { assetError("product", String(ref.product), `El producto "${r.product.name}" no tiene la foto que usa este elemento`); continue; }
      if (!relOk(r.src)) { assetError("product-image", r.src, `La foto de "${r.product.name}" tiene una ruta no válida (${r.src})`); continue; }
      if (seen.has(r.src)) continue;
      seen.add(r.src);
      if (PIMGS.has(r.src)) continue;
      const img = new Image();
      img.src = resolveUrl(r.src, BRAND?._base ?? document.baseURI);
      jobs.push(img.decode().then(() => PIMGS.set(r.src, img), () => assetError("product-image", r.src, `La foto de "${r.product.name}" (${r.src}) no existe o no se puede abrir`)));
    }
  }
  // A cached image that disappeared from disk stays decoded; render.mjs loads fresh pages, so only the studio can see that.
  PENDING_IMAGES = Promise.all(jobs).then(() => undefined);
  return PENDING_IMAGES;
}

const ellipsize = (ctx, str, maxW) => {
  let s = String(str);
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
};

// Card layout shared by productCard and the carousel items. `compact` = carousel cell (square tile, one-line name).
function cardLayout(ctx, d, w, { compact = false } = {}) {
  const pad = Math.round(w * (compact ? 0.05 : 0.045));
  const inner = w - 2 * pad;
  const ar = d.ar > 0 ? d.ar : 1;
  const tileH = compact ? inner : Math.round(inner * clamp(1 / ar, 0.62, 1));
  const name = String(d.name ?? "");
  const minN = compact ? 22 : 30;
  let nSz = Math.max(minN, Math.round(w * (compact ? 0.072 : 0.068)));
  let lines;
  for (;;) {
    ctx.font = font("display", nSz, 800);
    lines = compact ? [name] : wrapLines(ctx, name, inner);
    if ((compact ? ctx.measureText(name).width <= inner : lines.length <= 2) || nSz <= minN) break;
    nSz -= 2;
  }
  if (compact) lines = [ellipsize(ctx, name, inner)];
  else if (lines.length > 2) lines = [lines[0], ellipsize(ctx, lines.slice(1).join(" "), inner)];
  const priceSz = Math.max(compact ? 26 : 34, Math.round(w * (compact ? 0.098 : 0.1)));
  const noteSz = Math.max(30, Math.round(w * 0.056));
  const gapA = Math.round(w * 0.035);
  const nameH = lines.length * nSz * 1.15;
  const priceH = d.price ? priceSz * 1.2 : 0;
  const noteH = d.note ? noteSz * 1.3 : 0;
  const h = pad + tileH + gapA + nameH + (priceH ? 4 + priceH : 0) + noteH + pad;
  return { w, h, pad, inner, tileH, nSz, lines, priceSz, noteSz, gapA, nameH, priceH, noteH, compact };
}

// Draw a card at the origin. a = animation factors {img 0..1 (tile image reveal), text 0..1, badge 0..1}.
function drawCard(ctx, L, d, img, a = { img: 1, text: 1, badge: 1 }) {
  const c = colors();
  const { w, h, pad, inner, tileH } = L;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "rgba(255,255,255,0.98)";
  rr(ctx, 0, 0, w, h, w * 0.07);
  ctx.fill();
  ctx.restore();
  ctx.save();
  // image tile
  ctx.fillStyle = "rgba(10,15,11,0.05)";
  rr(ctx, pad, pad, inner, tileH, w * 0.05);
  ctx.fill();
  if (img) {
    ctx.save();
    rr(ctx, pad, pad, inner, tileH, w * 0.05);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha *= clamp(a.img * 3);
    const dy = (1 - expoOut(a.img)) * tileH * 0.08;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (d.cut) {
      const room = 0.88;
      const k = Math.min((inner * room) / iw, (tileH * room) / ih);
      const dw = iw * k, dh = ih * k;
      ctx.shadowColor = "rgba(0,0,0,0.26)";
      ctx.shadowBlur = tileH * 0.07;
      ctx.shadowOffsetY = tileH * 0.03;
      ctx.drawImage(img, pad + (inner - dw) / 2, pad + (tileH - dh) / 2 + dy, dw, dh);
    } else {
      const k = Math.max(inner / iw, tileH / ih) * (1 + 0.04 * (1 - expoOut(a.img)));
      const dw = iw * k, dh = ih * k;
      ctx.drawImage(img, pad + (inner - dw) / 2, pad + (tileH - dh) / 2, dw, dh);
    }
    ctx.restore();
  }
  // badge (pill on the tile's top-left corner)
  if (d.badge && a.badge > 0) {
    const bs = Math.max(26, Math.round(w * 0.05));
    ctx.font = font("display", bs, 800);
    const txt = String(d.badge).toUpperCase();
    const bw = ctx.measureText(txt).width + bs * 1.3, bh = bs * 1.7;
    ctx.save();
    ctx.globalAlpha *= clamp(a.badge * 3);
    const s = lerp(0.7, 1, expoOut(a.badge));
    const bx = pad + w * 0.03, by = pad + w * 0.03;
    ctx.translate(bx, by + bh / 2);
    ctx.scale(s, s);
    ctx.fillStyle = c.primary;
    rr(ctx, 0, -bh / 2, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = textColorOnPrimary();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(txt, bs * 0.65, bs * 0.04);
    ctx.restore();
  }
  // texts
  ctx.globalAlpha *= clamp(a.text * 2);
  const ty = (1 - expoOut(a.text)) * 14;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let y = pad + tileH + L.gapA + ty;
  ctx.fillStyle = c.ink;
  ctx.font = font("display", L.nSz, 800);
  for (const ln of L.lines) { ctx.fillText(ln, pad, y); y += L.nSz * 1.15; }
  if (d.price) {
    y += 4;
    ctx.font = font("display", L.priceSz, 800);
    ctx.fillStyle = c.ink;
    ctx.fillText(d.price, pad, y);
    y += L.priceH;
  }
  if (d.note) {
    ctx.font = font("body", L.noteSz, 600);
    ctx.fillStyle = "#4A4A4F";
    ctx.fillText(ellipsize(ctx, d.note, inner), pad, y);
  }
  ctx.restore();
}

// Text/image data of one product reference, merged with the element's overrides.
function cardData(ref, ov = {}, showPrice = true) {
  const r = resolveProductImage(ref);
  const p = r?.product;
  const price = showPrice === false ? "" : formatPrice(ov.price ?? p?.price, p?.currency);
  return {
    name: ov.name ?? ov.caption ?? p?.name ?? "", price, note: showPrice === false ? "" : (ov.priceNote ?? p?.priceNote ?? ""), badge: ov.badge ?? "",
    ar: r?.w && r?.h ? r.w / r.h : 1, cut: !!r?.cut, img: r?.src ? PIMGS.get(r.src) ?? null : null
  };
}

// ---------- productCard ----------
const PCARD_DEFAULTS = { x: 270, y: 520, w: 540 };
export function measureProductCard(el, opts = {}) {
  const ctx = need();
  ctx.save();
  const o = { ...PCARD_DEFAULTS, ...opts };
  const L = cardLayout(ctx, cardData({ product: el.product, image: el.image }, el, el.showPrice), o.w);
  ctx.restore();
  return { w: L.w + 40, h: L.h + 40 };
}
export function productCard(el, t, opts = {}) {
  const sp = speedOf(opts);
  const inAt = el.in, outAt = el.out;
  if (t < inAt || t >= outAt) return;
  const ctx = need();
  const o = { ...PCARD_DEFAULTS, ...opts };
  const d = cardData({ product: el.product, image: el.image }, el, el.showPrice);
  ctx.save();
  const L = cardLayout(ctx, d, o.w);
  const p = seg(t, inAt, inAt + 0.45 / sp);
  const q = seg(t, outAt - 0.3 / sp, outAt);
  const k = lerp(0.9, 1, outBack(p, 1.1)) * (1 - 0.1 * q * q);
  ctx.globalAlpha = clamp(p * 4) * (1 - q * q);
  ctx.translate(o.x + L.w / 2, o.y + L.h / 2);
  ctx.scale(k, k);
  ctx.translate(-L.w / 2, -L.h / 2);
  drawCard(ctx, L, d, d.img, { img: seg(t, inAt + 0.1 / sp, inAt + 0.65 / sp), text: seg(t, inAt + 0.28 / sp, inAt + 0.7 / sp), badge: seg(t, inAt + 0.4 / sp, inAt + 0.65 / sp) });
  ctx.restore();
}

// ---------- productPop ----------
// One image (cutout looks best) floating with a soft shadow, an optional label pill under it. x/y = centre of the image box.
const PPOP_DEFAULTS = { x: W / 2, y: 900, size: 620 };
function popLayout(ctx, el, d, o) {
  const k = d.ar >= 1 ? 1 : d.ar;
  const iw = d.ar >= 1 ? o.size : o.size * d.ar, ih = d.ar >= 1 ? o.size / d.ar : o.size;
  void k;
  const text = [el.label, el.showPrice ? d.price : ""].filter(Boolean).join("  ·  ");
  const ls = Math.max(34, Math.round(o.size * 0.062));
  let lw = 0;
  if (text) { ctx.font = font("display", ls, 800); lw = Math.min(ctx.measureText(text).width + ls * 1.6, Math.max(iw, o.size * 0.8) + 120); }
  const lh = text ? ls * 1.9 : 0;
  const gap = text ? 22 : 0;
  return { iw, ih, text, ls, lw, lh, gap, w: Math.max(iw, lw), h: ih + gap + lh };
}
export function measureProductPop(el, opts = {}) {
  const ctx = need();
  ctx.save();
  const o = { ...PPOP_DEFAULTS, ...opts };
  const L = popLayout(ctx, el, cardData({ product: el.product, image: el.image }, el, el.showPrice !== false), o);
  ctx.restore();
  return { w: L.w + 40, h: L.h + 40, boxW: L.iw, boxH: L.ih };
}
export function productPop(el, t, opts = {}) {
  const sp = speedOf(opts);
  const inAt = el.in, outAt = el.out;
  if (t < inAt || t >= outAt) return;
  const ctx = need();
  const c = colors();
  const o = { ...PPOP_DEFAULTS, ...opts };
  const d = cardData({ product: el.product, image: el.image }, el, el.showPrice !== false);
  ctx.save();
  const L = popLayout(ctx, el, d, o);
  const p = seg(t, inAt, inAt + 0.5 / sp);
  const q = seg(t, outAt - 0.3 / sp, outAt);
  const e = expoOut(p);
  const slide = el.style === "slide";
  const left = o.x - L.w / 2, top = o.y - (L.h - 0) / 2;
  ctx.globalAlpha = clamp(p * 4) * (1 - q * q);
  const cx = left + L.w / 2, cy = top + L.ih / 2;
  ctx.translate(cx + (slide ? -(1 - e) * 460 + q * q * 260 : 0), cy + (slide ? 0 : (1 - e) * 60));
  const k = (slide ? 1 : lerp(0.82, 1, e)) * (1 - 0.08 * q * q);
  ctx.scale(k, k);
  const img = d.img;
  const ix = -L.iw / 2, iy = -L.ih / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.shadowColor = "rgba(0,0,0,0.34)";
  ctx.shadowBlur = Math.max(30, L.ih * 0.09);
  ctx.shadowOffsetY = Math.max(16, L.ih * 0.05);
  if (img) {
    if (d.cut) ctx.drawImage(img, ix, iy, L.iw, L.ih);
    else {
      rr(ctx, ix, iy, L.iw, L.ih, Math.min(L.iw, L.ih) * 0.05);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.save();
      rr(ctx, ix, iy, L.iw, L.ih, Math.min(L.iw, L.ih) * 0.05);
      ctx.clip();
      ctx.shadowColor = "transparent";
      ctx.drawImage(img, ix, iy, L.iw, L.ih);
      ctx.restore();
    }
  }
  ctx.shadowColor = "transparent";
  if (L.text) {
    const lp = seg(t, inAt + 0.3 / sp, inAt + 0.65 / sp);
    ctx.globalAlpha *= clamp(lp * 2);
    const ly = L.ih / 2 + L.gap + (1 - expoOut(lp)) * 16;
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    rr(ctx, -L.lw / 2, ly, L.lw, L.lh, L.lh / 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = c.ink;
    ctx.font = font("display", L.ls, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ellipsize(ctx, L.text, L.lw - L.ls * 1.2), 0, ly + L.lh / 2 + L.ls * 0.04);
  }
  ctx.restore();
}

// ---------- carousel ----------
// slides: [{product, image?, caption?, price?}] (2-8). style: "slide" (swipe), "stack" (cards fanning), "grid-pop" (cells popping in).
// perItem = seconds each slide stays (slide/stack) or the delay between pops (grid-pop). x/y = top-left of the block.
const CAR_DEFAULTS = { x: 180, y: 520, w: 720, style: "slide" };
const carStyle = (el, o) => o.style ?? el.style ?? "slide";
const carPer = (style, o) => o.perItem ?? ({ slide: 1.6, stack: 1.4, "grid-pop": 0.35 })[style] ?? 1.5;
function carData(el) {
  const sl = (el.slides ?? []).slice(0, 8);
  const rows = sl.map((s) => cardData({ product: s.product, image: s.image }, { ...s, name: s.caption }, el.showPrice));
  if (el.style === "grid-pop") for (const r of rows) r.note = ""; // small cells: name + price only
  return rows;
}
function carLayout(ctx, el, o) {
  const style = carStyle(el, o);
  const rows = carData(el);
  const n = rows.length;
  if (style === "grid-pop") {
    const cols = n <= 4 ? 2 : 3, gap = 20;
    const nr = Math.ceil(n / cols);
    const cw = (o.w - gap * (cols - 1)) / cols;
    const Ls = rows.map((d) => cardLayout(ctx, d, cw, { compact: true }));
    const ch = Math.max(...Ls.map((l) => l.h));
    for (const l of Ls) l.h = ch; // every cell the same height
    return { style, rows, Ls, cols, gap, cw, ch, w: o.w, h: nr * ch + (nr - 1) * gap, n };
  }
  const Ls = rows.map((d) => cardLayout(ctx, d, o.w, { compact: true }));
  const ch = Math.max(...Ls.map((l) => l.h));
  for (const l of Ls) l.h = ch;
  const dots = style === "slide" ? 56 : 0;
  const stackPad = style === "stack" ? 40 : 0;
  return { style, rows, Ls, cw: o.w, ch, w: o.w, h: ch + dots + stackPad, dots, n };
}
export function measureCarousel(el, opts = {}) {
  const ctx = need();
  ctx.save();
  const L = carLayout(ctx, el, { ...CAR_DEFAULTS, ...opts });
  ctx.restore();
  return { w: L.w + 40, h: L.h + 40 };
}
export function carousel(el, t, opts = {}) {
  const sp = speedOf(opts);
  const inAt = el.in, outAt = el.out;
  if (t < inAt || t >= outAt) return;
  const ctx = need();
  const c = colors();
  const o = { ...CAR_DEFAULTS, ...opts };
  ctx.save();
  const L = carLayout(ctx, el, o);
  if (!L.n) { ctx.restore(); return; }
  const per = carPer(L.style, o);
  const p = seg(t, inAt, inAt + 0.45 / sp);
  const q = seg(t, outAt - 0.3 / sp, outAt);
  const base = clamp(p * 4) * (1 - q * q);
  ctx.globalAlpha = L.style === "grid-pop" ? 1 : base;
  const draw1 = (i, a = { img: 1, text: 1, badge: 1 }) => drawCard(ctx, L.Ls[i], L.rows[i], L.rows[i].img, a);
  const k = L.style === "grid-pop" ? 1 : lerp(0.92, 1, expoOut(p)) * (1 - 0.08 * q * q);
  ctx.translate(o.x + L.w / 2, o.y + L.h / 2);
  ctx.scale(k, k);
  ctx.translate(-L.w / 2, -L.h / 2);
  const hold = 0.45 / sp; // swipe duration
  const idx = Math.min(L.n - 1, Math.floor(Math.max(0, t - inAt) / per));
  const tIn = (i) => inAt + i * per; // moment slide i is fully shown
  const flip = idx < L.n - 1 ? seg(t, tIn(idx + 1) - hold, tIn(idx + 1)) : 0; // progress to the next slide
  const pos = idx + expoInOut(flip);
  if (L.style === "slide") {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-30, -80, L.w + 60, L.ch + 160); // narrower than the 50 px gap: a neighbour never peeks in at rest
    ctx.clip();
    for (let i = 0; i < L.n; i += 1) {
      const rel = i - pos;
      if (Math.abs(rel) >= 1) continue;
      ctx.save();
      ctx.translate(rel * (L.cw + 50), 0);
      ctx.globalAlpha *= 1 - 0.35 * Math.min(1, Math.abs(rel));
      draw1(i, { img: seg(t, inAt + 0.1 / sp, inAt + 0.65 / sp), text: seg(t, inAt + 0.25 / sp, inAt + 0.7 / sp), badge: 0 });
      ctx.restore();
    }
    ctx.restore();
    // page dots
    const dy = L.ch + 30, dr = 9, step = 30;
    const x0 = L.w / 2 - ((L.n - 1) * step) / 2;
    for (let i = 0; i < L.n; i += 1) {
      const on = clamp(1 - Math.abs(i - pos));
      ctx.fillStyle = on > 0.5 ? c.primary : "rgba(255,255,255,0.85)";
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x0 + i * step, dy, dr * (1 + 0.35 * on), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (L.style === "stack") {
    const top0 = 20;
    for (let i = L.n - 1; i >= 0; i -= 1) {
      const rel = i - pos;
      if (rel <= -1 || rel > 2.6) continue;
      ctx.save();
      ctx.translate(L.w / 2, top0 + L.ch / 2);
      if (rel < 0) {
        const f = -rel;
        ctx.translate(f * L.cw * 1.1, -f * 40);
        ctx.rotate(f * 0.28);
        ctx.globalAlpha *= 1 - f * f;
      } else {
        const dd = Math.min(rel, 2.2);
        const sgn = i % 2 ? 1 : -1;
        ctx.translate(sgn * dd * 14, -dd * 22);
        ctx.rotate(sgn * 0.045 * Math.min(dd, 1.5));
        ctx.scale(1 - 0.04 * dd, 1 - 0.04 * dd);
        ctx.globalAlpha *= 1 - 0.1 * dd;
      }
      ctx.translate(-L.cw / 2, -L.ch / 2);
      draw1(i, { img: 1, text: rel < 0.5 ? seg(t, inAt + 0.2 / sp, inAt + 0.6 / sp) : 1, badge: 0 });
      ctx.restore();
    }
  } else {
    for (let i = 0; i < L.n; i += 1) {
      const pi = seg(t, inAt + i * per, inAt + i * per + 0.4 / sp);
      if (pi <= 0) continue;
      const col = i % L.cols, row = Math.floor(i / L.cols);
      ctx.save();
      ctx.globalAlpha = clamp(pi * 4) * (1 - q * q);
      ctx.translate(col * (L.cw + L.gap) + L.cw / 2, row * (L.ch + L.gap) + L.ch / 2);
      const s = lerp(0.6, 1, expoOut(pi)) * (1 - 0.1 * q * q);
      ctx.scale(s, s);
      ctx.translate(-L.cw / 2, -L.ch / 2);
      draw1(i, { img: seg(pi, 0.2, 1), text: seg(pi, 0.3, 1), badge: 0 });
      ctx.restore();
    }
  }
  ctx.restore();
}

// ---------- motion library elements (product screens, kinetic word, brand sting...: engine/motion-lib/<type>.js) ----------
// Skin: ui-skin.json next to brand.json (the template fetches it only when the comp has ui elements and passes the doc to setUiSkin);
// absent = derived from brand.json. Thumbs / avatars: "people:pNN" (bundled fictional bank) or a path relative to the COMP (like logos
// resolve against brand.json). Everything is decoded before READY / before a frame (uiReady()); failures land in ASSET_ERRORS.
let UI_SKIN_DOC = null;
let UI_SKIN = null;
let UI_FONT_LOADED = null;
const UIMGS = new Map(); // ref -> decoded HTMLImageElement
let PENDING_UI = Promise.resolve();
export const uiReady = () => PENDING_UI;
export function setUiSkin(doc) {
  UI_SKIN_DOC = doc && typeof doc === "object" ? doc : null;
  UI_SKIN = null;
}
export const getUiSkin = () => (UI_SKIN ??= resolveSkin(UI_SKIN_DOC, BRAND ?? {}));
export const uiZones = () => ({ x0: SAFE.x0, x1: SAFE.x1, toastTop: BANDS.toastTop, bottom: BANDS.bottom });
export const uiBox = (el) => Lib.rect(el, uiZones(), uiMeasureEnv());
let UI_OFF = null;
const uiCanvas = (w, h) => {
  if (typeof document === "undefined") return null;
  if (!UI_OFF || UI_OFF.canvas.width !== w || UI_OFF.canvas.height !== h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    UI_OFF = { canvas, ctx: canvas.getContext("2d") };
  }
  return UI_OFF;
};
let ICON_INDEX = null; // promise of assets/brand-icons/index.json -> its `icons` map ({name: {png, svg, label, shape, plate, color}}) | null
let ICON_ENTRIES = null;
const iconIndex = () => (ICON_INDEX ??= fetch(resolveUrl("/_icons/index.json", document.baseURI), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null), () => null).then((j) => (ICON_ENTRIES = j?.icons ?? null)));
/** Load the skin font and decode every thumb / avatar of the visible ui elements. Sets the promise uiReady() resolves. */
export function loadUiAssets(elements = []) {
  dropIssues("ui-image");
  dropIssues("ui-skin");
  const uis = elements.filter((e) => Lib.isLib(e) && !e.hidden);
  if (!uis.length) { PENDING_UI = Promise.resolve(); return PENDING_UI; }
  const jobs = [];
  const skin = getUiSkin();
  if (!skin.derived && skin.font.src && UI_FONT_LOADED !== skin.font.family + skin.font.src) {
    UI_FONT_LOADED = skin.font.family + skin.font.src;
    jobs.push(loadFonts({ fonts: { ui: skin.font }, _base: BRAND?._base ?? document.baseURI }).catch(() => assetError("ui-skin", skin.font.family, `ui-skin.json: la tipografía "${skin.font.family}" no se pudo cargar`)));
  }
  for (const el of uis) {
    for (const { ref, what } of Lib.imageRefs(el)) {
      if (UIMGS.has(ref)) continue;
      const r = uiResolveRef(ref);
      if (!r) { assetError("ui-image", ref, `Una pantalla usa ${what} con una ruta no válida (${ref}); usa una ruta dentro de la carpeta del video`); continue; }
      if (r.kind === "icon") { // official platform logo: name -> file through /_icons/index.json; a missing entry or file is an asset error, never a fake
        jobs.push(iconIndex().then((idx) => {
          const e = idx?.[r.name];
          if (!e?.png) { assetError("ui-image", ref, r.name === "tiktok" ? "falta el logo oficial de TikTok (no se dibuja una aproximación): pide el kit oficial" : `El icono "${r.name}" no está en assets/brand-icons/index.json`); return undefined; }
          const load = (file, key) => { const img = new Image(); img.src = resolveUrl(`/_icons/${file}`, document.baseURI); return img.decode().then(() => UIMGS.set(key, img), () => assetError("ui-image", key, `El logo oficial "${r.name}" (${file}) no existe o no se puede abrir`)); };
          return Promise.all([load(e.png, ref), e.alt?.png ? load(e.alt.png, `${ref}:alt`) : undefined]); // + the official alternate variant (X on dark backgrounds)
        }));
        continue;
      }
      const img = new Image();
      img.src = r.kind === "people" ? resolveUrl(r.url, document.baseURI) : resolveUrl(r.path, document.baseURI);
      jobs.push(img.decode().then(() => UIMGS.set(ref, img), () => assetError("ui-image", ref, `La ${what} "${ref}" de una pantalla no existe o no se puede abrir`)));
    }
  }
  PENDING_UI = Promise.all(jobs).then(() => measureBackdrops(uis)).then(() => undefined);
  return PENDING_UI;
}
// ---- backdrops: elements whose look depends on what is behind them (uiIcons plate "auto") ask for the brightness of the FOOTAGE under chosen boxes.
// The comp (templates/overlay.html) provides the sampler: async (t) => a 2d ctx with the footage (no overlays) drawn at time t. Measured before READY,
// at 3 moments of the element's window, so the decision is a deterministic function of the footage and the layout.
let BACKDROP_SAMPLER = null;
export const setBackdropSampler = (fn) => { BACKDROP_SAMPLER = fn; };
const BACKDROPS = new Map(); // `${elKey}|${boxKey}` -> { lum, min, max }
const elKey = (el) => el.id ?? `${el.type}@${el.in}`;
async function measureBackdrops(els) {
  BACKDROPS.clear();
  if (!BACKDROP_SAMPLER) return;
  for (const el of els) {
    const boxes = Lib.backdrops(el, uiBox(el));
    if (!boxes.length) continue;
    const acc = new Map();
    for (const k of [0.25, 0.5, 0.75]) {
      const sctx = await BACKDROP_SAMPLER(el.in + (el.out - el.in) * k);
      if (!sctx) continue;
      const { data, width, height } = sctx.getImageData(0, 0, W, H);
      for (const b of boxes) {
        const st = boxLuminance(data, width, height, b);
        if (!st) continue;
        const a = acc.get(b.key) ?? { sum: 0, n: 0, min: 1, max: 0 };
        acc.set(b.key, { sum: a.sum + st.lum, n: a.n + 1, min: Math.min(a.min, st.min), max: Math.max(a.max, st.max) });
      }
    }
    for (const [key, a] of acc) BACKDROPS.set(`${elKey(el)}|${key}`, { lum: a.sum / a.n, min: a.min, max: a.max });
  }
}
const uiEnv = (el) => ({ skin: el.skin ? resolveSkin(UI_SKIN_DOC, BRAND ?? {}, el.skin) : getUiSkin(), img: (ref) => UIMGS.get(ref) ?? null, iconMeta: (name) => ICON_ENTRIES?.[name] ?? null, backdrop: (el, key) => BACKDROPS.get(`${elKey(el)}|${key}`) ?? null, canvas: uiCanvas, zones: uiZones(), measure: uiMeasureEnv().measure, kit: brandKit(), brand: BRAND ?? {} });
// Text measuring for types that size themselves from their text (font = a CSS font string); null without a canvas (Node tests).
let UI_MEASURE = null;
function uiMeasureEnv() {
  if (!UI_MEASURE && typeof document !== "undefined") UI_MEASURE = document.createElement("canvas").getContext("2d");
  return { measure: UI_MEASURE ? (font, txt) => { UI_MEASURE.font = font; return UI_MEASURE.measureText(txt).width; } : null, kit: brandKit() };
}
// The brand as motion-lib elements see it (engine/motion-lib/_kit.js documents the shape): colors, fonts, logo images, cta / website.
export function brandKit() {
  const webHost = (() => { try { return new URL(BRAND?.website ?? "").host.replace(/^www\./, ""); } catch { return ""; } })();
  return {
    name: BRAND?.name ?? "", colors: colors(), cta: BRAND?.cta ?? {}, website: BRAND?.website ?? "", webHost,
    font: (which, px, w = 700) => (typeof document === "undefined" ? `${w} ${px}px system-ui, sans-serif` : font(which, px, w)), // no DOM (Node tests): system font
    hasLogo: (v) => !!IMGS[v], logoSize: (v) => (IMGS[v] ? { w: IMGS[v].naturalWidth, h: IMGS[v].naturalHeight } : null),
    drawLogo: (ctx, v, cx, cy, mw, mh) => drawLogo(ctx, v, cx, cy, mw, mh),
    missingLogo: (v) => assetError("sting-logo", v, `logoSting: la variante de logo "${v}" no está disponible`)
  };
}
export const hasCandidates = Lib.hasCandidates;
/** Register the comp-local element types (<comp>/motion-lib/); a load problem becomes an asset error (render.mjs aborts, Spanish message). */
export async function loadLocalLib(url) {
  const r = await Lib.loadLocal(url);
  for (const e of r.errors) assetError("motion-lib", e.file, `El elemento propio ${e.file.replace(/^local:/, "")} no cumple el contrato: ${e.problems.join("; ")}`);
  return r;
}
export const candidatesOf = (el) => Lib.candidates(el, uiZones(), uiMeasureEnv());

// Element types: keywordPop, wordStack, counterBadge, tagPill, chatBubbles, dimensionLine, specCard, onomatopoeia, toast, panel,
// plus the caption option highlightWords (not drawn here: see highlightOptions) (see engine/README.md for the JSON shape).
export const MOTION_LAYERS = { under: ["panel"], mid: ["keywordPop", "wordStack", "counterBadge", "tagPill", "chatBubbles", "dimensionLine", "specCard", "onomatopoeia", "productCard", "productPop", "carousel", ...Lib.typesOnLayer("mid")], over: ["toast", ...Lib.typesOnLayer("over")], top: Lib.typesOnLayer("top") };

export async function drawMotion(elements, t, types) {
  await warmMotionFonts(elements);
  for (const el of elements ?? []) {
    if (!types.includes(el.type) || el.hidden) continue; // hidden: true (set by the studio) = keep in the config, draw nothing
    const o = el.opts ?? {};
    const d = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)); // undefined must not override defaults
    switch (el.type) {
      case "keywordPop":
        keywordPop(el.text, t, el.in, el.out, d({ style: el.style, rotate: el.rotate, x: el.x, y: el.y, size: el.size, maxW: el.maxW, speed: el.speed, ...o }));
        break;
      case "wordStack":
        wordStack(el.items, t, d({ outAt: el.out, x: el.x, y: el.y, align: el.align, size: el.size, h: el.h, gap: el.gap, speed: el.speed, ...o }));
        break;
      case "counterBadge":
        counterBadge(t, el.in, el.out, d({ from: el.from, to: el.to, dur: el.dur, label: el.label }), d({ x: el.x, y: el.y, variant: el.variant, speed: el.speed, ...o }));
        break;
      case "chatBubbles":
        chatBubbles(el.items, t, d({ outAt: el.out, x: el.x, y: el.y, maxW: el.maxW, size: el.size, max: el.max, variant: el.variant, speed: el.speed, ...o }));
        break;
      case "tagPill":
        tagPill(el.text, t, el.in, el.out, d({ variant: el.variant, x: el.x, y: el.y, speed: el.speed, ...o }));
        break;
      case "dimensionLine":
        dimensionLine(t, el.in, el.out, { label: el.label ?? el.text, from: el.from, to: el.to, track: el.track }, d({ thickness: el.thickness, tick: el.tick, size: el.size, color: el.color, speed: el.speed, ...o }));
        break;
      case "specCard":
        specCard(t, el.in, el.out, { title: el.title, rows: el.rows }, d({ x: el.x, y: el.y, size: el.size, maxW: el.maxW, rowDelay: el.rowDelay, speed: el.speed, ...o }));
        break;
      case "onomatopoeia":
        onomatopoeia(el.text, t, el.in, el.out, d({ x: el.x, y: el.y, size: el.size, rotate: el.rotate, points: el.points, maxW: el.maxW, speed: el.speed, ...o }));
        break;
      case "productCard":
        productCard(el, t, d({ x: el.x, y: el.y, w: el.w, speed: el.speed, ...o }));
        break;
      case "productPop":
        productPop(el, t, d({ x: el.x, y: el.y, size: el.size, speed: el.speed, ...o }));
        break;
      case "carousel":
        carousel(el, t, d({ x: el.x, y: el.y, w: el.w, style: el.style, perItem: el.perItem, speed: el.speed, ...o }));
        break;
      case "toast":
        toast(t, el.in, el.out, { title: el.title, body: el.body }, d({ y: el.y, time: el.time, speed: el.speed, ...o }));
        break;
      case "panel":
        await floatingPanel(t, el.in, el.out, panelFootage(el.dir, d({ clipStart: el.clipStart ?? 0, crop: el.crop, fit: el.fit, n: el.n })), d({ box: el.box, speed: el.speed, ...o }));
        break;
      default:
        if (Lib.isLib(el)) Lib.draw(need(), el, t, { ...uiEnv(el), rect: Lib.rect(el, uiZones(), uiMeasureEnv()) });
    }
  }
}

// Caption center y that stays clear of any visible panel: while a panel is on screen the captions glide up to sit above it.
export function captionsY(elements, t, base = 1180) {
  let y = base;
  for (const el of elements ?? []) {
    // Captions rise before the panel enters and only come back down once its exit animation is over.
    if (el.type !== "panel" || el.hidden || t < el.in - 0.5 || t >= el.out + 0.5) continue;
    const k = Math.max(inOut(seg(t, el.in - 0.15, el.in + 0.25)) * (1 - inOut(seg(t, el.out + 0.05, el.out + 0.45))), 0);
    const top = Math.min(el.box?.y ?? BANDS.panel.y0, BANDS.bottom - (el.box?.h ?? 340));
    y = lerp(y, Math.min(y, top - 125), k);
  }
  return y;
}

// Deterministic SFX-sync events from the config. Fills (and returns) MOTION_EVENTS.
export function motionEvents(elements = []) {
  MOTION_EVENTS.length = 0;
  const X = (cx) => Number(((cx / W) * 2 - 1).toFixed(3));
  // `key` = stable identity of an event across edits (sfx.json overrides it): <element id | #index>:<sfx kind>[:<item index>]
  let ei = 0, id = "";
  const push = (t, type, cx, item) => MOTION_EVENTS.push({ t: Number(t.toFixed(3)), type, x: X(cx), key: `${id}:${type}${item === undefined ? "" : `:${item}`}` });
  for (const el of elements) {
    id = el.id ?? `#${ei}`;
    ei += 1;
    if (el.hidden) continue;
    if (el.type === "keywordPop") push(el.in, "pop", el.x ?? W / 2);
    else if (el.type === "wordStack") (el.items ?? []).forEach((it, k) => push(it.at, "pop", (el.x ?? 80) + 220, k));
    else if (el.type === "counterBadge") push(el.in, "pop", (el.x ?? SAFE.x1) - 160);
    else if (el.type === "chatBubbles") (el.items ?? []).forEach((it, k) => push(it.at, "pop", (el.x ?? 90) + (it.from === "rex" ? (el.stackW ?? 800) - 200 : 200), k));
    else if (el.type === "tagPill") push(el.in, "whoosh", (el.x ?? SAFE.x0) + 120);
    else if (el.type === "toast") push(el.in, "notify", W / 2);
    else if (el.type === "dimensionLine") {
      const k = el.track?.[0] ?? el;
      push(el.in, "whoosh", ((k.from?.x ?? W / 2) + (k.to?.x ?? W / 2)) / 2);
    } else if (el.type === "specCard") push(el.in, "whoosh", (el.x ?? 90) + 300);
    else if (el.type === "onomatopoeia") push(el.in, "pop", el.x ?? W / 2);
    else if (el.type === "productCard") push(el.in, "whoosh", (el.x ?? PCARD_DEFAULTS.x) + (el.w ?? PCARD_DEFAULTS.w) / 2);
    else if (el.type === "carousel") push(el.in, "whoosh", (el.x ?? CAR_DEFAULTS.x) + (el.w ?? CAR_DEFAULTS.w) / 2);
    else if (el.type === "productPop") push(el.in, "pop", el.x ?? W / 2);
    else if (el.type === "panel") push(el.in, "whoosh", (el.box?.x ?? 140) + (el.box?.w ?? 800) / 2);
    else if (Lib.isLib(el)) { // library events carry their own x; keys are <id>:<type>:<n> (n = nth event of that type in this element)
      const seen = {};
      for (const e of Lib.events(el, uiBox(el))) {
        seen[e.type] = (seen[e.type] ?? -1) + 1;
        MOTION_EVENTS.push({ ...e, key: `${id}:${e.type}:${seen[e.type]}` });
      }
    }
  }
  MOTION_EVENTS.sort((a, b) => a.t - b.t);
  return MOTION_EVENTS;
}
