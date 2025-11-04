release: bash start.sh
web: cd backend && python3 -m uvicorn server:app --host 0.0.0.0 --port $PORT
worker: cd backend && python3 telegram_bot.py
