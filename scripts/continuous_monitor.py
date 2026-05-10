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
from telethon.sessions import StringSession
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
        "Authorization": f"Bearer {SUPABASE_KEY}"
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        log.warning(f"Failed to fetch watchlists: {e}")
        return []

def fetch_monitor_channels():
    """Fetch dynamic monitor channels from Supabase telegram_configs."""
    url = f"{SUPABASE_URL}/rest/v1/telegram_configs?select=value&key=eq.monitor_channels"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    })
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            if data and data[0].get("value"):
                channels = data[0]["value"].split(",")
                return [c.strip() for c in channels if c.strip()]
    except Exception as e:
        log.warning(f"Failed to fetch monitor channels: {e}")
    return []

def save_match(shopkeeper_id: str, product_name: str, keyword: str, text: str, link: str):
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
    if SESSION_STRING:
        session = StringSession(SESSION_STRING)
    else:
        session = "marginmart_monitor"
        
    client = TelegramClient(session, API_ID, API_HASH)

    log.info("Starting MarginMart Monitor...")
    
    # Start the dummy web server so Render doesn't crash the deployment
    await start_web_server()
    
    await client.start() # type: ignore

    me = await client.get_me()
    log.info(f"Logged in as: {me.first_name} (@{me.username})")

    # Load watchlists
    watchlists = fetch_watchlists()
    log.info(f"Loaded {len(watchlists)} watchlist items")
    
    active_channels = fetch_monitor_channels() or MONITOR_CHANNELS
    log.info(f"Loaded {len(active_channels)} active spy channels: {active_channels}")

    async def on_new_message(event):
        nonlocal watchlists

        raw_text = event.message.message or ""
        if not raw_text.strip():
            return  # Skip media-only messages

        channel_title = getattr(event.chat, "title", None) or getattr(event.chat, "username", None) or "Private/Unknown"
        channel_username = getattr(event.chat, "username", None)
        post_id = event.message.id
        # Post URL for DB (analytics) vs UI (clickable link)
        db_post_url = f"https://t.me/{channel_username}/{post_id}" if channel_username else f"private||{channel_title}"
        
        # UI Link: Use t.me/c/ for private channels if we can derive the ID
        ui_post_url = f"https://t.me/{channel_username}/{post_id}" if channel_username else None
        if not ui_post_url and str(event.chat_id).startswith("-100"):
            clean_id = str(event.chat_id)[4:]
            ui_post_url = f"https://t.me/c/{clean_id}/{post_id}"

        text_lower = raw_text.lower()
        log.info(f"[{channel_title}/{post_id}] New message: {raw_text[:80].replace(chr(10), ' ')}")

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

        log.info(f"MATCH in [{channel_title}/{post_id}] for: {list(shopkeeper_matches.keys())}")

        # Save matches to DB (keep db_post_url for analytics parsing)
        for shopkeeper_name, kws in shopkeeper_matches.items():
            shopkeeper_id = shopkeeper_ids[shopkeeper_name]
            for kw in kws:
                save_match(shopkeeper_id, kw, kw, raw_text, db_post_url)

        # Build alert message
        shopkeeper_lines = "\n".join(
            f"  \u2022 <b>{name}</b>  \u2192  {', '.join(kws)}"
            for name, kws in shopkeeper_matches.items()
        )

        # Base alert parts
        alert_parts = [
            "🚨 <b>DEAL MATCH FOUND!</b>",
            "",
            f"📣 <b>Source:</b> {channel_title}",
        ]
        
        if ui_post_url:
            alert_parts.append(f"🔗 <a href='{ui_post_url}'>View Original Post →</a>")
        else:
            alert_parts.append("🔗 <i>(Private Group)</i>")

        alert_parts.extend([
            "",
            f"👥 <b>Matched Partners:</b>",
            shopkeeper_lines,
            "",
            "━━━━━━━━━━━━━━━━━━",
            "<i>MarginMart Spy Engine Active \u2705</i>"
        ])

        alert_text = "\n".join(alert_parts)

        try:
            result = send_alert(alert_text)
            if result.get("ok"):
                log.info(f"Alert sent! Message ID: {result['result']['message_id']}")
        except Exception as e:
            log.error(f"Error handling message: {e}")

    # Register initial handler
    msg_handler = events.NewMessage(chats=active_channels)
    client.add_event_handler(on_new_message, msg_handler)

    # Background task to refresh config dynamically
    async def config_updater():
        nonlocal active_channels, watchlists, msg_handler
        while True:
            await asyncio.sleep(30)
            try:
                watchlists = fetch_watchlists()
                new_channels = fetch_monitor_channels()
                if new_channels and set(new_channels) != set(active_channels):
                    log.info(f"Spy Channels updated to {new_channels}. Re-registering listener.")
                    client.remove_event_handler(on_new_message, msg_handler)
                    active_channels = new_channels
                    msg_handler = events.NewMessage(chats=active_channels)
                    client.add_event_handler(on_new_message, msg_handler)
            except Exception as e:
                log.warning(f"Config update failed: {e}")

    # Run updater in the background
    client.loop.create_task(config_updater())

    log.info("Listening for new messages...")
    try:
        await client.run_until_disconnected() # type: ignore
    except KeyboardInterrupt:
        log.info("Shutting down monitor...")
    finally:
        await client.disconnect()

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    asyncio.run(run_monitor())
