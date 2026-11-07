/* Smart Savings model: verified offers, price history, price alerts, setup builder and cart review.
   No UI code. Load after catalog-model.js and engine.js.
   Honesty rules built in:
   - savings are only stated against a verified comparison basis, and the basis is always named
     (UVP = manufacturer's list price, 30-day best price, or the verified sum of a bundle's parts);
   - B-Stock is always labelled B-Stock with Thomann's condition text, never shown as new;
   - there is no scheduled price monitoring: prices change only when verified data is imported,
     or in clearly labelled demo mode. Alerts are shown in this page only. */
const OFFERS = (THOMANN_DATA.offers && THOMANN_DATA.offers.items) || [];
const OFFERS_CHECKED = THOMANN_DATA.offers && THOMANN_DATA.offers.checked;
const byArticle = a => P.find(p => p.tv && p.tv.article === a);

/* products that exist only as offers (B-Stock item, official bundle) */
(function addOfferProducts() {
  for (const o of OFFERS) {
    if (byArticle(o.article)) continue;
    if (o.type === "bstock") {
      const base = byArticle(o.newArticle);
      const rec = {id: "t" + o.article, article: o.article, name: o.name, brand: o.brand, top: base.top, crumb: [], sub: base.sub, subEn: base.sub, url: o.url, price: o.price,
        currency: "EUR", priceText: o.price + " €", ref: null, avail: o.avail, availEn: /^Sofort/.test(o.avail) ? "In stock" : o.avail, inStock: /^Sofort/.test(o.avail),
        specs: base.specs, compat: base.tv ? base.tv.compat : [], uses: base.tv ? base.tv.uses : [], bundle: null, image: null, verified: o.checked, source: o.url,
        condition: o.condition, warranty: o.warranty};
      const p = productFromRecord(rec, "verified"); p.bstockOf = base.id; p.cp = base.cp; P.push(p); BY[p.id] = p;
    }
    if (o.type === "bundle" && o.url) {
      const rec = {id: "t" + o.article, article: o.article, name: o.name, brand: o.brand || "", top: o.top, crumb: [], sub: "Official bundles", subEn: "Official bundles", url: o.url,
        price: o.price, currency: "EUR", priceText: o.price + " €", ref: o.ref, avail: o.avail, availEn: /^Sofort/.test(o.avail || "") ? "In stock" : (o.avail || "not recorded"),
        inStock: /^Sofort/.test(o.avail || ""), specs: {}, compat: [], uses: ["studio"], bundle: {contents: o.contents}, image: null, verified: o.checked, source: o.url};
      const p = productFromRecord(rec, "verified"); p.cp = {kind: "v-bundle", bundle: true}; P.push(p); BY[p.id] = p;
    }
  }
})();
const offerProductId = o => (byArticle(o.article) || {}).id;
const partIds = o => (o.parts || []).map(a => (byArticle(a) || {}).id).filter(Boolean);

/* the comparison basis is always named; % only when the basis is a verified reference price */
function savingVs(price, ref) {
  if (!ref || !(ref.value > price)) return null;
  const pct = Math.round((1 - price / ref.value) * 100);
  return {amount: +(ref.value - price).toFixed(2), pct, basis: ref.label, text: `${pct}% below the ${ref.basis === "best30" ? "30-day best price" : ref.basis === "uvp" ? "manufacturer's list price (UVP)" : "reference price"} of €${ref.value}`};
}
function offersFor(id) {
  const p = BY[id]; if (!p) return [];
  const art = p.tv && p.tv.article, out = [];
  for (const o of OFFERS) {
    if ((o.type === "hotdeal" || o.type === "bargain") && o.article === art) out.push({...o, productId: id, saving: savingVs(o.price, o.ref)});
    if (o.type === "bstock" && o.newArticle === art) out.push({...o, productId: offerProductId(o), saving: p.p > o.price ? {amount: +(p.p - o.price).toFixed(2), basis: "the new item's verified price", text: `€${(p.p - o.price).toFixed(2)} less than new (€${p.p})`} : null});
    if (o.type === "bundle" && (o.article === art || (o.parts || []).includes(art))) out.push({...o, productId: offerProductId(o)});
  }
  return out;
}
function bundleLabel(o) {
  return o.verifiedSaving ? `Save €${o.verifiedSaving.toFixed(2)} vs buying the ${o.parts.length} parts separately (€${o.partsSum}, verified ${o.checked})` : "Recommended Setup · savings vs separate parts can't be verified";
}

/* ---------- price history and alerts (device-local) ---------- */
const PRICE_KEY = "ga3_prices", ALERT_KEY = "ga3_alerts";
const ls = {get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }};
function priceHistory(id) {
  const all = ls.get(PRICE_KEY, {}), p = BY[id];
  const h = all[id] || [];
  if (!h.length && p) h.push(p.tv ? {t: p.tv.verified, price: p.tv.price, src: "verified", note: "thomann.de product page"} : {t: TODAY.toISOString().slice(0, 10), price: p.p, src: "demo", note: "demo catalogue price"});
  return h;
}
function seedHistory(id, price, src, t) {
  const all = ls.get(PRICE_KEY, {});
  if (!all[id] || !all[id].length) { all[id] = [{t, price: +price, src, note: src === "verified" ? "thomann.de product page" : "demo catalogue price"}]; ls.set(PRICE_KEY, all); }
}
function addSnapshot(id, price, src, note, t) {
  const all = ls.get(PRICE_KEY, {}), h = priceHistory(id);
  h.push({t: t || new Date().toISOString().slice(0, 16).replace("T", " "), price: +price, src, note: note || ""});
  all[id] = h.slice(-50); ls.set(PRICE_KEY, all);
}
const getAlerts = () => ls.get(ALERT_KEY, []);
const saveAlerts = l => ls.set(ALERT_KEY, l);
function createAlert(id, mode, threshold, notify) {
  const p = BY[id]; if (!p) throw new Error("Unknown product");
  const l = getAlerts().filter(a => a.id !== id);
  const a = {id, mode: mode === "below" ? "below" : "drop", threshold: mode === "below" ? +threshold : null, basePrice: p.p, active: true, created: new Date().toISOString().slice(0, 10), triggered: null, notify: {page: true, email: !!(notify && notify.email)}};
  if (a.mode === "below" && !(a.threshold > 0)) throw new Error("Give a price threshold in EUR");
  l.push(a); saveAlerts(l); seedHistory(id, p.p, p.tv ? "verified" : "demo", p.tv ? p.tv.verified : TODAY.toISOString().slice(0, 10)); return a;
}
/* returns the alerts that fired; simulated prices fire only simulated alerts */
function evaluateAlerts(id, price, src) {
  const l = getAlerts(), fired = [];
  for (const a of l) {
    if (a.id !== id || !a.active) continue;
    const hit = a.mode === "below" ? price <= a.threshold : price < a.basePrice;
    if (hit) { a.triggered = {t: new Date().toISOString().slice(0, 16).replace("T", " "), price, src}; fired.push(a); }
  }
  saveAlerts(l); return fired;
}
/* called by the catalogue importer when verified prices change */
function onPricesImported(updated) {
  const fired = [];
  for (const u of updated || []) { seedHistory(u.id, u.old, "verified", u.oldVerified); addSnapshot(u.id, u.new, "import", "verified import", u.verified); fired.push(...evaluateAlerts(u.id, u.new, "import")); }
  if (fired.length && typeof onAlertsFired === "function") onAlertsFired(fired);
  return fired;
}
/* demo mode only: never changes the product's real price */
function simulatePrice(id, price) {
  addSnapshot(id, price, "simulated", "demo mode");
  const fired = evaluateAlerts(id, +price, "simulated");
  if (fired.length && typeof onAlertsFired === "function") onAlertsFired(fired);
  return fired;
}

/* ---------- Smart Bundle Builder ---------- */
/* Tier rules, applied per role (the same three rules for every goal):
   Lowest Cost     = the cheapest catalogue item that meets the role's minimum requirement.
   Best Value      = the cheapest item that meets the role's recommended requirement (listed per role).
   Upgrade-Friendly = the cheapest item that leaves room to grow (listed per role).
   Roles the customer already covers with My rig are skipped. */
const TIER_INFO = {
  low: {label: "Lowest Cost", rule: "Cheapest item that meets the minimum requirement in each role."},
  value: {label: "Best Value", rule: "Cheapest item that meets the recommended requirement in each role (shown per item)."},
  upgrade: {label: "Upgrade-Friendly", rule: "Cheapest item in each role that leaves room to grow, e.g. more inputs."},
};
const SETUP_RECIPES = {
  vocal_recording: {label: "Vocal recording at home", officialBundles: ["652654"], roles: [
    {role: "Audio interface", owns: ["interface"], need: "at least 1 mic input with phantom power", low: ["t468428", "i1"], value: ["i1"], valueWhy: "current generation (4th Gen)", upgrade: ["i2", "t560993"], upgradeWhy: "2 mic inputs for a second voice or instrument"},
    {role: "Microphone", owns: ["mic"], ownsIf: x => !!(x.cp && x.cp.needsPhantom), ownsShort: "a dynamic stage mic works, but a condenser captures studio vocals in more detail", need: "studio condenser for vocals", low: ["m4"], value: ["t235937"], valueWhy: "set includes shock mount, pop filter and 6 m XLR cable", upgrade: ["m3"], upgradeWhy: "very low self-noise (4 dBA)", covers: {"t235937": ["XLR cable"]}},
    {role: "XLR cable", owns: [], ownsIds: ["c1"], need: "XLR, 6 m", low: ["t128512"], value: ["t128512"], upgrade: ["t128513"], upgradeWhy: "10 m reaches further"},
    {role: "Mic stand", owns: [], need: "boom stand", low: ["t133136"], value: ["t133136"], upgrade: ["t104942"], upgradeWhy: "sturdier K&M stand"},
    {role: "Headphones", owns: ["headphones"], need: "closed-back, so the mic doesn't pick up the playback", low: ["t399657"], value: ["h1"], valueWhy: "closed-back studio standard", upgrade: ["h1"]}]},
  guitar_practice: {label: "Electric guitar practice", officialBundles: [], roles: [
    {role: "Electric guitar", owns: ["electric guitar"], need: "playable electric guitar", low: ["t449491"], value: ["g6"], valueWhy: "well-rated all-rounder", upgrade: ["g2"], upgradeWhy: "Alnico pickups, better hardware"},
    {role: "Amp", owns: ["amp"], need: "practice amp with headphone use", low: ["t590648"], value: ["a1"], valueWhy: "50 W, loud enough for a band, quiet modes at home", upgrade: ["a1"]},
    {role: "Instrument cable", owns: [], ownsIds: ["c2"], need: "jack cable, 3 m", low: ["t128549"], value: ["t128549"], upgrade: ["t128549"]},
    {role: "Strings", owns: ["strings"], need: "spare set", optional: true, low: ["st1"], value: ["st2"], upgrade: ["st3"], upgradeWhy: "coated strings last longer"}]},
  podcast_two: {label: "Podcast for two people", officialBundles: [], roles: [
    {role: "Audio interface", owns: ["interface"], need: "2 mic inputs with enough gain", low: ["i2"], value: ["i2"], upgrade: ["t560993"], upgradeWhy: "more outputs for monitoring"},
    {role: "Microphones (×2)", qty: 2, owns: [], need: "dynamic mics that reject room noise", low: ["m1"], value: ["m1"], upgrade: ["m2"], upgradeWhy: "broadcast-grade voice (needs more gain)"},
    {role: "XLR cables (×2)", qty: 2, owns: [], need: "XLR, 6 m", low: ["t128512"], value: ["t128512"], upgrade: ["t128512"]},
    {role: "Mic stands (×2)", qty: 2, owns: [], need: "stand or boom", low: ["t133136"], value: ["t133136"], upgrade: ["t104942"]},
    {role: "Headphones (×2)", qty: 2, owns: [], need: "closed-back", low: ["t399657"], value: ["h1"], upgrade: ["h1"]}]},
};
function buildSetupOptions(goal, budget) {
  const rec = SETUP_RECIPES[goal]; if (!rec) throw new Error("Unknown goal. Use one of: " + Object.keys(SETUP_RECIPES).join(", "));
  const rig = rigItems(), tiers = [];
  for (const k of ["low", "value", "upgrade"]) {
    const items = [], skipped = [], covered = new Set();
    for (const r of rec.roles) {
      const own = rig.find(x => (r.owns || []).includes(x.cp && x.cp.kind) || (r.ownsIds || []).includes(x.id));
      if (own && (!r.ownsIf || r.ownsIf(own))) { skipped.push({role: r.role, owned: own.name}); continue; }
      if (own) skipped.push({role: r.role, ownedButShort: own.name, why: r.ownsShort});
      if (covered.has(r.role)) { skipped.push({role: r.role, covered: true}); continue; }
      const cands = (r[k] || r.low).map(id => BY[id]).filter(Boolean).sort((a, b) => a.p - b.p);
      const p = cands[0]; if (!p) continue;
      const qty = r.qty || 1;
      (r.covers && r.covers[p.id] || []).forEach(c => covered.add(c));
      items.push({role: r.role, id: p.id, name: p.n, qty, price: p.p, line: +(p.p * qty).toFixed(2), why: k === "value" && r.valueWhy ? r.valueWhy : k === "upgrade" && r.upgradeWhy ? r.upgradeWhy : r.need, optional: !!r.optional, verified: !!p.tv, verifiedOn: p.tv && p.tv.verified});
    }
    const total = +items.filter(i => !i.optional).reduce((a, i) => a + i.line, 0).toFixed(2);
    const ids = items.map(i => i.id), fc = fitCheck(ids.filter(id => !BY[id].vonly)).filter(c => c.status === "bad" && c.type !== "delivery");
    tiers.push({key: k, ...TIER_INFO[k], items, skipped, total, overBudget: budget ? total > budget : false, problems: fc.map(c => c.note)});
  }
  const bundles = rec.officialBundles.map(a => OFFERS.find(o => o.type === "bundle" && o.article === a)).filter(Boolean).map(o => ({id: offerProductId(o), name: o.name, price: o.price, partsSum: o.partsSum, saving: o.verifiedSaving, label: bundleLabel(o), contents: o.contents, checked: o.checked, url: o.url}));
  return {goal, label: rec.label, budget: budget || null, tiers, bundles, note: "Prices: verified items show their thomann.de price and date; demo items use demo prices. Totals exclude optional items."};
}

/* ---------- Review My Setup (cart): proposals only, nothing changes without the customer ---------- */
function reviewCart() {
  const basket = S.basket.map(b => ({...b, p: BY[b.id]})).filter(b => b.p), props = [], info = [];
  const rig = rigItems(), ownedIds = new Set(S.rig.map(r => r.id));
  const total = +basket.reduce((a, b) => a + b.p.p * b.qty, 0).toFixed(2);
  // duplicates: already owned, or two items doing the same job
  for (const b of basket) {
    if (ownedIds.has(b.id)) props.push({kind: "remove", id: b.id, title: `Remove ${b.p.n}`, reason: "It's already in My rig.", delta: -b.p.p * b.qty});
    else { const note = ownedNote(b.p); if (note && !note.startsWith("You own")) info.push({kind: "duplicate", text: `${b.p.n}: ${note}. Keep it only if it's an upgrade.`}); }
  }
  const kinds = {}; for (const b of basket) { const k = DUP_KINDS[b.p.cp && b.p.cp.kind] ? b.p.cp.kind : SUB_KIND[b.p.sub]; if (DUP_KINDS[k]) (kinds[k] = kinds[k] || []).push(b.p.n); }
  for (const [k, l] of Object.entries(kinds)) if (l.length > 1) info.push({kind: "duplicate", text: `Two items doing the same job (${DUP_KINDS[k]}): ${l.join(" and ")}.`});
  // missing essentials (demo fit model; verified-only items aren't modelled)
  const missing = new Map();
  for (const b of basket) if (!b.p.vonly) for (const m of missingFor(b.p)) if (m.fix && BY[m.fix] && !S.basket.some(x => x.id === m.fix)) missing.set(m.fix, m.what);
  for (const [id, what] of missing) props.push({kind: "add", id, title: `Add ${BY[id].n}`, reason: `Essential: without ${what} the setup won't work.`, delta: BY[id].p});
  // compatibility problems
  const fc = fitCheck(basket.filter(b => !b.p.vonly).map(b => b.id)).filter(c => c.status === "bad" && c.type !== "delivery" && c.type !== "ready");
  for (const c of fc) info.push({kind: "compat", text: c.note});
  if (basket.some(b => b.p.vonly)) info.push({kind: "unverified", text: "Compatibility for verified-only items isn't modelled in the prototype; only their listed specs are verified."});
  // verified bundles that cover items in the basket
  for (const o of OFFERS.filter(o => o.type === "bundle" && o.parts && o.verifiedSaving)) {
    const parts = partIds(o), have = parts.filter(id => S.basket.some(b => b.id === id));
    if (have.length >= 2) {
      const cur = have.reduce((a, id) => a + BY[id].p, 0), missingParts = parts.filter(id => !have.includes(id));
      props.push({kind: "swap", ids: have, id: offerProductId(o), title: `Swap ${have.length} items for the ${o.name}`, reason: `${bundleLabel(o)}.${missingParts.length ? ` It also includes ${missingParts.map(id => BY[id].n).join(", ")}.` : ""}`, delta: +(o.price - cur).toFixed(2), verified: true});
    }
  }
  // relevant verified discounts on items already in the basket
  for (const b of basket) for (const o of offersFor(b.id)) {
    if (o.type === "bstock" && o.productId && o.productId !== b.id) props.push({kind: "swap", ids: [b.id], id: o.productId, title: `Switch to B-Stock: ${o.name}`, reason: `B-Stock, not new: “${o.condition}”. ${o.warranty}. Verified ${o.checked}.`, delta: +(o.price - b.p.p).toFixed(2), verified: true, bstock: true});
    if ((o.type === "hotdeal" || o.type === "bargain") && o.saving) info.push({kind: "deal", text: `${b.p.n} is listed as a ${o.type === "hotdeal" ? "Hot Deal" : "bargain"}: ${o.saving.text} (thomann.de, ${o.checked}).`});
  }
  return {total, proposals: props.map((p, i) => ({...p, n: i})), info};
}
function applyCartProposal(pr) {
  if (pr.kind === "remove") S.basket = S.basket.filter(b => b.id !== pr.id);
  if (pr.kind === "add") S.basket.push({id: pr.id, qty: 1});
  if (pr.kind === "swap") { S.basket = S.basket.filter(b => !pr.ids.includes(b.id)); if (!S.basket.some(b => b.id === pr.id)) S.basket.push({id: pr.id, qty: 1}); }
}
