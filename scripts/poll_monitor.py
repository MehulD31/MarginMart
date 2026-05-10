"""
GitHub Actions monitor - polls @deals every run using Telethon session string.
Tracks last_post_id in Supabase, sends alerts for keyword matches.
"""
import asyncio, os, sys, json
import urllib.request, urllib.error

sys.stdout.reconfigure(encoding='utf-8')

from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID       = int(os.environ["TELEGRAM_API_ID"])
API_HASH     = os.environ["TELEGRAM_API_HASH"]
SESSION_STR  = os.environ["TELEGRAM_SESSION_STRING"]
BOT_TOKEN    = os.environ["BOT_TOKEN"]
ALERT_CHAT   = os.environ["ALERT_CHAT_ID"]
SUPA_URL     = os.environ["SUPABASE_URL"]
SUPA_KEY     = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
CHANNELS     = [c.strip().lstrip("@") for c in os.environ.get("MONITOR_CHANNELS", "deals").split(",")]
LIMIT        = int(os.environ.get("FETCH_LIMIT", "30"))  # messages to fetch per run

def supa_get(path):
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/{path}",
        headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}"}
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def supa_patch(table, data, where_field, where_val):
    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/{table}?{where_field}=eq.{where_val}",
        data=payload,
        headers={
            "apikey": SUPA_KEY,
            "Authorization": f"Bearer {SUPA_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="PATCH"
    )
    urllib.request.urlopen(req, timeout=10)

def send_alert(text):
    payload = json.dumps({
        "chat_id": ALERT_CHAT, "text": text,
        "parse_mode": "HTML", "disable_web_page_preview": True
    }).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

async def run():
    print(f"Connecting to Telegram...")
    client = TelegramClient(StringSession(SESSION_STR), API_ID, API_HASH)
    await client.connect()
    me = await client.get_me()
    print(f"Logged in as: {me.first_name} (@{me.username})")

    # Load data from Supabase
    watchlists = supa_get("watchlists?select=product_name,keywords,shopkeeper_id,shopkeepers(name)")
    trackers = supa_get("spy_trackers?select=*")
    print(f"Loaded {len(watchlists)} watchlist items, {len(trackers)} trackers")

    tracker_map = {t["channel_slug"]: t for t in trackers}

    for channel_slug in CHANNELS:
        tracker = tracker_map.get(channel_slug)
        if not tracker:
            print(f"[{channel_slug}] No tracker found, skipping.")
            continue

        last_post_id = tracker.get("last_post_id") or 0
        print(f"\n[{channel_slug}] Last post ID: {last_post_id}")

        try:
            entity = await client.get_entity(channel_slug)
            messages = await client.get_messages(entity, limit=LIMIT)
        except Exception as e:
            print(f"[{channel_slug}] Failed to get messages: {e}")
            continue

        # Filter to only new messages, sort oldest-first
        new_msgs = sorted(
            [m for m in messages if m.id > last_post_id and m.text],
            key=lambda m: m.id
        )
        print(f"[{channel_slug}] Found {len(new_msgs)} new messages (out of {len(messages)} fetched)")

        max_id = last_post_id
        for msg in new_msgs:
            text = msg.text or ""
            text_lower = text.lower()
            post_url = f"https://t.me/{channel_slug}/{msg.id}"

            # Match keywords
            shopkeeper_matches: dict[str, list[str]] = {}
            for item in watchlists:
                kws = item.get("keywords") or []
                if isinstance(kws, str): kws = [kws]
                matched = [k for k in kws if k and k.lower() in text_lower]
                if not matched: continue
                name = (item.get("shopkeepers") or {}).get("name") or f"ID:{item['shopkeeper_id']}"
                if name not in shopkeeper_matches: shopkeeper_matches[name] = []
                for k in matched:
                    if k not in shopkeeper_matches[name]: shopkeeper_matches[name].append(k)

            if shopkeeper_matches:
                print(f"  [Post {msg.id}] MATCH: {list(shopkeeper_matches.keys())}")
                preview = text[:350] + "..." if len(text) > 350 else text
                lines = "\n".join(
                    f"  \u2022 <b>{n}</b>  \u2192  {', '.join(kws)}"
                    for n, kws in shopkeeper_matches.items()
                )
                alert = "\n".join([
                    "\U0001f6a8 <b>Deal Alert!</b>",
                    f"\U0001f4e2 Channel: <code>{channel_slug}</code>",
                    f"\U0001f517 <a href='{post_url}'>View Post \u2192</a>",
                    "",
                    "\U0001f465 <b>Interested Shopkeepers:</b>",
                    lines,
                    "",
                    "\U0001f4dd <b>Deal:</b>",
                    preview,
                ])
                try:
                    result = send_alert(alert)
                    if result.get("ok"):
                        print(f"    Alert sent (msg_id={result['result']['message_id']})")
                except Exception as e:
                    print(f"    Alert failed: {e}")
            else:
                print(f"  [Post {msg.id}] No match")

            max_id = max(max_id, msg.id)

        # Update tracker
        if max_id > last_post_id:
            supa_patch("spy_trackers", {"last_post_id": max_id}, "id", tracker["id"])
            print(f"[{channel_slug}] Tracker updated: {last_post_id} → {max_id}")
        else:
            print(f"[{channel_slug}] No new posts, tracker unchanged.")

    await client.disconnect()
    print("\nDone.")

asyncio.run(run())
