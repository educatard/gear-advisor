/* Page functions the AI advisor can call, and the cards they render into the chat. */
/* ---------------- Card renderers ---------------- */
function miniProduct(p,extra=""){
  const own=typeof ownedNote==="function"?ownedNote(p):"";if(own)extra=(extra?extra+" · ":"")+`<b class="ownnote">${esc(own)}</b>`;
  return `<div class="mini"><div class="info"><div>${esc(p.n)}</div><div class="sub">${p.r?"★ "+p.r+" · ":""}${stockText(p)}${p.tv?` · <span class="vtag">verified ${esc(p.tv.verified)}</span>`:" · demo"}${extra?" · "+extra:""}</div></div><span class="price" style="font-size:14px">${eur(p.p)}</span><button class="btn small" data-detail="${p.id}">View</button><button class="btn small primary" data-add="${p.id}">Add</button>${typeof saveBtn==="function"?saveBtn(p.id):""}</div>`;
}
function stockText(p){if(p.tv)return p.tv.availEn;return p.st?(p.st<15?p.st+" left":"in stock"):"back in ~"+(p.restock||10)+" days"}
const card=(title,tags,body)=>`<div class="card"><h5>${esc(title)} ${tags||""}${typeof cardMark==="function"?cardMark(title):""}</h5>${body}</div>`;
const sim='<span class="tag sim">simulated</span>';
const USE_SPECS={studio:/input|eingäng|phantom|abtast|sample|bit|gain|noise|rausch|impedan|usb|frequen|charakter|pattern|type/i,live:/watt|leistung|spl|schalldruck|weight|gewicht|battery|batter|robust|charakter|feedback|channels|kanäle/i,home:/headphone|kopfhörer|bluetooth|watt|leistung|speaker|lautsprecher|weight|gewicht|size|abmess/i,producing:/usb|midi|software|version|input|eingäng|pad|key|tasten/i,teaching:/key|tasten|sounds|metronom|speaker|lautsprecher/i,rehearsal:/watt|leistung|speaker|lautsprecher|channels|kanäle/i};
let CMP_USE="";
function compareRows(l){let keys=[...new Set(l.flatMap(p=>Object.keys({...p.specs,...(p.tv&&p.vonly?{}:p.tv?.specs||{})})))];const re=USE_SPECS[CMP_USE];if(re)keys=[...keys.filter(k=>re.test(k)),...keys.filter(k=>!re.test(k))];return [["Price",l.map(p=>eur(p.p))],["B-Stock",l.map(p=>p.bs?eur(p.bs):"–")],["Rating",l.map(p=>p.r?"★ "+p.r:"no data")],["Stock",l.map(stockText)],...(typeof advMode==="function"&&advMode()==="experienced"?[["Delivery",l.map(deliveryText)],["Sound (described, not audio)",l.map(soundText)]]:[]),...keys.map(k=>[(re&&re.test(k)?"★ ":"")+k,l.map(p=>p.specs[k]||p.tv?.specs?.[k]||"–")]),["Source",l.map(p=>p.tv?"thomann.de, verified "+p.tv.verified:"demo data")]]}
function compareTable(l){const rows=compareRows(l);/* rows already ordered */return `<div class="tblwrap"><table class="cmp"><thead><tr><th></th>${l.map(p=>`<th>${esc(p.n)}</th>`).join("")}</tr></thead><tbody>${rows.map(([k,v])=>`<tr><th>${esc(k)}</th>${v.map(x=>`<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`}

/* ---------------- Tools for Claude ---------------- */
let currentCards=null, setStatus=()=>{};
const push=html=>{if(currentCards){const d=document.createElement("div");d.innerHTML=html;currentCards.append(...d.childNodes);scrollLog()}};
const shownLog=[];
const pick=(list,src)=>{if(typeof recordOffer==="function")recordOffer(list,src);if(typeof track==="function"){const n=list.map(x=>x.id).filter(id=>!sessionRecs.has(id));n.forEach(id=>sessionRecs.add(id));if(n.length)track("product_recommended",{ids:n,src})}};
const ids=x=>(Array.isArray(x)?x:String(x||"").split(/[\s,]+/)).map(String).filter(i=>BY[i]);
function need(id){const p=BY[String(id)];if(!p)throw new Error("Unknown product id "+id+". Use ids from the catalogue list.");return p}
const TOOLS = [
 {name:"search_products",description:"Search the shop catalogue (verified Thomann records and demo products). Hard constraints are applied as filters, not guesses: max_price/min_price, top_category, in_stock, source, and requires (every term must appear in the product's specs, name or tags, e.g. ['USB-C'] or ['Phantom Power: Ja']). Returns up to 10 matches with id, name, category, price, source and verification date.",
  inputSchema:{type:"object",properties:{query:{type:"string",description:"words to match in name, brand, subcategory or tags; may be empty when filtering"},top_category:{type:"string",enum:Object.keys(TOPS)},category:{type:"string",enum:Object.keys(CATS),description:"legacy demo product type"},max_price:{type:"number"},min_price:{type:"number"},in_stock:{type:"boolean"},source:{type:"string",enum:["any","verified","demo"]},requires:{type:"array",items:{type:"string"}},sort:{type:"string",enum:["relevance","price_low","price_high"]}}},
  execute(i){setStatus("Searching the catalogue…");const q=String(i.query||"").toLowerCase().split(/\s+/).filter(w=>w.length>1);
   const hay=p=>(p.n+" "+p.b+" "+p.tags.join(" ")+" "+(p.sub||"")+" "+(TOPS[p.top]?.en||"")).toLowerCase();
   const specHay=p=>(p.n+" "+p.tags.join(" ")+" "+Object.entries({...p.specs,...(p.tv?.specs||{})}).map(([k,v])=>k+": "+v).join(" | ")).toLowerCase();
   let l=P.filter(p=>!p.conflict&&(!i.category||p.c===i.category)&&(!i.top_category||p.top===i.top_category)&&(!i.max_price||p.p<=+i.max_price)&&(!i.min_price||p.p>=+i.min_price)&&(!i.in_stock||p.st>0)
     &&(!i.source||i.source==="any"||(i.source==="verified"?!!p.tv:!p.tv))&&(i.requires||[]).every(r=>specHay(p).includes(String(r).toLowerCase())));
   l=l.map(p=>{const h=hay(p);return {p,s:q.reduce((a,w)=>a+(h.includes(w)?1:0),0)}}).filter(o=>!q.length||o.s>0);
   l.sort(i.sort==="price_low"?(a,b)=>a.p.p-b.p.p:i.sort==="price_high"?(a,b)=>b.p.p-a.p.p:(a,b)=>b.s-a.s||(b.p.tv?1:0)-(a.p.tv?1:0)||(b.p.r||0)-(a.p.r||0));
   const res=l.slice(0,10).map(({p})=>({id:p.id,name:p.n,top:TOPS[p.top]?.en,sub:p.sub,price:p.p,source:p.tv?"verified on thomann.de "+p.tv.verified:"demo data",stock:stockText(p),rating:p.r||null,tags:p.tags.slice(0,8)}));
   return res.length?res:{results:[],note:"No product in the catalogue matches these constraints. Say so; don't invent one. Offer to relax a constraint or ask a specialist."}}},
 {name:"get_product_details",description:"Full specs, B-Stock price, stock and compatibility data for one product id.",
  inputSchema:{type:"object",properties:{id:{type:"string"}},required:["id"]},
  execute(i){const p=need(i.id);setStatus("Reading "+p.n+"…");
   const base={id:p.id,name:p.n,brand:p.b,price:p.p,top:TOPS[p.top]?.en,sub:p.sub,stock:stockText(p),specs:p.specs,tags:p.tags};
   if(p.tv)Object.assign(base,{source:"thomann.de product page",url:p.tv.url,article:p.tv.article,verifiedOn:p.tv.verified,priceReference:p.tv.ref?{basis:p.tv.ref.label,value:p.tv.ref.value}:null,availability:p.tv.availEn,bundleContents:p.tv.bundle?.contents||null,compatibilityFacts:p.tv.compat});
   if(p.vonly)Object.assign(base,{notVerified:["ratings and reviews","compatibility beyond the listed specs","stock quantity","images"]});
   else Object.assign(base,{demoData:{rating:p.r,reviews:p.rv,bstock:p.bs||null,compat:p.cp},demoNote:"rating, reviews and compatibility model are simulated demo data"+(p.tv?"; price, article and availability are verified":"")});
   return base}},
 {name:"show_products",description:"Display product cards to the customer (with View and Add-to-basket buttons). Use whenever you recommend specific items. Returns 'shown'.",
  inputSchema:{type:"object",properties:{ids:{type:"array",items:{type:"string"}},heading:{type:"string"},notes:{type:"object",description:"optional map id -> short reason (max 8 words)"}},required:["ids"]},
  execute(i){const l=ids(i.ids).filter(id=>!BY[id].conflict);if(!l.length)throw new Error("No valid ids (items whose price is being rechecked cannot be shown)");const notes=i.notes||{};
   push(card(i.heading||"Suggestions",typeof mk==="function"?mk("ai"):"",l.map(id=>miniProduct(BY[id],notes[id]?esc(notes[id]):"")).join("")));shownLog.push("products("+l.join(",")+")");pick(l.map(id=>({id,why:notes[id]?String(notes[id]):""})),"suggested");return "shown "+l.length}},
 {name:"compare_products",description:"Show a side-by-side comparison table of 2-4 products and return the spec matrix so you can explain trade-offs. Pass use_case so the specs that matter for it come first and are highlighted.",
  inputSchema:{type:"object",properties:{ids:{type:"array",items:{type:"string"}},use_case:{type:"string",enum:["home","live","studio","teaching","producing","rehearsal","other"]}},required:["ids"]},
  execute(i){const l=ids(i.ids).slice(0,4).map(id=>BY[id]);if(l.length<2)throw new Error("Need 2-4 valid ids");setStatus("Comparing…");CMP_USE=i.use_case||"";if(typeof track==="function")track("product_compared",{ids:l.map(p=>p.id)});
   const rows=compareRows(l);
   push(card("Comparison"+(i.use_case?" for "+(MP_USES[i.use_case]||i.use_case).toLowerCase():""),'<span class="tag">basic</span>'+(i.use_case?' <span class="muted" style="font-weight:400">★ = matters for this use</span>':""),`${compareTable(l)}<div class="prow" style="justify-content:flex-start;margin-top:6px">${l.map(p=>`<button class="btn small" data-add="${p.id}">Add ${esc(p.b)}</button>${saveBtn(p.id,esc(p.b))}`).join("")}</div>`));
   CMP_USE="";shownLog.push("compare("+l.map(p=>p.id).join(",")+")");pick(l.map(p=>({id:p.id,why:"Compared with "+l.filter(x=>x!==p).map(x=>x.n).join(" and ")})),"compared");
   return Object.fromEntries(rows.map(([k,v])=>[k,v]))}},
 {name:"price_check",description:"Cheaper similar items, B-Stock price and bundles that include this product. Shows a card. Use for 'cheaper option', 'is this a good price', budget questions.",
  inputSchema:{type:"object",properties:{id:{type:"string"}},required:["id"]},
  execute(i){const p=need(i.id);setStatus("Checking prices…");const r=priceCheck(p.id);
   const offs=offersFor(p.id),bst=offs.find(o=>o.type==="bstock"),deal=offs.find(o=>o.type==="hotdeal"||o.type==="bargain");
   push(card("Price check: "+p.n,'<span class="tag">basic</span>',`${deal?`<div class="dealnote">${deal.type==="hotdeal"?"Hot Deal":"Bargain"} on thomann.de${deal.saving?`: ${esc(deal.saving.text)}`:""} · checked ${esc(deal.checked)}</div>`:""}${bst?`<div class="mini"><div class="info"><div>${esc(bst.name)} <span class="tag warnt">B-Stock, not new</span></div><div class="sub">${esc(bst.condition)} · ${esc(bst.warranty)} · ${esc(bst.saving?bst.saving.text:"")}</div></div><span class="price" style="font-size:14px">${eur(bst.price)}</span><button class="btn small" data-detail="${bst.productId}">View</button></div>`:r.bstock?`<div class="mini"><div class="info"><div>B-Stock ${esc(p.n)} <span class="tag sim">demo price</span></div><div class="sub">Demo data: not a verified offer</div></div><span class="price" style="font-size:14px">${eur(r.bstock)}</span></div>`:'<div class="muted">No verified B-Stock offer.</div>'}
    ${r.similar.length?`<div class="muted" style="margin-top:6px">Cheaper alternatives</div>${r.similar.map(x=>miniProduct(x)).join("")}`:'<div class="muted">This is already the cheapest of its type.</div>'}
    ${r.bundles.map(b=>`<div class="mini"><div class="info"><div>Official bundle: ${esc(b.name)}</div><div class="sub">${esc(b.contents)} · ${esc(bundleLabel(b))}</div></div><span class="price" style="font-size:14px">${eur(b.price)}</span>${b.productId?`<button class="btn small" data-detail="${b.productId}">View</button>`:""}</div>`).join("")}`));
   shownLog.push("price_check("+p.id+")");pick(r.similar.map(x=>({id:x.id,why:"Cheaper option than the "+p.n})),"cheaper");
   return {price:p.p,verifiedPrice:!!p.tv,deal:deal?{type:deal.type,saving:deal.saving,checked:deal.checked}:null,bstock:bst?{id:bst.productId,price:bst.price,condition:bst.condition,warranty:bst.warranty}:(r.bstock?{price:r.bstock,note:"demo price, not a verified offer"}:null),cheaper:r.similar.map(x=>({id:x.id,name:x.n,price:x.p,verified:!!x.tv})),bundles:r.bundles.map(b=>({name:b.name,price:b.price,label:bundleLabel(b)}))}}},
 {name:"check_fit",description:"Check one or more products against the customer's My rig (power, phantom power, gain, impedance, ports, polarity, cable needs). Shows a card. Pass several ids to check items bought together (e.g. a mic plus a booster).",
  inputSchema:{type:"object",properties:{ids:{type:"array",items:{type:"string"}}},required:["ids"]},
  execute(i){const l=ids(i.ids);if(!l.length)throw new Error("No valid ids");setStatus("Checking against your rig…");const c=fitCheck(l);if(typeof track==="function")track("compatibility_checked",{ids:l});
   const worst=c.some(x=>x.status==="bad")?"bad":c.some(x=>x.status==="warn")?"warn":"ok";
   const label={ok:"Fits",warn:"Fits with notes",bad:"Problem"};
   push(card("Fit check: "+l.map(id=>BY[id].n).join(" + "),'<span class="tag moat">moat</span> <span class="badge '+worst+'">'+label[worst]+'</span>',c.map(x=>`<div class="check"><span class="badge ${x.status}">${x.status.toUpperCase()}</span><span>${esc(x.note)}</span></div>`).join("")+`<div class="muted">Checked against ${rigItems().length} items in My rig.</div>`));
   shownLog.push("fit("+l.join(",")+")");return c}},
 {name:"build_rig",description:"Show a complete setup as one card with roles, reasons and the total against the budget. Use for 'build me a setup' requests after you have chosen items via search.",
  inputSchema:{type:"object",properties:{title:{type:"string"},budget:{type:"number"},items:{type:"array",items:{type:"object",properties:{id:{type:"string"},qty:{type:"number"},role:{type:"string"}},required:["id"]}}},required:["items"]},
  execute(i){const it=(i.items||[]).filter(x=>BY[String(x.id)]).map(x=>({p:BY[String(x.id)],q:Math.max(1,+x.qty||1),role:String(x.role||"")}));if(!it.length)throw new Error("No valid items");
   const tot=it.reduce((a,x)=>a+x.p.p*x.q,0);const b=+i.budget||0;
   const html=it.map(x=>`<div class="mini"><div class="info"><div>${x.q>1?x.q+"× ":""}${esc(x.p.n)}</div><div class="sub">${esc(x.role)} · ${stockText(x.p)}</div></div><span class="price" style="font-size:14px">${eur(x.p.p*x.q)}</span><button class="btn small" data-detail="${x.p.id}">View</button>${saveBtn(x.p.id)}</div>`).join("")+
    `<div class="total"><span>Total${b?` (budget ${eur(b)})`:""}</span><span style="color:${b&&tot>b?"var(--bad)":"inherit"}">${eur(tot)}</span></div><div class="prow" style="justify-content:flex-start;margin-top:6px"><button class="btn small primary" data-addall='${JSON.stringify(it.map(x=>[x.p.id,x.q]))}'>Add all to basket</button><button class="btn small" data-save-all='${JSON.stringify(it.map(x=>x.p.id))}'>☆ Save whole setup</button><button class="btn small" data-say="Check that this setup works with my rig: ${esc(it.map(x=>x.p.n).join(", "))}">Check fit</button></div>`;
   push(card(i.title||"Your setup",'<span class="tag edge">setup builder</span>',html));shownLog.push("rig("+it.map(x=>x.p.id).join(",")+")");pick(it.map(x=>({id:x.p.id,why:(x.role?x.role+" in ":"Part of ")+(i.title||"your setup")})),"setup");
   return {total:+tot.toFixed(2),budget:b||null,overBudget:b?tot>b:false}}},
 {name:"stock_and_delivery",description:"Live stock and delivery dates for products to a country (ISO code, default DE). Shows a card.",
  inputSchema:{type:"object",properties:{ids:{type:"array",items:{type:"string"}},country:{type:"string"}},required:["ids"]},
  execute(i){const l=ids(i.ids);if(!l.length)throw new Error("No valid ids");setStatus("Checking stock…");const r=l.map(id=>delivery(BY[id],i.country));
   push(card("Stock & delivery to "+r[0].country,'<span class="tag">basic</span> '+sim,r.map(x=>`<div class="mini"><div class="info"><div>${esc(x.name)}</div><div class="sub">${x.inStock?x.inStock+" in stock":"Out of stock"} · ships from ${x.warehouse}${x.note?" · "+esc(x.note):""}${x.customs?" · "+x.customs:""}</div></div><div style="text-align:right;font-size:13px"><b>Arrives</b><br>${x.arrives}</div></div>`).join("")));
   return r}},
 {name:"orders",description:"The customer's orders. action 'list' returns all orders; 'track' shows one order's tracking card; 'start_return' shows a return card the customer must confirm (only for delivered orders inside 30 days).",
  inputSchema:{type:"object",properties:{action:{type:"string",enum:["list","track","start_return"]},order_id:{type:"string"},product_id:{type:"string"}},required:["action"]},
  execute(i){setStatus("Looking up orders…");
   if(i.action==="list") return ORDERS.map(o=>({id:o.id,date:o.date,status:o.status,eta:o.eta,items:o.items.map(([id,q])=>({id,name:BY[id].n,qty:q})),returnWindow:returnWindow(o)}));
   const o=ORDERS.find(x=>x.id===String(i.order_id))||ORDERS.find(x=>x.items.some(([id])=>id===String(i.product_id)));
   if(!o)throw new Error("Order not found");
   if(i.action==="track"){push(card("Order "+o.id,sim,orderHtml(o)));return {status:o.status,eta:o.eta,carrier:o.carrier,tracking:o.tracking}}
   const rw=returnWindow(o);
   if(!rw||!rw.open) return {ok:false,reason:rw?"30-day money-back window has closed; the 3-year warranty still covers faults":"Order not delivered yet; it can be refused at the door or returned after delivery"};
   const pid=String(i.product_id||o.items[0][0]);const p=BY[pid]||BY[o.items[0][0]];
   const key=o.id+p.id;
   push(card("Return "+p.n,'<span class="tag">basic</span> '+sim,`<div class="muted">Order ${o.id} · money-back until ${rw.until} (${rw.days} days left) · free return label</div>
    <label class="muted" for="rr_${key}" style="display:block;margin-top:6px">Reason</label><select id="rr_${key}" class="search" style="width:100%"><option>It doesn't work as expected</option><option>Doesn't suit my needs</option><option>Defective</option><option>Changed my mind</option></select>
    <div class="prow" style="justify-content:flex-start;margin-top:8px"><button class="btn small primary" data-confirm-return="${key}">Confirm return</button><button class="btn small" data-say="Before I return the ${esc(p.n)}, help me get it working.">Try to fix it first</button></div><div class="muted" data-rs="${key}"></div>`));
   return {ok:true,shownReturnCard:true,until:rw.until,daysLeft:rw.days,note:"Customer must press Confirm."}}},
 {name:"setup_help",description:"Troubleshooting steps from Thomann's (simulated) manuals and service knowledge for a product and problem. Shows a checklist card. Use before any fault return.",
  inputSchema:{type:"object",properties:{id:{type:"string"},problem:{type:"string"}},required:["id","problem"]},
  execute(i){const p=need(i.id);setStatus("Looking up the manual…");const list=KB[p.kb]||[];const q=String(i.problem).toLowerCase();
   const hit=list.map(k=>({k,s:k.issue.toLowerCase().split(/\W+/).filter(w=>w.length>2&&q.includes(w)).length})).sort((a,b)=>b.s-a.s)[0];
   if(!hit) return {found:false};
   push(card("Fix-it: "+hit.k.issue,'<span class="tag edge">setup & fix-it</span> '+sim,`<div class="muted">${esc(p.n)}</div><ul class="steps">${hit.k.steps.map((s,n)=>`<li><input type="checkbox" id="st_${p.id}_${n}_${Date.now()}" aria-label="Done"><span>${esc(s)}</span></li>`).join("")}</ul><div class="prow" style="justify-content:flex-start"><button class="btn small" data-say="I tried all the steps and it's still not working.">Still not working</button><button class="btn small" data-say="It works now, thanks!">It works now</button></div>`));
   shownLog.push("setup("+p.id+")");return {found:true,issue:hit.k.issue,steps:hit.k.steps,otherKnownIssues:list.map(k=>k.issue)}}},
 {name:"expert_handoff",description:"Hand the conversation to a named Thomann product specialist with a summary. Shows a card with contact options. Use for complex, pro or high-budget cases, installations, repairs, or when asked for a human.",
  inputSchema:{type:"object",properties:{department:{type:"string",enum:Object.keys(EXPERTS)},summary:{type:"string",description:"Exactly 4 short lines, no sentences: 'Wants: …', 'Budget: …', 'Level: …', 'Considering: …' (product names). Only mention owned gear if it matters for the question."},reason:{type:"string"}},required:["department","summary"]},
  execute(i){const e=EXPERTS[i.department]||EXPERTS.recording;setStatus("Briefing a specialist…");const k="h"+Date.now();
   push(card("Talk to "+e.name,'<span class="tag edge">expert handoff</span> '+sim,`<div class="muted">${esc(e.role)} · ${esc(e.since)}</div><div style="font-size:13px;margin:6px 0;padding:8px;background:var(--sunk);border-radius:8px"><b>Summary sent with your request</b><br>${esc(i.summary)}</div><div class="prow" style="justify-content:flex-start"><button class="btn small primary" data-hand="${k}" data-who="${esc(e.name)}" data-how="call back">Request a call</button><button class="btn small" data-hand="${k}" data-who="${esc(e.name)}" data-how="live chat">Live chat</button><button class="btn small" data-hand="${k}" data-who="${esc(e.name)}" data-how="email">Email</button></div><div class="muted" data-hs="${k}"></div>`));
   shownLog.push("handoff("+i.department+")");return {specialist:e.name,role:e.role,status:"card shown; customer picks call, chat or email"}}},
 {name:"offer_choices",description:"Ask the customer ONE short question with 2-6 tappable answers (needs interview). After calling it, end your turn with at most one short sentence.",
  inputSchema:{type:"object",properties:{question:{type:"string"},options:{type:"array",items:{type:"string"}},multi:{type:"boolean"}},required:["question","options"]},
  execute(i){const opts=(i.options||[]).map(String).slice(0,6);const k="c"+Date.now();
   push(`<div class="card"><h5>${esc(i.question)}</h5><div class="choices" data-choices="${k}" data-multi="${i.multi?1:0}">${opts.map(o=>`<button class="chip" aria-pressed="false" data-opt="${esc(o)}">${esc(o)}</button>`).join("")}${i.multi?'<button class="btn small primary" data-choicesend>Send</button>':""}</div></div>`);
   return "choices shown"}},
 {name:"update_rig",description:"Add or remove an item in the customer's My rig when they say they own or sold something. Use a product id when it's in the catalogue, otherwise a name.",
  inputSchema:{type:"object",properties:{action:{type:"string",enum:["add","remove"]},id:{type:"string"},name:{type:"string"}},required:["action"]},
  execute(i){if(i.action==="add"){if(BY[i.id]){addRig(String(i.id))}else if(i.name){S.rig.push({custom:true,name:String(i.name),cat:"other",cp:{kind:"other"},since:"2026-11"});store.set("rig",S.rig)}else throw new Error("Need id or name")}
   else{const n=S.rig.findIndex(r=>r.id===i.id||(r.custom&&r.name.toLowerCase()===String(i.name||"").toLowerCase()));if(n<0)throw new Error("Not in rig");S.rig.splice(n,1);store.set("rig",S.rig)}
   push(`<div class="muted">My rig updated (${esc(i.action)} ${esc(BY[i.id]?.n||i.name||"")}).</div>`);return rigItems().map(r=>r.name)}},
];
document.addEventListener("click",e=>{
  const c=e.target.closest("[data-opt]");
  if(c){const box=c.closest("[data-choices]");if(box.dataset.multi==="1"){c.setAttribute("aria-pressed",c.getAttribute("aria-pressed")!=="true")}else if(!S.busy){box.querySelectorAll("button").forEach(b=>b.disabled=true);c.setAttribute("aria-pressed","true");send(c.dataset.opt)}}
  const cs=e.target.closest("[data-choicesend]");
  if(cs&&!S.busy){const box=cs.closest("[data-choices]");const v=[...box.querySelectorAll('[aria-pressed="true"]')].map(b=>b.dataset.opt);if(v.length){box.querySelectorAll("button").forEach(b=>b.disabled=true);send(v.join(", "))}}
  const aa=e.target.closest("[data-addall]");
  if(aa){JSON.parse(aa.dataset.addall).forEach(([id,q])=>addBasket(id,q))}
  const h=e.target.closest("[data-hand]");
  if(h){document.querySelector(`[data-hs="${h.dataset.hand}"]`).textContent=`Request sent (simulated). ${h.dataset.who} will contact you by ${h.dataset.how} with your chat summary, usually within 15 minutes during shop hours.`;h.parentElement.querySelectorAll("button").forEach(b=>b.disabled=true)}
  const r=e.target.closest("[data-confirm-return]");
  if(r){const k=r.dataset.confirmReturn;const reason=document.getElementById("rr_"+k)?.value;document.querySelector(`[data-rs="${k}"]`).textContent=`Return registered (simulated). Reason: ${reason}. A free return label has been emailed; the refund follows when the parcel arrives.`;r.disabled=true}
});
