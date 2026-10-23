// "Costo": what this video spent (paid generations from the RUN ledger, media.json and finished requests), the free changes made, and an
// optional comparison against what the same video costs when made by hand. Read-only except the reference, saved through an authenticated PUT.
// Numbers come only from files on disk: credits are shown as recorded; USD only when config.json has usd_per_credit; no guessed rates.
import { on, toast } from "./store.js";
import { api, get } from "./api.js";
import { togglePopover, refreshPopover, popoverOpen } from "./popover.js";
import { $, h } from "./dom.js";

const ID = "cost";
let data = null;
const nf = (n) => (Math.round(n * 100) / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 });
const usd = (n) => `US$ ${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function chipText() {
  if (!data) return "Costo";
  const c = data.higgsfield.credits;
  return `${nf(c)} cr${data.usd !== null ? ` · ${usd(data.usd)}` : ""}`;
}
function paintChip() {
  const b = $("btnCost");
  b.textContent = chipText();
  b.title = data
    ? `Gasto de créditos de pago en esta corrida (${data.higgsfield.count} generaciones). Clic para ver el detalle. ${data.usd !== null ? `USD ${data.usdLabel}.` : "Sin precio por crédito configurado: se muestran solo créditos."}`
    : "Costo de este video";
}

async function load() {
  try {
    data = await get("/api/costs");
  } catch (err) {
    console.warn("costs not loaded", err);
  }
  paintChip();
  refreshPopover(ID);
}

const row = (k, v, title) => h("div", { class: "cost-row", title }, h("span", {}, k), h("span", {}, v));
const cr = (n) => `${nf(n)} cr`;

async function saveRef(amount, currency, note) {
  try {
    await api("PUT", "/api/cost-reference", { amount: amount === "" ? null : Number(amount), currency, note });
    toast(amount === "" ? "Referencia quitada" : "Referencia guardada");
    await load();
  } catch (err) {
    toast(err.data?.error ?? err.message, 4000);
  }
}

function referenceBlock(d) {
  const ref = d.reference;
  const amount = h("input", { type: "number", min: "0", step: "any", placeholder: "Monto", value: ref?.amount ?? "" });
  const cur = h("input", { type: "text", maxlength: "3", placeholder: "USD", value: ref?.currency ?? "USD", style: { textTransform: "uppercase" } });
  const note = h("input", { type: "text", class: "note", placeholder: "Nota (ej. cotización del editor, 2 días)", value: ref?.note ?? "" });
  const box = h("div", {}, h("div", { class: "grp" }, "Referencia: video hecho a mano"),
    h("div", { class: "cost-ref" }, amount, cur, note),
    h("div", { class: "row", style: { display: "flex", gap: "6px", marginTop: "6px" } },
      h("button", { class: "small primary", onclick: () => saveRef(amount.value, cur.value || "USD", note.value) }, "Guardar"),
      ref ? h("button", { class: "small", onclick: () => saveRef("", "USD", "") }, "Quitar") : null));
  if (ref && d.comparison?.ok) {
    const c = d.comparison;
    box.append(h("div", { class: `cost-cmp${c.savedUsd < 0 ? " warn" : ""}` },
      `Hecho a mano: ${usd(c.refUsd)}${ref.currency !== "USD" ? ` (${nf(ref.amount)} ${ref.currency})` : ""} · Aquí: ${usd(c.spentUsd)} (${d.usdLabel}). `,
      c.savedUsd >= 0 ? `Diferencia a favor: ${usd(c.savedUsd)} (${nf(c.savedPct)} %).` : `Cuesta ${usd(-c.savedUsd)} más que la referencia.`,
      h("div", { class: "cost-hint" }, "Compara solo créditos de generación; no incluye tu tiempo, música ni licencias.")));
  } else if (ref && d.comparison) {
    const why = d.comparison.reason === "no_usd_per_credit"
      ? "No hay precio por crédito: agrega \"usd_per_credit\" en engine/studio/config.json para comparar."
      : `No hay tipo de cambio para ${ref.currency}: agrega "fx_usd_per_unit": {"${ref.currency}": <USD por 1 ${ref.currency}>} en engine/studio/config.json, o captura la referencia en USD.`;
    box.append(h("div", { class: "cost-hint" }, `Referencia guardada: ${nf(ref.amount)} ${ref.currency}${ref.note ? ` (${ref.note})` : ""}. ${why}`));
  }
  return box;
}

function render(el) {
  el.replaceChildren(h("h3", {}, "Costo"));
  const d = data;
  if (!d) { el.append(h("div", { class: "empty" }, "Cargando…")); return; }
  const hf = d.higgsfield;
  el.append(h("div", { class: "sub" }, d.note));
  el.append(h("div", { class: "cost-big" }, hf.count || d.hasLedger ? cr(hf.credits) : "0 cr"),
    h("div", { class: "cost-hint", style: { marginTop: "0" } }, d.usd !== null ? `≈ ${usd(d.usd)} (${d.usdLabel}; ${d.usdPerCredit} USD por crédito, de config.json)` : "Sin precio por crédito: pon \"usd_per_credit\" en engine/studio/config.json para ver USD."));
  el.append(h("div", { class: "grp" }, "Generaciones de pago"));
  el.append(row("Borradores 480p", `${hf.draft.count} · ${cr(hf.draft.credits)}`));
  el.append(row("Finales 1080p", `${hf.final.count} · ${cr(hf.final.credits)}`));
  if (hf.unclassified.count) el.append(row("Sin clasificar", `${hf.unclassified.count} · ${cr(hf.unclassified.credits)}`, "El registro no dice si fue borrador o final"));
  if (d.elevenlabs.count || d.elevenlabs.chars) el.append(row("ElevenLabs", `${d.elevenlabs.chars != null ? `${nf(d.elevenlabs.chars)} car. · ` : ""}${cr(d.elevenlabs.credits)}`, "Créditos de ElevenLabs: otra cuenta, no se suman a los de Higgsfield ni se convierten a USD"));
  if (d.other.count) el.append(row("Otros", `${d.other.count} · ${cr(d.other.credits)}`));
  if (d.budget.cap != null) el.append(row("Tope de la corrida", `${cr(d.budget.cap)} · quedan ${cr(Math.max(0, d.budget.cap - d.budget.spent))}`));
  if (!d.items.length) el.append(h("div", { class: "cost-hint" }, "Todavía no hay generaciones de pago registradas (ledger.json, media.json o solicitudes terminadas)."));
  else el.append(h("details", {}, h("summary", { class: "grp" }, `Detalle (${d.items.length})`),
    ...d.items.map((i) => row(`${i.label}${i.quality ? ` · ${i.quality === "draft" ? "480p" : "1080p"}` : ""}`, cr(i.credits), `${i.service} · ${i.source}${i.jobId ? ` · ${i.jobId}` : ""}`))));
  el.append(h("div", { class: "grp" }, "Cambios sin costo"));
  el.append(row("Ediciones guardadas", String(d.free.edits), "Instantáneas en .studio/history"));
  el.append(row("Renders", d.free.renders === null ? "sin registro aún" : `${d.free.renders}${d.free.renders !== d.free.rendersOk ? ` (${d.free.rendersOk} sin error)` : ""}`, "Se cuentan desde que el servidor los registra (.studio/renders.jsonl)"));
  if (d.free.freeRequests) el.append(row("Acciones gratis (audio local)", String(d.free.freeRequests)));
  el.append(referenceBlock(d));
}

export async function init() {
  $("btnCost").onclick = async () => {
    togglePopover(ID, $("btnCost"), render, { width: 340 });
    if (popoverOpen(ID)) await load();
  };
  on("extras", load);
  await load();
}
export const reload = load;
