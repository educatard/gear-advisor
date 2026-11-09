"""Builds ../catalogue.js (data only) and coverage_report.md from verified_raw.jsonl.

verified_raw.jsonl holds one record per line, copied from thomann.de product pages:
  {"cat": <top-level id>, "url": <product page path on thomann.de/de/>, "d": {name, brand, article,
   price, ref, avail, crumb, specs[], bundle?, contents?}}
Only fields read from the page are stored. Anything else (ratings, return data, stock counts,
images) is left out and shown as "not verified" in the shop.

Run:  python3 catalogue/build_catalogue.py
"""
import json, pathlib, re, sys

HERE = pathlib.Path(__file__).parent
VERIFIED_ON = "2026-11-07"
BASE = "https://www.thomann.de/de/"

# The 17 top-level categories of https://www.thomann.de/de/cat.html (checked 2026-11-07),
# with the German subcategory names listed there.
TAXONOMY = [
 ("guitars_basses","Guitars and Basses","Gitarren und Bässe","gitarren_baesse.html",["E-Gitarren","Konzertgitarren","Westerngitarren","E-Bässe","Akustische und Halbakustische Bässe","Ukulelen","Bluegrass Instrumente","Travelgitarren","Sonstige Saiteninstrumente","E-Gitarren-Verstärker","Bassverstärker","Akustikgitarren-Verstärker","Saiten","Gitarren- und Bass-Effekte","Pickups und Tonabnehmer","Ersatzteile für Instrumente","Zubehör für Gitarren und Bässe","Gitarren-/Bass-Drahtlossysteme","Noten für Gitarre und Bass"]),
 ("drums","Drums and Percussion","Drums und Percussion","drums_und_percussion.html",["Schlagzeuge","E-Drums","Becken","Drumsticks und Mallets","Schlagzeugfelle","Schlagzeug Hardware","Percussion","Orff","Orchester-Schlagwerk","Marching/Military","Mikrofone für Drums","Noten für Drums","Taschen und Koffer für Drums","Zubehör für Drums","Ersatzteile für Drums"]),
 ("keys","Keys","Tasteninstrumente","tasteninstrumente.html",["Keyboards","Synthesizer","MIDI Masterkeyboards","Stage Pianos","Digital Pianos","Klaviere","Flügel","Elektronische Orgeln","Sakralorgeln","Akkordeons","Keyboardverstärker","Zubehör für Klaviere und Flügel"]),
 ("studio","Studio and Recording Equipment","Studio- und Recording-Equipment","studio_recording.html",["Audiointerfaces","Abhörmonitore","Studiomikrofone","Studio Software","Preamps","Digitale Recorder","Kopfhörer und Verstärker","Studio-Akustikelemente","Digitale Recording-Mischpulte","Controller","Digitalwandler","Effektgeräte","MIDI-Equipment","Summierer","Analoge Recording-Mischpulte","Sonstige Studiogeräte","Zubehör für Studio","Studio Packages","Analoge Recorder"]),
 ("software","Software","Software","software.html",["Sequenzersoftware und virtuelle Studios","Mastering und sonstige Editoren","Audio- und Effektplugins","Virtuelle Instrumente und Sampler","Soundlibraries","DJ-Software","Notationssoftware","EDU-Software","Sonstige Musiksoftware","Updates und Upgrades","Video- und Grafik-Software","Download Deals"]),
 ("pa","PA Equipment","PA- und Beschallungsequipment","pa-beschallungsequipment.html",["Komplette Beschallungsanlagen","Lautsprecher","Mischpulte","Verstärker und Endstufen","Frequenzweichen","PA-Mikrofone","Drahtlosanlagen","In-Ear Monitoring","Audiotools","Ständer und Stative","Kabel, Stecker und Adapter","Installationstechnik","Kommunikationstechnik","Zubehör für PA"]),
 ("lighting","Lighting and Stage","Licht- und Bühnenequipment","licht-buehnenequipment.html",["Lichtsets","Scheinwerfer","Bewegtes Licht","LED Technik","Steuerpulte und Dimmer","Dekobeleuchtung","Theaterbeleuchtung","Laser","Nebelmaschinen und Zubehör","Spezialeffekte","Stroboskope","Zubehör für Licht und Bühne","Hardware","Lampen (Leuchtmittel)","Bühnenelemente"]),
 ("dj","DJ Equipment","DJ-Equipment","dj-equipment.html",["DJ-Komplett-Sets","DJ-Controller","DJ-Player","Turntables","DJ-Mixer","DJ-Software","DJ-Effektgeräte","DJ-Kopfhörer","Grooveboxen","DJ Tische/Möbel","Zubehör für DJs","CD-Player","MP3-Player","Kassettendecks"]),
 ("broadcast","Broadcast and Video","Broadcast- und Videoequipment","broadcast_video.html",["Videokameras","Video Mixer und Schnittpulte","Streaming Equipment","Videolicht","Videohardware","Produktionsequipment","Videoediting","Projektionsequipment","Podcast-, Broadcast-Sets","Videozubehör"]),
 ("mics","Microphones","Mikrofone","mikrofone.html",["Gesangsmikrofone","Instrumentenmikrofone","Großmembran-Mikrofone","Kleinmembran-Kondensatormikrofone","Bändchenmikrofone","Drahtlosmikrofone","Headsetmikrofone","Lavaliermikrofone","Stereomikrofone","Broadcast-Mikrofone","Video- und Kameramikrofone","Reportermikrofone","USB/Podcast Mikrofone","Grenzflächenmikrofone","Mikrofonsets","Zubehör für Mikrofone"]),
 ("fx","Effect and Signal Processors","Effektgeräte und Signalprozessoren","effektgeraete_signalprozessoren.html",["Multieffekte","Parametrische Equalizer","Graphische Equalizer","Kompressoren/Gates/De-Esser","Limiter","System-500-Komponenten","Feedback-Controller","Vocalisten","Voice-Prozessoren","Delay-Line-Controller","Speaker-Management-Systeme","Zubehör für Signalprozessoren"]),
 ("wind","Wind Instruments","Blasinstrumente","blasinstrumente.html",["Saxophone","Trompeten","Klarinetten","Flügelhörner","Hörner","Posaunen","Tenorhörner","Baritone","Euphonien","Tuben","Oboen","Fagotte","Querflöten","Blockflöten","Mundharmonikas","Melodicas","Digitale Blasinstrumente","Mundstücke für Blechblasinstrumente","Mundstücke für Holzblasinstrumente","Ständer","Noten für Bläser"]),
 ("traditional","Traditional Instruments","Traditionelle Instrumente","traditionelle_instrumente.html",["Streichinstrumente","Traditionelle und Historische Saiteninstrumente","Meditation und Musiktherapie","Orchesterschlagwerk","Akkordeons"]),
 ("sheet","Sheet Music","Noten und Bücher","noten_buecher_dvds.html",["Noten für Tasteninstrumente","Noten für Saiteninstrumente","Noten für Blasinstrumente","Noten für Gesang","Fake Books/Real Books","Liederbücher/Songbooks","Jazz Play-Alongs","Musikalische Früherziehung","Fachliteratur","Notenständer","Notenzubehör","Notationssoftware","Online-Kurse"]),
 ("cases","Cases, Racks and Bags","Cases, Racks und Taschen","cases_racks_gigbags.html",["Cases","Racks","Taschen und Koffer","Studiomöbel","Abdeckhauben","Rack- und Case-Einzelkomponenten","Transportsysteme","Zubehör für Cases und Koffer"]),
 ("cables","Cables and Connectors","Kabel und Stecker","kabel_stecker.html",["Instrumentenkabel","Mikrofonkabel","Lautsprecherkabel","Audiokabel","Patch-Kabel","Y-Adapterkabel","MIDI-Kabel","Digitale Interface-Kabel","DMX- und Steuerkabel","Videokabel","Computerkabel","Stromkabel","Multicore Kabel","Stecker","Adapterstecker","Patchbays","Kabeltrommeln","Kabelbinder"]),
 ("accessories","Accessories and Headphones","Zubehör und Kopfhörer","zubehoer.html",["Ständer","Sitze und Stehhilfen","Kopfhörer","Gehörschutz","Steckdosenleisten","Computerzubehör","Metronome","Netzteile","Akkus, Batterien und Ladegeräte","Werkzeuge","Pflegemittel","Schutzabdeckungen"]),
]
# Specialist tools Thomann runs alongside the shop (kept separate from merchandise categories)
SPECIAL_TOOLS = [
 {"name":"Stompenberg FX","what":"Try real effect pedals online","url":"https://www.thomann.de/blog/en/stompenberg-effects"},
 {"name":"Cymbot","what":"Compare cymbal recordings","url":"https://www.thomannmusic.com/social_cymbot.html"},
]

# English labels for subcategory names that appear in the verified breadcrumbs
SUB_EN = {"E-Gitarren":"Electric guitars","E-Gitarren-Verstärker":"Guitar amps","Gitarren-/Bass-Effekte":"Guitar & bass effects","Gitarren Zubehör":"Guitar accessories",
 "E-Drums":"E-drums","Schlagzeug Hardware":"Drum hardware","Stage Pianos":"Stage pianos","Keyboards":"Keyboards","Zubehör f. Klaviere + Flügel":"Piano accessories","Digital Pianos":"Digital pianos",
 "Audiointerfaces":"Audio interfaces","Abhörmonitore":"Studio monitors","Sequenzersoftware":"DAW software","Audio- und Effektplugins":"Audio & effect plugins","Virtuelle Instrumente + Sampler":"Virtual instruments",
 "EDU-Software":"EDU software","Ableton":"DAW software","Mischpulte":"Mixers","Lautsprecher":"PA speakers","In-Ear Monitoring":"In-ear monitoring","Bühnenelemente":"Stage elements","LED Technik":"LED lighting",
 "Bewegtes Licht":"Moving lights","Hardware":"Truss & hardware","Steuerpulte und Dimmer":"Lighting controllers","DJ-Kopfhörer":"DJ headphones","DJ-Player":"DJ players","DJ-Controller":"DJ controllers",
 "Turntables":"Turntables","Kopfhörer":"Headphones","Controller":"Controllers","Streaming Equipment":"Streaming equipment","Videolicht":"Video lights","Digitale Recorder":"Digital recorders",
 "Videoediting":"Video editing","Ständer":"Stands","Gesangsmikrofone":"Vocal microphones","Großmembran-Mikrofone":"Large-diaphragm microphones","Instrumentenmikrofone":"Instrument microphones",
 "Frequenzweichen":"Crossovers & DSP","Vocalisten":"Vocal processors","Kompressoren/Gates/De-Esser":"Compressors, gates & de-essers","Preamps":"Preamps","Saxophone":"Saxophones","Querflöten":"Flutes",
 "Trompeten":"Trumpets","Mundharmonikas":"Harmonicas","Posaunen":"Trombones","Orchesterschlagwerk":"Orchestral percussion","Streichinstrumente":"String instruments","Percussion":"Percussion",
 "Fake Books":"Fake books & real books","Notenzubehör":"Sheet music accessories","Cases":"Cases","Rack-/Case-Komponenten":"Rack & case parts","Instrumenten Kabel":"Instrument cables",
 "Mikrofonkabel":"Microphone cables","Kabelbinder":"Cable ties","Stecker":"Connectors"}
# Editorial: typical uses by subcategory (not product data; labelled as such in the shop)
SUB_USES = {"Electric guitars":["home","live","rehearsal"],"Guitar amps":["home","rehearsal","live"],"Guitar & bass effects":["live","rehearsal","studio"],"E-drums":["home"],"Stage pianos":["home","live"],
 "Keyboards":["home","teaching"],"Digital pianos":["home","teaching"],"Audio interfaces":["studio","producing"],"Studio monitors":["studio","producing"],"DAW software":["producing","studio"],
 "Audio & effect plugins":["producing","studio"],"Virtual instruments":["producing"],"EDU software":["producing","studio"],"Mixers":["live"],"PA speakers":["live"],"In-ear monitoring":["live"],
 "Vocal microphones":["live","rehearsal"],"Large-diaphragm microphones":["studio"],"Instrument microphones":["live","studio"],"Vocal processors":["live"],"Headphones":["home","studio"],
 "DJ headphones":["live","producing"],"Saxophones":["home","teaching","live"],"Flutes":["home","teaching"],"Trumpets":["home","teaching","live"],"Harmonicas":["home"],"Trombones":["home","teaching"],
 "String instruments":["home","teaching"],"Microphone cables":["live","studio"],"Instrument cables":["home","live","rehearsal"],"Stands":["live","studio","home"]}

# Demo products (data.js) that are the same item as a verified record: they keep their demo
# fit-check data but take the verified price, article number and Thomann link.
DEMO_LINKS = {"a1":"590613","i1":"566673","i2":"566684","m1":"105767","m2":"129929","m3":"561426","m4":"186943","m5":"105768","d2":"428224","h1":"174334"}
TOP_IDS = [t[0] for t in TAXONOMY]
REQUIRED = ["name","brand","article","price","avail","crumb"]

def parse_eur(s):
    m = re.search(r"([\d.]+(?:,\d+)?)\s*€", s or "")
    if not m: return None
    return float(m.group(1).replace(".", "").replace(",", "."))

def parse_ref(s):
    """Keeps the label: UVP (manufacturer's list price) and 30-Tage-Bestpreis (lowest price of the last 30 days) are different things."""
    if not s: return None
    v = parse_eur(s)
    if v is None: return None
    if "30-Tage" in s: return {"basis":"best30","label":"30-day best price","value":v,"text":s}
    if "UVP" in s: return {"basis":"uvp","label":"Manufacturer's list price (UVP)","value":v,"text":s}
    return {"basis":"other","label":"Reference price","value":v,"text":s}

def avail_info(s):
    s = s or ""
    if s.startswith("Sofort"): return True, "In stock"
    m = re.search(r"\((\d+)\s*[–-]\s*(\d+) Tage\)", s)
    if m: return False, f"Ships in {m.group(1)}–{m.group(2)} days"
    m = re.search(r"In (\d+)\s*-\s*(\d+) Wochen", s)
    if m: return False, f"Ships in {m.group(1)}–{m.group(2)} weeks"
    return False, s

COMPAT_KEYS = re.compile(r"USB|Phantom|Bluetooth|Stecker|Anschluss|Impedanz|Spannung|Polarität|Eingänge|Ausgänge|Mikrofoneingänge|Windows|Mac|iOS|Android|Kopierschutz|XLR|Klinke|Netzteil|Stromaufnahme|DMX|Ethernet|Batterie", re.I)

def build(raw_lines):
    recs, errors, seen = [], [], set()
    for n, line in enumerate(raw_lines, 1):
        line = line.strip()
        if not line: continue
        try:
            r = json.loads(line)
        except ValueError as e:
            errors.append(f"line {n}: not JSON ({e})"); continue
        d = r.get("d", {})
        miss = [k for k in REQUIRED if not d.get(k)]
        if r.get("cat") not in TOP_IDS: miss.append("cat")
        if not r.get("url", "").endswith(".htm"): miss.append("url")
        price = parse_eur(d.get("price"))
        if price is None: miss.append("price")
        if miss:
            errors.append(f"line {n} ({d.get('name','?')}): missing/invalid {', '.join(miss)}"); continue
        if d["article"] in seen:
            errors.append(f"line {n}: duplicate article {d['article']}"); continue
        seen.add(d["article"])
        crumb = [c.strip() for c in d["crumb"].split(">") if c.strip() and c.strip() != "Alle Kategorien"]
        sub_de = crumb[1] if len(crumb) > 1 else crumb[0]
        sub_en = SUB_EN.get(sub_de, sub_de)
        specs = {}
        for s in d.get("specs") or []:
            if ":" in s:
                k, v = s.split(":", 1)
                if k.strip() != "Artikelnummer": specs[k.strip()] = v.strip()
        in_stock, avail_en = avail_info(d["avail"])
        bundle = {"contents": d["contents"]} if d.get("bundle") and d.get("contents") else None
        recs.append({
            "id": "t" + d["article"], "article": d["article"], "name": d["name"], "brand": d["brand"],
            "top": r["cat"], "crumb": crumb, "sub": sub_de, "subEn": sub_en,
            "url": BASE + r["url"], "price": price, "currency": "EUR", "priceText": d["price"],
            "ref": parse_ref(d.get("ref")), "avail": d["avail"], "availEn": avail_en, "inStock": in_stock,
            "specs": specs, "compat": [f"{k}: {v}" for k, v in specs.items() if COMPAT_KEYS.search(k + " " + v)],
            "uses": SUB_USES.get(sub_en, []), "bundle": bundle, "image": None,
            "verified": r.get("verified", VERIFIED_ON), "source": BASE + r["url"],
        })
    return recs, errors

def build_offers(recs):
    """Offers from offers_raw.json (Hot Deals, bargains, B-Stock, official bundles), checked against the records."""
    raw = json.loads((HERE / "offers_raw.json").read_text(encoding="utf8"))
    arts = {r["article"]: r for r in recs}
    items, errors = [], []
    def need(a, where):
        if a not in arts: errors.append(f"{where}: article {a} is not a verified record")
        return a in arts
    for o in raw["hotDeals"]:
        if need(o["article"], "hot deal"):
            items.append({"type": "hotdeal", "article": o["article"], "price": parse_eur(o["listed"]), "ref": parse_ref(o["ref"]), "source": raw["sources"]["hotdeals"], "checked": raw["checked"]})
    for o in raw["bargains"]:
        if need(o["article"], "bargain"):
            items.append({"type": "bargain", "article": o["article"], "price": parse_eur(o["listed"]), "ref": parse_ref(o["ref"]), "section": o.get("section"), "source": raw["sources"]["blowouts"], "checked": raw["checked"]})
    for o in raw["bstock"]:
        if need(o["newArticle"], "b-stock"):
            items.append({"type": "bstock", "article": o["article"], "name": o["name"], "brand": o["brand"], "price": parse_eur(o["price"]), "avail": o["avail"],
                          "condition": o["condition"], "warranty": o["warranty"], "url": BASE + o["url"], "newArticle": o["newArticle"], "checked": raw["checked"]})
    for o in raw["bundles"]:
        parts = o.get("parts")
        if parts:
            ok = all(need(a, "bundle " + o["name"]) for a in parts)
            parts_sum = round(sum(arts[a]["price"] for a in parts), 2) if ok else None
        else:
            parts_sum = None
        price = parse_eur(o["price"])
        items.append({"type": "bundle", "article": o["article"], "name": o["name"], "brand": o.get("brand"), "price": price, "ref": parse_ref(o.get("ref")),
                      "avail": o.get("avail"), "url": BASE + o["url"] if o.get("url") else None, "top": o.get("top"), "parts": parts, "partsSum": parts_sum,
                      "verifiedSaving": round(parts_sum - price, 2) if parts_sum and parts_sum > price else None,
                      "contents": o["contents"], "note": o.get("note"), "checked": raw["checked"]})
    return {"checked": raw["checked"], "sources": raw["sources"], "items": items}, errors

PACK_TOP = {"Guitars & Basses":"guitars_basses","Drums & Percussion":"drums","Keys":"keys","Studio & Recording":"studio","Software":"software","PA Equipment":"pa",
 "Lighting & Stage":"lighting","DJ Equipment":"dj","Broadcast & Video":"broadcast","Microphones":"mics","Effects & Signal Processing":"fx","Wind Instruments":"wind",
 "Traditional Instruments":"traditional","Sheet Music & Books":"sheet","Cases, Racks & Bags":"cases","Cables & Connectors":"cables","Accessories & Headphones":"accessories"}
PACK_TYPE = {"hot_deal":"hotdeal","clearance":"clearance","b_stock":"bstock","official_bundle":"bundle"}
REF_TYPE = {"30_day_low":"best30","msrp":"uvp"}

def build_pack(recs):
    """Deals snapshot of 2026-11-06 (thomann_deals_seed_2026-11-06.json): pricing-only records, kept separate
    from the product-page records. record_id is the merge key; listing prices are a dated snapshot, never live."""
    import csv
    f = HERE / "thomann_deals_seed_2026-11-06.json"
    if not f.exists(): return None, []
    d = json.loads(f.read_text(encoding="utf8"))
    by_path = {r["url"].rsplit("/", 1)[-1]: r for r in recs}
    obs = {}
    with open(HERE / "thomann_price_observations_2026-11-06.csv", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            obs.setdefault(row["record_id"], []).append({"t": row["observed_on"], "type": row["observation_type"], "price": float(row["price_eur"]), "conflict": row["conflict_flag"] == "True"})
    out, errors, seen = [], [], set()
    for x in d["deals"]:
        rid = x["record_id"]
        if rid in seen: errors.append("duplicate record_id " + rid); continue
        seen.add(rid)
        if x["category"] not in PACK_TOP: errors.append(f"{rid}: unknown category {x['category']}"); continue
        path = x["product_url"].rsplit("/", 1)[-1]
        ref = None
        if x["reference_price_eur"] and x["reference_price_type"] in REF_TYPE:
            b = REF_TYPE[x["reference_price_type"]]
            ref = {"basis": b, "label": "30-day best price" if b == "best30" else "Manufacturer's list price (UVP)", "value": x["reference_price_eur"], "text": f"{x['reference_price_label']}: {x['reference_price_eur']} €"}
        match = by_path.get(path)
        out.append({"recordId": rid, "article": match["article"] if match else (x["product_id"] or None), "matched": bool(match), "name": x["product_name"],
                    "top": PACK_TOP[x["category"]], "path": path, "type": PACK_TYPE[x["offer_type"]], "condition": x["condition"],
                    "price": x["listing_price_eur"], "pagePrice": x["product_page_price_eur"], "ref": ref, "observed": x["observed_on"],
                    "stock": x["stock_status"], "conflict": x["verification_status"] == "listing_product_conflict", "status": x["verification_status"],
                    "notes": x["notes"], "observations": obs.get(rid, [])})
    meta = {"snapshot": d["scraped_date"], "count": len(out), "warnings": d["warnings"], "live": False}
    return {"meta": meta, "items": out}, errors

def main():
    raw = (HERE / "verified_raw.jsonl").read_text(encoding="utf8").splitlines()
    recs, errors = build(raw)
    offers, oerr = build_offers(recs)
    errors += oerr
    pack, perr = build_pack(recs)
    errors += perr
    arts={r["article"] for r in recs}
    errors += [f"demo link {k}: article {v} not in records" for k,v in DEMO_LINKS.items() if v not in arts]
    if errors:
        print("Validation errors:\n  " + "\n  ".join(errors)); sys.exit(1)
    data = {"schemaVersion": 1, "market": "DE", "currency": "EUR", "verifiedOn": VERIFIED_ON,
            "directory": "https://www.thomann.de/de/cat.html",
            "taxonomy": [{"id": i, "en": en, "de": de, "url": BASE + u, "subs": subs} for i, en, de, u, subs in TAXONOMY],
            "specialTools": SPECIAL_TOOLS, "demoLinks": DEMO_LINKS, "offers": offers, "dealsPack": pack, "records": recs}
    js = ("/* Generated by catalogue/build_catalogue.py from catalogue/verified_raw.jsonl. Do not edit by hand.\n"
          "   Product data copied from thomann.de product pages (German store, EUR) on " + VERIFIED_ON + ". */\n"
          "const THOMANN_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    out = HERE.parent / ("static/catalogue.js" if (HERE.parent / "static").is_dir() else "catalogue.js")
    out.write_text(js, encoding="utf8")
    rows = []
    for i, en, de, u, subs in TAXONOMY:
        n = sum(1 for r in recs if r["top"] == i)
        rows.append(f"| {en} | {n} | {'complete' if n >= 6 else 'needs more verified records'} |")
    rep = ("# Catalogue coverage\n\nVerified on thomann.de (German store, EUR) on " + VERIFIED_ON + ". "
           "A category is complete when it has at least 6 verified product records.\n\n"
           "| Top-level category | Verified records | Status |\n|---|---|---|\n" + "\n".join(rows) +
           f"\n\n**Total: {len(recs)} verified records.**\n\nNot stored for any record (not verified): ratings, review counts, return data, stock counts, product images. "
           "Bundles are only marked when the page lists the contents. Price references keep Thomann's label (UVP = manufacturer's list price; 30-Tage-Bestpreis = lowest price in the last 30 days).\n")
    (HERE / "coverage_report.md").write_text(rep, encoding="utf8")
    print(f"ok: {len(recs)} records → catalogue.js; coverage_report.md written")

if __name__ == "__main__":
    main()
