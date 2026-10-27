// ONE contextual inspector: shows only the properties of what is selected (element, caption segment, track, platform zones);
// nothing selected = a short video summary. Element forms come from TYPES[type].fields in schema.js.
import { S, on, commit, commitDoc, selected, selIds, byId, replaceEl, selectElement, selectCaption, selectTrack, selectZones, clearSel, newId, effZones, isDirty, clone, toast } from "./store.js";
import { TYPES, isPinned, supportsPin, SPEED_TYPES, windowOf, ZONE_PRESETS, presetOf, zonesOf, DEFAULT_ZONES, CAPTION_DEFAULTS } from "./schema.js";
import * as caps from "./captions.js";
import * as ops from "./ops.js";
import * as edlui from "./edl-ui.js";
import * as sfxlane from "./sfxlane.js";
import { X, musicSections, voiceSections, videoSections, sfxSections, openRequests, runAction } from "./extras.js";
import { rstate, startRender } from "./render.js";
import { logoPanel, ctaPanel, onRefresh } from "./logo.js";
import { selectLogo, selectCta } from "./store.js";
import { h, $ } from "./dom.js";
import { api } from "./api.js";
import { section, field, slider, numberBox, textBox, checkBox, selectBox, note } from "./ui.js";

const body = () => $("inspBody");

function edit(id, key, fn) { commit(replaceEl(id, (c) => { fn(c); return c; }), `ins:${id}:${key}`, "inspector"); }


// ---------- dotted paths ("source.kind", "total.value"): ui elements keep small nested objects ----------
const getPath = (o, path) => path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
function setPath(o, path, val) {
  const ks = path.split(".");
  let a = o;
  for (const k of ks.slice(0, -1)) a = a[k] && typeof a[k] === "object" ? a[k] : (a[k] = {});
  a[ks[ks.length - 1]] = val;
}
function delPath(o, path) {
  const ks = path.split(".");
  const chain = [o];
  for (const k of ks.slice(0, -1)) { const n = chain[chain.length - 1]?.[k]; if (!n || typeof n !== "object") return; chain.push(n); }
  delete chain[chain.length - 1][ks[ks.length - 1]];
  for (let i = chain.length - 1; i > 0; i -= 1) if (!Object.keys(chain[i]).length) delete chain[i - 1][ks[i - 1]];
}

// ---------- element form controls ----------
function numInput(el, key, f) {
  const v = getPath(el, key);
  return field(f.label, h("input", { type: "number", step: f.step ?? 1, min: f.min, max: f.max, placeholder: f.ph ?? "", value: v ?? "",
    oninput: (e) => edit(el.id, key, (c) => { const raw = e.target.value; if (raw === "") { if (f.opt) delPath(c, key); } else setPath(c, key, Number(raw)); }) }));
}
function control(el, f) {
  const v = getPath(el, f.key);
  switch (f.kind) {
    case "text":
      return field(f.label, h("input", { type: "text", value: v ?? "", placeholder: f.ph ?? "", oninput: (e) => edit(el.id, f.key, (c) => { if (e.target.value === "" && f.opt) delPath(c, f.key); else setPath(c, f.key, e.target.value); }) }));
    case "number":
      if (f.max != null || f.key === "size" || f.key === "rotate") return slider({ label: f.label, value: v, min: f.min ?? -45, max: f.max ?? (f.key === "size" ? 320 : 45), step: f.step ?? 1, ph: f.ph ?? "", opt: !!f.opt, onInput: (val) => edit(el.id, f.key, (c) => { if (val === null) delPath(c, f.key); else setPath(c, f.key, val); }) });
      return numInput(el, f.key, f);
    case "select":
      return field(f.label, h("select", { onchange: (e) => edit(el.id, f.key, (c) => { if (e.target.value === "") delPath(c, f.key); else setPath(c, f.key, e.target.value); }) },
        f.opt ? h("option", { value: "", selected: v === undefined }, `(${f.ph ?? "por defecto"})`) : null, f.options.map(([val, lab]) => h("option", { value: val, selected: v === val }, lab))));
    case "list":
      return field(f.label, h("textarea", { oninput: (e) => edit(el.id, f.key, (c) => { const arr = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean); if (arr.length) setPath(c, f.key, arr); else delPath(c, f.key); }) }, (v ?? []).join("\n")), true);
    case "multi": { // array of option values, in the order they were ticked (uiIcons: which platform logos, left to right)
      const cur = Array.isArray(v) ? v : [];
      return field(f.label, h("div", { class: "multi" }, f.options.map(([val, lab]) => h("label", { class: "check" },
        h("input", { type: "checkbox", checked: cur.includes(val), onchange: (e) => edit(el.id, f.key, (c) => {
          let a = Array.isArray(getPath(c, f.key)) ? [...getPath(c, f.key)] : [];
          if (e.target.checked) { if (!a.includes(val)) a.push(val); } else a = a.filter((x) => x !== val);
          if (f.max && a.length > f.max) a = a.slice(-f.max); // over the limit: the oldest tick drops
          if (f.min && !a.length) a = [val]; // never empty
          setPath(c, f.key, a);
        }) }), lab))));
    }
    case "index": return indexSelect(el, f, v);
    case "blocks": return blocksEditor(el, f);
    case "point": {
      if (el.track?.length) return field(f.label, h("span", { class: "muted" }, "definido por track (arrastra en el cuadro)"));
      const pair = h("div", { class: "pair" });
      for (const ax of ["x", "y"]) pair.append(h("input", { type: "number", step: 1, value: v?.[ax] ?? 0, title: ax, oninput: (e) => edit(el.id, `${f.key}.${ax}`, (c) => { c[f.key] = { ...(c[f.key] ?? { x: 0, y: 0 }), [ax]: Number(e.target.value) }; }) }));
      return field(f.label, pair);
    }
    case "rows": return listEditor(el, f, "rows", () => ({ label: "Dato", value: "Valor", icon: "check" }), (row, i) => [
      h("input", { type: "text", value: row.label ?? "", placeholder: "Etiqueta", oninput: (e) => edit(el.id, `r${i}l`, (c) => { c.rows[i].label = e.target.value; }) }),
      h("input", { type: "text", value: row.value ?? "", placeholder: "Valor", oninput: (e) => edit(el.id, `r${i}v`, (c) => { c.rows[i].value = e.target.value; }) }),
      h("select", { onchange: (e) => edit(el.id, `r${i}i`, (c) => { c.rows[i].icon = e.target.value; }) }, ["check", "dot"].map((o) => h("option", { value: o, selected: (row.icon ?? "check") === o }, o === "check" ? "✓" : "•")))
    ]);
    case "chatItems": return listEditor(el, f, "items", () => ({ from: "client", text: "Mensaje", at: Math.min(S.t, S.duration) }), (it, i) => [
      h("select", { onchange: (e) => edit(el.id, `c${i}f`, (c) => { c.items[i].from = e.target.value; }) }, [["client", "Cliente"], ["rex", "Rex"]].map(([val, lab]) => h("option", { value: val, selected: it.from === val }, lab))),
      h("input", { type: "text", value: it.text ?? "", oninput: (e) => edit(el.id, `c${i}t`, (c) => { c.items[i].text = e.target.value; }) }),
      h("input", { type: "number", step: 0.05, value: it.at ?? 0, title: "at (s)", oninput: (e) => edit(el.id, `c${i}a`, (c) => { c.items[i].at = Number(e.target.value); }) })
    ], "chat");
    case "stackItems": return listEditor(el, f, "items", () => ({ text: "NUEVO", at: Math.min(S.t, S.duration) }), (it, i) => [
      h("input", { type: "text", value: it.text ?? "", oninput: (e) => edit(el.id, `s${i}t`, (c) => { c.items[i].text = e.target.value; }) }),
      h("input", { type: "number", step: 0.05, value: it.at ?? 0, title: "at (s)", oninput: (e) => edit(el.id, `s${i}a`, (c) => { c.items[i].at = Number(e.target.value); }) })
    ], "stack");
    case "product": return field(f.label, productSelect(v, (val) => edit(el.id, f.key, (c) => { c[f.key] = val; delete c.image; }), true));
    case "productImage": {
      const p = productDoc().products.find((x) => x.id === el.product);
      if (!p || (p.images?.length ?? 0) < 2) return field(f.label, h("span", { class: "muted" }, p ? (p.images?.length ? "una sola foto" : "este producto no tiene fotos") : "elige un producto"));
      return field(f.label, imageSelect(p, v, (val) => edit(el.id, f.key, (c) => { if (val) c[f.key] = val; else delete c[f.key]; })));
    }
    case "bool": {
      const on = f.ph === "sí" ? v !== false : v === true;
      return field(f.label, h("label", { class: "check" }, h("input", { type: "checkbox", checked: on, onchange: (e) => edit(el.id, f.key, (c) => { if (f.ph === "sí") { if (e.target.checked) delPath(c, f.key); else setPath(c, f.key, false); } else if (e.target.checked) setPath(c, f.key, true); else delPath(c, f.key); }) }), on ? "sí" : "no"));
    }
    case "slides": return slidesEditor(el, f);
    default: return null;
  }
}

// "Which row?" picker for ui elements (select / highlight / kanban columns): lists the rows by name, stores the 0-based index.
function indexSelect(el, f, v) {
  const rows = getPath(el, f.of) ?? [];
  return field(f.label, h("select", { onchange: (e) => edit(el.id, f.key, (c) => { if (e.target.value === "") delPath(c, f.key); else setPath(c, f.key, Number(e.target.value)); }) },
    f.required ? null : h("option", { value: "", selected: !Number.isInteger(v) }, "(ninguna)"),
    rows.map((r, i) => h("option", { value: i, selected: v === i }, `${i + 1}. ${f.name?.(r) ?? ""}`))));
}
// Editable list of rows / steps / items of a ui element: one small block per entry with its own inputs, move up / down, remove, add.
// spec: { prop (dotted path of the array), scalar?, min, max, blank(), fields(row) -> [field specs with dotted keys relative to the row],
//         name(row), kinds? (+ blank as {kind: fn}), children? (same spec for a nested array inside every row) }
function blocksEditor(el, spec, base = null, depth = 0) {
  const path = (base ? `${base}.` : "") + spec.prop;
  const list = getPath(el, path) ?? [];
  const box = h("div", { class: depth ? "ui-blocks nested" : "ui-blocks" });
  const mutate = (key, fn, struct = false) => commit(replaceEl(el.id, (c) => { let a = getPath(c, path); if (!a) { setPath(c, path, []); a = getPath(c, path); } fn(a, c); return c; }), struct ? null : `ins:${el.id}:${key}`, struct ? "inspector-struct" : "inspector");
  list.forEach((row, i) => {
    const inputs = [];
    for (const f of spec.fields(row)) {
      const rowKey = `${path}.${i}${f.scalar ? "" : `.${f.key}`}`;
      const cur = f.scalar ? row : getPath(row, f.key);
      const set = (val) => mutate(rowKey, (a) => { if (f.scalar) a[i] = val; else if (val === undefined) delPath(a[i], f.key); else setPath(a[i], f.key, val); });
      if (f.kind === "select") inputs.push(field(f.label, h("select", { onchange: (e) => set(e.target.value === "" ? undefined : e.target.value) }, f.opt ? h("option", { value: "", selected: cur === undefined }, `(${f.ph ?? "por defecto"})`) : null, f.options.map(([val, lab]) => h("option", { value: val, selected: cur === val }, lab)))));
      else if (f.kind === "bool") inputs.push(field(f.label, h("label", { class: "check" }, h("input", { type: "checkbox", checked: cur === true, onchange: (e) => set(e.target.checked ? true : undefined) }), cur === true ? "sí" : "no")));
      else if (f.kind === "number") inputs.push(field(f.label, h("input", { type: "number", step: f.step ?? 1, min: f.min, max: f.max, value: cur ?? "", oninput: (e) => set(e.target.value === "" ? undefined : Number(e.target.value)) })));
      else inputs.push(field(f.label, h("input", { type: "text", value: cur ?? "", placeholder: f.ph ?? "", oninput: (e) => {
        const raw = e.target.value;
        if (raw === "" && f.opt) return set(undefined);
        // numbers typed into a money field stay numbers (the engine counts them up exactly like text)
        set(f.key === "value" && /^-?\d+(\.\d+)?$/.test(raw.trim()) && typeof cur === "number" ? Number(raw) : raw);
      } })));
    }
    const kids = spec.children ? blocksEditor(el, spec.children, `${path}.${i}`, depth + 1) : null;
    box.append(h("div", { class: "ui-block" },
      h("div", { class: "ui-block-top" }, h("span", { class: "muted tiny" }, `${i + 1}. ${spec.name?.(row) ?? ""}`),
        h("button", { class: "small", title: "Subir", disabled: i === 0, onclick: () => mutate("up", (a) => { a.splice(i - 1, 0, a.splice(i, 1)[0]); }, true) }, "↑"),
        h("button", { class: "small", title: "Bajar", disabled: i === list.length - 1, onclick: () => mutate("dn", (a) => { a.splice(i + 1, 0, a.splice(i, 1)[0]); }, true) }, "↓"),
        h("button", { class: "small danger", title: "Quitar", disabled: list.length <= (spec.min ?? 0), onclick: () => mutate("rm", (a, c) => { a.splice(i, 1); fixIndexes(c, path, i); }, true) }, "×")),
      ...inputs, kids));
  });
  if (spec.kinds) {
    const sel = h("select", {}, spec.kinds.map(([k, lab]) => h("option", { value: k }, `+ ${lab}`)));
    box.append(h("div", { class: "ui-add" }, sel, h("button", { class: "small", disabled: list.length >= (spec.max ?? 99), onclick: () => mutate("add", (a) => { a.push(spec.blank[sel.value]()); }, true) }, "Agregar")));
  } else box.append(h("button", { class: "small", disabled: list.length >= (spec.max ?? 99), onclick: () => mutate("add", (a) => { a.push(spec.blank()); }, true) }, "+ Agregar"));
  return depth ? h("div", { class: "field col" }, h("label", {}, spec.label), box) : h("div", { class: "field col" }, h("label", {}, spec.label), box);
}
// Removing / moving a row must not leave select / highlight / from / to pointing at a row that is gone.
function fixIndexes(c, path, removed) {
  for (const k of ["select", "highlight", "from", "to"]) {
    const sib = path.split(".").length === 1;
    if (!sib || c[k] === undefined) continue;
    const arr = c[path] ?? [];
    if (!["select", "highlight", "from", "to"].includes(k)) continue;
    if ((k === "select" && path !== "rows") || (k === "highlight" && path !== "rows") || ((k === "from" || k === "to") && path !== "columns")) continue;
    if (c[k] === removed) { if (k === "from" || k === "to") c[k] = Math.min(removed, Math.max(0, arr.length - 1)); else delete c[k]; } else if (c[k] > removed) c[k] -= 1;
  }
}
const productDoc = () => S.products?.doc ?? { products: [] };
function productSelect(value, onPick, withHint) {
  const list = productDoc().products;
  if (!list.length) return h("span", { class: "muted" }, "Primero agrega un producto (botón Productos arriba).");
  return h("select", { onchange: (e) => onPick(e.target.value) }, !list.some((p) => p.id === value) ? h("option", { value: "", selected: true }, withHint ? "(elige un producto)" : "(elige)") : null,
    list.map((p) => h("option", { value: p.id, selected: p.id === value }, p.name)));
}
function imageSelect(p, value, onPick) {
  return h("select", { onchange: (e) => onPick(e.target.value) }, h("option", { value: "", selected: !value }, "(la principal)"),
    p.images.map((im, i) => h("option", { value: im.id, selected: im.id === value }, `Foto ${i + 1}${im.cutout ? " (sin fondo)" : ""}`)));
}
function slidesEditor(el, f) {
  const box = h("div", {});
  (el.slides ?? []).forEach((sl, i) => {
    const p = productDoc().products.find((x) => x.id === sl.product);
    box.append(h("div", { class: "pp-slide" },
      h("div", { class: "pp-slide-top" }, h("span", { class: "muted tiny" }, `${i + 1}`),
        productSelect(sl.product, (val) => edit(el.id, `sl${i}p`, (c) => { c.slides[i].product = val; delete c.slides[i].image; }), false),
        h("button", { class: "small", title: "Subir", disabled: i === 0, onclick: () => commit(replaceEl(el.id, (c) => { c.slides.splice(i - 1, 0, c.slides.splice(i, 1)[0]); return c; }), null, "inspector-struct") }, "↑"),
        h("button", { class: "small danger", title: "Quitar del carrusel", onclick: () => commit(replaceEl(el.id, (c) => { c.slides.splice(i, 1); return c; }), null, "inspector-struct") }, "×")),
      p && p.images.length > 1 ? imageSelect(p, sl.image, (val) => edit(el.id, `sl${i}i`, (c) => { if (val) c.slides[i].image = val; else delete c.slides[i].image; })) : null,
      h("input", { type: "text", placeholder: "Texto (opcional; si no, el nombre)", value: sl.caption ?? "", oninput: (e) => edit(el.id, `sl${i}c`, (c) => { if (e.target.value) c.slides[i].caption = e.target.value; else delete c.slides[i].caption; }) }),
      h("input", { type: "text", placeholder: "Precio distinto (opcional)", value: sl.price ?? "", oninput: (e) => edit(el.id, `sl${i}r`, (c) => { const t = e.target.value.trim().replace(/[$\s]/g, "").replace(/,/g, ""); if (!t) delete c.slides[i].price; else c.slides[i].price = Number.isFinite(Number(t)) ? Number(t) : e.target.value; }) })));
  });
  const list = productDoc().products;
  box.append(h("button", { class: "small", disabled: (el.slides?.length ?? 0) >= (f.max ?? 8) || !list.length, title: !list.length ? "Primero agrega un producto" : "Agregar otro producto al carrusel",
    onclick: () => commit(replaceEl(el.id, (c) => { (c.slides ??= []).push({ product: (list.find((p) => !c.slides.some((s) => s.product === p.id)) ?? list[0]).id }); return c; }), null, "inspector-struct") }, "+ Agregar producto"));
  return h("div", { class: "field col" }, h("label", {}, f.label), box);
}
function listEditor(el, f, prop, blank, cells, cls = "rows") {
  const list = el[prop] ?? [];
  const box = h("div", {});
  list.forEach((row, i) => box.append(h("div", { class: `listrow ${cls}` }, ...cells(row, i),
    h("button", { class: "small danger", title: "Quitar", onclick: () => commit(replaceEl(el.id, (c) => { c[prop].splice(i, 1); return c; }), null, "inspector-struct") }, "×"))));
  box.append(h("button", { class: "small", disabled: list.length >= (f.max ?? 99), onclick: () => commit(replaceEl(el.id, (c) => { (c[prop] ??= []).push(blank()); return c; }), null, "inspector-struct") }, "+ Agregar"));
  return h("div", { class: "field col" }, h("label", {}, f.label), box);
}

// ---------- panels ----------
function elementPanel() {
  const ids = selIds();
  const out = [];
  if (ids.length > 1) {
    out.push(h("h2", {}, `${ids.length} elementos`), note("Shift+clic suma o quita. Arrastra uno en la línea de tiempo para moverlos juntos."),
      h("div", { class: "btnrow" }, h("button", { onclick: () => ops.duplicate(ids) }, "Duplicar"), h("button", { onclick: () => ops.toggleHide(ids) }, "Ocultar / mostrar"), h("button", { class: "danger", onclick: () => ops.remove(ids) }, "Eliminar")));
    return out;
  }
  const el = selected();
  if (!el) return [videoPanel()];
  const spec = TYPES[el.type];
  const i = S.motion.findIndex((e) => e.id === el.id);
  out.push(
    h("h2", {}, spec?.label ?? el.type, h("span", { class: "muted tiny" }, ` ${el.type}`)),
    h("div", { class: "btnrow" }, h("button", { onclick: () => ops.duplicate([el.id]) }, "Duplicar"), h("button", { onclick: () => ops.toggleHide([el.id]) }, el.hidden ? "Mostrar" : "Ocultar"), h("button", { class: "danger", onclick: () => ops.remove([el.id]) }, "Eliminar"))
  );
  const content = (spec?.fields ?? []).map((f) => control(el, f)).filter(Boolean);
  if (content.length) out.push(section("Contenido", content, { key: `c-${el.type}` }));
  if (spec?.screen) out.push(section("Pantalla", spec.screen.map((f) => control(el, f)).filter(Boolean), { key: "ui-screen" }));
  if (spec?.source) out.push(section("Fuente de los datos", [note("Si la pantalla muestra cifras, di de dónde salen: la revisión lo pide antes de publicar."), ...spec.source.map((f) => control(el, f))], { key: "ui-source" }));
  const time = [];
  if (spec?.timing === "inOut") {
    time.push(numberBox({ label: "Entra (s)", value: el.in, min: 0, onInput: (v) => edit(el.id, "in", (c) => { c.in = v ?? 0; }) }), numberBox({ label: "Sale (s)", value: el.out, min: 0, onInput: (v) => edit(el.id, "out", (c) => { c.out = v ?? 0; }) }));
  } else if (spec?.timing === "items") time.push(numberBox({ label: "Sale (s)", value: el.out, min: 0, onInput: (v) => edit(el.id, "out", (c) => { c.out = v ?? 0; }) }));
  if (SPEED_TYPES.includes(el.type)) time.push(slider({ label: "Velocidad ×", value: el.speed ?? 1, min: 0.25, max: 3, step: 0.05, onInput: (v) => edit(el.id, "speed", (c) => { if (v === null || Math.abs(v - 1) < 0.001) delete c.speed; else c.speed = v; }) }), note("Acelera (>1) o suaviza (<1) la entrada y la salida."));
  if (time.length) out.push(section("Tiempo", time, { key: "t" }));
  if (supportsPin(el) || el.type === "panel") {
    const rep = S.plan?.report.elements[i];
    const pinned = isPinned(el);
    const pos = [field("Estado", h("span", {}, h("span", { class: `chip-state ${pinned ? "pinned" : "auto"}` }, pinned ? "fijado" : "auto"), h("span", { class: "muted" }, pinned ? " x/y propios: no se recoloca solo" : rep?.slot ? ` en ${rep.slot}` : "")))];
    if (supportsPin(el)) {
      const pair = h("div", { class: "pair" });
      for (const ax of ["x", "y"]) pair.append(h("input", { type: "number", step: 1, title: ax, placeholder: rep?.rect ? String(Math.round(ax === "x" ? rep.rect.x : rep.rect.y)) : ax, value: el[ax] ?? "", oninput: (e) => edit(el.id, `pos${ax}`, (c) => { if (e.target.value === "") delete c[ax]; else c[ax] = Number(e.target.value); }) }));
      pos.push(field("x / y (px)", pair), h("button", { disabled: !pinned, onclick: () => ops.unpin(el.id) }, "Soltar posición"));
    }
    out.push(section("Posición", pos, { key: "pos" }));
  }
  const iss = S.issues[el.id];
  if (iss?.errors.length) out.push(h("div", { class: "errs" }, iss.errors.map((m) => h("div", {}, m))));
  if (iss?.warnings.length) out.push(h("div", { class: "warns" }, iss.warnings.map((m) => h("div", {}, m))));
  return out;
}

function highlightEl() { return S.motion.find((e) => e.type === "highlightWords"); }
function setHighlight(patch) {
  const hl = highlightEl();
  if (hl) {
    const next = { ...clone(hl), ...patch };
    if (!next.words?.length) { commit(S.motion.filter((e) => e.id !== hl.id), null, "ops"); return; }
    commit(S.motion.map((e) => (e.id === hl.id ? next : e)), "hl", "inspector");
  } else if (patch.words?.length) commit([...S.motion, { type: "highlightWords", style: "underline", ...patch, id: newId() }], "hl", "inspector");
}
function colorField(label, key, st) {
  const cur = S.captions?.style?.[key];
  const inp = h("input", { type: "color", value: cur ?? (key === "color" ? "#ffffff" : "#c8ff2e"), oninput: (e) => caps.setStyle({ [key]: e.target.value }, `capc-${key}`) });
  return field(label, h("div", { class: "sl" }, inp, h("button", { class: "small", disabled: cur === undefined, onclick: () => caps.setStyle({ [key]: null }, null) }, cur === undefined ? "marca" : "usar marca")));
}
function captionStyleSections() {
  const st = caps.capStyle();
  const hl = highlightEl();
  const auto = !caps.hasOverride();
  return [
    section("Estilo de subtítulos", [
      note("Arrastra el bloque en el cuadro para moverlo; los tiradores laterales cambian el ancho."),
      slider({ label: "Tamaño", value: st.size, min: 40, max: 140, step: 1, onInput: (v) => caps.setStyle({ size: v }, "capsize") }),
      slider({ label: "Posición Y", value: Math.round(st.y), min: 300, max: 1700, step: 5, onInput: (v) => caps.setStyle({ y: v }, "capy") }),
      slider({ label: "Posición X", value: Math.round(st.cx), min: 200, max: 880, step: 5, onInput: (v) => caps.setStyle({ cx: v }, "capx") }),
      slider({ label: "Ancho", value: Math.round(st.maxW), min: 300, max: 1040, step: 10, onInput: (v) => caps.setStyle({ maxW: v }, "capw") }),
      checkBox({ label: "Mayúsculas", checked: st.upper, onChange: (v) => caps.setStyle({ upper: v }, null) }),
      slider({ label: "Palabras por frase", value: st.maxWords, min: 1, max: 6, step: 1, onInput: (v) => caps.setStyle({ maxWords: v }, "capmw") }),
      auto ? null : note("Con subtítulos editados, las frases ya no se reagrupan: este valor solo aplica a los automáticos.", "warns"),
      colorField("Color de texto", "color", st), colorField("Color palabra activa", "active", st)
    ], { key: "capstyle" }),
    section("Palabras resaltadas", [
      textBox({ label: "Una por línea", area: true, value: (hl?.words ?? []).join("\n"), onInput: (v) => setHighlight({ words: v.split("\n").map((s) => s.trim()).filter(Boolean) }) }),
      selectBox({ label: "Estilo", value: hl?.style ?? "underline", options: [["underline", "Subrayado"], ["box", "Caja"]], onChange: (v) => setHighlight({ style: v }) }),
      note("Acepta frases (“a la medida”) y números (2,40 = 2.40); no distingue acentos ni mayúsculas.")
    ], { key: "caphl" }),
    caps.hasOverride() ? section("Segmentos", [h("button", { onclick: () => caps.resetSegments() }, "Volver a subtítulos automáticos"), note("Se descartan los textos editados y los cortes de segmentos; se conserva el estilo.")], { key: "capreset" }) : null
  ].filter(Boolean);
}
function captionPanel() {
  const sg = S.selection.seg ? caps.segById(S.selection.seg) : null;
  const out = [];
  if (sg) {
    const segIdx = caps.segments().findIndex((x) => x.id === sg.id);
    out.push(h("h2", {}, "Subtítulo", h("span", { class: "muted tiny" }, ` ${sg.in.toFixed(2)}–${sg.out.toFixed(2)} s`)));
    out.push(section("Texto", [
      textBox({ label: "Texto", area: true, value: sg.text, onInput: (v) => caps.setText(sg.id, v) }),
      note("Cambiar el texto no mueve el tiempo de la voz: las palabras conservan su tiempo si el número de palabras no cambia."),
      numberBox({ label: "Entra (s)", value: sg.in, onInput: (v) => caps.editSeg(sg.id, (s) => ({ ...s, in: v ?? s.in }), `cin:${sg.id}`) }),
      numberBox({ label: "Sale (s)", value: sg.out, onInput: (v) => caps.editSeg(sg.id, (s) => ({ ...s, out: v ?? s.out }), `cout:${sg.id}`) }),
      checkBox({ label: "Visible", checked: !sg.hidden, text: sg.hidden ? "oculto" : "se muestra", onChange: () => caps.toggleHidden(sg.id) }),
      h("div", { class: "btnrow" },
        h("button", { disabled: !(S.t > sg.in && S.t < sg.out), onclick: () => caps.split(sg.id, S.t) }, "Dividir en el cursor"),
        h("button", { disabled: segIdx >= caps.segments().length - 1, onclick: () => caps.mergeNext(sg.id) }, "Unir con el siguiente"),
        h("button", { class: "danger", onclick: () => caps.removeSeg(sg.id) }, "Eliminar"))
    ], { key: "capseg" }));
  } else out.push(h("h2", {}, "Subtítulos"), note(caps.hasOverride() ? "Editados a mano." : "Automáticos: se agrupan desde la voz. Al editar un bloque se vuelven editables."));
  return [...out, ...captionStyleSections()];
}

function setZones(z, key = "zones") {
  const next = { top: z.top, bottom: z.bottom, left: z.left, right: z.right };
  const isDefault = Object.entries(DEFAULT_ZONES).every(([k, v]) => next[k] === v);
  commitDoc({ zones: isDefault && !S.zones ? null : next }, key, "zones");
}
function zonesPanel() {
  const z = effZones();
  const pre = presetOf(S.zones);
  return [
    h("h2", {}, "Zonas de la plataforma"),
    note("Lo que las apps tapan con su interfaz. La colocación automática, el logo y los subtítulos las respetan. Valores aproximados: cambian con las apps."),
    section("Preajuste", [
      selectBox({ label: "Plataforma", value: pre, options: Object.entries(ZONE_PRESETS).map(([k, p]) => [k, p.label]), onChange: (v) => { if (v !== "custom") { const p = ZONE_PRESETS[v]; setZones(p, null); } } }),
      checkBox({ label: "Guías", checked: S.guides, text: "mostrar en el cuadro", onChange: (v) => { S.guides = v; $("btnGuides")?.classList.toggle("on", v); import("./stage.js").then((m) => m.redraw()); } })
    ]),
    section("Ajuste fino (px)", [
      slider({ label: "Arriba", value: z.top, min: 0, max: 600, step: 5, onInput: (v) => setZones({ ...z, top: v }, "ztop") }),
      slider({ label: "Abajo", value: z.bottom, min: 0, max: 800, step: 5, onInput: (v) => setZones({ ...z, bottom: v }, "zbottom") }),
      slider({ label: "Izquierda", value: z.left, min: 0, max: 300, step: 5, onInput: (v) => setZones({ ...z, left: v }, "zleft") }),
      slider({ label: "Derecha", value: z.right, min: 0, max: 300, step: 5, onInput: (v) => setZones({ ...z, right: v }, "zright") }),
      note("También puedes arrastrar las líneas en el cuadro."),
      h("button", { disabled: !S.zones, onclick: () => commitDoc({ zones: null }, null, "zones") }, "Restablecer valores por defecto")
    ])
  ];
}

function motionTrackPanel() {
  const n = S.motion.filter((e) => windowOf(e)).length;
  return [h("h2", {}, "Motion"), note(`${n} elementos en la línea de tiempo. Clic en un bloque para editarlo; clic derecho en un hueco para añadir uno ahí.`),
    section("Añadir en el cursor", [h("div", { class: "addgrid" }, Object.entries(TYPES).filter(([, s]) => !s.noAdd).map(([type, s]) => h("button", { class: "small", onclick: () => ops.addAt(type) }, s.label)))])];
}
function trackPanel(track) {
  switch (track) {
    case "motion": return motionTrackPanel();
    case "captions": return captionPanel();
    case "video": return [h("h2", {}, "Video"), ...edlui.binSections(), ...videoSections()];
    case "voice": return [h("h2", {}, "Voz"), ...voiceSections()];
    case "music": return [h("h2", {}, "Música"), ...musicSections()];
    case "sfx": return [h("h2", {}, "Efectos de sonido"), ...sfxSections()];
    case "brand": return [h("h2", {}, "Marca"), note("El logo de la esquina y la tarjeta de cierre. Elige uno para ajustarlo; también puedes hacer clic en el logo dentro del cuadro."), h("div", { class: "btnrow" }, h("button", { onclick: selectLogo }, "Logo"), S.cta || S.ctaDoc ? h("button", { onclick: selectCta }, "Cierre") : null)];
    default: return [videoPanel()];
  }
}

function videoPanel() {
  const pre = ZONE_PRESETS[presetOf(S.zones)].label;
  const pend = X.requests.filter((r) => ["pending", "approved", "running"].includes(r.status)).length;
  const fin = S.final;
  const finAt = fin ? new Date(fin.at).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  const status = rstate.running ? `renderizando ${Math.round(rstate.progress * 100)}%` : rstate.code === 0 ? "último render correcto" : rstate.code != null ? "el último render falló" : fin ? `final del ${finAt}${fin.stale ? " (sin tus últimos cambios)" : ""}` : "sin video final todavía";
  return h("div", {},
    h("h2", {}, "Video"),
    h("div", { class: "kv" },
      h("span", {}, "Duración"), h("b", {}, `${S.duration.toFixed(2)} s`),
      h("span", {}, "Motion"), h("b", {}, `${S.motion.filter((e) => windowOf(e)).length} elementos`),
      h("span", {}, "Subtítulos"), h("b", {}, `${caps.segments().length} ${caps.hasOverride() ? "(editados)" : "(automáticos)"}`),
      h("span", {}, "Plataforma"), h("b", {}, pre),
      h("span", {}, "Render"), h("b", {}, status),
      pend ? h("span", {}, "Solicitudes") : null, pend ? h("b", {}, `${pend} en cola`) : null),
    h("div", { class: "btnrow", style: { marginTop: "12px" } },
      h("button", { class: "accent", onclick: startRender }, "Renderizar"), fin || rstate.code === 0 ? h("button", { onclick: () => api("POST", "/api/open-final", {}).catch((e) => toast(e.data?.error ?? e.message)), title: "Abre el último video final en tu reproductor" }, "Ver final") : null, h("button", { onclick: selectZones }, "Zonas de la plataforma"), h("button", { onclick: selectLogo }, "Logo"), S.cta || S.ctaDoc ? h("button", { onclick: selectCta }, "Cierre") : null, pend ? h("button", { onclick: openRequests }, "Ver solicitudes") : null),
    note("Selecciona un bloque, un subtítulo o el encabezado de una pista para ver sus ajustes. Clic derecho abre el menú; ? muestra los atajos."));
}

export function render() {
  const root = body();
  if (!root) return;
  const focused = root.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  root.replaceChildren();
  const k = S.selection.kind;
  let nodes;
  if (k === "element") nodes = elementPanel();
  else if (k === "caption") nodes = captionPanel();
  else if (k === "track") nodes = trackPanel(S.selection.track);
  else if (k === "segment") nodes = edlui.segmentPanel();
  else if (k === "sfxev") nodes = sfxlane.panel();
  else if (k === "zones") nodes = zonesPanel();
  else if (k === "logo") nodes = logoPanel();
  else if (k === "cta") nodes = ctaPanel();
  else nodes = [videoPanel()];
  root.append(...nodes);
  void focused;
}
// Rebuild on selection / structural changes; typing in a field must not rebuild (it would steal focus).
const typing = () => body()?.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
on("selection", () => render());
on("extras", () => { if (!typing()) render(); });
on("motion", () => { if (!typing()) render(); });
on("plan", () => { if (!typing()) render(); });
on("wordrange", () => { if (S.selection.kind === "track") render(); });
onRefresh(render); // logo upload progress / result re-renders the panel
