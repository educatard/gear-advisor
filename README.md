# Gear Advisor (API-key version)

The Thomann-style shop prototype with the AI advisor running on **your** Claude API key, so testers need no Claude account. Every message from every visitor is billed to your API account.

- `app.py`: a small Python server. It serves the shop page and forwards each step of the advisor's conversation to Claude (`claude-sonnet-5-5`). The server owns the model, the advisor's instructions and the limits, so the key can only be used as the shop advisor.
- `static/`: the shop page, built from `../gear-advisor.html` by `../build_site.py`. Don't edit these files directly.
- `render.yaml`: one-click setup for Render.
- `catalogue/`: the product data pipeline. `verified_raw.jsonl` holds 103 records read from thomann.de product pages (German store, EUR) on 2026-11-07, at least 6 for each of Thomann's 17 top-level categories; `offers_raw.json` holds Hot Deals, a bargain, a B-Stock item and official bundles from the same day; `thomann_deals_seed_2026-11-06.json` and `thomann_price_observations_2026-11-06.csv` add a 52-deal snapshot of 6 Nov (price data only, shown as dated prices; 2 records with conflicting prices are flagged and kept away from the advisor). `python3 catalogue/build_catalogue.py` validates both and writes `static/catalogue.js`; `coverage_report.md` lists the count per category. New or updated records can also be imported in the page (All categories → Catalogue coverage and import); those stay in the visitor's browser.

## What is real and what is demo data

- Verified: product names, brands, article numbers, prices, reference prices (labelled UVP or 30-day best price), availability text, breadcrumbs and listed specs of the catalogue records; the listed offers; the parts and prices of the Scarlett Solo 3rd + NT1-A bundle.
- Demo: the original 61 demo products' ratings, reviews and fit-check model (return statistics are no longer shown anywhere) (10 of them are linked to their verified record and show the verified price), orders, specialists and handoffs.
- The page doesn't link out to thomann.de; sources are shown as plain text.
- Not available: checkout, real purchases, customer accounts, scheduled price monitoring, email or push notifications. Price alerts only react to imported verified prices or to the clearly labelled demo mode. The performance dashboard reports conversion, order value and repeat-purchase metrics as not measurable and labels proxies.
- Privacy: the Music Profile, My rig, saved products, projects, alerts and anonymous usage events are stored in the visitor's browser only; profile details are sent to Claude only as part of chat messages.

## Cost and protection

- The AI summaries above search results use **Claude Haiku 5.5** (`ADVISOR_SUMMARY_MODEL`), roughly **$0.002–0.005 each**, and each search is remembered in the visitor's browser so repeats are free. They count toward the same per-visitor rate limit.
- Rough cost with Sonnet 5.5: **$0.03–0.05 per message**, so about **$0.50–0.75 per 15-message test session**. Prompt caching is on, which cuts the cost of the repeated instructions and catalogue.
- Each visitor (by IP address) can make **12 requests a minute and 80 an hour**. One chat message uses 1–4 requests, depending on how many tools the advisor calls. Change this with `RATE_PER_MINUTE` and `RATE_PER_HOUR`.
- There is **no daily cap and no access code**. Anyone with the link can use the advisor until the rate limit stops them. **Set a monthly spend limit for this key in the Claude Console** (Settings → Limits) before sharing the link.
- Each request's token use is printed to the server log (no message content), so you can watch spend in Render's Logs tab.
- If the model declines a request for safety reasons, the server retries on a fallback model automatically (`fallbacks: "default"`).

## Run it on your Mac

From this folder, with your key in the environment (type it into your own terminal; never paste it into a chat or a file in this folder):

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # your key
```

```bash
.venv/bin/uvicorn app:app --port 8770
```

Open http://localhost:8770. To test the page without spending anything, start it with `ADVISOR_MOCK=1` in front of the last command: the advisor then gives a scripted reply.

## Put it online with Render

1. Create a free account at render.com and connect your GitHub account.
2. Put this folder in a new **private** GitHub repository (the commands are in the chat; `.gitignore` keeps `.venv` out).
3. In Render: **New → Blueprint**, pick the repository. Render reads `render.yaml`.
4. When it asks for `ANTHROPIC_API_KEY`, paste your key there. It's stored encrypted by Render and never appears in the code.
5. Deploy. The site's address is `https://gear-advisor-XXXX.onrender.com`.

The free plan sleeps after about 15 minutes without visits, so the first page load afterwards takes around 30 seconds. Open the link a minute before a test session.

## Updating

After changing `../gear-advisor.html` (or `data.js`, `engine.js`, `tools.js`), run `python3 ../build_site.py`, commit and push. Render redeploys automatically.
