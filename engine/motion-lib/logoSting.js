// Element "logoSting": closing brand sting (alternative or companion to the CTA card). Beats, as fractions of the element duration:
//   1. a full-frame flat background wipes in from an organic blob of the brand primary (deterministic shape: phases come from a hash of the id)
//   2. the logo scales in with a small overshoot
//   3. the logo settles: shrinks and moves up
//   4. the url types itself letter by letter under it (15-22 chars/s), optional tagline fades in
//   5. hold
// Sits on the "top" layer (above the toast and the logo bug, like the CTA card), hides the captions and the logo bug while visible.
// SFX: whoosh at the blob, pop at the logo. Flat colours only: no glow, no gradients.
import { seg, lerp, expoOut, inOut, outBack, clamp } from "../ui-motion.js";
import { hexA, lum, seedPhases } from "./_kit.js";

const W = 1080, H = 1920;
const LOGOS = ["auto", "color", "white", "mark"];
const BGS = ["paper", "primary"];
const MIN_CPS = 15, MAX_CPS = 22, CPS = 18;
const HEX = /^#[0-9a-f]{6}$/i;

const urlOf = (el, kit) => (el.url !== undefined ? String(el.url) : kit.cta?.web || kit.webHost || "").trim();
/** Typing schedule: seconds of typing for n chars (18 chars/s, never outside 15..22 inside a window of D seconds). */
export function typingSeconds(n, D) {
  if (!n) return 0;
  const want = n / CPS;
  return clamp(want, n / MAX_CPS, Math.min(n / MIN_CPS, D * 0.4));
}
/** Logo variant for a background: paper -> colour logo, primary -> white logo (dark primaries) or the mark; explicit choice wins. */
export function pickVariant(el, kit) {
  const bg = el.bg === "primary" ? "primary" : "paper";
  if (el.logo && el.logo !== "auto") return el.logo;
  const order = bg === "paper" ? ["color", "mark", "white"] : lum(kit.colors.primary) < 0.35 ? ["white", "mark", "color"] : ["color", "mark", "white"];
  return order.find((v) => kit.hasLogo(v)) ?? order[0];
}

export default {
  type: "logoSting",
  category: "Cierres",
  usesSkin: false, // brand typography element: reads the brand kit, not the ui skin
  captions: "always",
  hidesLogo: true,
  fullFrame: true, // covers the whole frame by design: exempt from face / safe-area / collision checks
  layer: "top",
  label: "Cierre con logo",
  description: "Una mancha de color tapa la pantalla, aparece el logo y se escribe la dirección web",
  brief: [
    "Qué: el cierre de marca: una mancha del color de la marca cubre la toma, aparece el logo y se escribe la dirección web.",
    "Cuándo: el final del video, solo o antes de la tarjeta CTA. No usar: a mitad del video ni más de una vez.",
    "Coreografía: mancha orgánica que crece hasta cubrir, el logo asienta, la web se escribe letra por letra, cola quieta ≥ 1 s.",
    "Gusto: color plano de la marca, sin degradados ni brillo; dura 3 s o más; oculta subtítulos y el logo de esquina.",
    "Datos: logo y web de brand.json; nunca un logo aproximado."
  ].join("\n"),
  icon: "M12 3c4 0 8 3 8 8s-3 10-8 10-8-5-8-10 4-8 8-8zM9 12h6",
  thumbAt: 0.86,
  sampleDur: 3.4,
  defaults: (t, end) => ({ type: "logoSting", in: t, out: Math.min(t + 3.4, end), bg: "paper", logo: "auto" }),
  fields: [
    { key: "bg", label: "Fondo", kind: "select", options: [["paper", "Claro (papel)"], ["primary", "Color de la marca"]], opt: true, ph: "claro" },
    { key: "logo", label: "Logo", kind: "select", options: [["auto", "El que mejor se ve"], ["color", "A color"], ["white", "Blanco"], ["mark", "Solo el símbolo"]], opt: true, ph: "el que mejor se ve" },
    { key: "url", label: "Dirección web (ej. reda.mx)", kind: "text", opt: true, ph: "la de la marca" },
    { key: "tagline", label: "Frase corta debajo (opcional)", kind: "text", opt: true }
  ],
  pin: null,

  validate(el, tag) {
    const errors = [], warnings = [];
    if (el.bg !== undefined && !BGS.includes(el.bg)) errors.push(`${tag}: "bg" debe ser paper o primary`);
    if (el.logo !== undefined && !LOGOS.includes(el.logo)) errors.push(`${tag}: "logo" debe ser auto, color, white o mark`);
    if (el.url !== undefined && String(el.url).length > 40) errors.push(`${tag}: la dirección web es muy larga (máximo 40 letras)`);
    if (el.tagline !== undefined && String(el.tagline).length > 60) errors.push(`${tag}: la frase es muy larga (máximo 60 letras)`);
    const D = Number(el.out) - Number(el.in);
    if (D > 0 && D < 2.4) warnings.push(`${tag}: dura muy poco (${D.toFixed(1)} s): se verá apurado; mejor 3 s o más`);
    return { errors, warnings };
  },

  // Fractions of D (Ld = 1) built from seconds (compressed when the window is shorter than ~2.6 s): the primary wipe takes 9 frames, the paper
  // follows right behind it, then logo in, settle, typing (n chars at ~18 chars/s), tagline. No exit: it holds to the end.
  timeline(el, mode, kit) {
    const D = Math.max(0.05, (Number(el.out) || 0) - (Number(el.in) || 0));
    const k = Math.min(1, D / 2.6);
    const f = (sec) => (sec * k) / D;
    const n = Array.from(el.url ?? "").length || (kit?.webHost ? kit.webHost.length : 7);
    const t0 = f(1.4);
    const typeFrac = Math.min(0.4, typingSeconds(n, D) / D);
    return { Ld: 1, b: { blob: [0, f(0.3)], wipe: [f(0.2), f(0.5)], logo: [f(0.5), f(1.0)], settle: [f(1.1), f(1.45)], type: [t0, t0 + typeFrac], tagline: [t0 + typeFrac, Math.min(0.98, t0 + typeFrac + 0.1)], exit: [1, 1] } };
  },

  rect: () => ({ x: 0, y: 0, w: W, h: H }),
  texts: (el, add) => { add(el.url); add(el.tagline); },
  events(el, rect, { beats: B, add }) {
    add(B.blob[0], "whoosh", W / 2);
    add(B.logo[0] + 0.04 * (B.logo[1] - B.logo[0]), "pop", W / 2);
  },

  draw(ctx, el, t, env) {
    const { kit, ts, tl } = env;
    const b = tl.b, c = kit.colors;
    const bg = el.bg === "primary" ? c.primary : c.paper;
    const ink = el.bg === "primary" ? (lum(c.primary) < 0.35 ? "#FFFFFF" : c.ink) : c.ink;
    const [p1, p2, p3] = seedPhases(el.id ?? "logoSting", 3);
    // ---- 1. organic blob wipe: the brand primary as a solid flat fill grows to the full frame in ~9 frames, then the flat background (paper) wipes in
    // right behind it from the same point (no alpha, no tint). Shape = hash of the id: deterministic. ----
    const R = 1700;
    const blobPath = (k) => {
      const r0 = R * k, N = 72;
      ctx.beginPath();
      for (let i = 0; i <= N; i += 1) {
        const a = (i / N) * Math.PI * 2;
        const r = r0 * (1 + 0.11 * Math.sin(3 * a + p1 + k * 1.6) + 0.07 * Math.sin(5 * a + p2 - k * 2.2) + 0.04 * Math.sin(7 * a + p3));
        const x = W * 0.5 + Math.cos(a) * r, y = H * 0.56 + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    const kb = inOut(seg(ts, b.blob[0], b.blob[1])) * 0.35 + expoOut(seg(ts, b.blob[0], b.blob[1])) * 0.65;
    if (seg(ts, b.blob[0], b.blob[1]) <= 0) return;
    ctx.fillStyle = c.primary;
    blobPath(kb);
    ctx.fill();
    if (seg(ts, b.blob[0], b.blob[1]) >= 1) ctx.fillRect(0, 0, W, H);
    if (el.bg !== "primary") {
      const w2 = seg(ts, b.wipe[0], b.wipe[1]);
      if (w2 > 0) {
        ctx.fillStyle = c.paper;
        blobPath(inOut(w2) * 0.35 + expoOut(w2) * 0.65);
        ctx.fill();
        if (w2 >= 1) ctx.fillRect(0, 0, W, H); // flat and exact once the wipe is complete
      }
    }
    // ---- 2./3. logo: scale in with a small overshoot, then settle (shrink + move up) ----
    const variant = pickVariant(el, kit);
    const kin = seg(ts, b.logo[0], b.logo[1]);
    const st = inOut(seg(ts, b.settle[0], b.settle[1]));
    const size = kit.logoSize(variant);
    const maxW = lerp(700, 560, st), maxH = lerp(300, 240, st);
    const cy = lerp(H * 0.45, H * 0.4, st);
    const s = lerp(0.62, 1, outBack(kin, 1.1));
    ctx.save();
    ctx.globalAlpha = Math.min(1, kin * 3);
    ctx.translate(W / 2, cy);
    ctx.scale(s, s);
    if (!kit.drawLogo(ctx, variant, 0, 0, maxW, maxH)) {
      if (size === null && el.logo && el.logo !== "auto") kit.missingLogo(variant); // an explicit variant that is missing is an asset error, never a silent swap
      ctx.font = kit.font("display", 150, 800);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = ink;
      ctx.fillText(kit.name, 0, 0);
    }
    ctx.restore();
    // ---- 4. url types letter by letter under the logo; the caret blinks only while typing ----
    const url = urlOf(el, kit);
    const chars = Array.from(url);
    const kt = seg(ts, b.type[0], b.type[1]);
    const shown = Math.floor(kt * chars.length + 1e-9);
    if (chars.length && kin > 0.6) {
      const y = cy + maxH / 2 + 110;
      ctx.font = kit.font("body", 64, 700);
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const full = ctx.measureText(url).width;
      const x0 = W / 2 - full / 2;
      ctx.fillStyle = ink;
      ctx.fillText(chars.slice(0, shown).join(""), x0, y);
      const typing = kt > 0 && kt < 1;
      if (typing || (kt >= 1 && seg(ts, b.type[1], b.type[1] + 0.12) < 1)) {
        const cx = x0 + ctx.measureText(chars.slice(0, shown).join("")).width + 6;
        if (Math.floor(shown / 2) % 2 === 0 || typing) { ctx.fillStyle = hexA(el.bg === "primary" ? ink : c.primary, 1); ctx.fillRect(cx, y - 34, 6, 68); }
      }
    }
    // ---- optional tagline ----
    if (el.tagline) {
      const k = expoOut(seg(ts, b.tagline[0], b.tagline[1]));
      if (k > 0) {
        ctx.globalAlpha = k;
        ctx.font = kit.font("body", 40, 500);
        ctx.textAlign = "center";
        ctx.fillStyle = el.bg === "primary" ? ink : c.accent_on_paper;
        ctx.fillText(el.tagline, W / 2, cy + maxH / 2 + 110 + 92 + (1 - k) * 20);
      }
    }
  }
};
