// Shared helpers of the "App" family of the motion library (phone / browser chrome, typing, switches, app tiles). Pure functions of their
// arguments: no Date, no random, no globals. Files starting with "_" are NOT element types (the registry in index.js skips them).
// Coordinates: every helper draws in the caller's current transform; `x, y` are the top-left corner unless a comment says otherwise.
import { seg, lerp, expoOut, outBack } from "../ui-motion.js";
import { rr, fnt, text, shadow, noShadow, disc, checkMark, hexA, mix } from "./_kit.js";

/** Brand logos that exist as official files in assets/brand-icons/index.json (tiktok is pending: never drawn). */
export const OFFICIAL_ICONS = ["whatsapp", "instagram", "messenger", "facebook", "telegram", "gmail", "googlemaps", "google", "linkedin", "youtube", "x"];

/** Typed prefix of `s` at time `ts` (started at `start`), `cps` characters per second (the craft rule is 15 to 22). */
export const typed = (s, ts, start, cps = 18) => {
  const str = String(s ?? "");
  return str.slice(0, Math.max(0, Math.min(str.length, Math.floor((ts - start) * cps))));
};
/** Blinking caret is NOT drawn by default (no flicker in a deterministic still): helpers only draw a fixed bar while typing. */
export function caret(ctx, x, y, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y - h / 2, 3, h);
}

/**
 * Phone body drawn at (0,0)-(w,h) in the caller's space. Solid dark body, no brand marks, no gradient.
 * Returns the screen rectangle { x, y, w, h, r } where content goes (already inset by the bezel).
 */
export function phoneBody(ctx, skin, w, h, { notch = true, homeBar = true, body = "#16181D" } = {}) {
  const bezel = Math.round(w * 0.05);
  const R = Math.round(w * 0.16);
  ctx.fillStyle = body;
  rr(ctx, 0, 0, w, h, R);
  ctx.fill();
  const scr = { x: bezel, y: bezel, w: w - bezel * 2, h: h - bezel * 2, r: R - bezel };
  if (notch) {
    ctx.fillStyle = "#000000";
    rr(ctx, w / 2 - w * 0.17, bezel + 6, w * 0.34, 34, 17);
    ctx.fill();
  }
  if (homeBar) {
    ctx.fillStyle = hexA(skin.colors.ink ?? "#1A1A1A", 0.9);
    rr(ctx, w / 2 - w * 0.16, h - bezel - 24, w * 0.32, 10, 5);
    ctx.fill();
  }
  return scr;
}

/** Clip to a rounded rect: call ctx.save() first and ctx.restore() after drawing the content. */
export function clipRR(ctx, x, y, w, h, r) {
  rr(ctx, x, y, w, h, r);
  ctx.clip();
}

/**
 * Image into a box: fit "cover" (fills, cropped) or "contain" (whole, letterboxed on nothing: the box is only the image area).
 * `offsetY` moves the image inside a cover box (0..1 of the overflow), used by the slow scroll of phoneFrame.
 */
export function drawFitted(ctx, img, x, y, w, h, fit = "cover", offsetY = 0) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  if (fit === "contain") {
    const s = Math.min(w / iw, h / ih);
    ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
    return;
  }
  const s = Math.max(w / iw, h / ih);
  const over = ih * s - h;
  ctx.drawImage(img, x + (w - iw * s) / 2, y - over * clampUnit(offsetY), iw * s, ih * s);
}
const clampUnit = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/**
 * Minimal browser window at (0,0)-(w,h): neutral top bar with three plain dots, a URL pill holding `url` (the already typed part).
 * Returns the content rectangle below the bar { x: 0, y: BAR, w, h: h - BAR }.
 */
export const BROWSER_BAR = 96;
export function browserChrome(ctx, skin, w, h, url = "") {
  const C = skin.colors;
  ctx.fillStyle = C.surface;
  rr(ctx, 0, 0, w, h, skin.radius.card);
  ctx.fill();
  ctx.save();
  clipRR(ctx, 0, 0, w, h, skin.radius.card);
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, w, BROWSER_BAR);
  ctx.fillStyle = C.line;
  ctx.fillRect(0, BROWSER_BAR - 2, w, 2);
  [0, 1, 2].forEach((i) => disc(ctx, 40 + i * 30, BROWSER_BAR / 2, 9, C.faint));
  const px = 150, pw = w - px - 36, ph = 56;
  ctx.fillStyle = C.surface;
  rr(ctx, px, BROWSER_BAR / 2 - ph / 2, pw, ph, ph / 2);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  rr(ctx, px + 1, BROWSER_BAR / 2 - ph / 2 + 1, pw - 2, ph - 2, ph / 2);
  ctx.stroke();
  text(ctx, url, px + 26, BROWSER_BAR / 2 + 1, { font: fnt(skin, 500, 30), color: C.text, maxW: pw - 52 });
  ctx.restore();
  return { x: 0, y: BROWSER_BAR, w, h: h - BROWSER_BAR };
}

/** iOS-style switch: track (off = line colour, on = `onColor` by k) and a knob sliding with k (0..1). Drawn at (x, y) top-left, size w x h. */
export function drawSwitch(ctx, skin, x, y, w, h, k, onColor = skin.colors.primary) {
  const C = skin.colors;
  ctx.fillStyle = mix(C.line, onColor, k);
  rr(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const pad = Math.round(h * 0.09), d = h - pad * 2;
  const kx = lerp(x + pad + d / 2, x + w - pad - d / 2, k);
  shadow(ctx, "rgba(16,24,40,0.28)", 10, 4);
  disc(ctx, kx, y + h / 2, d / 2, "#FFFFFF");
  noShadow(ctx);
}

/** Magnifier glyph centred at (cx, cy), radius r (line only, no fill). */
export function searchGlyph(ctx, cx, cy, r, color, lw = 4) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.moveTo(cx + r * 0.72, cy + r * 0.72);
  ctx.lineTo(cx + r * 1.45, cy + r * 1.45);
  ctx.stroke();
  ctx.restore();
}

/**
 * App tile (square, `size` px, top-left x, y): the OFFICIAL platform logo of `name` (one of OFFICIAL_ICONS, drawn as it is, aspect kept,
 * no recolour) or the brand mark when name is "brand". Returns false when nothing could be drawn (the loader already reports missing assets).
 */
export function appTile(ctx, env, name, x, y, size) {
  if (name === "brand") return !!env.kit?.drawLogo?.(ctx, "mark", x + size / 2, y + size / 2, size, size);
  if (!OFFICIAL_ICONS.includes(name)) return false;
  const img = env.img(`icon:${name}`);
  if (!img) return false;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const f = Math.min(size / iw, size / ih);
  ctx.drawImage(img, x + (size - iw * f) / 2, y + (size - ih * f) / 2, iw * f, ih * f);
  return true;
}
/** Asset refs an element must declare in imageRefs for an app tile. */
export const tileRefs = (name, add) => { if (name && name !== "brand" && OFFICIAL_ICONS.includes(name)) add(`icon:${name}`, "icono"); };

/** Ease a value in with the rise of uiList rows: returns { k, dy } for a card entering at time a. */
export const riseIn = (ts, a, dur = 0.45, dist = 60) => { const k = expoOut(seg(ts, a, a + dur)); return { k, dy: (1 - k) * dist }; };
/** Spring pop (0.6 -> 1 with overshoot) for a scale, done at ts in [a, a + dur]. */
export const popIn = (ts, a, dur = 0.42) => lerp(0.6, 1, outBack(seg(ts, a, a + dur)));

/** Check badge on a brand colour (k = progress 0..1), for the "done" states. */
export function doneBadge(ctx, cx, cy, size, bg, k) {
  if (k <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  disc(ctx, 0, 0, size / 2, bg);
  checkMark(ctx, 0, 0, size * 0.62, "#fff", size * 0.075);
  ctx.restore();
}

// ---------- QR encoder (ISO/IEC 18004): byte mode, versions 1-10, levels L/M/Q/H. Pure and deterministic, no dependency. ----------
// The block structure table is data from the standard (values as listed in the segno 1.6.6 tables, BSD-3-Clause, Copyright (c) Lars Heuer).
// Each level lists its groups as [blocks, codewords per block, data codewords per block].
const EC_TABLE = {
  1: { L: [[1,26,19]], M: [[1,26,16]], Q: [[1,26,13]], H: [[1,26,9]] },
  2: { L: [[1,44,34]], M: [[1,44,28]], Q: [[1,44,22]], H: [[1,44,16]] },
  3: { L: [[1,70,55]], M: [[1,70,44]], Q: [[2,35,17]], H: [[2,35,13]] },
  4: { L: [[1,100,80]], M: [[2,50,32]], Q: [[2,50,24]], H: [[4,25,9]] },
  5: { L: [[1,134,108]], M: [[2,67,43]], Q: [[2,33,15], [2,34,16]], H: [[2,33,11], [2,34,12]] },
  6: { L: [[2,86,68]], M: [[4,43,27]], Q: [[4,43,19]], H: [[4,43,15]] },
  7: { L: [[2,98,78]], M: [[4,49,31]], Q: [[2,32,14], [4,33,15]], H: [[4,39,13], [1,40,14]] },
  8: { L: [[2,121,97]], M: [[2,60,38], [2,61,39]], Q: [[4,40,18], [2,41,19]], H: [[4,40,14], [2,41,15]] },
  9: { L: [[2,146,116]], M: [[3,58,36], [2,59,37]], Q: [[4,36,16], [4,37,17]], H: [[4,36,12], [4,37,13]] },
  10: { L: [[2,86,68], [2,87,69]], M: [[4,69,43], [1,70,44]], Q: [[6,43,19], [2,44,20]], H: [[6,43,15], [2,44,16]] },
};
// Alignment pattern centres per version 1..10 (version 1 has none).
const ALIGN = [[], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50]];
const FORMAT_LEVEL = { L: 1, M: 0, Q: 3, H: 2 };
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
/** Reed-Solomon generator polynomial of degree n (highest coefficient first, leading 1 included). */
function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i += 1) {
    const next = new Array(g.length + 1).fill(0);
    g.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= gmul(c, EXP[i]); });
    g = next;
  }
  return g;
}
/** The n error-correction codewords of `data` (polynomial division remainder over GF(256)). */
function rsEncode(data, n) {
  const g = rsGenerator(n);
  const rem = new Array(n).fill(0);
  for (const d of data) {
    const factor = d ^ rem[0];
    rem.shift();
    rem.push(0);
    if (factor) for (let i = 0; i < n; i += 1) rem[i] ^= gmul(g[i + 1], factor);
  }
  return rem;
}
const ccBits = (v) => (v <= 9 ? 8 : 16);
const dataCapacity = (v, ecc) => EC_TABLE[v][ecc].reduce((s, [nb, , d]) => s + nb * d, 0);
/** Smallest version (1..10) that holds `len` bytes at level `ecc`. */
export function qrVersionFor(len, ecc = "M") {
  for (let v = 1; v <= 10; v += 1) if (4 + ccBits(v) + 8 * len <= dataCapacity(v, ecc) * 8) return v;
  throw new Error(`QR: el texto no cabe (${len} bytes en nivel ${ecc})`);
}
/** Data + error-correction codewords, interleaved as the standard requires. */
function codewords(bytes, v, ecc) {
  const groups = EC_TABLE[v][ecc];
  const cap = dataCapacity(v, ecc);
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1); };
  put(0x4, 4);
  put(bytes.length, ccBits(v));
  bytes.forEach((b) => put(b, 8));
  put(0, Math.max(0, Math.min(4, cap * 8 - bits.length)));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + b, 0));
  for (let p = 0; data.length < cap; p ^= 1) data.push(p ? 0x11 : 0xec);
  const blocks = [];
  let off = 0;
  for (const [nb, total, d] of groups) {
    for (let k = 0; k < nb; k += 1) {
      const part = data.slice(off, off + d);
      blocks.push({ d: part, e: rsEncode(part, total - d) });
      off += d;
    }
  }
  const out = [];
  const maxD = Math.max(...blocks.map((b) => b.d.length)), maxE = Math.max(...blocks.map((b) => b.e.length));
  for (let i = 0; i < maxD; i += 1) blocks.forEach((b) => { if (i < b.d.length) out.push(b.d[i]); });
  for (let i = 0; i < maxE; i += 1) blocks.forEach((b) => { if (i < b.e.length) out.push(b.e[i]); });
  return out;
}
const MASKS = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (_, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0
];
/** BCH(15,5) format word for the level bits and mask, XOR 0x5412. */
function formatWord(ecc, mask) {
  const data = (FORMAT_LEVEL[ecc] << 3) | mask;
  let rem = data;
  for (let k = 0; k < 10; k += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
/** BCH(18,6) version word (versions 7 and up). */
function versionWord(v) {
  let rem = v;
  for (let k = 0; k < 12; k += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (v << 12) | rem;
}
/** Matrix of the function patterns and the data placement, before masking. */
function baseMatrix(v, cw) {
  const n = 17 + 4 * v;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const f = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r, c, dark) => { m[r][c] = dark; f[r][c] = true; };
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= n || c >= n) continue;
        const d = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        set(r, c, d <= 1 || d === 3);
      }
    }
  }
  for (let i = 8; i < n - 8; i += 1) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const pos = ALIGN[v - 1];
  for (const r of pos) {
    for (const c of pos) {
      if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
  // reserved format areas (filled per mask later) and the dark module
  for (let i = 0; i <= 8; i += 1) { if (i !== 6) { f[8][i] = true; f[i][8] = true; } }
  for (let i = 0; i < 8; i += 1) { f[n - 1 - i][8] = true; f[8][n - 1 - i] = true; }
  set(n - 8, 8, true);
  if (v >= 7) {
    const bits = versionWord(v);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = n - 11 + (i % 3), b = Math.floor(i / 3);
      set(b, a, bit);
      set(a, b, bit);
    }
  }
  let i = 0;
  const total = cw.length * 8;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const c = right - j, up = ((right + 1) & 2) === 0;
        const r = up ? n - 1 - vert : vert;
        if (!f[r][c] && i < total) { m[r][c] = ((cw[i >> 3] >> (7 - (i & 7))) & 1) === 1; i += 1; }
      }
    }
  }
  return { n, m, f };
}
/** Writes the two copies of the format word (around the finders and split at the bottom-left / top-right). */
function writeFormat(m, n, bits) {
  const bit = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i += 1) m[i][8] = bit(i);
  m[7][8] = bit(6);
  m[8][8] = bit(7);
  m[8][7] = bit(8);
  for (let i = 9; i < 15; i += 1) m[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i += 1) m[8][n - 1 - i] = bit(i);
  for (let i = 8; i < 15; i += 1) m[n - 15 + i][8] = bit(i);
}
/** ISO penalty score N1..N4 of a matrix. */
function penalty(m) {
  const n = m.length;
  const at = (r, c, rowsFirst) => (rowsFirst ? m[r][c] : m[c][r]);
  let p = 0;
  for (const rowsFirst of [true, false]) {
    for (let a = 0; a < n; a += 1) {
      let run = 1;
      for (let b = 1; b <= n; b += 1) {
        if (b < n && at(a, b, rowsFirst) === at(a, b - 1, rowsFirst)) { run += 1; continue; }
        if (run >= 5) p += 3 + (run - 5);
        run = 1;
      }
      const P1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], P2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
      for (let b = 0; b + 11 <= n; b += 1) {
        const line = P1.map((_, k) => (at(a, b + k, rowsFirst) ? 1 : 0));
        if (line.every((x, k) => x === P1[k]) || line.every((x, k) => x === P2[k])) p += 40;
      }
    }
  }
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const x = m[r][c];
      if (x === m[r][c + 1] && x === m[r + 1][c] && x === m[r + 1][c + 1]) p += 3;
    }
  }
  let dark = 0;
  m.forEach((row) => row.forEach((x) => { if (x) dark += 1; }));
  const total = n * n;
  p += 10 * (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1);
  return p;
}
/**
 * QR matrix of `text` (boolean[][], true = dark, no quiet zone). Byte mode; `ecc` L | M | Q | H (default M); opts.version and
 * opts.mask force a version / mask (tests). Without opts the mask with the lowest penalty is chosen (first one wins a tie).
 */
export function qrMatrix(text, ecc = "M", opts = {}) {
  const bytes = [...new TextEncoder().encode(String(text ?? ""))];
  const v = opts.version ?? qrVersionFor(bytes.length, ecc);
  const cw = codewords(bytes, v, ecc);
  const { n, m: base, f } = baseMatrix(v, cw);
  let best = null, bestP = Infinity;
  const masks = opts.mask !== undefined ? [opts.mask] : MASKS.map((_, k) => k);
  for (const k of masks) {
    const m = base.map((row, r) => row.map((x, c) => (f[r][c] ? x : x !== MASKS[k](r, c))));
    writeFormat(m, n, formatWord(ecc, k));
    const p = penalty(m);
    if (p < bestP) { bestP = p; best = m; }
  }
  return best;
}
