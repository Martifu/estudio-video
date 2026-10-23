// Command line bridge to the motion library registry (used by scripts/overlay.py so Python never keeps a list of element types).
//   node engine/motion-lib/cli.mjs types            -> {"types": {"<type>": {"family", "usesSkin", "category", "label"}}}
//   node engine/motion-lib/cli.mjs check <file>     -> {"types": [...], "errors": [{"index", "message"}], "warnings": [...]}   (file = a motion.json list)
//   node engine/motion-lib/cli.mjs catalog --md     -> Markdown catalog of the library grouped by category (references/libreria.md)
//   ... --local <RUN/comp/motion-lib>                -> also register the comp-local element types; each one must pass the contract test
//                                                       (engine/motion-lib/_contract.mjs): failures come back as "localErrors" [{file, problems}]
import { readFileSync } from "node:fs";
import * as Lib from "./index.js";
import { contractProblems } from "./_contract.mjs";

const argv = process.argv.slice(2);
const li = argv.indexOf("--local");
const localDir = li >= 0 ? argv.splice(li, 2)[1] : null;
const [cmd, file] = argv;
const localErrors = [];
if (localDir) {
  const r = await Lib.loadLocal(localDir);
  localErrors.push(...r.errors.map((e) => ({ file: e.file.replace(/^local:/, ""), problems: e.problems })));
  for (const t of r.types) { const p = contractProblems(Lib.get(t)); if (p.length) localErrors.push({ file: `${t}.js`, problems: p }); }
}
const libErrors = () => Lib.LOAD_ERRORS.filter((e) => !e.file.startsWith("local:"));
const catalog = () => Object.fromEntries(Lib.all().map((d) => [d.type, { family: d.family ?? null, usesSkin: d.family === "ui" || d.usesSkin !== false, category: Lib.isLocal(d.type) ? Lib.LOCAL_CATEGORY : d.category, label: d.label, ...(Lib.isLocal(d.type) ? { local: true } : {}) }]));
const extra = () => (localDir ? { localErrors } : {});
if (cmd === "catalog") {
  const firstLine = (s) => String(s ?? "").trim().split("\n")[0].trim();
  const out = ["# Librería de motion (catálogo)", "", "Generado desde los descriptores (`node engine/motion-lib/cli.mjs catalog --md > references/libreria.md`); no lo edites a mano.",
    "Cada elemento trae su `brief` completo (para qué, cuándo no, coreografía, reglas de gusto, de dónde salen los datos) en `engine/motion-lib/<tipo>.js`.", ""];
  for (const { category, items } of Lib.byCategory()) {
    out.push(`## ${category}`, "", "| Tipo | Qué es | Cuándo usarlo |", "|---|---|---|");
    for (const d of items) {
      const lines = String(d.brief).trim().split("\n").map((x) => x.trim());
      const when = lines.find((x) => /^Cu[aá]ndo/i.test(x)) ?? lines[1] ?? "";
      out.push(`| \`${d.type}\` | ${d.label}: ${firstLine(d.description)} | ${when.replace(/^Cu[aá]ndo[^:]*:\s*/i, "").replace(/\|/g, "/")} |`);
    }
    out.push("");
  }
  const Tr = await import("../transitions/index.js").catch(() => null);
  if (Tr?.all) {
    out.push("## Transiciones (`engine/transitions/`)", "", "| Tipo | Qué es | Cuándo usarla |", "|---|---|---|");
    for (const d of Tr.all()) {
      const lines = String(d.brief ?? "").trim().split("\n").map((x) => x.trim());
      const when = lines.find((x) => /^Cu[aá]ndo/i.test(x)) ?? lines[1] ?? "";
      out.push(`| \`${d.name}\` | ${d.label}: ${firstLine(d.description)} | ${when.replace(/^Cu[aá]ndo[^:]*:\s*/i, "").replace(/\|/g, "/")} |`);
    }
    out.push("");
  }
  console.log(out.join("\n"));
} else if (cmd === "types") {
  console.log(JSON.stringify({ types: catalog(), loadErrors: libErrors(), ...extra() }));
} else if (cmd === "check" && file) {
  const list = JSON.parse(readFileSync(file, "utf8"));
  const errors = [], warnings = [];
  (Array.isArray(list) ? list : []).forEach((el, index) => {
    if (!Lib.isLib(el)) return;
    const r = Lib.validate(el, `motion[${index}] (${el.type})`);
    for (const message of r.errors) errors.push({ index, message });
    for (const message of r.warnings) warnings.push({ index, message });
  });
  console.log(JSON.stringify({ types: catalog(), errors, warnings, loadErrors: libErrors(), ...extra() }));
} else {
  console.error("usage: node cli.mjs types | check <motion.json> | catalog --md  [--local <comp>/motion-lib]");
  process.exit(2);
}
