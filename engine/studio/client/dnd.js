// Drag payload of the app's own drags (HTML5 DnD hides getData() until drop, so dragover reads this).
export const MIME = { clip: "application/x-estudio-clip", sfx: "application/x-estudio-sfx", transition: "application/x-estudio-transition", text: "application/x-estudio-text", product: "application/x-estudio-product" };
let payload = null;
export const setDragPayload = (kind, data) => { payload = kind ? { kind, data } : null; };
export const dragPayload = (kind) => (payload && (!kind || payload.kind === kind) ? payload.data : null);
export const hasType = (e, kind) => [...(e.dataTransfer?.types ?? [])].includes(MIME[kind]);
export const readDrop = (e, kind) => { try { return JSON.parse(e.dataTransfer.getData(MIME[kind])); } catch { return dragPayload(kind); } };
