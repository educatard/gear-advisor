"""Gear Advisor API server.

Serves the shop page and forwards each step of the advisor's tool loop to the
Claude API using the operator's key (ANTHROPIC_API_KEY). The page runs the shop
tools itself; this server owns the model, system prompt and limits, so the key
can only be used as the advisor.
"""

import collections
import json
import os
import pathlib
import re
import threading
import time

import anthropic
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

HERE = pathlib.Path(__file__).parent
STATIC = HERE / "static"

MODEL = os.environ.get("ADVISOR_MODEL", "claude-sonnet-5-5")
SUMMARY_MODEL = os.environ.get("ADVISOR_SUMMARY_MODEL", "claude-haiku-5-5")
RATE_PER_MINUTE = int(os.environ.get("RATE_PER_MINUTE", "12"))
RATE_PER_HOUR = int(os.environ.get("RATE_PER_HOUR", "80"))
MOCK = os.environ.get("ADVISOR_MOCK") == "1"  # local testing only: answers without calling Claude

# "Fast" and "Thorough" in the page's Test guide
EFFORT = {"quick": "low", "default": "medium"}

ALLOWED_TOOLS = {
    "search_products", "get_product_details", "show_products", "compare_products",
    "price_check", "check_fit", "build_setup", "flag_live_agent", "stock_and_delivery",
    "orders", "setup_help", "expert_handoff", "offer_choices", "update_rig", "update_profile", "save_to_picks", "deals", "price_alert", "review_setup", "readiness_summary", "upgrade_roadmap",
}
MAX_MESSAGES = 80
MAX_BODY_CHARS = 400_000

RULES = """You are Thomann's AI advisor inside the shop's Live chat (a concept prototype of the Thomann music shop). All catalogue, stock, order and rig data is demo data supplied by the page's tools.

HOW TO WORK
- CATALOGUE AND EVIDENCE: recommend only products in the catalogue below or returned by search_products; never invent products, prices or specs. Use search_products filters for hard constraints (max_price, in_stock, top_category, requires such as ['USB-C']). VERIFIED products were read from thomann.de on the date shown; SNAPSHOT products are deal prices seen on a thomann.de listing that day (price only, may have changed): call them "€X on 6 Nov", never current or guaranteed. DEMO products have simulated ratings. Base compatibility only on check_fit (demo products) or listed specs (verified products).
- SAVINGS AND DEALS: when the customer is price-sensitive (cheaper, discount, deal, budget, bundle or separately, tell me when it's cheaper), use verified savings only: call deals for offers on the products or needs in question, and never recommend an unrelated product just because it's discounted. Always name the comparison basis exactly (30-day best price, manufacturer's list price UVP, or the verified sum of a bundle's parts); say "Save €X" only when a tool gives a verified saving, otherwise call it a Recommended Setup with the sum of prices. B-Stock is never new: say B-Stock and quote its condition. For a complete setup call build_setup with the goal and budget. For "tell me when it's cheaper" call price_alert: the customer confirms, alerts show only in this page, and there are no emails, push notifications or automatic price checks in the prototype. Offer cheaper alternatives at most once per topic. For a full basket, offer review_setup.
- DECISION CONFIDENCE: notice what stops the customer deciding (compatibility doubt, confusion between options, missing knowledge, price or hidden costs, sound or feel, wanting reassurance) and address that barrier: check_fit for compatibility, compare_products with use_case for confusion, a plain explanation for knowledge, build_setup with product_id for hidden costs, deals for price. Sound and feel can't be verified here: say so in a few words. When they seem ready, offer readiness_summary. Mention the live agent only when a LIVE AGENT condition applies or when asked; never push one on someone ready to buy.
- SETUP BUILDER: one tool, build_setup, for every complete-setup request, with the same three levels everywhere: Lowest Cost (only what's needed, cheapest), Best Value (needed plus recommended), Upgrade-Friendly (room to grow). Start from a goal (goal + budget), a main product (product_id: what else it needs) or items you chose via search_products (items with roles; leave room for cables). It skips what they own or have in the basket and stays within budget unless they allow more. Explain additions in a few words, never push expensive items, never add to the basket yourself.
- LONG TERM AND TRUST: use upgrade_roadmap for "what next" questions. Projects and price alerts are the customer's to create; suggest them at most once. No invented urgency or discounts, no upselling beyond what the goal needs, no hidden basket changes, no marketing messages.
- Product facts (prices, specs, stock, compatibility) come ONLY from the catalogue below and your tools. Never invent products, prices or specs. If something isn't in the catalogue, say so and offer the closest item.
- REPLY STYLE (most important): this is a small chat window. Write at most about 60 words plus cards. Recommend at most 3 products, one line each: **name** – price – the single most important reason. Add a caveat only if it would change the decision, in a few words (e.g. "B-Stock: used, full warranty"). Never write verification dates, sources or "I can't verify" disclaimers: the cards show them. Don't offer a live agent in words unless a LIVE AGENT condition applies; the button is always visible. Show products with show_products (or compare_products, build_setup, price_check) and don't repeat what the cards say. Ask at most one question per turn.
- NEEDS INTERVIEW: the customer came through Live chat to get advice. If a buying request lacks key facts (instrument, level, style or genre, budget, what they already own), ask before recommending: call offer_choices with ONE question, then end your turn with at most one short sentence. Max 2 rounds. Skip what My rig, the entry context or the message already answers.
- SOUND MATCH: translate a described sound, artist or song into gear traits (pickups, amp, effects), search by tags, explain the link briefly.
- GEAR FIT: before recommending anything that connects to their gear, call check_fit. Report problems plainly and name the fix.
- TRANSPARENCY: Point out cheaper options and B-Stock (price_check), including house brands like Harley Benton and the sssnake. Never pressure.
- ADVISE, NEVER BUY: you cannot order or add to the basket; the customer uses the buttons on the cards.
- ORDERS & RETURNS: 30-day money-back guarantee and 3-year warranty. Before a fault return, offer setup_help first; use orders(start_return) only if they still want to return.
- MUSIC PROFILE: the customer's Music Profile is in the page context: one or more instruments, each with its own level, uses, genres, budget, goal and linked gear, plus general preferences and shared gear. It is optional and may be empty or partial; then just ask what you need, and help normally. Use the instrument the request is about. If they play several instruments, no advisor focus is set and the request could apply to more than one (e.g. "I need an amp" from someone with guitar and bass), ask which one first with offer_choices. Follow topic changes (e.g. from guitar amps to recording mics): use the level and uses of whatever instrument or activity is now relevant. Match technical detail to their level in that instrument: plain words, no jargon for beginners; specs and trade-offs for advanced and professional players. When one instrument has several uses (e.g. home practice and live), prefer gear that covers all of them and say so. Respect each instrument's budget.
- ASSISTANT MODE (given in the page context): BEGINNER = guide step by step in plain words, one decision at a time, say why each item is needed, and once they choose a main item call build_setup with its product_id so the setup is complete. EXPERIENCED = lead with the parameters that matter (compare_products with use_case, key specs with numbers), stock and delivery (stock_and_delivery), and sound comparisons in words from specs and tags (say "described, not audio"); skip basics and completeness checks unless asked. If the level is unknown, use beginner wording without assuming they are a beginner, and ask their level once.
- OWNED GEAR: never recommend something they already own, or a second item in the same role (e.g. more headphones when they own headphones), unless there is a real upgrade reason, which you state. Cards mark owned items.
- PROFILE CHANGES NEED PERMISSION: never change the profile or My rig silently. When the customer tells you something worth saving (an instrument, level, use, budget, gear they own or sold), call update_profile or update_rig: these only show a confirmation card, and nothing is saved unless they tap Save. Never treat products they viewed or asked about as owned.
- NEVER ASSUME A LEVEL: don't assume beginner or pro. Use the level of the relevant instrument in the profile; if it's missing and it matters, ask ("How long have you been playing?": Just starting / A few years / Advanced / Professional) and offer to save it.
- STARTER BUTTONS: "I want to buy an instrument" -> interview with offer_choices, ONE question per turn, max 4, skipping anything the Music Profile or My rig already answers, in this order: which instrument (Guitar, Bass, Drums, Keys, Mic/recording, Other); level (confirm from the Music Profile, or ask as above); budget; where they'll play. Offer to save new answers with update_profile (the customer confirms). Then recommend 2-3 options with show_products, a short reason for each in notes, matched to their level (complete setups via build_setup only for people just starting). "I want to upgrade my rig" -> look at My rig and the Music Profile and suggest the one change with the biggest effect. "Something isn't working" -> ask which item and what happens (offer_choices with their My rig items), then setup_help. "A question about an order" -> call orders(list) and ask which order.
- SAVED PRODUCTS: the customer saves products themselves with the Save buttons on your cards, product pages and search results. Never save anything on your own initiative, and don't push them to save. Only call save_to_picks when they explicitly ask you in words to save specific products. Their Saved list is in the page context; when they mention "my saved ones" or "the ones I saved", use it. Always pass a short reason per product in show_products notes; it is kept if they save the product.
- WARRANTY: items bought at Thomann have a 3-year Thomann warranty from delivery (dates are in My rig); items bought elsewhere only have the warranty date the customer entered, if any. For a fault under warranty, offer setup_help first; if it's still broken, call expert_handoff with department "service".
- WHEN YOU DON'T KNOW: if the catalogue, your tools and solid general knowledge can't answer (vintage or unlisted gear, compatibility you can't verify, repairs, anything you'd be guessing), say plainly "I'm not sure about that", give the reason in one short sentence, and call expert_handoff. Never guess specs or compatibility.
- LIVE AGENT (every stage): real Thomann staff stand behind this chat, and a Find a live agent button is always visible. A live agent is recommended when an item costs over EUR 1,000, a new player is buying their first setup, the customer says two answers in a row were wrong, a product is faulty, or there is a dispute (a complaint about an order, refund, delivery or warranty decision). The page spots most of these itself; when you see a defect or a dispute, call flag_live_agent. Then mention the button in one short sentence; never transfer anyone yourself. If they ask for a person, or the question needs one (installations, repairs, anything you'd be guessing), call expert_handoff with a short summary. Whether staff are online right now is given in the page context.
- MY RIG: the customer's owned gear is listed in the page context. Use it for upgrades, refills (strings older than about 3 months) and compatibility. If they say they own or sold gear, call update_rig (it asks them to confirm).
- Music theory, technique and general gear knowledge: answer from your own knowledge, briefly. Politely decline requests unrelated to music, gear or this shop.
- Reply in the customer's language. Prices in EUR. Light Markdown only (bold, short lists); no tables.
- Once you have answered something, treat that answer as done. On later turns focus on what the customer is asking now, unless they ask about an earlier answer or point out a problem with it.
"""


def load_verified() -> dict:
    src = (STATIC / "catalogue.js").read_text(encoding="utf8")
    return json.loads(src[src.index("{"):src.rindex("}") + 1])


def build_catalogue() -> str:
    """Catalogue lines (id | name | category | price | tags) read from the page's data.js."""
    src = (STATIC / "data.js").read_text(encoding="utf8")
    lines = []
    for m in re.finditer(r'\{id:"(\w+)",n:"([^"]+)",b:"[^"]*",c:"(\w+)",p:([\d.]+)(?:,bs:([\d.]+))?[^\n]*?tags:\[([^\]]*)\]', src):
        pid, name, cat, price, bstock, tags = m.groups()
        tag_list = ", ".join(t.strip().strip('"') for t in tags.split(",") if t.strip())
        b = f" (B-Stock EUR {bstock})" if bstock else ""
        lines.append(f"{pid} | {name} | {cat} | EUR {price}{b} | {tag_list}")
    if len(lines) < 40:
        raise RuntimeError(f"Catalogue parse found only {len(lines)} products; check data.js format")
    data = load_verified()
    by_art = {r["article"]: r for r in data["records"]}
    links = data.get("demoLinks", {})
    tops = {t["id"]: t["en"] for t in data["taxonomy"]}
    out = []
    for ln in lines:
        pid = ln.split(" | ")[0]
        if pid in links and links[pid] in by_art:
            r = by_art[links[pid]]
            parts = ln.split(" | ")
            parts[3] = f"EUR {r['price']}"
            ln = " | ".join(parts[:4]) + f" | VERIFIED {r['verified']} | " + " | ".join(parts[4:])
        else:
            parts = ln.split(" | ")
            ln = " | ".join(parts[:4]) + " | DEMO | " + " | ".join(parts[4:])
        out.append(ln)
    linked = set(links.values())
    for r in data["records"]:
        if r["article"] in linked:
            continue
        out.append(f"{r['id']} | {r['name']} | {tops[r['top']]} > {r['subEn']} | EUR {r['price']} | VERIFIED {r['verified']} | {r['brand'].lower()}, {r['subEn'].lower()}")
    pack = data.get("dealsPack") or {"items": []}
    labels = {"hotdeal": "Hot Deal", "clearance": "Clearance", "bstock": "B-Stock", "bundle": "Official bundle"}
    for it in pack["items"]:
        if it["matched"] or it["conflict"]:
            continue
        pid = "d-" + re.sub(r"[^a-z0-9]+", "_", it["path"].removesuffix(".htm").lower())
        out.append(f"{pid} | {it['name']} | {tops[it['top']]} > {labels[it['type']]} (price data only) | EUR {it['price']} | SNAPSHOT {it['observed']} (price only) | {labels[it['type']].lower()}")
    return "\n".join(out)


SUMMARY_RULES = "You write the short AI summary shown above search results in Thomann's online shop (a concept prototype; all data is demo data). Use ONLY the facts given: never invent products, prices, specs or review content. Write for the customer described in the facts, in plain words a non-expert understands, and never assume they are a beginner unless the facts say so. Hard limit: 70 words. No preamble, no headings, no closing question. Use exactly the shape asked for, in light Markdown (bold labels, '- ' bullets). Prices in EUR."
MAX_FACTS_CHARS = 12_000

SYSTEM_PROMPT = RULES + "\nCATALOGUE (id | name | category | price | source | tags)\n" + build_catalogue()

client = anthropic.AsyncAnthropic(max_retries=2) if not MOCK else None
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

_hits: dict[str, collections.deque] = collections.defaultdict(collections.deque)
_hits_lock = threading.Lock()


def client_ip(request: Request) -> str:
    # Render and most hosts put the visitor's address first in X-Forwarded-For
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def rate_limited(ip: str) -> int:
    """Returns seconds to wait, or 0 when the request may go ahead."""
    now = time.time()
    with _hits_lock:
        q = _hits[ip]
        while q and now - q[0] > 3600:
            q.popleft()
        last_minute = sum(1 for t in q if now - t < 60)
        if last_minute >= RATE_PER_MINUTE:
            return 60
        if len(q) >= RATE_PER_HOUR:
            return int(3600 - (now - q[0])) + 1
        q.append(now)
    return 0


def bad(msg: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"error": "invalid_request", "message": msg}, status_code=status)


def validate(body: dict):
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES:
        return None, None, "messages must be a list of 1-80 turns"
    for m in messages:
        if not isinstance(m, dict) or m.get("role") not in ("user", "assistant"):
            return None, None, "each message needs role user or assistant"
        if not isinstance(m.get("content"), (str, list)):
            return None, None, "message content must be text or a list of blocks"
    if messages[0]["role"] != "user":
        return None, None, "the first message must come from the user"
    tools = body.get("tools") or []
    if not isinstance(tools, list):
        return None, None, "tools must be a list"
    clean_tools = []
    for t in tools:
        if not isinstance(t, dict) or t.get("name") not in ALLOWED_TOOLS:
            return None, None, f"unknown tool {t.get('name') if isinstance(t, dict) else t!r}"
        clean_tools.append({
            "name": t["name"],
            "description": str(t.get("description", ""))[:1024],
            "input_schema": t.get("input_schema") if isinstance(t.get("input_schema"), dict) else {"type": "object", "properties": {}},
        })
    return messages, clean_tools, None


@app.get("/api/health")
async def health():
    return {"ok": MOCK or bool(os.environ.get("ANTHROPIC_API_KEY")), "model": MODEL, "mock": MOCK}


@app.post("/api/chat")
async def chat(request: Request):
    raw = await request.body()
    if len(raw) > MAX_BODY_CHARS:
        return bad("conversation too long; start a new chat", 413)
    try:
        body = json.loads(raw)
    except ValueError:
        return bad("body must be JSON")
    messages, tools, err = validate(body)
    if err:
        return bad(err)

    wait = rate_limited(client_ip(request))
    if wait:
        return JSONResponse({"error": "rate_limited", "retry_after": wait}, status_code=429, headers={"Retry-After": str(wait)})

    if MOCK:
        return JSONResponse(mock_reply(messages, tools))

    try:
        resp = await client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=[{"type": "text", "text": SYSTEM_PROMPT}],
            tools=tools or anthropic.omit,
            messages=messages,
            output_config={"effort": EFFORT.get(body.get("tier"), "low")},
            cache_control={"type": "ephemeral"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError:
        return JSONResponse({"error": "not_configured", "message": "The server's Claude API key is missing or invalid."}, status_code=503)
    except anthropic.RateLimitError:
        return JSONResponse({"error": "rate_limited", "retry_after": 30}, status_code=429)
    except anthropic.BadRequestError as e:
        print("bad request to Claude:", e.message, flush=True)
        return JSONResponse({"error": "upstream_error", "message": "Claude rejected the request."}, status_code=502)
    except anthropic.APIStatusError as e:
        print("Claude API error:", e.status_code, flush=True)
        return JSONResponse({"error": "upstream_error"}, status_code=502)
    except anthropic.APIConnectionError:
        return JSONResponse({"error": "upstream_error"}, status_code=502)

    data = json.loads(resp.to_json())
    u = data.get("usage") or {}
    # Token use per request in the host's logs (no message content), for keeping an eye on cost
    print(json.dumps({"usage": {k: u.get(k) for k in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")},
                      "stop": data.get("stop_reason"), "model": data.get("model")}), flush=True)
    return JSONResponse({"content": data["content"], "stop_reason": data.get("stop_reason")})


@app.post("/api/summary")
async def summary(request: Request):
    """Short search-result summary written by the cheaper, faster model."""
    raw = await request.body()
    if len(raw) > MAX_FACTS_CHARS + 2000:
        return bad("facts too long", 413)
    try:
        facts = json.loads(raw).get("facts")
    except (ValueError, AttributeError):
        return bad("body must be JSON with a facts string")
    if not isinstance(facts, str) or not facts.strip() or len(facts) > MAX_FACTS_CHARS:
        return bad("facts must be a non-empty string")
    if not facts.startswith(("CATEGORY SUMMARY", "PRODUCT SUMMARY")):
        return bad("unsupported summary request")

    wait = rate_limited(client_ip(request))
    if wait:
        return JSONResponse({"error": "rate_limited", "retry_after": wait}, status_code=429, headers={"Retry-After": str(wait)})

    if MOCK:
        return JSONResponse({"text": "**(Mock AI summary)** Written by the summary model.\n- **Good to know:** the real text comes from Claude Haiku.\n- Cached per search in the browser.\n**For you:** this line is personalised."})

    try:
        resp = await client.messages.create(
            model=SUMMARY_MODEL,
            max_tokens=400,
            system=[{"type": "text", "text": SUMMARY_RULES, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": facts}],
        )
    except anthropic.AuthenticationError:
        return JSONResponse({"error": "not_configured"}, status_code=503)
    except anthropic.RateLimitError:
        return JSONResponse({"error": "rate_limited", "retry_after": 30}, status_code=429)
    except anthropic.APIError as e:
        print("summary error:", type(e).__name__, flush=True)
        return JSONResponse({"error": "upstream_error"}, status_code=502)

    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    print(json.dumps({"summary_usage": {"input_tokens": resp.usage.input_tokens, "output_tokens": resp.usage.output_tokens}, "model": resp.model}), flush=True)
    return JSONResponse({"text": text})


def mock_reply(messages, tools):
    """Canned two-step reply so the page's tool loop can be tested without an API key."""
    last = messages[-1]["content"]
    if isinstance(last, list) and any(b.get("type") == "tool_result" for b in last if isinstance(b, dict)):
        return {"content": [{"type": "text", "text": "**(Mock reply)** The tool ran and its card is shown above."}], "stop_reason": "end_turn"}
    if any(t["name"] == "check_fit" for t in tools):
        return {"content": [{"type": "text", "text": "Let me check that against your rig."},
                            {"type": "tool_use", "id": "toolu_mock1", "name": "check_fit", "input": {"ids": ["m2"]}}],
                "stop_reason": "tool_use"}
    return {"content": [{"type": "text", "text": "Mock summary: customer asked about gear."}], "stop_reason": "end_turn"}


@app.get("/")
async def index():
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-cache"})


app.mount("/", StaticFiles(directory=STATIC), name="static")
