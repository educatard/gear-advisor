/* ---------------- Rules engines ---------------- */
function fitCheck(prodIds){
  const cands=prodIds.map(id=>BY[id]).filter(Boolean);
  const rig=rigItems();
  const all=[...rig.map(r=>({name:r.name,cp:r.cp||{}})),...cands.map(c=>({name:c.n,cp:c.cp,isNew:true}))];
  const find=k=>all.filter(x=>x.cp.kind===k);
  const checks=[];
  const add=(s,t)=>checks.push({status:s,note:t});
  for(const c of cands){
    const cp=c.cp;
    if(cp.kind==="mic"||cp.kind==="booster"){
      const ifs=find("interface");
      if(!ifs.length){add("bad",`${c.n}: you have no audio interface or mixer to plug it into.`);continue}
      const itf=ifs.find(x=>x.isNew)||ifs[0];
      if(cp.needsPhantom) add(itf.cp.phantom?"ok":"bad",`${c.n} needs 48 V phantom power: ${itf.name} ${itf.cp.phantom?"provides it":"does not provide it"}.`);
      if(cp.kind==="mic"){
        const boost=find("booster")[0];const gain=itf.cp.gain+(boost&&cp.gainNeed>40?boost.cp.boost:0);
        const d=gain-cp.gainNeed;
        if(d>=5) add("ok",`Gain: ${itf.name} gives ${itf.cp.gain} dB${boost&&cp.gainNeed>40?` + ${boost.cp.boost} dB from the ${boost.name}`:""}; the mic needs about ${cp.gainNeed} dB.`);
        else if(d>=0) add("warn",`Gain is just enough (${gain} dB available, ~${cp.gainNeed} dB needed). Expect some hiss at the top of the dial.`);
        else add("warn",`Too quiet: ${itf.name} gives ${itf.cp.gain} dB, the ${c.n} needs about ${cp.gainNeed} dB. Fix: an inline booster such as the Triton Audio FetHead (+27 dB, €79), or an interface with more gain.`);
        const mics=find("mic").length; if(mics>itf.cp.xlr) add("warn",`You would have ${mics} mics but ${itf.name} has ${itf.cp.xlr} mic input${itf.cp.xlr>1?"s":""}: you can't record them at the same time.`);
      } else add("ok",`${c.n} goes between a dynamic mic and the interface.`);
    }
    if(cp.kind==="interface"){
      const comp=find("computer")[0];
      if(comp) add(cp.usb==="C"||!comp.cp.ports.includes("USB-C")?"ok":"warn",cp.usb==="C"?`USB-C connects directly to your ${comp.name}.`:`It uses USB-${cp.usb}: you need a USB-${cp.usb} to USB-C cable for your ${comp.name} (about €8).`);
      for(const m of find("mic").filter(x=>!x.isNew)){
        if(m.cp.needsPhantom&&!cp.phantom) add("bad",`${m.name} needs phantom power, which this interface lacks.`);
        const d=cp.gain-m.cp.gainNeed; add(d>=0?"ok":"warn",`Your ${m.name}: ${d>=0?"enough gain":"needs ~"+m.cp.gainNeed+" dB, this gives "+cp.gain+" dB"}.`);
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
        add(big?"ok":"bad",big?`${psu.name} has outputs strong enough for ${cp.mA} mA.`:`${c.n} draws ${cp.mA} mA; no output on the ${psu.name} gives that. It needs its own supply or an isolated high-current output.`);
        if(pedals.length>psu.cp.outputs.length) add("warn",`You'd have ${pedals.length} pedals but ${psu.cp.outputs.length} supply outputs.`);
      } else add(cp.battery&&cp.mA<60?"warn":"bad",cp.battery&&cp.mA<60?`You have no pedal power supply. It runs on a 9 V battery; a 9 V centre-negative supply (e.g. Harley Benton PowerPlant Junior, €29) saves batteries.`:`It draws ${cp.mA} mA${cp.battery?" and drains batteries fast":" and has no battery option"}: you need a 9 V centre-negative supply with at least ${cp.mA} mA per output.`);
      const amp=find("amp")[0]; if(amp) add("ok",`Plugs into the input of your ${amp.name} with two instrument cables.`); else add("warn","You have no amp in your rig: you'll need an amp or a headphone/multi-effects unit.");
      if(pedals.filter(x=>!x.isNew).length) add("ok",`Chains with your ${pedals.filter(x=>!x.isNew).map(x=>x.name).join(", ")}; you'll need a patch cable.`);
    }
    if(cp.kind==="psu"){
      for(const pd of find("pedal")) add(cp.outputs.some(o=>o.mA>=pd.cp.mA)?"ok":"bad",`${pd.name} (${pd.cp.mA} mA): ${cp.outputs.some(o=>o.mA>=pd.cp.mA)?"covered":"needs more current than any output gives"}.`);
      if(!cp.isolated&&find("pedal").some(x=>x.cp.mA>=50)) add("warn","Not isolated: digital pedals may add whine. Isolated supplies avoid that.");
    }
    if(cp.kind==="headphones"){
      const srcs=[...find("interface"),...find("amp").filter(a=>a.cp.headphoneOut)];
      if(!srcs.length) add("warn","No interface or amp with a headphone output in your rig.");
      for(const s of srcs) add(!s.cp.hpMax||cp.ohm<=s.cp.hpMax?"ok":"warn",`${s.name}: ${!s.cp.hpMax||cp.ohm<=s.cp.hpMax?"drives these fine":"may be quiet with "+cp.ohm+" Ω"}.`);
      if(cp.ohm>=250) add("warn",`${cp.ohm} Ω headphones are quiet on phones and laptops.`);
    }
    if(cp.kind==="amp"){
      const g=find("electric guitar"); add(g.length?"ok":"warn",g.length?`Your ${g[0].name} plugs straight in.`:"You have no electric guitar in your rig.");
      if(!cp.headphoneOut) add("warn","No headphone output: silent practice needs a separate solution.");
      for(const pd of find("pedal").filter(x=>!x.isNew)) add("ok",`Your ${pd.name} works in front of it.`);
    }
    if(cp.kind==="electric guitar"||cp.kind==="acoustic guitar"){
      const amp=find("amp")[0];
      if(cp.kind==="electric guitar") add(amp?"ok":"warn",amp?`Plugs into your ${amp.name}.`:"You'll need an amp or a headphone amp.");
      else add("ok","Acoustic: no amp needed.");
      const g=find("electric guitar").filter(x=>!x.isNew); if(g.length&&cp.kind==="electric guitar") add("ok",`Note: you already own the ${g[0].name}. Compare pickups to make sure this adds a new sound.`);
    }
    if(cp.kind==="strings"){
      const g=all.filter(x=>x.cp.kind==="electric guitar"||x.cp.kind==="acoustic guitar");
      for(const gg of g) add(gg.cp.kind===cp.for?"ok":"bad",`${gg.name}: ${gg.cp.kind===cp.for?"fits":"wrong type (these are for "+cp.for+"s)"}.`);
      if(!g.length) add("warn","No guitar in your rig.");
    }
    if(cp.kind==="keys"){
      const comp=find("computer")[0]; if(comp) add(cp.usb==="C"?"ok":"warn",cp.usb==="C"?"USB-C to your computer directly.":`USB-${cp.usb==="micro"?"Micro-B":cp.usb}: you need a cable or adapter to USB-C.`);
      const sp=find("sustain")[0]; if(sp) add(sp.cp.polarity===cp.sustain||cp.sustain==="any"?"ok":"warn",`Sustain pedal ${sp.name}: ${sp.cp.polarity===cp.sustain||cp.sustain==="any"?"works":"polarity may be reversed"}.`);
    }
    if(cp.kind==="sustain"){
      const k=find("keys"); for(const kk of k) add(kk.cp.sustain==="any"||kk.cp.sustain===cp.polarity?"ok":"warn",`${kk.name}: ${kk.cp.sustain==="any"||kk.cp.sustain===cp.polarity?"works":"polarity may be reversed"}.`);
      if(!k.length) add("warn","No keyboard in your rig.");
    }
    if(cp.kind==="monitors"){
      const itf=find("interface")[0]; add(itf?(cp.inputs.includes(itf.cp.out)?"ok":"warn"):"warn",itf?(cp.inputs.includes(itf.cp.out)?`${itf.name} connects with ${itf.cp.out} cables.`:`${itf.name} has ${itf.cp.out} outputs: you need ${itf.cp.out} to ${cp.inputs[0]} cables.`):"No interface to connect them to.");
    }
    if(cp.kind==="edrums") add("ok","Connects to your computer by USB for recording and lessons apps; headphones plug into the module.");
  }
  if(!checks.length) add("ok","No known conflicts with your rig.");
  return checks;
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
