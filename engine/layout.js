// Face-aware layout planner for motion graphics on top of talking-person footage (browser module, runs once at load).
//
//   const plan = planLayout({ elements, clips, hasCaptions, captions, hook, cta, logoUntil });
//   plan.elements  motion elements with x/y/size/... resolved (auto-placed ones carry `_slot`)
//   plan.logo      { corner, rect, hide:[[from,to],...] }  (pass to B.logoBug)
//   plan.report    layout-report.json content (render.mjs writes it next to index.html)
//
// Inputs: per-clip face tracks (`clips[i].faces`, made by scripts/faces.swift: Apple Vision boxes in 1080x1920 canvas pixels, one
// sample every few frames). Elements without explicit x/y (or with "place":"auto") are tried in a set of named slots and size
// variants; the winner minimizes (see score()): overlap with the face zone (face box grown 12 % per side and 25 % extra on top for hair,
// weight 1000) over the element's whole time window, overlap with the person box (weight 60), collisions with whatever else is on
// screen at the same time (captions, hook, panel, toast, other motion; weight 3000+) and leaving the free area (y 350..1540, x 60..1020).
// Fixed bands (px): header 230-330 = logo bug + tagPill on the opposite side; toast top >= 350; captions 1430 (lifted above a panel);
// panel 1180-1520; nothing above 220 or below 1540.
import * as B from "./brand-layer.js";

const { W, BANDS } = B;
// Free area; re-read from B.SAFE / B.BANDS at the start of every planLayout() (the studio edits the platform zones via B.setZones).
let X0 = 60, X1 = W - 60, TOP = BANDS.toastTop, BOTTOM = BANDS.bottom;
const syncZones = () => {
  X0 = B.SAFE.x0;
  X1 = B.SAFE.x1;
  TOP = BANDS.toastTop;
  BOTTOM = BANDS.bottom;
};
const DEFAULT_FACE = [340, 520, 400, 400];

// ---------- rect helpers ({x,y,w,h}) ----------
const area = (r) => Math.max(0, r.w) * Math.max(0, r.h);
const FACE_AREA_W = 600; // cost per fraction of the face box covered (registry default candidates only)
const CHIN_W = 3, CHIN_GAP = 40; // cost per px a default-placed card rises above "chin + 40 px" (capped at 600 px)
const inter = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
const grow = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const box = (a) => (a ? { x: a[0], y: a[1], w: a[2], h: a[3] } : null);
const iou = (a, b) => {
  const i = inter(a, b);
  return i / (area(a) + area(b) - i || 1);
};
const round = (v, d = 3) => Number(v.toFixed(d));
const rrect = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });
const ticks = (a, b, dt = 0.1) => {
  const n = Math.max(2, Math.ceil((b - a) / dt) + 1);
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
};
// Face box -> the zone nothing should cover. Vision boxes stop at the brows/chin, so the head is: the face grown 12 % per side (core,
// full weight) plus a hair band of 50 % of the face height above it (lower weight: covering hair is better than covering eyes).
export const faceCore = (f) => ({ x: f.x - 0.12 * f.w, y: f.y - 0.12 * f.h, w: f.w * 1.24, h: f.h * 1.24 });
export const hairBand = (f) => ({ x: f.x - 0.12 * f.w, y: f.y - 0.62 * f.h, w: f.w * 1.24, h: 0.5 * f.h });
export const faceZone = (f) => ({ x: f.x - 0.12 * f.w, y: f.y - 0.62 * f.h, w: f.w * 1.24, h: f.h * 1.74 });

// ---------- face tracking ----------
// Per-clip samples: [{f (1-based frame), face:[x,y,w,h]|null, person:[x,y,w,h]|null}]. Face holds the last known box through gaps
// and interpolates between samples unless the box jumps (a cut); the person box is only interpolated, never held through a null.
function makeTracker(clips) {
  const FPS = 30;
  const prep = clips.map((c) => {
    const s = (c.faces?.samples ?? []).map((x) => ({ f: x.f, face: box(x.face), person: box(x.person) }));
    return { c, s, source: c.faces?.source ?? "none" };
  });
  const lerpBox = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k });
  const at = (t) => {
    const cl = prep.find((p) => t >= p.c.start && t < p.c.start + p.c.dur) ?? prep[prep.length - 1];
    const f = Math.floor((t - cl.c.start) * FPS) + 1;
    const s = cl.s;
    let i = -1;
    for (let k = 0; k < s.length; k += 1) if (s[k].f <= f) i = k;
    const prev = s[Math.max(i, 0)], next = s[i + 1];
    let face = null, person = null;
    if (s.length) {
      const held = (() => {
        for (let k = Math.max(i, 0); k >= 0; k -= 1) if (s[k].face) return s[k].face;
        for (let k = i + 1; k < s.length; k += 1) if (s[k].face) return s[k].face;
        return null;
      })();
      face = held;
      if (prev.face && next?.face && iou(prev.face, next.face) > 0.4) face = lerpBox(prev.face, next.face, (f - prev.f) / (next.f - prev.f));
      else if (prev.face) face = prev.face;
      person = prev.person;
      if (prev.person && next?.person && iou(prev.person, next.person) > 0.4) person = lerpBox(prev.person, next.person, (f - prev.f) / (next.f - prev.f));
    }
    return { face: face ?? box(DEFAULT_FACE), person, tracked: !!face };
  };
  return { at, sources: prep.map((p) => ({ clip: p.c.name, source: p.source, samples: p.s.length })) };
}

// ---------- element geometry ----------
const isAuto = (el) => el.place === "auto" || (el.x === undefined && el.y === undefined);
export const windowOf = (el) => {
  if (el.type === "panel") return [el.in - 0.15, el.out + 0.5];
  if (el.type === "wordStack" || el.type === "chatBubbles") return [el.items?.[0]?.at ?? 0, el.out];
  return [el.in, el.out];
};
const label = (el) => el.text ?? el.label ?? el.title ?? el.brand ?? el.name ?? el.product ?? el.items?.map((i) => i.text).join(" / ") ?? el.words?.join(" / ") ?? el.type;

// Visual rect of an element with fully explicit/default parameters.
function rectOf(el) {
  const o = el.opts ?? {};
  switch (el.type) {
    case "keywordPop": {
      const m = B.measureKeywordPop(el.text, { style: el.style, rotate: el.rotate, size: el.size, maxW: el.maxW, ...o });
      const cx = el.x ?? W / 2, cy = el.y ?? 760;
      return { x: cx - m.w / 2, y: cy - m.h / 2, w: m.w, h: m.h };
    }
    case "wordStack": {
      const m = B.measureWordStack(el.items, strip({ size: el.size, h: el.h, gap: el.gap, ...o }));
      const al = el.align ?? "left", x = el.x ?? 80;
      return { x: al === "center" ? x - m.w / 2 : al === "right" ? x - m.w : x, y: el.y ?? 520, w: m.w, h: m.h };
    }
    case "counterBadge": {
      const m = B.measureCounterBadge({ from: el.from, to: el.to, label: el.label }, strip({ ...o }));
      return { x: (el.x ?? X1) - m.w + 10, y: (el.y ?? BANDS.toastTop - 10) - 10, w: m.w, h: m.h };
    }
    case "tagPill": {
      const m = B.measureTagPill(el.text, strip({ size: o.size }));
      return { x: el.x ?? X0, y: Math.max(el.y ?? BANDS.header.y0 + 16, BANDS.header.y0), w: m.w, h: m.h };
    }
    case "dimensionLine": // explicit from/to (or track): bounding box over the whole track, never auto-placed
      return B.measureDimensionLine({ label: el.label ?? el.text, from: el.from, to: el.to, track: el.track }, strip({ thickness: el.thickness, tick: el.tick, size: el.size, ...o }));
    case "specCard": {
      const m = B.measureSpecCard({ title: el.title, rows: el.rows }, strip({ size: el.size, maxW: el.maxW, ...o }));
      return { x: (el.x ?? 90) - 20, y: (el.y ?? 520) - 20, w: m.w, h: m.h };
    }
    case "productCard": {
      const m = B.measureProductCard(el, strip({ w: el.w, ...o }));
      return { x: (el.x ?? 270) - 20, y: (el.y ?? 520) - 20, w: m.w, h: m.h };
    }
    case "carousel": {
      const m = B.measureCarousel(el, strip({ w: el.w, style: el.style, ...o }));
      return { x: (el.x ?? 180) - 20, y: (el.y ?? 520) - 20, w: m.w, h: m.h };
    }
    case "productPop": {
      const m = B.measureProductPop(el, strip({ size: el.size, ...o }));
      return { x: (el.x ?? W / 2) - m.w / 2, y: (el.y ?? 900) - m.h / 2, w: m.w, h: m.h };
    }
    case "onomatopoeia": {
      const m = B.measureOnomatopoeia(el.text, strip({ rotate: el.rotate, size: el.size, maxW: el.maxW, ...o }));
      return { x: (el.x ?? W / 2) - m.w / 2, y: (el.y ?? 760) - m.h / 2, w: m.w, h: m.h };
    }
    case "toast":
      return { x: o.x ?? 90, y: Math.max(el.y ?? o.y ?? TOP, TOP), w: o.w ?? W - 180, h: o.h ?? 150 };
    case "panel": {
      const b = { x: 140, y: BANDS.panel.y0, w: 800, h: 340, ...(el.box ?? {}) };
      return { x: b.x, y: Math.min(b.y, BOTTOM - b.h), w: b.w, h: b.h };
    }
    case "chatBubbles": {
      const m = B.measureChatBubbles(el.items, strip({ maxW: el.maxW, size: el.size, max: el.max, ...o }));
      const bottom = el.y ?? 1340;
      return { x: (el.x ?? 90) - 10, y: bottom + 10 - m.h, w: m.w, h: m.h };
    }
    default:
      return B.isLib(el) ? B.uiBox(el) : null; // motion-lib elements: slot-based box (band / top / center) or the descriptor's own rect; never pinned
  }
}
const strip = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// Size variants tried for an auto element: [{ patch (size params), m {w,h}, cost }]. Cost grows as the element shrinks.
function variantsOf(el) {
  const o = el.opts ?? {};
  const out = [];
  const seen = new Set();
  const add = (patch, m, cost) => {
    const key = `${Math.round(m.w)}x${Math.round(m.h)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ patch, m, cost });
  };
  if (el.type === "keywordPop") {
    const base = el.size ?? 150, maxW0 = el.maxW ?? 880;
    for (const s of [1, 0.85, 0.72, 0.6]) {
      const size = Math.round(base * s);
      if (size < Math.min(56, base)) continue;
      for (const mw of [maxW0, 640, 460]) {
        const m = B.measureKeywordPop(el.text, strip({ style: el.style, rotate: el.rotate, size, maxW: Math.min(mw, maxW0), ...o }));
        add({ size, maxW: Math.min(mw, maxW0) }, m, (1 - s) * 120 + (m.lines - 1) * 15 + (mw < maxW0 ? 10 : 0));
      }
    }
  } else if (el.type === "specCard") {
    const sz = el.size ?? 40;
    for (const s of [1, 0.88, 0.78]) {
      const size = Math.round(sz * s);
      if (size < Math.min(32, sz)) continue;
      add({ size }, B.measureSpecCard({ title: el.title, rows: el.rows }, strip({ maxW: el.maxW, ...o, size })), (1 - s) * 100);
    }
  } else if (el.type === "productCard" || el.type === "carousel") {
    const w0 = el.w ?? (el.type === "carousel" ? 720 : 540);
    const meas = el.type === "carousel" ? B.measureCarousel : B.measureProductCard;
    for (const s of [1, 0.86, 0.74, 0.62]) {
      const w = Math.round(w0 * s);
      add({ w }, meas(el, strip({ ...o, w })), (1 - s) * 100);
    }
  } else if (el.type === "productPop") {
    const base = el.size ?? 620;
    for (const s of [1, 0.82, 0.66]) {
      const size = Math.round(base * s);
      add({ size }, B.measureProductPop(el, strip({ ...o, size })), (1 - s) * 100);
    }
  } else if (el.type === "onomatopoeia") {
    const base = el.size ?? 170;
    for (const s of [1, 0.82, 0.66]) {
      const size = Math.round(base * s);
      if (size < Math.min(80, base)) continue;
      add({ size }, B.measureOnomatopoeia(el.text, strip({ rotate: el.rotate, maxW: el.maxW, ...o, size })), (1 - s) * 120);
    }
  } else if (el.type === "wordStack") {
    const sz = el.size ?? 58, h0 = el.h ?? 100, g0 = el.gap ?? 18;
    for (const s of [1, 0.85, 0.72]) {
      const p = { size: Math.round(sz * s), h: Math.round(h0 * s), gap: Math.round(g0 * s) };
      add(p, B.measureWordStack(el.items, strip({ ...p, ...o })), (1 - s) * 100);
    }
  } else if (el.type === "counterBadge") {
    const ns = o.numSize ?? 124, ls = o.labelSize ?? 38;
    for (const s of [1, 0.82, 0.66]) {
      const p = { numSize: Math.round(ns * s), labelSize: Math.round(ls * s) };
      add({ opts: p }, B.measureCounterBadge({ from: el.from, to: el.to, label: el.label }, strip({ ...o, ...p })), (1 - s) * 100);
    }
  } else if (el.type === "chatBubbles") {
    const mw0 = el.maxW ?? 760, sz0 = el.size ?? 52;
    const max0 = el.max ?? o.max ?? 3;
    // Size variants first; showing 2 bubbles at a time instead of 3 is the last resort (halves the stack height).
    const combos = [[mw0, sz0, max0], [Math.min(mw0, 640), sz0, max0], [Math.min(mw0, 640), Math.max(46, sz0 - 4), max0], [Math.min(mw0, 520), Math.max(46, sz0 - 6), max0],
      [mw0, sz0, Math.min(2, max0)], [Math.min(mw0, 640), Math.max(46, sz0 - 4), Math.min(2, max0)]];
    for (const [mw, sz, max] of combos) {
      const m = B.measureChatBubbles(el.items, strip({ ...o, maxW: mw, size: sz, max }));
      add({ maxW: mw, size: sz, max }, m, (mw0 - mw) * 0.1 + (sz0 - sz) * 6 + (max0 - max) * 60);
    }
  }
  return out;
}

// Resolved params for an element placed at `rect` (inverse of rectOf) using variant v and slot side.
function patchFor(el, v, rect, side) {
  switch (el.type) {
    case "keywordPop":
      return { ...v.patch, x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    case "specCard":
      return { ...v.patch, x: rect.x + 20, y: rect.y + 20 };
    case "onomatopoeia":
      return { ...v.patch, x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    case "productCard":
    case "carousel":
      return { ...v.patch, x: rect.x + 20, y: rect.y + 20 };
    case "productPop": // x / y = centre of the whole block (image + label)
      return { ...v.patch, x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    case "wordStack": {
      const align = side === "right" ? "right" : side === "left" ? "left" : "center";
      return { ...v.patch, align, x: align === "right" ? rect.x + rect.w : align === "left" ? rect.x : rect.x + rect.w / 2, y: rect.y };
    }
    case "counterBadge":
      return { x: rect.x + rect.w - 10, y: rect.y + 10, opts: { ...(el.opts ?? {}), ...v.patch.opts } };
    case "chatBubbles":
      return { ...v.patch, x: rect.x + 10, y: rect.y + rect.h - 10, stackW: v.m.w - 20 };
    default:
      return {};
  }
}

// ---------- planner ----------
export function planLayout({ elements = [], clips = [], hasCaptions = false, captions = {}, hook = null, cta = null, logoUntil = null, logo = {} }) {
  syncZones();
  const tracker = makeTracker(clips);
  const end = cta ? cta.at : clips.length ? clips[clips.length - 1].start + clips[clips.length - 1].dur : 0;
  const capSize = captions.size ?? 78;
  const capBase = captions.y ?? 1180;
  const capRect = (t) => {
    const yc = B.captionsY(elements, t, capBase);
    return { x: 90, y: yc - capSize * 0.8, w: W - 180, h: capSize * 1.6 };
  };
  const faceAt = (t) => {
    const r = tracker.at(t);
    return { face: r.face, zone: faceZone(r.face), core: faceCore(r.face), hair: hairBand(r.face), person: r.person };
  };
  const avgZone = (ts) => {
    const zs = ts.map((t) => faceAt(t).zone);
    const mean = (k) => zs.reduce((n, z) => n + z[k], 0) / zs.length;
    return { x: mean("x"), y: mean("y"), w: mean("w"), h: mean("h") };
  };

  // --- logo: header corner farther from the face on average (top-right when equal) ---
  const logoWin = [logo.in ?? 0.3, logo.out ?? logoUntil ?? end];
  const lts = ticks(logoWin[0], Math.max(logoWin[0] + 0.1, logoWin[1]), 0.25).filter((t) => t <= end);
  const meanCx = lts.reduce((n, t) => n + faceAt(t).face.x + faceAt(t).face.w / 2, 0) / Math.max(1, lts.length);
  // logo.json: corner "auto"/absent = the face rule; explicit x/y place the box anywhere (the corner then only says which side tagPills avoid).
  let corner = logo.corner && logo.corner !== "auto" ? logo.corner : meanCx < W / 2 - 40 ? "tr" : meanCx > W / 2 + 40 ? "tl" : "tr";
  const logoRect = B.logoBox({ ...logo, corner });
  if (Number.isFinite(logo.x)) corner = logoRect.x + logoRect.w / 2 < W / 2 ? "tl" : "tr";

  // --- obstacles on screen: { name, rectAt(t), t0, t1 } ---
  const obstacles = [];
  // Captions are not drawn while a ui element is on screen (B.captionsHidden), so they are no obstacle then.
  if (hasCaptions) obstacles.push({ name: "captions", rectAt: (t) => (B.captionsHidden(elements, t) ? null : capRect(t)), t0: 0, t1: end });
  if (hook) obstacles.push({ name: "hook", rectAt: () => ({ x: 80, y: 360, w: W - 160, h: 240 }), t0: hook.inAt, t1: hook.outAt });

  const out = elements.map((el) => ({ ...el }));
  const rects = new Array(out.length).fill(null);
  const meta = new Array(out.length).fill(null);
  const addObstacle = (i) => obstacles.push({ name: `${out[i].type}[${i}]`, idx: i, rectAt: () => rects[i], t0: windowOf(out[i])[0], t1: windowOf(out[i])[1] });

  // Fixed items first: panels, toasts, explicit elements.
  out.forEach((el, i) => {
    const fixed = el.type === "toast" || el.type === "panel" || el.type === "dimensionLine" || (B.isLib(el) && !B.hasCandidates(el)); // motion-lib: fixed slot / descriptor rect (elements with candidates are planned below); dimensionLine: explicit from/to, never auto
    if (el.hidden) return; // hidden elements take no space and are not placed (the report keeps their index)
    if (fixed || !isAuto(el)) {
      rects[i] = rectOf(el);
      meta[i] = { mode: fixed && el.type !== "dimensionLine" ? "fixed" : "explicit", slot: B.isLib(el) ? `ui-${el.slot ?? "band"}` : fixed && el.type !== "dimensionLine" ? el.type : "explicit" };
      if (el.type === "toast") out[i].y = rects[i].y; // clamps y to >= 350
      if (!B.isFullFrame(el)) addObstacle(i); // a full-frame element is no obstacle for the others
    }
  });
  // tagPills: header band, opposite side of the logo.
  out.forEach((el, i) => {
    if (el.type !== "tagPill" || rects[i] || el.hidden) return;
    const m = B.measureTagPill(el.text, strip({ size: el.opts?.size }));
    const x = corner === "tr" ? X0 : X1 - m.w;
    rects[i] = { x, y: BANDS.header.y0 + 16, w: m.w, h: m.h };
    out[i].x = x;
    out[i].y = BANDS.header.y0 + 16;
    meta[i] = { mode: "auto", slot: corner === "tr" ? "header-left" : "header-right" };
    addObstacle(i);
  });

  // Overlap cost of `rect` against everything visible during `ts`.
  // `rect` may carry `at(t)` -> the rect actually on screen at t (chat stacks grow bubble by bubble); `rect` itself is the union.
  const evaluate = (rect, ts, selfIdx = -1) => {
    let faceMean = 0, faceMax = 0, rawMax = 0, rawFrac = 0, zoneFrac = 0, personMean = 0, hit = 0, hitMax = 0;
    const A0 = area(rect);
    for (const t of ts) {
      const f = faceAt(t);
      const r = rect.at ? rect.at(t) : rect;
      const A = area(r);
      if (A <= 0) continue;
      // Intrusion depth, not the fraction of the rect: a big stack with a small bite out of it must not look cheap.
      const zf = Math.min(1, (inter(r, f.core) + 0.4 * inter(r, f.hair)) / 30000);
      faceMean += zf / ts.length;
      faceMax = Math.max(faceMax, zf);
      rawMax = Math.max(rawMax, Math.min(1, inter(r, f.face) / 20000));
      rawFrac = Math.max(rawFrac, inter(r, f.face) / A);
      zoneFrac = Math.max(zoneFrac, inter(r, f.zone) / A);
      if (f.person) personMean += inter(r, f.person) / A / ts.length;
    }
    const A = A0;
    const names = [];
    for (const ob of obstacles) {
      if (ob.idx === selfIdx) continue;
      let worst = 0;
      for (const t of ts) {
        if (t < ob.t0 || t > ob.t1) continue;
        const r = ob.rectAt(t);
        const me = rect.at ? rect.at(t) : rect;
        if (r && area(me) > 0) worst = Math.max(worst, inter(me, grow(r, 14)) / area(me));
      }
      if (worst > 0) {
        hit += 3000 * worst + 600;
        hitMax = Math.max(hitMax, worst);
        names.push(ob.name);
      }
    }
    let bounds = 0;
    if (rect.x < X0 - 1 || rect.x + rect.w > X1 + 1 || rect.y < TOP - 1 || rect.y + rect.h > BOTTOM + 1) bounds = 5000;
    return { cost: 1000 * (0.5 * faceMean + 0.5 * faceMax) + 400 * rawMax + 60 * personMean + hit + bounds, faceMax, rawMax, rawFrac, zoneFrac, personMean, names, bounds };
  };

  // --- auto placement of the rest, biggest first ---
  const autos = out
    .map((el, i) => ({ el, i }))
    .filter(({ el, i }) => !rects[i] && !el.hidden && ["keywordPop", "wordStack", "counterBadge", "chatBubbles", "specCard", "onomatopoeia", "productCard", "productPop", "carousel"].includes(el.type))
    .map((a) => ({ ...a, vs: variantsOf(a.el) }))
    .sort((a, b) => area(b.vs[0].m) - area(a.vs[0].m));

  for (const { el, i, vs } of autos) {
    const [w0, w1] = windowOf(el);
    // The last 0.15 s is the fade-out: ignore it when scoring (a cut right at the end must not push the element around).
    const ts = ticks(w0, Math.max(w1 - (w1 - w0 > 0.6 ? 0.15 : 0), w0 + 0.1)).filter((t) => t <= end + 0.01);
    const zone = avgZone(ts);
    const capTop = hasCaptions ? Math.min(...ts.map((t) => capRect(t).y)) - 20 : BOTTOM;
    const lowY = Math.min(BOTTOM, capTop);
    let best = null;
    const perVariant = [];
    for (const v of vs) {
      let vbest = null;
      const { w, h } = v.m;
      const cx = zone.x + zone.w / 2;
      const clampX = (x) => Math.min(Math.max(x, X0), X1 - w);
      const slots = [
        ["upper-left", X0, TOP + 20], ["upper-right", X1 - w, TOP + 20], ["upper-center", (W - w) / 2, TOP + 20],
        ["left-mid", X0, zone.y + zone.h / 2 - h / 2], ["right-mid", X1 - w, zone.y + zone.h / 2 - h / 2],
        ["left-low", X0, lowY - h], ["right-low", X1 - w, lowY - h], ["lower-mid", (W - w) / 2, lowY - h],
        ["above-head", cx - w / 2, zone.y - 16 - h], ["below-face", cx - w / 2, zone.y + zone.h + 16]
      ];
      for (let y = TOP; y <= lowY - h; y += 70) for (const [n, x] of [["left", X0], ["center", (W - w) / 2], ["right", X1 - w]]) slots.push([`grid-${n}@${y}`, x, y]);
      slots.forEach(([name, sx, sy], si) => {
        const rect = { x: clampX(sx), y: Math.min(Math.max(sy, TOP), Math.max(TOP, BOTTOM - h)), w, h };
        if (v.m.hAt) rect.at = (t) => ({ x: rect.x, y: rect.y + h - v.m.hAt(t), w, h: v.m.hAt(t) });
        const r = evaluate(rect, ts, i);
        const cost = r.cost + v.cost + (si < 10 ? si * 3 : 40);
        if (!best || cost < best.cost) best = { cost, rect, name, v, r };
        if (!vbest || cost < vbest.cost) vbest = { cost: Math.round(cost), slot: name, size: `${Math.round(w)}x${Math.round(h)}`, face: round(r.zoneFrac, 2), hit: r.names.length };
      });
      perVariant.push({ ...v.patch, ...vbest });
    }
    const side = /left/.test(best.name) ? "left" : /right/.test(best.name) ? "right" : "center";
    Object.assign(out[i], patchFor(el, best.v, best.rect, side));
    out[i]._slot = best.name;
    rects[i] = best.rect;
    meta[i] = { mode: "auto", slot: best.name, cost: Math.round(best.cost), variant: best.v.patch, tried: perVariant };
    addObstacle(i);
  }

  // --- motion-lib elements with candidates(): the descriptor offers positions / sizes, the planner scores them like any other element ---
  for (const { el, i } of out.map((el, i) => ({ el, i })).filter(({ el, i }) => !rects[i] && !el.hidden && B.isLib(el) && B.hasCandidates(el))) {
    const [w0, w1] = windowOf(el);
    const cands = B.candidatesOf(el);
    // Registry default candidates skip the very first instant: the previous element ends exactly where this one starts (back-to-back
    // screens), and a shared boundary tick is no real collision (the card is still a blob there).
    const t0 = cands[0]?.faceArea ? w0 + 0.05 : w0;
    const ts = ticks(t0, Math.max(w1 - (w1 - w0 > 0.6 ? 0.15 : 0), t0 + 0.1)).filter((t) => t <= end + 0.01);
    let best = null;
    for (const c of cands) {
      const r = evaluate(c.rect, ts, i);
      // Registry default candidates (motion-lib/index.js defaultCandidates, flag faceArea): also weigh how much OF THE FACE stays covered and
      // how far the card climbs over the chin, so a smaller / side variant that hides less of the face and clears the chin wins.
      let covered = 0, chin = 0;
      if (c.faceArea) for (const t of ts) {
        const f = faceAt(t).face;
        if (!f || !area(f)) continue;
        covered += inter(c.rect, f) / area(f) / ts.length;
        // chin clearance: a card that starts less than CHIN_GAP px under the chin (and sits under the face) touches it
        const under = Math.min(c.rect.x + c.rect.w, f.x + f.w) > Math.max(c.rect.x, f.x);
        if (under) chin += Math.min(600, Math.max(0, f.y + f.h + CHIN_GAP - c.rect.y)) / ts.length;
      }
      const cost = r.cost + (c.cost ?? 0) + FACE_AREA_W * covered + CHIN_W * chin;
      if (!best || cost < best.cost) best = { cost, c, r };
    }
    if (!best) continue;
    Object.assign(out[i], best.c.patch ?? {});
    out[i]._slot = best.c.name;
    rects[i] = best.c.rect;
    meta[i] = { mode: "auto", slot: best.c.name, cost: Math.round(best.cost), variant: best.c.patch };
    addObstacle(i);
  }

  // --- logo fade windows where any element would cover the bug ---
  const hide = [];
  out.forEach((el, i) => {
    if (logo.hidden || logo.autoHide === false) return; // logo.json: hidden / autoHide:false keep the logo on top of everything
    if (!rects[i] || el.type === "tagPill" || B.isFullFrame(el)) return; // a full-frame element asks for its own window (logoHideWindows)
    if (inter(grow(rects[i], 10), logoRect) > 0) hide.push(windowOf(el));
  });
  if (!(logo.hidden || logo.autoHide === false)) for (const w of B.logoHideWindows(out)) hide.push(w); // motion-lib elements that always take the logo bug away (logoSting)

  // --- report ---
  const items = out.map((el, i) => {
    // highlightWords is a caption option (engine/brand-layer.js highlightOptions): nothing to place.
    if (el.type === "highlightWords") return { index: i, type: el.type, label: label(el), mode: "caption-option", slot: null, window: null, rect: null, faceOverlap: null, faceZoneOverlap: null, personOverlap: null, collidesWith: [], outOfBounds: false, score: null, qaTime: null };
    const r = rects[i];
    const [w0, w1] = windowOf(el);
    const ts = ticks(w0, Math.max(w1 - (w1 - w0 > 0.6 ? 0.15 : 0), w0 + 0.1)).filter((t) => t <= end + 0.01);
    const full = B.isFullFrame(el);
    const ev = r && !full ? evaluate(r, ts, i) : null; // full-frame elements: no face / bounds / collision numbers
    const qaT = el.type === "wordStack" || el.type === "chatBubbles" ? (Math.max(...el.items.map((x) => x.at)) + 0.4 + el.out) / 2 : (w0 + w1) / 2;
    return {
      index: i, type: el.type, label: label(el), mode: meta[i]?.mode ?? "ignored", slot: meta[i]?.slot ?? null,
      window: [round(w0, 2), round(w1, 2)], rect: r ? rrect(r) : null, ...(full ? { fullFrame: true } : {}),
      faceOverlap: ev ? round(ev.rawFrac) : null, // max fraction of the element's area inside the face box
      faceZoneOverlap: ev ? round(ev.zoneFrac) : null, // same for the expanded face zone (hair + margin)
      personOverlap: ev ? round(ev.personMean) : null,
      collidesWith: ev ? ev.names : [], outOfBounds: ev ? ev.bounds > 0 : false,
      variant: meta[i]?.variant, tried: meta[i]?.tried, score: meta[i]?.cost ?? (ev ? Math.round(ev.cost) : null), qaTime: round(Math.min(Math.max(qaT, 0), end - 0.05), 2)
    };
  });
  const report = {
    faces: tracker.sources, canvas: [W, 1920],
    bands: { header: [BANDS.header.y0, BANDS.header.y1], toastTop: TOP, panel: [BANDS.panel.y0, BANDS.panel.y1], captionsY: capBase, bottom: BOTTOM },
    logo: { corner, rect: rrect(logoRect), meanFaceCx: Math.round(meanCx), hide: hide.map(([a, b]) => [round(a, 2), round(b, 2)]) },
    elements: items
  };
  return { elements: out, logo: { corner, rect: logoRect, hide }, report, rects, tracker, faceAt, capRect: hasCaptions ? capRect : null };
}

// QA-only overlay (never in the delivered video): face box (red), expanded zone (yellow dashed), person (blue dashed), element rects (cyan).
export function drawQa(ctx, plan, t) {
  const f = plan.faceAt(t);
  const line = (r, color, w, dash = []) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.setLineDash(dash);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  };
  const tag = (txt, x, y, color) => {
    ctx.save();
    ctx.font = "700 26px system-ui, sans-serif";
    const w = ctx.measureText(txt).width + 14;
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(x, y, w, 34);
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(txt, x + 7, y + 18);
    ctx.restore();
  };
  if (f.person) line(f.person, "#4da3ff", 3, [14, 10]);
  line(f.zone, "#ffe14d", 4, [18, 10]);
  line(f.face, "#ff3b30", 6);
  tag("face", f.face.x, Math.max(0, f.face.y - 36), "#ff3b30");
  if (plan.capRect) line(plan.capRect(t), "#ff4df0", 3, [8, 8]);
  line(plan.logo.rect, "#ff4df0", 3, [8, 8]);
  plan.report.elements.forEach((e, i) => {
    if (!plan.rects[i] || t < e.window[0] - 0.05 || t > e.window[1] + 0.05) return;
    line(plan.rects[i], "#00e5ff", 4);
    tag(`${e.type} ${e.slot}`, plan.rects[i].x, plan.rects[i].y - 36 < 0 ? plan.rects[i].y : plan.rects[i].y - 36, "#00e5ff");
  });
}
