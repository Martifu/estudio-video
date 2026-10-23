// Element "uiForm" of the motion library: formulario paso a paso que se llena solo y genera un pdf. One file = one element type (see engine/README.md "Cómo agregar un elemento").
// Timeline beats are in DESIGN seconds; the registry (index.js) scales them to [in, out]. Drawing is a pure function of the local time.
import { seg, lerp, expoOut, inOut, outBack, EXIT, statusColor, countText, CARD_W } from "../ui-motion.js";
import { rr, hexA, mix, fnt, text, shadow, noShadow, card, pill, checkMark, disc, checkBadge, coverImage, drawCursor, envelope, beginCard, radiusAt } from "./_kit.js";
import { UI_SCREEN, UI_SOURCE, FICTIONAL } from "./_fields.js";
const FORM_ITEM = (row) => {
  switch (row.kind) {
    case "option": return [{ key: "title", label: "Nombre", kind: "text" }, { key: "price", label: "Precio", kind: "text", opt: true }, { key: "meta", label: "Detalle", kind: "text", opt: true }, { key: "selected", label: "Elegido", kind: "bool" }, { key: "thumb", label: "Miniatura (ruta)", kind: "text", opt: true }];
    case "note": return [{ key: "text", label: "Texto", kind: "text" }];
    case "field": return [{ key: "label", label: "Nombre del campo", kind: "text" }, { key: "value", label: "Texto", kind: "text" }, { key: "icon", label: "Icono", kind: "select", options: [["calendar", "Calendario"], ["user", "Persona"], ["search", "Lupa"]], opt: true, ph: "sin icono" }, { key: "typed", label: "Se escribe letra por letra", kind: "bool" }];
    default: return [{ key: "label", label: "Nombre del campo", kind: "text" }, { key: "value", label: "Opción elegida", kind: "text" }];
  }
};
const FORM_ITEM_KINDS = [["option", "Opción con precio"], ["note", "Nota"], ["field", "Campo de texto"], ["select", "Lista desplegable"]];
const FORM_ITEM_BLANK = { option: () => ({ kind: "option", title: "Opción", price: "$0", selected: false }), note: () => ({ kind: "note", text: "Nota" }), field: () => ({ kind: "field", label: "Campo", value: "", typed: true }), select: () => ({ kind: "select", label: "Lista", value: "Opción" }) };

export const FORM = { h: 750, head: 150 };

/** Schedule of a form: which steps act, where the content scrolls, when the total counts and the button is clicked. */
export function formTimeline(el, mode) {
  const full = mode === "full";
  const steps = el.steps ?? [];
  const k = full ? { dwell: 0.35, act: 0.4, scroll: 0.6, type: 0.8, perChar: 0.04 } : { dwell: 0.25, act: 0.25, scroll: 0.35, type: 0, perChar: 0 };
  const info = steps.map((s) => {
    const its = s.items ?? [];
    return { sel: its.findIndex((i) => i.kind === "option" && i.selected), typed: its.findIndex((i) => i.kind === "field" && i.typed), pick: its.findIndex((i) => i.kind === "select") };
  }).map((x) => ({ ...x, actionable: x.sel >= 0 || x.typed >= 0 || x.pick >= 0 }));
  let cur = 0.9;
  const scrolls = []; // {to: step index | "tail", span}
  const act = (i, a) => {
    const x = info[i], s = steps[i], span = {};
    let end = a;
    if (x.sel >= 0) { span.border = [a, a + k.act]; span.check = [a + k.act * 0.75, a + k.act * 1.4]; end = Math.max(end, span.check[1]); }
    if (x.typed >= 0) {
      const it = s.items[x.typed], len = String(it.value ?? "").length;
      if (full && len) { const d = Math.min(k.type, k.perChar * len); span.type = [a + 0.1, a + 0.1 + d]; end = Math.max(end, span.type[1]); } else end = Math.max(end, a + k.act);
    }
    if (x.pick >= 0) { const a0 = span.type ? span.type[1] + 0.1 : a + 0.1; span.pick = [a0, a0 + k.act * 0.75]; end = Math.max(end, span.pick[1]); }
    return { ...span, at: a, end };
  };
  const nextAct = (from) => info.findIndex((x, i) => i > from && x.actionable);
  let first = info.findIndex((x) => x.actionable);
  const stepActs = {};
  if (first >= 0) {
    let i = first;
    for (;;) {
      const a = act(i, cur);
      stepActs[i] = a;
      const n = nextAct(i);
      const sc = [a.end - 0.05, a.end - 0.05 + k.scroll];
      scrolls.push({ to: n >= 0 ? `s${n}` : "tail", span: sc });
      cur = sc[1] + 0.05;
      if (n < 0) break;
      i = n;
    }
  } else { scrolls.push({ to: "tail", span: [0.9, 0.9 + k.scroll] }); cur = 0.9 + k.scroll + 0.05; }
  const lastScrollStart = scrolls.length ? scrolls[scrolls.length - 1].span[0] : 0.9;
  const total = el.total ? [lastScrollStart + 0.15, lastScrollStart + 0.15 + (full ? 0.8 : 0.5)] : null;
  const tailEnd = total ? total[1] : cur;
  const b = { blob: [0, 0.5], stagger: { start: 0.25, step: 0.06, dur: 0.4 }, steps: stepActs, scrolls, total };
  let end = tailEnd;
  if (el.button) {
    const click = tailEnd + (full ? 0.25 : 0.1);
    const load = el.button.loading ? (full ? 0.55 : 0.3) : 0;
    const done = click + load;
    Object.assign(b, { click, cursorIn: [Math.max(0.1, (total ? total[0] : lastScrollStart) + 0.2), click - 0.12], loading: [click, done], done, cursorOut: [done - 0.05, done + 0.25] });
    end = done;
    if (el.toast) { b.toast = [done + 0.05, done + 0.4]; end = b.toast[1]; }
    b.push = [b.total ? b.total[0] : lastScrollStart, click];
  } else b.push = [0.9, Math.max(1.5, tailEnd)];
  const hold = full ? 0.6 : 0.4;
  b.exit = [end + hold, end + hold + EXIT];
  return { Ld: b.exit[1], b };
}

const GAP = 20;
function formLayout(el, skin) {
  let y = 0;
  const items = [];
  const stepTops = [];
  let idx = 0;
  const push = (o) => { items.push({ ...o, y, idx: idx++ }); y += o.h; };
  (el.steps ?? []).forEach((s, si) => {
    stepTops[si] = y;
    push({ kind: "step", si, h: 142, step: s });
    for (const it of s.items ?? []) {
      if (it.kind === "option") push({ kind: "option", si, it, h: 190 + GAP });
      else if (it.kind === "note") push({ kind: "note", si, it, h: 56 + GAP / 2 });
      else if (it.kind === "field") push({ kind: "field", si, it, h: 48 + 92 + 26 });
      else if (it.kind === "select") push({ kind: "select", si, it, h: 48 + 92 + 26 });
    }
  });
  let totalY = null, buttonY = null;
  if (el.total) { y += 10; totalY = y; push({ kind: "total", h: 130 + 26 }); }
  if (el.button) { buttonY = y; push({ kind: "button", h: 120 }); }
  y += 40;
  void skin;
  return { items, stepTops, totalY, buttonY, contentH: y };
}
function drawForm(ctx, el, ts, tl, rect, env) {
  const { skin } = env, C = skin.colors, b = tl.b;
  const w = rect.w, h = rect.h;
  const E = envelope(tl, ts);
  const L = formLayout(el, skin);
  const viewH = h - FORM.head;
  const maxScroll = Math.max(0, L.contentH - viewH);
  let scroll = 0;
  for (const s of b.scrolls) {
    const target = s.to === "tail" ? maxScroll : Math.min(L.stepTops[Number(s.to.slice(1))] ?? maxScroll, maxScroll);
    scroll = lerp(scroll, Math.max(scroll, target), inOut(seg(ts, s.span[0], s.span[1])));
  }
  beginCard(ctx, el, tl, ts, rect, [w / 2, h / 2], E);
  const R = radiusAt(E, skin, w, h);
  card(ctx, 0, 0, w, h, R, skin);
  ctx.save();
  rr(ctx, 0, 0, w, h, R);
  ctx.clip();
  // scrolling layer (clipped to the viewport under the fixed header)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, FORM.head, w, viewH);
  ctx.clip();
  ctx.translate(0, FORM.head - scroll);
  const spans = b.steps;
  const press = b.click !== undefined ? Math.max(0, 1 - Math.abs(ts - b.click - 0.05) / 0.12) : 0;
  for (const it of L.items) {
    const k = expoOut(seg(ts, b.stagger.start + it.idx * b.stagger.step, b.stagger.start + it.idx * b.stagger.step + b.stagger.dur));
    if (k <= 0) continue;
    if (it.y + it.h - scroll < -20 || it.y - scroll > viewH + 20) continue;
    ctx.save();
    ctx.globalAlpha = E.alpha * k;
    ctx.translate(0, (1 - k) * 30);
    const sp = spans[it.si] ?? {};
    const x0 = 44, cw = w - 88;
    if (it.kind === "step") {
      const y = it.y;
      disc(ctx, x0 + 29, y + 34 + 29, 29, hexA(C.accent, 0.1));
      text(ctx, String(it.si + 1), x0 + 29, y + 34 + 30, { font: fnt(skin, 700, 30), color: C.accent, align: "center" });
      const title = String(it.step.title ?? "").toUpperCase();
      text(ctx, title, x0 + 78, y + 34 + 30, { font: fnt(skin, 700, 34), color: C.ink, ls: 1.4, maxW: cw - 78 - (it.step.aside ? 330 : 0) });
      if (it.step.aside) {
        ctx.font = fnt(skin, 600, 24);
        const aw = ctx.measureText(it.step.aside).width + 18 * 2 + 34;
        const ax = x0 + cw - aw, ay = y + 34 + 29;
        ctx.fillStyle = hexA(C.accent, 0.09);
        rr(ctx, ax, ay - 24, aw, 48, 16);
        ctx.fill();
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 2.4;
        ctx.lineCap = "round";
        rr(ctx, ax + 18, ay - 2, 20, 14, 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax + 22, ay - 2); ctx.lineTo(ax + 22, ay - 8); ctx.arc(ax + 28, ay - 8, 6, Math.PI, 0); ctx.lineTo(ax + 34, ay - 2); ctx.stroke();
        text(ctx, it.step.aside, ax + 18 + 34, ay + 1, { font: fnt(skin, 600, 24), color: C.accent });
      }
      ctx.fillStyle = C.line;
      ctx.fillRect(x0, y + 114, cw, 2);
    } else if (it.kind === "option") {
      const o = it.it, y = it.y, oh = 190;
      const bd = sp.border ? inOut(seg(ts, sp.border[0], sp.border[1])) : o.selected ? 1 : 0;
      const ck = sp.check ? seg(ts, sp.check[0], sp.check[1]) : o.selected ? 1 : 0;
      ctx.fillStyle = bd >= 1 || ck > 0 ? mix("#FFFFFF", C.accent, 0.04) : C.surface;
      rr(ctx, x0, y, cw, oh, skin.radius.row);
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 4;
      rr(ctx, x0 + 2, y + 2, cw - 4, oh - 4, skin.radius.row - 2);
      ctx.stroke();
      if (bd > 0) {
        const per = 2 * (cw - 4 + oh - 4);
        ctx.save();
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 5;
        ctx.setLineDash([per * bd, per]);
        ctx.beginPath();
        ctx.roundRect(x0 + 2.5, y + 2.5, cw - 5, oh - 5, skin.radius.row - 2);
        ctx.stroke();
        ctx.restore();
      }
      let tx = x0 + 28;
      if (o.thumb) {
        const img = env.img(o.thumb);
        if (img) coverImage(ctx, img, x0 + 20, y + 20, 150, 150, 18);
        tx = x0 + 20 + 150 + 26;
      }
      const maxT = x0 + cw - 100 - tx;
      text(ctx, o.title ?? "", tx, y + 50, { font: fnt(skin, 700, 40), color: C.accent, maxW: maxT });
      if (o.price !== undefined && o.price !== "") text(ctx, typeof o.price === "number" ? countText(o.price, 1, "money") : String(o.price), tx, y + 100, { font: fnt(skin, 600, 32), color: C.primary, maxW: maxT });
      if (o.meta) text(ctx, o.meta, tx, y + 144, { font: fnt(skin, 500, 26), color: C.faint, maxW: maxT });
      if (ck > 0) checkBadge(ctx, x0 + cw - 26 - 27, y + 26 + 27, 54, C.accent, outBack(ck));
    } else if (it.kind === "note") {
      text(ctx, it.it.text ?? "", x0 + 8, it.y + 24, { font: fnt(skin, 500, 28, true), color: C.faint, maxW: cw - 8 });
    } else if (it.kind === "field" || it.kind === "select") {
      const o = it.it, y = it.y;
      text(ctx, String(o.label ?? "").toUpperCase(), x0, y + 16, { font: fnt(skin, 600, 24), color: C.muted, ls: 1.4, maxW: cw });
      let dy = 0, active = false;
      if (it.kind === "select" && sp.pick) { const e = seg(ts, sp.pick[0], sp.pick[1]); dy = (1 - outBack(e)) * -30; active = e > 0; }
      const by = y + 48 + dy;
      if (it.kind === "field" && sp.type) active = ts >= sp.type[0] && ts < sp.type[1] + 0.25;
      ctx.fillStyle = C.surface;
      rr(ctx, x0, by, cw, 92, 22);
      ctx.fill();
      ctx.strokeStyle = active ? C.accent : C.line;
      ctx.lineWidth = active ? 3 : 2;
      rr(ctx, x0 + 1, by + 1, cw - 2, 90, 22);
      ctx.stroke();
      let tx = x0 + 26;
      if (it.kind === "field" && o.icon) { fieldIcon(ctx, o.icon, tx + 18, by + 46, 36, C.muted); tx += 36 + 18; }
      let val = String(o.value ?? "");
      if (it.kind === "field" && o.typed && sp.type) {
        const n = Math.round(val.length * seg(ts, sp.type[0], sp.type[1]));
        val = val.slice(0, n);
        const tw = text(ctx, val, tx, by + 47, { font: fnt(skin, 500, 32), color: C.ink, maxW: cw - (tx - x0) - 40 });
        if (ts >= sp.type[0] - 0.1 && ts < sp.type[1] + 0.2 && Math.floor(ts * 4) % 2 === 0) { ctx.fillStyle = C.accent; ctx.fillRect(tx + tw + 3, by + 28, 3, 38); }
      } else text(ctx, val, tx, by + 47, { font: fnt(skin, 500, 32), color: C.ink, maxW: cw - (tx - x0) - 80 });
      if (it.kind === "select") {
        ctx.strokeStyle = C.faint;
        ctx.lineWidth = 3.4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(x0 + cw - 58, by + 40); ctx.lineTo(x0 + cw - 46, by + 52); ctx.lineTo(x0 + cw - 34, by + 40); ctx.stroke();
      }
    } else if (it.kind === "total") {
      const ty = it.y;
      ctx.fillStyle = C.panel;
      rr(ctx, x0, ty, cw, 130, skin.radius.row);
      ctx.fill();
      text(ctx, el.total.label ?? "Total", x0 + 34, ty + 66, { font: fnt(skin, 600, 34), color: C.ink });
      const ck = b.total ? expoOut(seg(ts, b.total[0], b.total[1])) : 1;
      text(ctx, countText(el.total.value, ck, "money"), x0 + cw - 34, ty + 66, { font: fnt(skin, 700, 52), color: C.accent, align: "right" });
    } else if (it.kind === "button") {
      const by = it.y, bt = el.button;
      const loading = b.loading && ts >= b.loading[0] && ts < b.loading[1] && bt.loading;
      const done = b.done !== undefined && ts >= b.done && bt.done;
      ctx.save();
      const cx = x0 + cw / 2, cy = by + 60;
      ctx.translate(cx, cy);
      ctx.scale(1 - 0.04 * press, 1 - 0.04 * press);
      ctx.translate(-cx, -cy);
      shadow(ctx, "rgba(0,0,0,0.30)", 36, 18);
      ctx.fillStyle = done ? mix(C.success, "#000000", 0.12) : C.ink;
      rr(ctx, x0, by, cw, 120, skin.radius.row);
      ctx.fill();
      noShadow(ctx);
      const label = done ? bt.done : loading ? bt.loading : bt.label ?? "";
      ctx.font = fnt(skin, 600, 36);
      const lw = ctx.measureText(label).width;
      const iw = 38 + 14;
      let lx = cx - (lw + iw) / 2;
      if (loading) {
        ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(lx + 19, cy, 17, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.beginPath(); const a0 = (ts * 720 * Math.PI) / 180; ctx.arc(lx + 19, cy, 17, a0, a0 + Math.PI * 0.55); ctx.stroke();
      } else if (done) checkMark(ctx, lx + 19, cy, 40, "#fff", 5);
      else docIcon(ctx, lx + 19, cy, 38, "#fff");
      text(ctx, label, lx + iw, cy + 1, { font: fnt(skin, 600, 36), color: "#fff" });
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.restore(); // scroll clip
  // fixed header
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, w, FORM.head);
  ctx.fillStyle = C.line;
  ctx.fillRect(0, FORM.head - 2, w, 2);
  const ha = expoOut(seg(ts, 0.1, 0.45));
  ctx.globalAlpha = E.alpha * ha;
  const tw = text(ctx, el.title ?? "", 40, 62, { font: fnt(skin, 700, 50), color: C.ink, maxW: el.badge ? 560 : 800 });
  if (el.badge) pill(ctx, skin, String(el.badge), 40 + tw + 18, 62, { bg: statusColor(skin, { text: el.badge }) });
  if (el.subtitle) text(ctx, el.subtitle, 40, 112, { font: fnt(skin, 500, 28), color: C.faint, maxW: 800 });
  ctx.restore(); // clip
  ctx.restore(); // transform
  // toast (separate layer, like the approved mockup)
  if (el.toast && b.toast) {
    const d = seg(ts, b.toast[0], b.toast[1]);
    if (d > 0) {
      ctx.save();
      ctx.globalAlpha = (1 - inOut(E.ex));
      ctx.font = fnt(skin, 700, 38);
      const tw2 = ctx.measureText(String(el.toast)).width + 36 + 58 + 20 + 36 - 36;
      const tx = rect.x + rect.w / 2, ty = rect.y + 270;
      ctx.translate(tx, ty + (1 - expoOut(d)) * 40);
      const sc = lerp(0.6, 1, outBack(d));
      ctx.scale(sc, sc);
      shadow(ctx, "rgba(0,0,0,0.35)", 50, 24);
      ctx.fillStyle = C.surface;
      rr(ctx, -tw2 / 2, -48, tw2, 96, 28);
      ctx.fill();
      noShadow(ctx);
      checkBadge(ctx, -tw2 / 2 + 36 + 29, 0, 58, C.success);
      text(ctx, String(el.toast), -tw2 / 2 + 36 + 58 + 20, 2, { font: fnt(skin, 700, 38), color: C.ink });
      ctx.restore();
    }
  }
  if (tl.cursor && b.click !== undefined && L.buttonY !== null) {
    const by = rect.y + FORM.head + L.buttonY - maxScroll + 60; // the button is at the bottom once scrolled to the tail
    const path = [[b.cursorIn[0], 1080 + 70, rect.y + h + 160], [b.cursorIn[1], rect.x + w / 2, by]];
    const a = ts < b.cursorIn[0] ? 0 : 1 - seg(ts, b.cursorOut[0], b.cursorOut[1]);
    drawCursor(ctx, skin, ts, path, b.click, a * (1 - inOut(E.ex)), "#ffffff");
  }
}
function docIcon(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const s = size / 24;
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(14, 2); ctx.lineTo(6, 2); ctx.arcTo(4, 2, 4, 4, 2); ctx.lineTo(4, 20); ctx.arcTo(4, 22, 6, 22, 2); ctx.lineTo(18, 22); ctx.arcTo(20, 22, 20, 20, 2); ctx.lineTo(20, 8); ctx.closePath();
  ctx.moveTo(14, 2); ctx.lineTo(14, 8); ctx.lineTo(20, 8); ctx.moveTo(16, 13); ctx.lineTo(8, 13); ctx.moveTo(16, 17); ctx.lineTo(8, 17);
  ctx.stroke();
  ctx.restore();
}
function fieldIcon(ctx, name, cx, cy, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.06;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const s = size / 24;
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.beginPath();
  if (name === "calendar") { ctx.roundRect(3, 5, 18, 16, 2); ctx.moveTo(16, 3); ctx.lineTo(16, 7); ctx.moveTo(8, 3); ctx.lineTo(8, 7); ctx.moveTo(3, 10); ctx.lineTo(21, 10); }
  else if (name === "user") { ctx.arc(12, 8, 4, 0, Math.PI * 2); ctx.moveTo(4, 21); ctx.quadraticCurveTo(12, 9, 20, 21); }
  else { ctx.arc(10.5, 10.5, 6.5, 0, Math.PI * 2); ctx.moveTo(15.5, 15.5); ctx.lineTo(21, 21); }
  ctx.stroke();
  ctx.restore();
}


export default {
  type: "uiForm",
  category: "Pantallas",
  family: "ui",
  placement: "pinned", // the original product screens keep their slot (no face-aware default)
  captions: "option",
  label: "Formulario",
  timelineLabel: "Pantalla: formulario",
  description: "Formulario paso a paso que se llena solo y genera un PDF",
  brief: [
    "Qué: un formulario que se llena solo (cotizador, alta, checkout) y termina en un resultado ('Cotización generada').",
    "Cuándo: la voz explica un proceso de varios pasos que la app resuelve. No usar: si no hay proceso (uiStat) o si es solo un botón (buttonTap).",
    "Coreografía: pasos numerados que avanzan, opción seleccionada, fecha que se escribe a 15-22 caracteres/s, total que cuenta, clic en el botón → 'Generando…' → listo.",
    "Gusto: la misma unidad / cliente que la pantalla anterior; clic y cambio de pantalla en el mismo cuadro; la cámara solo empuja hacia adelante.",
    "Datos: textos y cifras de la captura del cotizador real o del MCP (get_project); source obligatorio."
  ].join("\n"),
  icon: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h3",
  textKey: "title",
  defaults: (t, end) => ({
    type: "uiForm", in: t, out: Math.min(t + 6.5, end), title: "Cotizar 304", badge: "Disponible", subtitle: "Torre Aurora | Nivel 3",
    steps: [
      { title: "Selecciona modelo", aside: "Asignado por unidad", items: [{ kind: "option", title: "Modelo B", price: "$2,960,000", meta: "2 Hab · 2 Baños · 68 m²", selected: true }] },
      { title: "Equipamientos", items: [{ kind: "note", text: "Sin equipamientos adicionales." }] },
      { title: "Esquema y fecha", items: [{ kind: "field", label: "Fecha de cotización", value: "22 de octubre de 2026", icon: "calendar", typed: true }, { kind: "select", label: "Esquema de pago", value: "APARTADO 10%" }] }
    ],
    total: { label: "Total", value: "$2,960,000" }, button: { label: "Generar cotización", loading: "Generando PDF…", done: "Cotización generada" }, toast: "Cotización lista · PDF", source: { ...FICTIONAL }
  }),
  fields: [
    { key: "title", label: "Título", kind: "text" },
    { key: "badge", label: "Etiqueta junto al título", kind: "text", opt: true },
    { key: "subtitle", label: "Subtítulo", kind: "text", opt: true },
    { key: "steps", label: "Pasos (1 a 5)", kind: "blocks", prop: "steps", min: 1, max: 5, blank: () => ({ title: "Nuevo paso", items: [{ kind: "note", text: "Nota" }] }), name: (r) => r.title || "Paso",
      fields: () => [{ key: "title", label: "Título del paso", kind: "text" }, { key: "aside", label: "Aviso al lado (opcional)", kind: "text", opt: true }],
      children: { prop: "items", label: "Contenido del paso", max: 6, kinds: FORM_ITEM_KINDS, blank: FORM_ITEM_BLANK, fields: FORM_ITEM, name: (r) => r.title ?? r.label ?? r.text ?? "Elemento" } },
    { key: "total.label", label: "Texto del total", kind: "text", opt: true },
    { key: "total.value", label: "Total (ej. $2,960,000)", kind: "text", opt: true },
    { key: "button.label", label: "Botón", kind: "text", opt: true },
    { key: "button.loading", label: "Botón mientras trabaja", kind: "text", opt: true, ph: "Generando…" },
    { key: "button.done", label: "Botón al terminar", kind: "text", opt: true, ph: "Listo" },
    { key: "toast", label: "Aviso al terminar (opcional)", kind: "text", opt: true }
  ],
  screen: UI_SCREEN(true),
  source: UI_SOURCE,
  pin: null,
  fullMin: 4.8,
  cursor: (el) => !!el.button,
  timeline: formTimeline,
  size: (el) => ({ w: CARD_W, h: FORM.h }),
  imageRefs(el, add) {
    for (const s of el.steps ?? []) for (const it of s.items ?? []) if (it.kind === "option") add(it.thumb, "miniatura");
  },
  showsNumbers: (el) => !!el.total || (el.steps ?? []).some((s) => (s.items ?? []).some((i) => i.kind === "option" && i.price !== undefined && i.price !== "")),
  validate(el, tag) {
    const errors = [], warnings = [];
    const n = (el.steps ?? []).length;
    if (n < 1 || n > 5) errors.push(`${tag}: necesita de 1 a 5 pasos (tiene ${n})`);
    if ((el.steps ?? []).some((s) => !s?.title || !Array.isArray(s.items))) errors.push(`${tag}: cada paso necesita título y contenido`);
    return { errors, warnings };
  },
  texts(el, add) {
    add(el.title); add(el.subtitle); add(el.toast); add(el.button?.label);
    for (const st of el.steps ?? []) { add(st.title); add(st.aside); for (const i of st.items ?? []) { add(i.title); add(i.meta); add(i.text); add(i.label); } }
  },
  events(el, rect, { beats: B, cursor, add }) {
    add(B.blob[0], "pop");
    for (const s of B.scrolls) add(s.span[0], "whoosh");
    if (cursor && B.click !== undefined) add(B.click, "click");
    if (B.done !== undefined && (el.button?.done || el.toast)) add(B.toast ? B.toast[0] : B.done, "notify");
  },
  draw: (ctx, el, t, env) => drawForm(ctx, el, env.ts, env.tl, env.rect, env),
};
