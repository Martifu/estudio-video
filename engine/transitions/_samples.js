// Synthetic demo scenes for transition thumbnails (browser only; index.js imports this module, so nothing here touches `document`
// at load time). Brand-neutral placeholder art: flat fills only, no photos, gradients or glows.

/** A canvas of W x H. Throws outside the browser: it is only called from browser code (renderPreview). */
export function makeCanvas(W, H) {
  if (typeof document === "undefined") throw new Error("makeCanvas solo funciona en el navegador (no hay document)");
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}

/** Two placeholder scenes: `from` = dark field with a circle, `to` = light field with a rounded rect in the primary colour. */
export function sampleFrames(W, H, brand = {}) {
  const from = makeCanvas(W, H);
  const to = makeCanvas(W, H);
  const ink = brand.ink || "#111111";
  const paper = brand.paper || "#f2f2f2";
  const primary = brand.primary || "#000000";

  const a = from.getContext("2d");
  a.fillStyle = ink;
  a.fillRect(0, 0, W, H);
  a.fillStyle = "#777777";
  a.beginPath();
  a.arc(W / 2, H * 0.45, W * 0.28, 0, Math.PI * 2);
  a.fill();

  const b = to.getContext("2d");
  b.fillStyle = paper;
  b.fillRect(0, 0, W, H);
  b.fillStyle = primary;
  b.beginPath();
  if (typeof b.roundRect === "function") b.roundRect(W * 0.2, H * 0.5, W * 0.6, H * 0.25, W * 0.06);
  else b.rect(W * 0.2, H * 0.5, W * 0.6, H * 0.25);
  b.fill();

  return { from, to };
}
