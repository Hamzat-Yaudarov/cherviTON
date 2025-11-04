#!/bin/bash
cd /app/backend
export WEB_APP_URL="https://telegram-app-debug.preview.emergentagent.com"
python telegram_bot.py
