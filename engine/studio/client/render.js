// Render: the top-bar button runs the fixed pipeline (server side); progress/log arrive over SSE.
import { S, isDirty, toast } from "./store.js";
import { api, get } from "./api.js";
import { $, h, esc } from "./dom.js";
import { openModal, closeModal } from "./menus.js";

export const rstate = { lines: [], progress: 0, running: false, output: null, code: null };

function paintButton() {
  const b = $("btnRender");
  b.disabled = false;
  b.classList.toggle("busy", rstate.running);
  b.style.setProperty("--p", `${Math.round(rstate.progress * 100)}%`);
  b.textContent = rstate.running ? `Renderizando ${Math.round(rstate.progress * 100)}%` : "Renderizar";
}
export async function startRender() {
  if (rstate.running) { openRenderLog(); return; }
  if (isDirty() && !confirm("Hay cambios sin guardar. El render usa los archivos guardados en disco. ¿Renderizar de todos modos?")) return;
  // Preflight: every referenced asset (logo files, CTA logo) must resolve inside the RUN and decode; errors block the render here and on the server.
  const pf = await get("/api/preflight").catch(() => null);
  const compErrors = S.assetIssues?.errors ?? [];
  if ((pf && !pf.ok) || compErrors.length) { showPreflight({ errors: [...(pf?.errors ?? []), ...compErrors.map((e) => ({ message: e.error }))], warnings: pf?.warnings ?? [] }); return; }
  rstate.warnings = pf?.warnings ?? [];
  rstate.lines = []; rstate.progress = 0; rstate.running = true; rstate.code = null;
  paintButton();
  try { await api("POST", "/api/render", {}); } catch (err) {
    if (err.data?.preflight) { rstate.running = false; paintButton(); showPreflight(err.data.preflight); return; }
    rstate.running = false; rstate.lines.push(`error: ${err.message}`);
    paintButton();
    toast(err.data?.error ?? err.message, 4000);
    return;
  }
  openRenderLog();
}
/** Blocking list of asset problems (Spanish messages from the server); warnings are advisory. */
function showPreflight(pf) {
  const card = h("div", { class: "preflight" }, h("h2", {}, "No se puede renderizar todavía"),
    h("div", { class: "muted" }, "Hay assets con problemas. Si el render siguiera, el video saldría con el logo equivocado o sin él."),
    h("ul", { class: "bad" }, pf.errors.map((e) => h("li", {}, e.message))),
    pf.warnings?.length ? h("div", {}, h("b", {}, "Avisos"), h("ul", { class: "warn" }, pf.warnings.map((w) => h("li", {}, w.message)))) : null,
    h("div", { class: "row" }, h("button", { onclick: closeModal }, "Entendido")));
  openModal(card, { wide: true });
}
export function onRenderEvent(d) {
  if (d.line) rstate.lines.push(d.line);
  if (d.progress !== undefined) rstate.progress = d.progress;
  if (d.done) {
    rstate.running = false; rstate.code = d.code; rstate.output = d.output;
    if (d.code === 0) rstate.progress = 1;
  }
  paintButton();
  const log = $("renderLog");
  if (log) { log.textContent = rstate.lines.slice(-200).join("\n"); log.scrollTop = log.scrollHeight; }
  const bar = document.querySelector("#renderBar > div");
  if (bar) bar.style.width = `${Math.round(rstate.progress * 100)}%`;
  if (d.done) openRenderLog();
}
export function openRenderLog() {
  const card = h("div", {}, h("h2", {}, rstate.running ? "Renderizando…" : rstate.code === 0 ? "Render listo" : rstate.code === null ? "Render" : "El render falló"),
    h("div", { class: "muted" }, "Corre el comando guardado en .studio/build.json (overlay.py con --reuse-footage). Gratis, local."));
  const bar = h("div", { class: "progress", id: "renderBar" }, h("div", { style: { width: `${Math.round(rstate.progress * 100)}%` } }));
  const log = h("div", { class: "log", id: "renderLog" });
  log.textContent = rstate.lines.slice(-200).join("\n");
  if (rstate.warnings?.length) card.append(h("div", { class: "preflight" }, h("b", {}, "Avisos de assets (no bloquean)"), h("ul", { class: "warn" }, rstate.warnings.map((w) => h("li", {}, w.message)))));
  card.append(bar, log);
  const row = h("div", { class: "row" });
  if (rstate.code === 0 && rstate.output) {
    card.append(h("p", { html: `Listo: <span class="mono">${esc(rstate.output)}</span>` }));
    row.append(h("button", { onclick: () => api("POST", "/api/open-final", {}).catch((e) => toast(e.message)) }, "Abrir en QuickTime"));
  }
  row.append(h("button", { onclick: closeModal }, "Cerrar"));
  card.append(row);
  openModal(card, { wide: true });
  log.scrollTop = log.scrollHeight;
}
