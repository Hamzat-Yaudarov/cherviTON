#!/bin/bash
cd /app/backend
export WEB_APP_URL="https://tele-game-worms.preview.emergentagent.com"
python telegram_bot.py
