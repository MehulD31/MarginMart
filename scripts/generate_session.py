import os
import sys
from telethon import TelegramClient
from telethon.sessions import StringSession

def main():
    print("====================================================")
    print("MarginMart Telegram Session String Generator")
    print("====================================================")
    print("This script will help you log in to Telegram and generate")
    print("a session string to run the bot on a cloud platform (Render).")
    print("----------------------------------------------------\n")
    
    try:
        api_id_input = input("Enter your Telegram API ID (from https://my.telegram.org): ").strip()
        if not api_id_input.isdigit():
            print("Error: API ID must be a number.")
            sys.exit(1)
        api_id = int(api_id_input)
        
        api_hash = input("Enter your Telegram API HASH: ").strip()
        if not api_hash:
            print("Error: API HASH cannot be empty.")
            sys.exit(1)
            
        print("\nStarting Telethon client...")
        # Create a client with a StringSession. Because it is empty, it will prompt for login.
        client = TelegramClient(StringSession(), api_id, api_hash)
        
        # client.start() automatically prompts for phone, code, and password in the terminal.
        client.start()
        
        session_str = client.session.save()
        
        print("\n====================================================")
        print("SUCCESS! You are logged in.")
        print("====================================================")
        print("Copy the session string below and set it as")
        print("TELEGRAM_SESSION_STRING in your Render environment variables:")
        print("\n" + session_str + "\n")
        print("====================================================")
        
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
    except Exception as e:
        print(f"\nAn error occurred: {e}")

if __name__ == "__main__":
    main()
