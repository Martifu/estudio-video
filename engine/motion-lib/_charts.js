// Shared helpers of the chart elements (barChart and the ones that follow). Not an element type (the "_" prefix keeps it out of the
// registry). Pure functions of their arguments: no Date, no random, no globals, no ctx.canvas / env.canvas / env.measure.
import { clamp, seg, lerp, expoOut, statText, parseMoney } from "../ui-motion.js";
import { rr, hexA, fnt, text, card, envelope, beginCard, radiusAt, disc, mix } from "./_kit.js";

export const CHART_FORMATS = [["money", "Dinero"], ["int", "Número"], ["pct", "Porcentaje"], ["compact", "Corto (612K)"]];

/** Card envelope of a chart: birth blob, blur/fade exit, the surface and a clip to the card. Returns { E, R }; close with endCardEnvelope(ctx). */
export function cardEnvelope(ctx, el, tl, ts, rect, skin) {
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts, { blurExit: true });
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  ctx.globalAlpha = E.alpha;
  return { E, R };
}
/** Undoes cardEnvelope (clip save + card transform save). */
export function endCardEnvelope(ctx) { ctx.restore(); ctx.restore(); }

/** Grid lines and baseline fade in together (expoOut over `beat`). Returns the alpha drawn with. `box` = { x, y, w, h, lines } (lines = gridlines above the baseline). */
export function axisFade(ctx, skin, ts, beat, box) {
  const a = expoOut(seg(ts, beat[0], beat[1]));
  if (a <= 0) return 0;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.strokeStyle = skin.colors.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= box.lines; i += 1) {
    const y = box.y + box.h - (box.h * i) / box.lines;
    ctx.moveTo(box.x, Math.round(y) + 0.5);
    ctx.lineTo(box.x + box.w, Math.round(y) + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = skin.colors.faint;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y + box.h + 1.5);
  ctx.lineTo(box.x + box.w, box.y + box.h + 1.5);
  ctx.stroke();
  ctx.restore();
  return a;
}

/** Progress 0..1 of item `i` of a staggered list: stagger = { start, step, dur } in design seconds (expoOut per item). */
export function growBar(ts, stagger, i) {
  const a = stagger.start + i * stagger.step;
  return expoOut(seg(ts, a, a + stagger.dur));
}

/** Arc length walk of a polyline: draws the part up to `progress` (0..1) of its length and a leading dot. points = [[x, y], ...] in card px. */
export function polylineDraw(ctx, points, progress, { color, width = 6, dot = true, dotR = width * 1.6 } = {}) {
  if (!points || points.length < 2 || progress <= 0) return;
  const lens = [0];
  for (let i = 1; i < points.length; i += 1) lens.push(lens[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = lens[lens.length - 1];
  const target = clamp(progress) * total;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  let head = points[0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i];
    if (target >= lens[i]) { ctx.lineTo(b[0], b[1]); head = b; continue; }
    const k = (target - lens[i - 1]) / (lens[i] - lens[i - 1]);
    head = [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
    ctx.lineTo(head[0], head[1]);
    break;
  }
  ctx.stroke();
  if (dot) disc(ctx, head[0], head[1], dotR, color);
  ctx.restore();
}

/** Arc stroke of a ring from angle `from` to `to` (radians, clockwise from 3 o'clock), round caps. Nothing when to <= from. */
export function ringArc(ctx, cx, cy, r, from, to, color, width = 18) {
  if (to <= from) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, from, to);
  ctx.stroke();
  ctx.restore();
}

/**
 * Count-up text of a value: `fe` = { value, format, prefix?, suffix? } (the same fields as a uiStat). k = 0..1 of the count:
 * "" before it starts, the exact final text (statText) at k >= 1. The ease 1 - (1 - k)^3 is monotonic, and every format rounds
 * monotonically, so the text never goes above the final value nor back down. `from` (0..1) is the first value shown: the count
 * starts at that share of the target, never at a meaningless 0 ("from" = COUNT_FROM for the charts of this group).
 */
export const COUNT_FROM = 0.62;
export function countUp(fe, k, { from = 0 } = {}) {
  if (k <= 0) return "";
  if (k >= 1) return statText(fe, 1);
  const e = 1 - Math.pow(1 - k, 3);
  return statText(fe, from + (1 - from) * e);
}

/** Solid segment colours of a series of n (donut): brand primary, accent, a deep primary, the muted neutral, a deep accent. No pale tints. */
export function seriesPalette(C, n) {
  const base = [C.primary, C.accent, mix(C.primary, C.ink, 0.45), C.muted, mix(C.accent, C.ink, 0.45), mix(C.primary, C.accent, 0.5)];
  const list = [];
  for (const c of base) if (!list.some((x) => x.toLowerCase() === String(c).toLowerCase())) list.push(c);
  return Array.from({ length: n }, (_, i) => list[i % list.length]);
}

/** A padded, rounded y-domain for a series: { min, max, step, lines } with about 4 gridlines; the data never touches the edges. */
export function niceDomain(vals, { pad = 0.25 } = {}) {
  const finite = vals.filter(Number.isFinite);
  const lo = Math.min(...finite), hi = Math.max(...finite);
  const span = hi - lo || Math.max(Math.abs(hi), 1) * 0.2;
  const raw = (span * (1 + 2 * pad)) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw - 1e-12);
  let min = Math.floor((lo - span * pad) / step) * step;
  const max = Math.ceil((hi + span * pad) / step) * step;
  if (lo >= 0 && min < 0) min = 0;
  return { min, max, step, lines: Math.max(1, Math.round((max - min) / step)) };
}

/** Delta badge (up = success colour, down = danger) with stroked arrows, like uiStat. (x, cy) = left edge and vertical middle; g = 0..1 entrance. Returns the width. */
export function deltaBadge(ctx, skin, s, dir, x, cy, g) {
  const C = skin.colors;
  ctx.save();
  ctx.font = fnt(skin, 700, 32);
  const dw = ctx.measureText(s).width + 40 + 30 + 10;
  if (g <= 0) { ctx.restore(); return dw; }
  const up = dir !== "down";
  const col = up ? C.success : C.danger;
  ctx.translate(x + dw / 2, cy);
  const sc = lerp(0.5, 1, expoOut(g));
  ctx.scale(sc, sc);
  ctx.globalAlpha *= clamp(g * 4);
  ctx.fillStyle = hexA(col, 0.14);
  rr(ctx, -dw / 2, -29, dw, 58, 29);
  ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 4.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const ax = -dw / 2 + 36;
  ctx.beginPath();
  if (up) { ctx.moveTo(ax, 8); ctx.lineTo(ax, -9); ctx.moveTo(ax - 8, -1); ctx.lineTo(ax, -9); ctx.lineTo(ax + 8, -1); }
  else { ctx.moveTo(ax, -8); ctx.lineTo(ax, 9); ctx.moveTo(ax - 8, 1); ctx.lineTo(ax, 9); ctx.lineTo(ax + 8, 1); }
  ctx.stroke();
  text(ctx, s, ax + 24, 2, { font: fnt(skin, 700, 32), color: col });
  ctx.restore();
  return dw;
}

/** One row of legend items [{ label, color }] at (x, y = vertical middle); swatch + 26 px label each. Returns the width drawn. */
export function legendRow(ctx, skin, items, x, y, { gap = 40, maxW } = {}) {
  let cx = x;
  for (const it of items ?? []) {
    disc(ctx, cx + 11, y, 11, it.color);
    const w = text(ctx, it.label, cx + 32, y + 1, { font: fnt(skin, 600, 26), color: skin.colors.muted, maxW: maxW ? Math.max(40, x + maxW - cx - 32) : undefined });
    cx += 32 + w + gap;
    if (maxW && cx - x >= maxW) break;
  }
  return cx - x;
}

/**
 * Spanish problems of a data series: rows = [{ label, value }]. Returns messages prefixed with `tag` (empty = valid).
 * Checks the row count (min..max), a label per row and a finite numeric value (parseMoney), and that some value is above zero.
 */
export function seriesProblems(rows, tag, { min = 1, max = 6 } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const p = [];
  if (list.length < min || list.length > max) p.push(`${tag}: necesita de ${min} a ${max} filas (tiene ${list.length})`);
  if (list.some((r) => !r || !String(r.label ?? "").trim())) p.push(`${tag}: cada fila necesita un nombre`);
  if (list.some((r) => !r || parseMoney(r.value) === null)) p.push(`${tag}: cada fila necesita una cifra`);
  else if (list.length && !list.some((r) => parseMoney(r.value) > 0)) p.push(`${tag}: al menos una cifra debe ser mayor que cero`);
  else if (list.some((r) => parseMoney(r.value) < 0)) p.push(`${tag}: las cifras no pueden ser negativas`);
  return p;
}
