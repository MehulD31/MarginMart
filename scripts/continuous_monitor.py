"""
MarginMart Telegram Deal Monitor
=================================
Production-ready Telethon userbot that monitors public Telegram channels
and sends alerts to a group when keywords match watchlist items.

Setup:
  1. pip install telethon python-dotenv supabase
  2. Fill in .env (see .env.example)
  3. Run: python monitor.py --setup   (first time, to generate session)
  4. Run: python monitor.py           (normal operation)
"""

import asyncio
import os
import sys
import logging
import signal
from datetime import datetime

from dotenv import load_dotenv
from telethon import TelegramClient, events
from telethon.errors import SessionPasswordNeededError
import urllib.request
import json
from aiohttp import web

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SESSION_STRING = os.getenv("TELEGRAM_SESSION_STRING", "")
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ALERT_CHAT_ID = os.getenv("ALERT_CHAT_ID", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Channels to monitor (add as many as you want)
MONITOR_CHANNELS = os.getenv("MONITOR_CHANNELS", "deals").split(",")
MONITOR_CHANNELS = [c.strip().lstrip("@") for c in MONITOR_CHANNELS]

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("monitor.log", encoding="utf-8"),
    ]
)
log = logging.getLogger("marginmart")

# ── Supabase helpers ──────────────────────────────────────────────────────────
def fetch_watchlists():
    """Fetch all watchlist items with shopkeeper names from Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/watchlists?select=product_name,keywords,shopkeeper_id,shopkeepers(name)"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def save_match(shopkeeper_id, product_name, keyword, text, link):
    """Save a match to the matches table."""
    try:
        payload = json.dumps({
            "shopkeeper_id": shopkeeper_id,
            "product_name": product_name,
            "matched_keyword": keyword,
            "original_text": text[:1000],
            "telegram_link": link,
            "operator_name": "TELETHON_MONITOR"
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/matches",
            data=payload,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            method="POST"
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        log.warning(f"Failed to save match: {e}")

# ── Telegram alert sender ─────────────────────────────────────────────────────
def send_alert(text: str):
    """Send alert via Bot API (synchronous, safe to call from async context)."""
    payload = json.dumps({
        "chat_id": ALERT_CHAT_ID,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        result = json.loads(r.read())
        if not result.get("ok"):
            log.error(f"Telegram send failed: {result}")
        return result

# ── Render Web Server ─────────────────────────────────────────────────────────
async def health_check(request):
    return web.Response(text="MarginMart Bot is running 24/7!")

async def start_web_server():
    app = web.Application()
    app.add_routes([web.get('/', health_check)])
    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.environ.get("PORT", 8000))
    site = web.TCPSite(runner, '0.0.0.0', port)
    await site.start()
    log.info(f"Dummy web server started on port {port} to satisfy Render")

# ── Core monitor ──────────────────────────────────────────────────────────────
async def run_monitor():
    if not API_ID or not API_HASH:
        log.error("TELEGRAM_API_ID and TELEGRAM_API_HASH are required. Get them from https://my.telegram.org/apps")
        sys.exit(1)

    if not BOT_TOKEN or not ALERT_CHAT_ID:
        log.error("BOT_TOKEN and ALERT_CHAT_ID are required in .env")
        sys.exit(1)

    # Use string session if available, otherwise file-based
    session = SESSION_STRING if SESSION_STRING else "marginmart_monitor"
    client = TelegramClient(session, API_ID, API_HASH)

    log.info("Starting MarginMart Monitor...")
    
    # Start the dummy web server so Render doesn't crash the deployment
    await start_web_server()
    
    await client.start()

    me = await client.get_me()
    log.info(f"Logged in as: {me.first_name} (@{me.username})")

    # Load watchlists
    try:
        watchlists = fetch_watchlists()
        log.info(f"Loaded {len(watchlists)} watchlist items")
    except Exception as e:
        log.error(f"Failed to load watchlists: {e}")
        watchlists = []

    # Reload watchlists every 5 minutes to pick up changes
    last_reload = asyncio.get_event_loop().time()

    @client.on(events.NewMessage(chats=MONITOR_CHANNELS))
    async def on_new_message(event):
        nonlocal watchlists, last_reload

        # Reload watchlists if stale
        now = asyncio.get_event_loop().time()
        if now - last_reload > 300:
            try:
                watchlists = fetch_watchlists()
                last_reload = now
                log.info(f"Reloaded watchlists: {len(watchlists)} items")
            except Exception as e:
                log.warning(f"Watchlist reload failed: {e}")

        text = event.message.text or event.message.message or ""
        if not text.strip():
            return  # Skip media-only messages

        channel = getattr(event.chat, "username", None) or "unknown"
        post_id = event.message.id
        post_url = f"https://t.me/{channel}/{post_id}" if channel != "unknown" else None

        text_lower = text.lower()
        log.info(f"[{channel}/{post_id}] New message: {text[:80].replace(chr(10), ' ')}")

        # Match against all watchlist items — build shopkeeper → keywords map
        shopkeeper_matches: dict[str, list[str]] = {}
        shopkeeper_ids: dict[str, str] = {}

        for item in watchlists:
            keywords = item.get("keywords") or []
            if isinstance(keywords, str):
                keywords = [keywords]

            matched_kws = [k for k in keywords if k and k.lower() in text_lower]
            if not matched_kws:
                continue

            shopkeeper_name = (item.get("shopkeepers") or {}).get("name") or f"ID:{item.get('shopkeeper_id')}"
            shopkeeper_id = item.get("shopkeeper_id")

            if shopkeeper_name not in shopkeeper_matches:
                shopkeeper_matches[shopkeeper_name] = []
                shopkeeper_ids[shopkeeper_name] = shopkeeper_id

            for kw in matched_kws:
                if kw not in shopkeeper_matches[shopkeeper_name]:
                    shopkeeper_matches[shopkeeper_name].append(kw)

        if not shopkeeper_matches:
            return  # No match, skip

        log.info(f"MATCH in [{channel}/{post_id}] for: {list(shopkeeper_matches.keys())}")

        # Save matches to DB
        for shopkeeper_name, kws in shopkeeper_matches.items():
            shopkeeper_id = shopkeeper_ids[shopkeeper_name]
            for kw in kws:
                save_match(shopkeeper_id, kw, kw, text, post_url)

        # Build alert message
        preview = text[:350] + "..." if len(text) > 350 else text
        shopkeeper_lines = "\n".join(
            f"  \u2022 <b>{name}</b>  \u2192  {', '.join(kws)}"
            for name, kws in shopkeeper_matches.items()
        )

        alert_text = "\n".join([
            "\U0001f6a8 <b>Deal Alert!</b>",
            "",
            f"\U0001f4e2 Channel: <code>{channel}</code>",
            f"\U0001f517 <a href='{post_url}'>View Original Post \u2192</a>" if post_url else "",
            "",
            f"\U0001f465 <b>Interested Shopkeepers:</b>",
            shopkeeper_lines,
            "",
            f"\U0001f4dd <b>Deal:</b>",
            preview,
        ])

        try:
            result = send_alert(alert_text)
            if result.get("ok"):
                log.info(f"Alert sent! Message ID: {result['result']['message_id']}")
        except Exception as e:
            log.error(f"Failed to send alert: {e}")

    log.info(f"Monitoring channels: {', '.join(MONITOR_CHANNELS)}")
    log.info("Waiting for new messages... (Press Ctrl+C to stop)")

    # Keep running until interrupted
    try:
        await client.run_until_disconnected()
    except KeyboardInterrupt:
        log.info("Shutting down monitor...")
    finally:
        await client.disconnect()


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    asyncio.run(run_monitor())
