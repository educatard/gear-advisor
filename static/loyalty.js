/* Conversion, basket completeness and loyalty models. No UI code. Load after savings.js.
   Trust rules built in: additions are classified and explained, owned/basket items are never re-suggested,
   budgets are respected unless the customer allows more, nothing is added to the basket here,
   events are anonymous, and metrics without real data are reported as not measurable. */

/* ---------- Ready-to-Play: what else the main item needs ---------- */
const kindOf = p => DUP_KINDS[p.cp && p.cp.kind] || (p.cp && ["electric guitar", "mic", "edrums", "keys", "interface"].includes(p.cp.kind)) ? p.cp.kind : (SUB_KIND[p.sub] || ({"Large-diaphragm microphones": "mic", "Vocal microphones": "mic", "Instrument microphones": "mic", "Electric guitars": "electric guitar", "DJ controllers": "djctl"})[p.sub] || p.cp && p.cp.kind);
/* opts per tier (same names as the goal builder): min = Lowest Cost, bal = Best Value, up = Upgrade-Friendly (cheapest listed id that exists wins) */
const RTP_RULES = {
  "electric guitar": [
    {lvl: "Essential", role: "Amp or headphone amp", why: "an electric guitar is nearly silent without one", owns: ["amp"], min: ["t590648"], bal: ["a1"], up: ["a1"]},
    {lvl: "Essential", role: "Instrument cable", why: "connects the guitar to the amp", ownsIds: ["c2", "t128549"], min: ["t128549"], bal: ["c2"], up: ["c2"]},
    {lvl: "Recommended", role: "Spare strings", why: "strings break, and fresh ones sound better", owns: ["strings"], min: ["st1"], bal: ["st2"], up: ["st3"]},
    {lvl: "Recommended", role: "Picks", why: "easier, cleaner strumming", owns: ["picks"], min: ["x2"], bal: ["x2"], up: ["x2"]},
    {lvl: "Optional", role: "Guitar stand", why: "keeps the guitar safe and ready to play", min: ["t129408"], bal: ["t129408"], up: ["t129408"]}],
  mic: [
    {lvl: "Essential", role: "Audio interface", why: "an XLR mic can't plug into a computer directly", owns: ["interface"], min: ["t468428"], bal: ["i1"], up: ["i2"]},
    {lvl: "Essential", role: "XLR cable", why: "connects the mic to the interface", ownsIds: ["c1", "t128512", "t128513"], coveredBySet: true, min: ["t128512"], bal: ["c1", "t128512"], up: ["t128513"]},
    {lvl: "Essential", role: "Mic stand", why: "holds the mic still while you sing or speak", min: ["t133136"], bal: ["t133136"], up: ["t104942"]},
    {lvl: "Recommended", role: "Closed-back headphones", why: "lets you hear yourself without the mic picking up the playback", owns: ["headphones"], min: ["t399657"], bal: ["h1"], up: ["h1"]}],
  interface: [
    {lvl: "Essential", role: "Headphones or monitors", why: "you need to hear what you record", owns: ["headphones", "monitors"], min: ["t399657"], bal: ["h1"], up: ["h1"]},
    {lvl: "Recommended", role: "Microphone", why: "to record vocals or acoustic instruments", owns: ["mic"], min: ["m4"], bal: ["t235937"], up: ["m3"]},
    {lvl: "Optional", role: "Studio monitors", why: "for mixing on speakers as well as headphones", owns: ["monitors"], min: ["s2"], bal: ["s2"], up: ["t431386"]}],
  edrums: [
    {lvl: "Essential", role: "Headphones", why: "e-drums make almost no sound without them", owns: ["headphones"], min: ["t520620"], bal: ["t520620"], up: ["h1"]},
    {lvl: "Essential", role: "Drum throne", why: "this kit doesn't include a seat", skipIfSpec: ["Inkl. Hocker", "Ja"], ownsIds: ["t190868"], min: ["t190868"], bal: ["t190868"], up: ["t190868"]}],
  keys: [
    {lvl: "Recommended", role: "Sustain pedal", why: "needed for most piano pieces", owns: ["sustain"], min: ["k4"], bal: ["k4"], up: ["k4"]},
    {lvl: "Recommended", role: "Headphones", why: "practise without disturbing anyone", owns: ["headphones"], min: ["t399657"], bal: ["h1"], up: ["h1"]},
    {lvl: "Optional", role: "Piano bench", why: "the right height for posture", min: ["t416998"], bal: ["t416998"], up: ["t416998"]}],
  djctl: [
    {lvl: "Essential", role: "DJ headphones", why: "to cue the next track", owns: ["headphones"], min: ["t331904"], bal: ["t379291"], up: ["t379291"]}],
};
const RTP_TIERS = {min: {label: TIER_INFO.low.label, rule: "Only what's needed to play, cheapest option in each role."}, bal: {label: TIER_INFO.value.label, rule: "What's needed plus recommended items, mid-range options."}, up: {label: TIER_INFO.upgrade.label, rule: "Everything incl. optional items, options with room to grow."}};
function readyToPlay(anchorId, budget, allowOverBudget) {
  const a = BY[anchorId]; if (!a) throw new Error("Unknown product id");
  const rules = RTP_RULES[kindOf(a)] || [];
  const rig = rigItems(), inBasket = id => S.basket.some(b => b.id === id);
  const isSet = !!(a.tv && a.tv.bundle) || !!(a.cp && a.cp.bundle);
  const tiers = {};
  for (const k of ["min", "bal", "up"]) {
    const items = [], skipped = [];
    for (const r of rules) {
      if (k === "min" && r.lvl !== "Essential") continue;
      if (k === "bal" && r.lvl === "Optional") continue;
      if (r.skipIfSpec && String((a.specs || {})[r.skipIfSpec[0]] || "").startsWith(r.skipIfSpec[1])) { skipped.push({role: r.role, why: "included with the product"}); continue; }
      if (r.coveredBySet && isSet) { skipped.push({role: r.role, why: "included in the set"}); continue; }
      const own = rig.find(x => (r.owns || []).includes(x.cp && x.cp.kind) || (r.ownsIds || []).includes(x.id));
      if (own) { skipped.push({role: r.role, why: "you own " + own.name}); continue; }
      const pick = (r[k] || r.min).map(id => BY[id]).filter(Boolean).sort((x, y) => x.p - y.p)[0];
      if (!pick) continue;
      if (inBasket(pick.id)) { skipped.push({role: r.role, why: pick.n + " is already in your basket"}); continue; }
      items.push({lvl: r.lvl, role: r.role, why: r.why, id: pick.id, name: pick.n, price: pick.p, verified: !!pick.tv});
    }
    let total = +(a.p + items.reduce((s, i) => s + i.price, 0)).toFixed(2), dropped = [];
    if (budget && total > budget && !allowOverBudget) {
      for (const lvl of ["Optional", "Recommended"]) while (total > budget && items.some(i => i.lvl === lvl)) {
        const i = items.findIndex(x => x.lvl === lvl); dropped.push(items[i]); total = +(total - items[i].price).toFixed(2); items.splice(i, 1);
      }
    }
    tiers[k] = {key: k, ...RTP_TIERS[k], items, skipped, dropped, total, overBudget: !!budget && total > budget};
  }
  return {anchor: {id: a.id, name: a.n, price: a.p}, budget: budget || null, known: rules.length > 0, tiers,
    note: rules.length ? "Essential = needed for it to work; Recommended = clearly better experience; Optional = convenience or growth." : "No add-on rules for this product type: our data doesn't say it needs anything else. Ask a specialist if unsure."};
}

/* ---------- Purchase-readiness summary (the basket) ---------- */
function purchaseReadiness() {
  const items = S.basket.map(b => ({...b, p: BY[b.id]})).filter(b => b.p);
  const total = +items.reduce((a, b) => a + b.p.p * b.qty, 0).toFixed(2);
  const demoIds = items.filter(b => !b.p.vonly).map(b => b.id);
  const checks = demoIds.length ? fitCheck(demoIds).filter(c => c.type === "fit" || c.type === "computer" || c.type === "ready") : [];
  const verified = checks.filter(c => c.status === "ok").map(c => c.note), problems = checks.filter(c => c.status !== "ok").map(c => c.note);
  const unresolved = [];
  for (const b of items) {
    if (b.p.vonly) unresolved.push(`${b.p.n}: compatibility beyond its listed specs isn't verified.`);
    if (b.p.tv && !b.p.tv.inStock) unresolved.push(`${b.p.n}: ${b.p.tv.availEn}.`);
    if (b.p.bstockOf) unresolved.push(`${b.p.n} is B-Stock: ${b.p.tv.condition}.`);
    if (!b.p.tv) unresolved.push(`${b.p.n}: demo product, price not verified on thomann.de.`);
  }
  const highPrice = items.some(b => b.p.p > 1000);
  const offerSpecialist = problems.some(Boolean) || items.some(b => b.p.vonly) || highPrice;
  return {items: items.map(b => ({id: b.id, name: b.p.n, qty: b.qty, price: b.p.p, line: +(b.p.p * b.qty).toFixed(2), verified: !!b.p.tv, verifiedOn: b.p.tv && b.p.tv.verified})),
    total, verified, problems, unresolved, offerSpecialist, highPrice, ready: !problems.length};
}

/* ---------- Upgrade roadmap from the Music Profile ---------- */
const UPGRADE_PATHS = {g1: "g2", t449491: "g2", g6: "g2", g2: "g3", g5: "g4", a3: "a1", a4: "a1", t590648: "a1", a1: "a2", i4: "i2", t468428: "i1", i1: "i2", i2: "t560993", h2: "h4", h1: "h4", t399657: "h1", m1: "m3", k3: "k1", kd2: "t589542", t589542: "t457271", t457271: "t568064", t461227: "t464015", t464015: "t511732", d2: "t511732"};
const START_WITH = {guitar: ["t449491", "t590648"], acoustic: ["g8"], bass: [], piano: ["t457271"], drums: ["t461227"], vocals: ["m1"], production: ["i1", "t432718"], wind: ["t147061"], strings: ["t378019"], other: []};
function upgradeRoadmap() {
  const out = [], owned = new Set(S.rig.map(r => r.id));
  for (const ins of S.music.instruments) {
    const gear = rigItems().filter(x => x.inst && x.inst.includes(ins.id)), budget = +ins.budget || null, steps = [];
    if (!gear.length) {
      for (const id of (START_WITH[ins.kind] || [])) if (BY[id] && !owned.has(id)) steps.push({when: "Now", id, name: BY[id].n, price: BY[id].p, why: "a starting point for " + insName(ins).toLowerCase()});
    }
    for (const g of gear) if (g.id && !g.custom) for (const m of missingFor(BY[g.id] || g)) if (m.fix && BY[m.fix] && !owned.has(m.fix) && !steps.some(s => s.id === m.fix)) steps.push({when: "Now", id: m.fix, name: BY[m.fix].n, price: BY[m.fix].p, why: `your ${g.name} needs ${m.what}`});
    for (const g of gear) { const up = g.id && UPGRADE_PATHS[g.id]; if (up && BY[up] && !owned.has(up)) steps.push({when: budget && BY[up].p > budget ? "Later" : "Next", id: up, name: BY[up].n, price: BY[up].p, why: `upgrade from your ${g.name}${ins.goals ? " for your goal: " + ins.goals : ""}`}); }
    out.push({ins: insName(ins), level: MP_LEVELS[ins.level] || "", budget, steps: steps.slice(0, 6)});
  }
  return out;
}

/* ---------- Saved projects (device-local) ---------- */
const PROJ_KEY = "ga3_projects";
const getProjects = () => ls.get(PROJ_KEY, []);
const saveProjects = l => ls.set(PROJ_KEY, l);
function createProject(name, items, notes) {
  const l = getProjects(), p = {id: "pr" + Date.now().toString(36), name: String(name || "My project").slice(0, 60), items: items.filter(([id]) => BY[id]).map(([id, q]) => [id, q || 1]), notes: notes || "", created: new Date().toISOString().slice(0, 10), updated: new Date().toISOString().slice(0, 10)};
  l.push(p); saveProjects(l); return p;
}

/* ---------- Consultation summary for a specialist (shared only with consent) ---------- */
function consultSummary() {
  return localSummary() + "\nOpen question: ";
}

/* ---------- Anonymous event tracking ---------- */
const EVENT_NAMES = ["chat_started", "needs_assessment_completed", "product_recommended", "product_compared", "compatibility_checked", "setup_completed", "bundle_viewed", "deal_viewed", "price_alert_created", "product_saved", "live_agent_suggested", "add_to_cart", "cart_reviewed", "human_handoff_requested", "human_handoff_completed", "thomann_product_link_clicked", "returning_profile_loaded", "purchase_completed", "product_page_viewed", "welcome_card_shown", "checkin_answered", "answer_feedback", "review_summary_shown"];
const EV_KEY = "ga3_events";
const SESSION_ID = (() => { try { let s = sessionStorage.getItem("ga3_sid"); if (!s) { s = "s-" + Math.random().toString(36).slice(2, 10); sessionStorage.setItem("ga3_sid", s); } return s; } catch (e) { return "s-" + Math.random().toString(36).slice(2, 10); } })();
const VISITOR = (() => { const v = ls.get("ga3_vid", null); if (v) return {id: v, returning: true}; const n = "v-" + Math.random().toString(36).slice(2, 10); ls.set("ga3_vid", n); return {id: n, returning: false}; })();
const sessionRecs = new Set();
function track(name, props) {
  if (!EVENT_NAMES.includes(name)) return;
  const l = ls.get(EV_KEY, []);
  l.push({e: name, s: SESSION_ID, v: VISITOR.id, t: Date.now(), variant: S.variant || "B", ...(props || {})});
  ls.set(EV_KEY, l.slice(-5000));
}
function computeMetrics(events) {
  const ev = events || ls.get(EV_KEY, []);
  const sessions = new Set(ev.map(x => x.s)), by = n => ev.filter(x => x.e === n), sess = n => new Set(by(n).map(x => x.s));
  const counts = Object.fromEntries(EVENT_NAMES.map(n => [n, by(n).length]));
  const chat = sess("chat_started"), handoff = sess("human_handoff_requested");
  const recs = new Set(by("product_recommended").flatMap(x => (x.ids || []).map(id => x.s + "|" + id)));
  const recAdded = new Set(by("add_to_cart").filter(x => x.recommended).map(x => x.s + "|" + x.id));
  const lastCart = {}; for (const x of by("add_to_cart")) lastCart[x.s] = x.cartValue;
  const cartVals = Object.values(lastCart).filter(v => v >= 0);
  const pct = (a, b) => b ? +(a / b * 100).toFixed(1) : null;
  return {sessions: sessions.size, counts,
    metrics: [
      {name: "Conversion rate", formula: "Completed purchases / Eligible sessions × 100", num: counts.purchase_completed, den: sessions.size, value: null, status: "not measurable", note: "The prototype has no checkout, so no purchase is ever confirmed. Product page views are tracked as a proxy below, not as purchases."},
      {name: "Average order value", formula: "Total confirmed order revenue / Number of completed orders", num: 0, den: 0, value: null, status: "not measurable", note: "No confirmed orders."},
      {name: "Cart completion rate", formula: "Completed carts / Carts created × 100", num: 0, den: sess("add_to_cart").size, value: null, status: "not measurable", note: "No checkout. Proxy: sessions that reviewed their cart / sessions with a cart = " + (pct(sess("cart_reviewed").size, sess("add_to_cart").size) ?? "–") + "%."},
      {name: "Cart value (proxy, average of each session's last cart)", formula: "Sum of product prices × quantities", num: +cartVals.reduce((a, b) => a + b, 0).toFixed(2), den: cartVals.length, value: cartVals.length ? +(cartVals.reduce((a, b) => a + b, 0) / cartVals.length).toFixed(2) : null, status: "proxy", note: "Cart contents at the time of the last add-to-cart in each session; not an order value."},
      {name: "Repeat customer rate", formula: "Returning purchasing customers / Total purchasing customers × 100", num: 0, den: 0, value: null, status: "not measurable", note: "No purchases or accounts. Proxy: sessions where a returning profile loaded = " + sess("returning_profile_loaded").size + " of " + sessions.size + "."},
      {name: "Handoff rate", formula: "Conversations transferred to humans / Total conversations × 100", num: [...handoff].filter(s => chat.has(s)).length, den: chat.size, value: pct([...handoff].filter(s => chat.has(s)).length, chat.size), status: "measured (simulated handoff)", note: "Handoffs are simulated in the prototype; counts are real clicks."},
      {name: "Recommendation acceptance rate", formula: "Recommended products added to cart / Eligible recommended products × 100", num: [...recAdded].filter(x => recs.has(x)).length, den: recs.size, value: pct([...recAdded].filter(x => recs.has(x)).length, recs.size), status: "measured", note: "Per session: a product counts once when the advisor showed it and once if it was then added to the cart."},
      {name: "Product page view rate (purchase-intent proxy)", formula: "Sessions that opened a product page / Sessions × 100", num: sess("product_page_viewed").size, den: sessions.size, value: pct(sess("product_page_viewed").size, sessions.size), status: "proxy", note: "Intent, not a purchase. (Links to thomann.de were removed, so link clicks are no longer measured.)"},
    ]};
}
/* demo data for presentations: generated, labelled, never stored with real events */
function demoEvents() {
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280, out = [];
  for (let i = 0; i < 40; i++) {
    const s = "demo-" + i, v = i % 2 ? "A" : "B", push = (e, x) => out.push({e, s, v: "demo", t: i, variant: v, ...(x || {})});
    push("chat_started"); if (rnd() < .7) push("needs_assessment_completed");
    const id = ["i1", "m4", "t457271"][i % 3]; push("product_recommended", {ids: [id]});
    if (rnd() < (v === "B" ? .5 : .35)) push("add_to_cart", {id, recommended: true, cartValue: +(100 + rnd() * 400).toFixed(2)});
    if (rnd() < .2) push("human_handoff_requested"); if (rnd() < .6) push("product_page_viewed");
    if (i % 3 === 0) push("answer_feedback", {value: i % 12 === 0 ? "down" : "up"}); if (i % 24 === 0) push("answer_feedback", {value: "reason", reason: "gear"});
  }
  return out;
}

/* ---------- A/B test sessions ---------- */
const AB_KEY = "ga3_ab";
const getAB = () => ls.get(AB_KEY, []);
function recordABSession(form) {
  const ev = ls.get(EV_KEY, []).filter(x => x.s === SESSION_ID);
  const start = ev.find(x => x.e === "chat_started"), firstAdd = ev.find(x => x.e === "add_to_cart");
  const rec = {variant: S.variant || "B", t: new Date().toISOString().slice(0, 16), session: SESSION_ID,
    taskCompleted: form.taskCompleted, minutesToDecision: start && firstAdd && firstAdd.t > start.t ? +((firstAdd.t - start.t) / 60000).toFixed(1) : null,
    compatAccuracy: form.compatAccuracy, cartItems: S.basket.reduce((a, b) => a + b.qty, 0), cartValue: +S.basket.reduce((a, b) => a + BY[b.id].p * b.qty, 0).toFixed(2),
    trust: +form.trust || null, usefulness: +form.usefulness || null, willingness: +form.willingness || null, handoffHelpful: form.handoffHelpful};
  const l = getAB(); l.push(rec); ls.set(AB_KEY, l); return rec;
}
function summariseAB(records) {
  const out = {};
  for (const v of ["A", "B"]) {
    const l = records.filter(r => r.variant === v), avg = k => { const x = l.map(r => r[k]).filter(n => typeof n === "number"); return x.length ? +(x.reduce((a, b) => a + b, 0) / x.length).toFixed(2) : null; };
    out[v] = {n: l.length, taskCompletion: l.length ? +(l.filter(r => r.taskCompleted === "yes").length / l.length * 100).toFixed(0) : null, minutesToDecision: avg("minutesToDecision"), compatCorrect: l.length ? +(l.filter(r => r.compatAccuracy === "correct").length / l.length * 100).toFixed(0) : null,
      cartItems: avg("cartItems"), cartValue: avg("cartValue"), trust: avg("trust"), usefulness: avg("usefulness"), willingness: avg("willingness"), handoffHelpful: l.filter(r => r.handoffHelpful === "yes").length + "/" + l.filter(r => r.handoffHelpful !== "not used").length};
  }
  return out;
}
function demoAB() { let seed = 3; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280; return Array.from({length: 16}, (_, i) => ({variant: i % 2 ? "A" : "B", taskCompleted: r() < .75 ? "yes" : "no", minutesToDecision: +(3 + r() * 8).toFixed(1), compatAccuracy: r() < .7 ? "correct" : "partly", cartItems: 1 + Math.floor(r() * 4), cartValue: +(80 + r() * 400).toFixed(2), trust: 3 + Math.floor(r() * 3), usefulness: 3 + Math.floor(r() * 3), willingness: 2 + Math.floor(r() * 4), handoffHelpful: r() < .5 ? "not used" : "yes"})); }
