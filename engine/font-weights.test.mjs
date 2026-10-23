// Regression: every font weight the engine draws with must be in FONT_WEIGHTS, which loadFonts() resolves before READY.
// A weight missing there (500 / 700 once were) is fetched lazily on its first canvas draw, which falls back to the system font
// for the first frames: the toast of a render came out with different glyph metrics between runs.
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const declared = (() => {
  const m = src("./brand-layer.js").match(/export const FONT_WEIGHTS = \[([^\]]+)\]/);
  assert.ok(m, "FONT_WEIGHTS export not found");
  return m[1].split(",").map((x) => Number(x.trim()));
})();

test("FONT_WEIGHTS covers every weight literal used for drawing", () => {
  const used = new Set();
  for (const m of src("./brand-layer.js").matchAll(/(?:font\("(?:display|body)",\s*[^,]+,\s*|fitFont\(ctx,\s*"(?:display|body)",\s*)(\d{3})\b/g)) used.add(Number(m[1]));
  for (const f of readdirSync(new URL("./motion-lib/", import.meta.url)).filter((x) => x.endsWith(".js"))) { // motion-lib: fnt(skin, W, px) and kit.font("display"|"body", px, W)
    const code = src(`./motion-lib/${f}`);
    for (const m of code.matchAll(/fnt\(skin,\s*(\d{3})\b/g)) used.add(Number(m[1]));
    for (const m of code.matchAll(/(?:kit\.)?font\("(?:display|body)",\s*[^,)]+,\s*(\d{3})\)/g)) used.add(Number(m[1]));
  }
  assert.ok(used.size >= 4, `expected to find the drawn weights, got ${[...used]}`);
  for (const w of used) assert.ok(declared.includes(w), `weight ${w} is drawn but not preloaded (FONT_WEIGHTS = ${declared})`);
});
