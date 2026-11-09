/* Customer review facts for the review summary.
   REAL: read on the thomann.de product pages (German store) on 2026-11-09. Star rating, number of ratings,
   the star distribution and the number of written reviews are as shown on the page. The themes are our own
   short paraphrase of what reviewers say; no review text and no reviewer names are stored here.
   DEMO: simulated themes for the demo catalogue, always labelled "Simulated demo reviews". */
const REVIEWS_CHECKED = "2026-11-09";
const ASPECT_EN = {BEDIENUNG: "Ease of use", FEATURES: "Features", SOUND: "Sound", VERARBEITUNG: "Build quality", TRAGEKOMFORT: "Comfort"};
/* key: Thomann article number. dist = [5★, 4★, 3★, 2★, 1★] customers. praised / criticised: [theme, how often] */
const REAL_REVIEWS = {
  "269795": {stars: 4.8, ratings: 123, dist: [106, 15, 1, 1, 0], written: 76, aspects: ["FEATURES", "SOUND", "VERARBEITUNG"],
    praised: [["Versatile, powerful tone from the Seymour Duncan pickups", "often"], ["Very playable: comfortable neck and a fairly light body", "often"], ["Striking satin finish and overall look", "sometimes"]],
    criticised: [["Small cosmetic flaws, such as binding colour or wear on the gold hardware", "a few"], ["Setup or nut height may need adjusting out of the box", "a few"]]},
  "566673": {stars: 4.7, ratings: 319, dist: [252, 49, 9, 4, 5], written: 162, aspects: ["BEDIENUNG", "FEATURES", "SOUND", "VERARBEITUNG"],
    praised: [["Clear sound with very low latency", "often"], ["Solid build in a compact case", "often"], ["Easy plug-and-play setup and a large software bundle", "sometimes"]],
    criticised: [["Occasional driver or audio dropouts on some operating systems", "a few"], ["No power switch: you unplug the USB cable to turn it off", "a few"]]},
  "590613": {stars: 4.8, ratings: 226, dist: [183, 38, 5, 0, 0], written: 127, aspects: ["BEDIENUNG", "FEATURES", "SOUND", "VERARBEITUNG"],
    praised: [["Wide range of good built-in effects", "often"], ["Great sound, and the power control makes quiet practice at home easy", "often"], ["Very good value for money", "sometimes"]],
    criticised: [["Bluetooth and the phone app need a separately sold adapter", "a few"], ["Fewer preset slots and connections than the bigger model", "a few"]]},
  "174334": {stars: 4.8, ratings: 5434, dist: [4500, 798, 95, 23, 18], written: 2966, aspects: ["SOUND", "TRAGEKOMFORT", "VERARBEITUNG"],
    praised: [["Very comfortable, even in long sessions", "often"], ["Clear, detailed sound for monitoring and production", "often"], ["Robust, with parts that are easy to replace", "sometimes"]],
    criticised: [["The treble can sound sharp or tiring to some listeners", "a few"], ["Velour pads trap sweat and need cleaning or replacing", "a few"]]},
  "566684": {stars: 4.7, ratings: 354, dist: [286, 52, 6, 6, 4], written: 195, aspects: ["BEDIENUNG", "FEATURES", "SOUND", "VERARBEITUNG"],
    praised: [["Clean, transparent sound with low-noise preamps", "often"], ["Easy plug-and-play setup", "often"], ["Solid build in a compact case", "sometimes"]],
    criticised: [["Occasional stability problems or dropouts on Windows", "a few"], ["Auto Gain and Clip Safe don't always set levels precisely", "a few"]]},
  "560993": {stars: 4.7, ratings: 67, dist: [54, 10, 2, 0, 1], written: 44, aspects: ["BEDIENUNG", "FEATURES", "SOUND", "VERARBEITUNG"],
    praised: [["Low-noise preamps with enough gain, even for a Shure SM7B without a booster", "often"], ["Clear, detailed sound", "sometimes"], ["Send/return jacks for adding external preamps or effects", "a few"]],
    criticised: [], note: "No recurring complaint in the written reviews read; one 1-star rating."},
  "105767": {stars: 4.8, ratings: 5858, dist: [4937, 832, 78, 2, 5], written: 2462, aspects: ["FEATURES", "SOUND", "VERARBEITUNG"],
    praised: [["Extremely robust; many say it lasts for decades", "often"], ["Reliable for live vocals, with good feedback rejection", "often"], ["Works on stage, in rehearsals and for recording", "sometimes"]],
    criticised: [["Less high-end detail than condenser or more specialised microphones", "a few"]]},
  "129929": {stars: 4.9, ratings: 2127, dist: [1902, 185, 22, 13, 5], written: 1212, aspects: ["FEATURES", "SOUND", "VERARBEITUNG"],
    praised: [["Warm, clear sound that handles strong voices and instruments", "often"], ["Rejects room and background noise well, even in untreated rooms", "often"], ["Very durable", "sometimes"]],
    criticised: [["Needs a strong interface or an inline preamp for enough gain", "a few"], ["The mount and connector position can be awkward on some boom arms", "a few"]]},
  "561426": {stars: 4.7, ratings: 130, dist: [106, 19, 1, 0, 4], written: 72, aspects: ["FEATURES", "SOUND", "VERARBEITUNG"],
    praised: [["Clean, detailed sound with very low self-noise", "often"], ["Both XLR and USB-C, so it fits many setups", "often"], ["Great value, with shock mount and pop filter included", "sometimes"]],
    criticised: [["The sensitive capsule picks up room noise in untreated rooms", "a few"], ["The USB connection and software can be fiddly", "a few"]]},
  "186943": {stars: 4.7, ratings: 1305, dist: [908, 353, 38, 2, 4], written: 686, aspects: ["FEATURES", "SOUND", "VERARBEITUNG"],
    praised: [["Clear, detailed and balanced sound for voice and instruments", "often"], ["Solid metal build", "often"], ["Great value, especially for a first home studio", "sometimes"]],
    criticised: [["Needs 48 V phantom power, and no pop filter or shock mount is included", "a few"]]},
  "457271": {stars: 4.8, ratings: 456, dist: [372, 68, 10, 5, 1], written: 291, aspects: ["BEDIENUNG", "FEATURES", "SOUND", "VERARBEITUNG"],
    praised: [["Weighted keys that feel close to an acoustic piano", "often"], ["Warm, natural piano sound", "often"], ["Great value, especially for beginners", "sometimes"]],
    criticised: [["Built-in speakers have limited volume and quality", "a few"], ["Fewer sounds and features than higher models", "a few"]]},
  "359614": {stars: 4.7, ratings: 637, dist: [498, 121, 11, 3, 4], written: 351, aspects: ["BEDIENUNG", "FEATURES", "SOUND", "VERARBEITUNG"],
    praised: [["Weighted keys with a realistic piano feel", "often"], ["Great value, especially for beginners", "often"], ["Simple and easy to use", "sometimes"]],
    criticised: [["Built-in speakers sound weaker than headphones", "a few"], ["The included sustain pedal and accessories feel basic", "a few"]]},
  "449491": {stars: 4.6, ratings: 947, dist: [636, 250, 42, 16, 2], written: 573, aspects: ["FEATURES", "SOUND", "VERARBEITUNG"],
    praised: [["Excellent value; a good first guitar", "often"], ["Versatile sounds from the HSS pickups", "often"], ["Nice satin finish and comfortable to play", "sometimes"]],
    criticised: [["May need a setup at first: strings, action or fret ends", "a few"], ["Occasional fret buzz or slight noise at high gain", "a few"]]},
};
/* simulated themes per demo category: [praised...], [criticised...] */
const DEMO_THEMES = {
  guitars: [["Comfortable neck and easy to play", "Good tone for the price", "Holds tuning well"], ["May need a setup out of the box", "Some find it heavy"]],
  guitar: [["Comfortable neck and easy to play", "Good tone for the price", "Holds tuning well"], ["May need a setup out of the box", "Some find it heavy"]],
  amps: [["Good sound at low volume", "Easy to dial in", "Useful built-in effects"], ["Gets boomy when turned up", "Some wish for more connections"]],
  pedals: [["Does its one job very well", "Solid metal case", "Easy to set up"], ["Needs a power supply or batteries", "Can be noisy at extreme settings"]],
  power: [["Quiet power with no hum", "Compact and solid"], ["Not enough outputs for bigger boards"]],
  interfaces: [["Clean, low-noise recordings", "Easy setup on Mac and PC", "Solid build"], ["Occasional driver hiccups", "Limited inputs for a band"]],
  mics: [["Clear sound on vocals", "Well built"], ["Picks up room noise", "Needs a stand or pop filter"]],
  headphones: [["Comfortable for long sessions", "Detailed sound"], ["Cable is long or not detachable", "Pads get warm"]],
  monitors: [["Clear, balanced sound for mixing", "Compact for small rooms"], ["Limited bass at low volume"]],
  keys: [["Realistic key feel", "Good piano sound"], ["Built-in speakers are basic", "Pedal feels cheap"]],
  drums: [["Quiet pads for practice at home", "Good sounds for the price"], ["Hi-hat feels less natural", "Rack wobbles when played hard"]],
  accessories: [["Does the job reliably", "Good value"], ["Feels basic"]],
};
function reviewOf(p) {
  if (!p) return null;
  const art = p.tv && p.tv.article, real = art && REAL_REVIEWS[art];
  if (real) return {kind: "real", stars: real.stars, ratings: real.ratings, dist: real.dist, written: real.written, aspects: real.aspects.map(a => ASPECT_EN[a] || a),
    praised: real.praised, criticised: real.criticised, note: real.note || "", source: "thomann.de, checked " + REVIEWS_CHECKED};
  if (p.r && p.rv && !p.vonly) {
    const t = DEMO_THEMES[p.c] || DEMO_THEMES.accessories, h = [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const freq = i => i === 0 ? "often" : i === 1 && p.r >= 4.6 ? "often" : "sometimes";
    const tags = p.tags || [];
    const praised = t[0].map((x, i) => [x, freq(i)]);
    if (tags.includes("budget") && !praised.some(x => /price|value/i.test(x[0]))) praised.push(["Good value for money", "sometimes"]);
    const crit = t[1].slice(0, p.r >= 4.7 ? 1 + (h % 2) : 2).map(x => [x, "a few"]);
    return {kind: "demo", stars: p.r, ratings: p.rv, dist: null, written: null, aspects: [], praised, criticised: crit, note: "", source: "Simulated demo reviews"};
  }
  return null;
}
