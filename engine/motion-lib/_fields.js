// Inspector field fragments and small validators shared by the element types (data only, no DOM, no canvas).
// Field kinds are rendered by engine/studio/client/inspector.js (text, textarea, number, select, bool, list, point, blocks, index...);
// `opt: true` = optional (an empty input deletes the key so the default applies; `ph` is the default shown as placeholder).

/** "Pantalla" section: where it sits, captions while visible, camera push, optional cursor. */
export const UI_SCREEN = (cursor) => [
  { key: "slot", label: "Dónde se ve", kind: "select", options: [["band", "Abajo, entre la barbilla y los botones"], ["top", "Arriba"], ["center", "Al centro"]], opt: true, ph: "abajo" },
  { key: "captions", label: "Subtítulos mientras se ve", kind: "select", options: [["hide", "Ocultarlos"], ["keep", "Dejarlos"]], opt: true, ph: "ocultarlos" },
  ...(cursor ? [{ key: "cursor", label: "Mostrar el cursor", kind: "bool", ph: "sí" }] : []),
  { key: "push", label: "Acercamiento de cámara", kind: "number", step: 0.01, min: 0, max: 0.15, opt: true, ph: "0.06" }
];
export const UI_SOURCE_KINDS = ["reda", "screenshot", "brand", "fictional"];
/** "Fuente de los datos" section: the review asks to confirm where shown numbers come from. */
export const UI_SOURCE = [
  { key: "source.kind", label: "¿De dónde salen los datos?", kind: "select", options: [["reda", "De Reda (datos reales)"], ["screenshot", "De una captura de pantalla"], ["brand", "De la marca"], ["fictional", "Ilustrativos (inventados)"]], opt: true, ph: "sin indicar" },
  { key: "source.ref", label: "Referencia (opcional)", kind: "text", opt: true, ph: "ej. crm/inventario" },
  { key: "source.fetchedAt", label: "Fecha de los datos (aaaa-mm-dd)", kind: "text", opt: true, ph: "2026-10-22" }
];
export const FICTIONAL = { kind: "fictional" };
/** true when el[k] is absent or an integer index inside 0..len-1. */
export const idx = (el, k, len) => el[k] === undefined || el[k] === null || (Number.isInteger(el[k]) && el[k] >= 0 && el[k] < len);
