/* Catalogue model: turns the verified Thomann records (catalogue.js) into shop products, links them to
   demo products (data.js), and validates/imports new records. No UI code here.
   Load order: data.js, catalogue.js, catalog-model.js, engine.js, tools.js, page. */
const TAX = THOMANN_DATA.taxonomy;
const TOPS = Object.fromEntries(TAX.map(t => [t.id, t]));
const VERIFIED_ON = THOMANN_DATA.verifiedOn;

/* demo product types -> Thomann top-level category + subcategory */
const DEMO_TOP = {guitars:["guitars_basses","Electric guitars"],amps:["guitars_basses","Guitar amps"],pedals:["guitars_basses","Guitar & bass effects"],power:["guitars_basses","Guitar & bass effects"],
  interfaces:["studio","Audio interfaces"],mics:["mics","Microphones"],headphones:["accessories","Headphones"],monitors:["studio","Studio monitors"],keys:["keys","Keyboards"],drums:["drums","E-drums"]};
const DEMO_KIND_TOP = {strings:["guitars_basses","Strings"],cable:["cables","Cables"],usbcable:["cables","Computer cables"],battery:["accessories","Batteries"],picks:["guitars_basses","Guitar accessories"],
  "acoustic guitar":["guitars_basses","Acoustic guitars"],cymbal:["drums","Cymbals"],sustain:["keys","Piano accessories"],booster:["mics","Microphone accessories"]};
const USE_TO_SIT = {home:"home",live:"band",rehearsal:"band",studio:"recording",producing:"recording"};
/* which top-level categories serve which instrument in the Music Profile */
const INST_TOPS = {guitar:["guitars_basses"],acoustic:["guitars_basses"],bass:["guitars_basses"],piano:["keys"],drums:["drums"],vocals:["mics","fx"],production:["studio","software","dj"],wind:["wind"],strings:["traditional"],other:[]};

const isVerified = p => !!p.tv;
const restockDays = s => { const m = String(s || "").match(/(\d+)\s*[–-]\s*(\d+)\s*(Tage|Wochen)/); return m ? Math.round((+m[1] + +m[2]) / 2 * (m[3] === "Wochen" ? 7 : 1)) : 10; };

function productFromRecord(rec, src) {
  const words = [rec.subEn, rec.sub, TOPS[rec.top]?.en, TOPS[rec.top]?.de, rec.brand, ...(rec.uses || []).map(u => typeof MP_USES !== "undefined" ? MP_USES[u] : u)]
    .filter(Boolean).join(" ").toLowerCase().split(/[\s,&/()+-]+/).filter(w => w.length > 1);
  return {id: rec.id, n: rec.name, b: rec.brand, c: rec.top, top: rec.top, sub: rec.subEn, p: rec.price, r: null, rv: 0,
    st: rec.inStock ? 50 : 0, restock: rec.inStock ? 0 : restockDays(rec.avail), tags: [...new Set(words)], specs: rec.specs || {},
    cp: {kind: "v-" + String(rec.subEn).toLowerCase().replace(/[^a-z]+/g, "-")}, ret: null,
    sit: [...new Set((rec.uses || []).map(u => USE_TO_SIT[u]).filter(Boolean))], src, vonly: true, tv: rec};
}
function linkDemo(p, rec) {
  p.tv = rec; p.p = rec.price; p.src = "demo+verified";
  if (!rec.inStock) { p.st = 0; p.restock = restockDays(rec.avail); } else if (!p.st) p.st = 50;
}
/* imported records live on this device only (localStorage), flagged as imported */
function loadImported() { try { return JSON.parse(localStorage.getItem("ga3_imported") || "[]"); } catch (e) { return []; } }
function saveImported(l) { try { localStorage.setItem("ga3_imported", JSON.stringify(l)); } catch (e) {} }

(function mergeCatalogue() {
  for (const p of P) {
    const m = DEMO_TOP[p.c] && !DEMO_KIND_TOP[p.cp.kind] ? DEMO_TOP[p.c] : DEMO_KIND_TOP[p.cp.kind] || DEMO_TOP[p.c] || ["accessories", "Accessories"];
    p.top = m[0]; p.sub = m[1]; p.src = "demo";
  }
  const byArticle = Object.fromEntries(THOMANN_DATA.records.map(r => [r.article, r]));
  const linked = new Set();
  for (const [demoId, art] of Object.entries(THOMANN_DATA.demoLinks || {})) {
    if (BY[demoId] && byArticle[art]) { linkDemo(BY[demoId], byArticle[art]); linked.add(art); }
  }
  for (const rec of THOMANN_DATA.records) if (!linked.has(rec.article)) { const p = productFromRecord(rec, "verified"); P.push(p); BY[p.id] = p; }
  for (const rec of loadImported()) if (!BY[rec.id]) { const p = productFromRecord(rec, "imported"); P.push(p); BY[p.id] = p; }
  for (const t of TAX) if (!CATS[t.id]) CATS[t.id] = t.en;
})();

function availLabel(p) { return p.tv ? p.tv.availEn : null; }
function catalogueCoverage() {
  return TAX.map(t => {
    const l = P.filter(p => p.top === t.id);
    const ver = l.filter(p => p.tv && p.src !== "imported").length, imp = l.filter(p => p.src === "imported").length;
    return {id: t.id, en: t.en, de: t.de, url: t.url, verified: ver, imported: imp, demo: l.filter(p => !p.tv).length, complete: ver >= 6};
  });
}

/* ---------- import: JSON (array of records) or CSV ---------- */
const IMPORT_FIELDS = ["name", "brand", "article", "price", "url", "top", "sub", "avail", "verified"];
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim());
  return rows.filter(r => r.some(c => c.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}
function normaliseImport(o) {
  const errs = [];
  for (const f of IMPORT_FIELDS) if (o[f] === undefined || o[f] === "") errs.push("missing " + f);
  const price = typeof o.price === "number" ? o.price : parseFloat(String(o.price || "").replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  if (!(price > 0)) errs.push("price must be a positive number in EUR");
  if (o.url && !/^https:\/\/www\.thomann\.de\/.+\.htm/.test(o.url)) errs.push("url must be a thomann.de product page (https://www.thomann.de/…htm)");
  if (o.top && !TOPS[o.top]) errs.push("top must be one of: " + Object.keys(TOPS).join(", "));
  if (o.article && !/^\d{4,8}$/.test(String(o.article))) errs.push("article must be Thomann's numeric article number");
  if (o.verified && !/^\d{4}-\d{2}-\d{2}$/.test(o.verified)) errs.push("verified must be a date YYYY-MM-DD");
  if (errs.length) return {errs};
  const specs = typeof o.specs === "object" && o.specs ? o.specs : Object.fromEntries(String(o.specs || "").split("|").map(s => s.split(":")).filter(a => a.length > 1).map(([k, ...v]) => [k.trim(), v.join(":").trim()]));
  const inStock = /^(sofort|in stock)/i.test(o.avail);
  return {rec: {id: "t" + o.article, article: String(o.article), name: o.name, brand: o.brand, top: o.top, crumb: [], sub: o.sub, subEn: o.sub, url: o.url, price, currency: "EUR",
    priceText: price + " €", ref: o.refValue ? {basis: o.refBasis === "best30" ? "best30" : o.refBasis === "uvp" ? "uvp" : "other", label: o.refBasis === "best30" ? "30-day best price" : o.refBasis === "uvp" ? "Manufacturer's list price (UVP)" : "Reference price", value: +o.refValue, text: ""} : null,
    avail: o.avail, availEn: inStock ? "In stock" : o.avail, inStock, specs, compat: [], uses: [], bundle: null, image: null, verified: o.verified, source: o.url, imported: true}};
}
/* returns {added, updated:[{id,old,new}], errors:[...]}; updates keep a price history (used by price alerts) */
function importCatalogue(text) {
  let items;
  const t = String(text || "").trim();
  try { items = t.startsWith("[") || t.startsWith("{") ? [].concat(JSON.parse(t)) : parseCsv(t); }
  catch (e) { return {added: 0, updated: [], errors: ["Could not read the data: " + e.message]}; }
  const imported = loadImported(), out = {added: 0, updated: [], errors: []};
  items.forEach((o, i) => {
    const {rec, errs} = normaliseImport(o || {});
    if (errs) { out.errors.push(`Row ${i + 1}${o && o.name ? " (" + o.name + ")" : ""}: ${errs.join("; ")}`); return; }
    const ex = P.find(p => p.tv && p.tv.article === rec.article);
    if (ex) {
      if (rec.verified < ex.tv.verified) { out.errors.push(`Row ${i + 1}: older than the stored record (${ex.tv.verified}); skipped`); return; }
      const old = ex.p;
      ex.tv = Object.assign({}, ex.tv, {price: rec.price, priceText: rec.priceText, verified: rec.verified, avail: rec.avail, availEn: rec.availEn, inStock: rec.inStock, ref: rec.ref || ex.tv.ref});
      ex.p = rec.price; ex.st = rec.inStock ? Math.max(ex.st || 0, 50) : 0;
      const k = imported.findIndex(x => x.article === rec.article); if (k >= 0) imported[k] = Object.assign(imported[k], rec);
      else imported.push(Object.assign({}, rec, {updateOnly: true}));
      out.updated.push({id: ex.id, name: ex.n, old, new: rec.price, verified: rec.verified});
      return;
    }
    imported.push(rec); const p = productFromRecord(rec, "imported"); P.push(p); BY[p.id] = p; out.added++;
  });
  saveImported(imported);
  return out;
}
/* apply stored price updates for records that ship with the page */
(function applyStoredUpdates() {
  for (const rec of loadImported()) {
    if (!rec.updateOnly) continue;
    const ex = P.find(p => p.tv && p.tv.article === rec.article);
    if (ex && rec.verified >= ex.tv.verified) { ex.tv = Object.assign({}, ex.tv, {price: rec.price, verified: rec.verified, avail: rec.avail, availEn: rec.availEn, inStock: rec.inStock}); ex.p = rec.price; }
  }
})();
