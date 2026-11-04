/* ---------------- Rules engines ---------------- */
/* Each check: {status: ok|warn|bad, note, type: fit|computer|ready|place|delivery, fix?: product id, alt?: fix is an alternative to view rather than an add-on} */
const PROFILE=()=>(typeof S!=="undefined"&&S.profile)||{};
function profileComputer(){
  const c=PROFILE().computer;
  if(!c||c==="none")return null;
  return {name:{usbc:"Mac (USB-C)",usba:"computer (USB-A)",ipad:"iPad"}[c],cp:{kind:"computer",ports:c==="usba"?["USB-A"]:["USB-C"]}};
}
function usbCheck(dev,usb,comp){
  const port=comp.cp.ports.includes("USB-C")?"C":"A",label=usb==="micro"?"Micro-USB":"USB-"+usb;
  if(usb==="C"&&port==="C")return {status:"ok",note:`USB-C: plugs straight into your ${comp.name}.`,type:"computer"};
  if(usb==="C")return {status:"warn",note:`${dev} uses USB-C; your ${comp.name} has USB-A ports. Use a USB-C to USB-A cable.`,type:"computer"};
  if(port==="A")return {status:"ok",note:`${label}: the usual cable fits your ${comp.name}.`,type:"computer"};
  return {status:"warn",note:`${dev} uses ${label}; your ${comp.name} has USB-C. You need a ${label} to USB-C cable.`,fix:usb==="micro"?"x5":"x4",type:"computer"};
}
function fitCheck(prodIds){
  const cands=prodIds.map(id=>BY[id]).filter(Boolean);
  const rig=rigItems();
  const all=[...rig.map(r=>({name:r.name,cp:r.cp||{}})),...cands.map(c=>({name:c.n,cp:c.cp,isNew:true}))];
  const find=k=>all.filter(x=>x.cp.kind===k);
  const comp=profileComputer()||find("computer")[0];
  const checks=[];
  const add=(s,t,fix,type="fit",alt=false)=>checks.push({status:s,note:t,fix,type,alt});
  for(const c of cands){
    const cp=c.cp;
    if(cp.kind==="mic"||cp.kind==="booster"){
      const ifs=find("interface");
      if(!ifs.length){add("bad",`${c.n}: you have no audio interface or mixer to plug it into.`,"i1");continue}
      const itf=ifs.find(x=>x.isNew)||ifs[0];
      if(cp.needsPhantom) add(itf.cp.phantom?"ok":"bad",`${c.n} needs 48 V phantom power: ${itf.name} ${itf.cp.phantom?"provides it":"does not provide it"}.`,itf.cp.phantom?undefined:"i2");
      if(cp.kind==="mic"){
        const boost=find("booster")[0];const gain=itf.cp.gain+(boost&&cp.gainNeed>40?boost.cp.boost:0);
        const d=gain-cp.gainNeed;
        if(d>=5) add("ok",`Gain: ${itf.name} gives ${itf.cp.gain} dB${boost&&cp.gainNeed>40?` + ${boost.cp.boost} dB from the ${boost.name}`:""}; the mic needs about ${cp.gainNeed} dB.`);
        else if(d>=0) add("warn",`Gain is just enough (${gain} dB available, ~${cp.gainNeed} dB needed). Expect some hiss at the top of the dial.`,boost?undefined:"m7");
        else add("warn",`Too quiet: ${itf.name} gives ${itf.cp.gain} dB, the ${c.n} needs about ${cp.gainNeed} dB. An inline booster fixes it.`,"m7");
        const mics=find("mic").length; if(mics>itf.cp.xlr) add("warn",`You would have ${mics} mics but ${itf.name} has ${itf.cp.xlr} mic input${itf.cp.xlr>1?"s":""}: you can't record them at the same time.`,"i2");
      } else add("ok",`${c.n} goes between a dynamic mic and the interface.`);
    }
    if(cp.kind==="interface"){
      if(comp) checks.push(usbCheck(c.n,cp.usb,comp));
      for(const m of find("mic").filter(x=>!x.isNew)){
        if(m.cp.needsPhantom&&!cp.phantom) add("bad",`${m.name} needs phantom power, which this interface lacks.`);
        const d=cp.gain-m.cp.gainNeed; add(d>=0?"ok":"warn",`Your ${m.name}: ${d>=0?"enough gain":"needs ~"+m.cp.gainNeed+" dB, this gives "+cp.gain+" dB"}.`,d>=0?undefined:"m7");
      }
      for(const h of find("headphones")) add(h.cp.ohm<=cp.hpMax?"ok":"warn",`Your ${h.name} (${h.cp.ohm} Ω) ${h.cp.ohm<=cp.hpMax?"are driven fine":"may be quiet on this headphone output"}.`);
      for(const mo of find("monitors")) add(mo.cp.inputs.includes(cp.out)?"ok":"warn",`Monitors ${mo.name}: ${mo.cp.inputs.includes(cp.out)?cp.out+" cables connect directly":"need "+cp.out+" to "+mo.cp.inputs[0]+" cables"}.`);
      const old=find("interface").filter(x=>!x.isNew); if(old.length) add("warn",`You already own the ${old[0].name}. Check this one adds what you need (inputs, gain).`);
    }
    if(cp.kind==="pedal"){
      const psu=find("psu")[0];
      const pedals=find("pedal");
      if(psu){
        const big=psu.cp.outputs.filter(o=>o.mA>=cp.mA).length;
        add(big?"ok":"bad",big?`${psu.name} has outputs strong enough for ${cp.mA} mA.`:`${c.n} draws ${cp.mA} mA; no output on the ${psu.name} gives that. It needs an isolated high-current output.`,big?undefined:"pw2");
        if(pedals.length>psu.cp.outputs.length) add("warn",`You'd have ${pedals.length} pedals but ${psu.cp.outputs.length} supply outputs.`,"pw2");
      } else if(cp.battery&&cp.mA<60) add("warn",`No pedal power supply in your rig. It runs on a 9 V battery for now; a 9 V supply saves batteries.`,"pw1");
      else add("bad",`It draws ${cp.mA} mA${cp.battery?" and drains batteries fast":" and has no battery option"}: you need a 9 V centre-negative supply with at least ${cp.mA} mA per output.`,cp.mA>100?"pw2":"pw1");
      const amp=find("amp")[0]; if(amp) add("ok",`Plugs into the input of your ${amp.name}.`); else add("warn","You have no amp in your rig: you'll need an amp or a headphone/multi-effects unit.","a1");
      if(pedals.filter(x=>!x.isNew).length) add("ok",`Chains with your ${pedals.filter(x=>!x.isNew).map(x=>x.name).join(", ")}.`);
    }
    if(cp.kind==="psu"){
      for(const pd of find("pedal")) add(cp.outputs.some(o=>o.mA>=pd.cp.mA)?"ok":"bad",`${pd.name} (${pd.cp.mA} mA): ${cp.outputs.some(o=>o.mA>=pd.cp.mA)?"covered":"needs more current than any output gives"}.`,cp.outputs.some(o=>o.mA>=pd.cp.mA)?undefined:"pw2",undefined,true);
      if(!cp.isolated&&find("pedal").some(x=>x.cp.mA>=50)) add("warn","Not isolated: digital pedals may add whine. Isolated supplies avoid that.","pw2","fit",true);
    }
    if(cp.kind==="headphones"){
      const srcs=[...find("interface"),...find("amp").filter(a=>a.cp.headphoneOut)];
      if(!srcs.length) add("warn","No interface or amp with a headphone output in your rig.");
      for(const s of srcs) add(!s.cp.hpMax||cp.ohm<=s.cp.hpMax?"ok":"warn",`${s.name}: ${!s.cp.hpMax||cp.ohm<=s.cp.hpMax?"drives these fine":"may be quiet with "+cp.ohm+" Ω"}.`);
      if(cp.ohm>=250) add("warn",`${cp.ohm} Ω headphones are quiet on phones and laptops.`,"h1","fit",true);
    }
    if(cp.kind==="amp"){
      const g=find("electric guitar"); add(g.length?"ok":"warn",g.length?`Your ${g[0].name} plugs straight in.`:"You have no electric guitar in your rig.");
      if(!cp.headphoneOut&&PROFILE().place!=="flat") add("warn","No headphone output: silent practice needs a separate solution.");
      for(const pd of find("pedal").filter(x=>!x.isNew)) add("ok",`Your ${pd.name} works in front of it.`);
    }
    if(cp.kind==="electric guitar"||cp.kind==="acoustic guitar"){
      const amp=find("amp")[0];
      if(cp.kind==="electric guitar"&&!cp.bundle) add(amp?"ok":"warn",amp?`Plugs into your ${amp.name}.`:"You'll need an amp or a headphone amp.",amp?undefined:"a1");
      else if(cp.kind==="acoustic guitar") add("ok","Acoustic: no amp needed.");
      const g=find("electric guitar").filter(x=>!x.isNew); if(g.length&&cp.kind==="electric guitar") add("ok",`Note: you already own the ${g[0].name}. Compare pickups to make sure this adds a new sound.`);
    }
    if(cp.kind==="strings"){
      const g=all.filter(x=>x.cp.kind==="electric guitar"||x.cp.kind==="acoustic guitar");
      for(const gg of g) add(gg.cp.kind===cp.for?"ok":"bad",`${gg.name}: ${gg.cp.kind===cp.for?"fits":"wrong type (these are for "+cp.for+"s)"}.`);
      if(!g.length) add("warn","No guitar in your rig.");
    }
    if(cp.kind==="keys"){
      if(comp&&!cp.standalone) checks.push(usbCheck(c.n,cp.usb,comp));
      else if(cp.standalone) add("ok","Has its own speakers: plays without a computer.");
      else add("warn","This is a controller: it makes no sound on its own and needs a computer or iPad.");
      const sp=find("sustain")[0]; if(sp) add(sp.cp.polarity===cp.sustain||cp.sustain==="any"?"ok":"warn",`Sustain pedal ${sp.name}: ${sp.cp.polarity===cp.sustain||cp.sustain==="any"?"works":"polarity may be reversed"}.`);
    }
    if(cp.kind==="sustain"){
      const k=find("keys"); for(const kk of k) add(kk.cp.sustain==="any"||kk.cp.sustain===cp.polarity?"ok":"warn",`${kk.name}: ${kk.cp.sustain==="any"||kk.cp.sustain===cp.polarity?"works":"polarity may be reversed"}.`);
      if(!k.length) add("warn","No keyboard in your rig.");
    }
    if(cp.kind==="monitors"){
      const itf=find("interface")[0]; add(itf?(cp.inputs.includes(itf.cp.out)?"ok":"warn"):"warn",itf?(cp.inputs.includes(itf.cp.out)?`${itf.name} connects with ${itf.cp.out} cables.`:`${itf.name} has ${itf.cp.out} outputs: you need ${itf.cp.out} to ${cp.inputs[0]} cables.`):"No interface to connect them to.",itf?undefined:"i1");
    }
    if(cp.kind==="edrums") add("ok","Connects to your computer by USB for recording and lessons apps; headphones plug into the module.");
    if(cp.kind==="usbcable"&&comp) add(comp.cp.ports.includes("USB-C")?"ok":"warn",comp.cp.ports.includes("USB-C")?`USB-C end fits your ${comp.name}.`:`Your ${comp.name} has USB-A ports; this cable has a USB-C end.`,undefined,"computer");
  }
  if(!checks.some(c=>c.type==="fit"||c.type==="computer")) add("ok","No known conflicts with your rig.");
  for(const c of cands) checks.push(...moreChecks(c));
  return checks;
}
/* What else the shopper needs before they can play, counting their rig and basket */
function missingFor(c){
  const o=[...rigItems().map(r=>({id:r.id,cp:r.cp||{}})),...(typeof S!=="undefined"?S.basket:[]).map(b=>({id:b.id,cp:BY[b.id].cp}))];
  const hasKind=k=>o.some(x=>x.cp.kind===k),hasId=id=>o.some(x=>x.id===id),pr=PROFILE(),out=[],k=c.cp.kind;
  if(c.cp.bundle)return out;
  if(k==="electric guitar"){
    if(!hasKind("amp")&&!o.some(x=>x.cp.headphoneOut))out.push({what:"an amp",fix:pr.level==="beginner"||pr.forWhom==="child"?"a3":"a1"});
    if(!hasId("c2"))out.push({what:"an instrument cable",fix:"c2"});
    if(!hasKind("electric guitar")&&!hasKind("acoustic guitar")&&!hasKind("picks"))out.push({what:"picks",fix:"x2"});
  }
  if(k==="acoustic guitar"&&!hasKind("electric guitar")&&!hasKind("acoustic guitar")&&!hasKind("picks"))out.push({what:"picks",fix:"x2"});
  if(k==="pedal"){
    if(!hasKind("psu")){
      if(c.cp.battery&&c.cp.mA<60){if(!hasKind("battery"))out.push({what:"a 9 V battery (not included)",fix:"x1"})}
      else out.push({what:`a power supply with ${c.cp.mA} mA`,fix:c.cp.mA>100?"pw2":"pw1"});
    }
    if(!hasId("c2"))out.push({what:"an instrument cable",fix:"c2"});
    if(o.some(x=>x.cp.kind==="pedal"&&x.id!==c.id)&&!hasId("c3"))out.push({what:"a patch cable to chain it with your other pedals",fix:"c3"});
  }
  if(k==="amp"&&!hasId("c2"))out.push({what:"an instrument cable",fix:"c2"});
  if(k==="mic"||k==="booster"){if(!hasKind("interface"))out.push({what:"an audio interface",fix:"i1"});if(!hasId("c1"))out.push({what:"an XLR cable",fix:"c1"})}
  if((k==="interface"||k==="edrums"||(k==="keys"&&c.cp.standalone&&pr.listen==="headphones"))&&!hasKind("headphones")&&!hasKind("monitors"))out.push({what:"headphones",fix:"h1"});
  return out;
}
function moreChecks(c){
  const out=[],pr=PROFILE(),cp=c.cp;
  const miss=missingFor(c);
  for(const m of miss)out.push({status:"warn",note:`To start playing you also need ${m.what}.`,fix:m.fix,type:"ready"});
  if(!miss.length&&!["strings","cable","battery","picks","usbcable","booster","psu"].includes(cp.kind))
    out.push({status:"ok",note:cp.bundle?"Complete set: everything you need to start is in the box.":"Ready to play: nothing else needed with your rig.",type:"ready"});
  if(pr.place==="flat"){
    if(cp.kind==="amp")out.push(cp.headphoneOut?{status:"ok",note:"Headphone output: you can practise quietly in your flat.",type:"place"}:{status:"warn",note:`Loud for a flat: no headphone output${/tube/i.test(c.specs.Power||"")?", and tube amps need volume to sound good":""}. A modelling amp with headphones suits a flat better.`,fix:"a1",alt:true,type:"place"});
    if(cp.kind==="edrums")out.push({status:"warn",note:"In a flat, the kick pedal thumps through the floor even with headphones on. A drum mat or riser helps.",type:"place"});
    if(cp.kind==="cymbal")out.push({status:"warn",note:"Real cymbals are very loud in a flat. E-drums suit home practice better.",fix:"d1",alt:true,type:"place"});
    if(cp.kind==="monitors")out.push({status:"ok",note:"Fine for a flat at low volume; switch to headphones late at night.",type:"place"});
    if(cp.kind==="headphones")out.push({status:"ok",note:`${/closed/i.test(c.specs.Type||"")?"Closed back: your neighbours and housemates hear very little.":"Open back: people nearby will hear some sound."}`,type:"place"});
  }
  if(pr.forWhom==="child"&&cp.kind==="electric guitar"&&!c.tags.includes("kids"))out.push({status:"warn",note:"Full-size guitar: for children under about 11, a 3/4 size is easier to hold and play.",fix:"kd1",alt:true,type:"place"});
  const wk=c.restock?Math.round(c.restock/7):0;
  out.push(!c.st?{status:"warn",note:`Not in stock${c.specs.Availability?" (made to order)":""}: arrives in about ${wk>=4?`${wk-1}–${wk+1} weeks`:`${c.restock||10} days`}.`,type:"delivery"}
    :{status:"ok",note:c.st<15?`In stock, only ${c.st} left: arrives in 1–3 days.`:"In stock: arrives in 1–3 days.",type:"delivery"});
  return out;
}
function priceCheck(id){
  const p=BY[id];
  const tagset=new Set(p.tags);
  const similar=P.filter(x=>x.c===p.c&&x.id!==id&&x.p<p.p&&x.cp.kind===p.cp.kind).map(x=>({x,score:x.tags.filter(t=>tagset.has(t)).length+x.r})).sort((a,b)=>b.score-a.score).slice(0,3).map(o=>o.x);
  const bundles=BUNDLES.filter(b=>b.ids.includes(id)).map(b=>{const full=b.ids.reduce((a,i)=>a+BY[i].p,0);return {name:b.name,items:b.ids.map(i=>BY[i].n),full,price:+(full*(1-b.off/100)).toFixed(2)}});
  return {product:p,similar,bstock:p.bs||null,bundles};
}
function delivery(p,country){
  const c=(country||"DE").toUpperCase();
  const map={DE:[1,2],AT:[2,3],NL:[2,3],BE:[2,4],FR:[2,4],IT:[3,5],ES:[3,5],PL:[2,4],CH:[3,5],UK:[3,6],GB:[3,6],US:[6,10]};
  const [a,b]=map[c]||[3,6];const wait=p.st?0:(p.restock||10);
  const d=n=>{const t=new Date(TODAY);t.setDate(t.getDate()+n);return t.toISOString().slice(0,10)};
  return {id:p.id,name:p.n,inStock:p.st,warehouse:"Treppendorf, DE",country:c,arrives:`${d(wait+a)} – ${d(wait+b)}`,note:p.st?(p.st<15?"Low stock":""):`Restock expected in ~${wait} days`,customs:["CH","UK","GB","US"].includes(c)?"Customs duties may apply":""};
}
