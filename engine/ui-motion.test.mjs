// node --test engine/ui-motion.test.mjs
// Shared base of the motion library: skins, number formats, count-up text and image refs.
import test from "node:test";
import assert from "node:assert/strict";
import * as M from "./ui-motion.js";

test("skin: derived from brand.json, overlaid by ui-skin.json, then by the element override", () => {
  const brand = { colors: { primary: "#80BC00", ink: "#0A0F0B", accent_on_paper: "#007313" }, fonts: { body: { family: "Onest", src: "https://x/css" } } };
  const d = M.resolveSkin(null, brand);
  assert.equal(d.derived, true);
  assert.equal(d.font.family, "Onest");
  assert.equal(d.colors.accent, "#007313");
  assert.equal(d.colors.surface, "#FFFFFF");
  const doc = { font: { family: "Cabin", src: "https://f" }, colors: { accent: "#5E17EB", primary: "#7DBD4D" }, radius: { card: 30 }, status: { Disponible: "#6B7280" } };
  const s = M.resolveSkin(doc, brand, { colors: { accent: "#111111" } });
  assert.equal(s.derived, false);
  assert.equal(s.font.family, "Cabin");
  assert.equal(s.colors.accent, "#111111");
  assert.equal(s.colors.primary, "#7DBD4D");
  assert.equal(s.radius.card, 30);
  assert.equal(M.statusColor(s, { text: "Disponible" }), "#6B7280");
  assert.equal(M.statusColor(s, { text: "Otro" }), s.colors.muted);
  assert.equal(M.statusColor(s, { text: "x", status: "#ff0000" }), "#ff0000");
});

test("derived skin: a brand without its own accent (or with the primary again) gets a distinguishable accent", () => {
  const vichac = M.resolveSkin(null, { colors: { primary: "#7A1FD6", accent_on_paper: "#7A1FD6" } });
  assert.notEqual(vichac.colors.accent.toLowerCase(), "#7a1fd6");
  assert.equal(vichac.colors.primary, "#7A1FD6");
  assert.equal(M.resolveSkin(null, { colors: { primary: "#7A1FD6" } }).colors.accent, vichac.colors.accent, "missing accent = same rule");
  assert.equal(M.contrastAccent("#7DBD4D"), "#5E17EB", "a green brand gets a violet accent (the Reda pairing)");
  assert.equal(M.resolveSkin(null, { colors: { primary: "#80BC00", accent_on_paper: "#007313" } }).colors.accent, "#007313", "an own accent is kept");
});

test("formats: money / int / pct / compact, count-up text and refs", () => {
  assert.equal(M.fmtMoney(3986811.18), "$3,986,811.18");
  assert.equal(M.fmtMoney(2460769), "$2,460,769");
  assert.equal(M.countText("$398,681.12", 1), "$398,681.12");
  assert.equal(M.countText(3986811.18, 0.5), "$1,993,405.59");
  assert.equal(M.statText({ value: 1284, format: "int" }), "1,284");
  assert.equal(M.statText({ value: 42.5, format: "pct" }), "42.5%");
  assert.equal(M.statText({ value: 1250000, format: "compact", suffix: " leads" }), "1.3M leads");
  assert.equal(M.statText({ value: 5, format: "money", prefix: "≈" }), "≈$5");
  assert.equal(M.uiResolveRef("people:p01").url, "/_people/p01@256.jpg");
  assert.equal(M.uiResolveRef("../x.jpg"), null);
  assert.equal(M.uiResolveRef("https://x/y.jpg"), null);
  assert.equal(M.uiResolveRef("crm/plan.jpg").path, "crm/plan.jpg");
});
