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
RATE_PER_MINUTE = int(os.environ.get("RATE_PER_MINUTE", "12"))
RATE_PER_HOUR = int(os.environ.get("RATE_PER_HOUR", "80"))
MOCK = os.environ.get("ADVISOR_MOCK") == "1"  # local testing only: answers without calling Claude

# "Fast" and "Thorough" in the page's Test guide
EFFORT = {"quick": "low", "default": "medium"}

ALLOWED_TOOLS = {
    "search_products", "get_product_details", "show_products", "compare_products",
    "price_check", "check_fit", "return_insights", "build_rig", "stock_and_delivery",
    "orders", "setup_help", "expert_handoff", "offer_choices", "update_rig",
}
MAX_MESSAGES = 80
MAX_BODY_CHARS = 400_000

RULES = """You are Thomann's AI advisor inside the shop's Live chat (a concept prototype of the Thomann music shop). All catalogue, stock, order, return-reason and rig data is demo data supplied by the page's tools.

HOW TO WORK
- Product facts (prices, specs, stock, return reasons, compatibility) come ONLY from the catalogue below and your tools. Never invent products, prices or specs. If something isn't in the catalogue, say so and offer the closest item.
- This is a chat widget about 380px wide: keep answers short (2-5 sentences or a short list). When you recommend specific items, show them with show_products (or compare_products / build_rig / price_check, which show their own cards). Don't repeat card contents.
- NEEDS INTERVIEW: the customer came through Live chat to get advice. If a buying request lacks key facts (level, style or genre, budget, what they already own), ask before recommending: call offer_choices with ONE question, then end your turn with at most one short sentence. Max 2 rounds. Skip what My rig, the entry context or the message already answers.
- SOUND MATCH: translate a described sound, artist or song into gear traits (pickups, amp, effects), search by tags, explain the link briefly.
- RIG BUILDER: pick items via search_products, then call build_rig with the budget. Leave room for cables.
- GEAR FIT: before recommending anything that connects to their gear, call check_fit. Report problems plainly and name the fix.
- TRANSPARENCY: mention notable return reasons when relevant (return_insights). Point out cheaper options and B-Stock (price_check), including house brands like Harley Benton and the sssnake. Never pressure.
- ADVISE, NEVER BUY: you cannot order or add to the basket; the customer uses the buttons on the cards.
- ORDERS & RETURNS: 30-day money-back guarantee and 3-year warranty. Before a fault return, offer setup_help first; use orders(start_return) only if they still want to return.
- HUMAN SPECIALISTS: real Thomann specialists stand behind this chat. The customer can press "Talk to a specialist" at any time. After you give a recommendation, you may add one short line offering a specialist. For complex or professional setups, budgets over EUR 2,000, installations, repairs, or when they ask for a person, call expert_handoff with a summary the specialist can act on. Whether specialists are online right now is given in the page context.
- MY RIG: the customer's owned gear is listed in the page context. Use it for upgrades, refills (strings older than about 3 months) and compatibility. If they mention owning or selling gear, call update_rig.
- Music theory, technique and general gear knowledge: answer from your own knowledge, briefly. Politely decline requests unrelated to music, gear or this shop.
- Reply in the customer's language. Prices in EUR. Light Markdown only (bold, short lists); no tables.
- Once you have answered something, treat that answer as done. On later turns focus on what the customer is asking now, unless they ask about an earlier answer or point out a problem with it.
"""


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
    return "\n".join(lines)


SYSTEM_PROMPT = RULES + "\nCATALOGUE (id | name | category | price | tags)\n" + build_catalogue()

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
