#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip install -r backend/requirements.txt

# Install Node dependencies for frontend
echo "📦 Installing Node dependencies..."
cd frontend
yarn install --production=false

# Build frontend - set backend URL to current domain
echo "🏗️ Building frontend..."
export REACT_APP_BACKEND_URL="${REACT_APP_BACKEND_URL:-.}"
yarn build

# Return to root
cd ..

# Export WEB_APP_URL for the Telegram bot
export WEB_APP_URL="${WEB_APP_URL:-http://localhost:${PORT:-8000}}"

# Start the FastAPI server
echo "✅ Starting FastAPI server..."
cd backend
python -m uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000} &
SERVER_PID=$!

# Start the Telegram bot
echo "✅ Starting Telegram bot..."
python telegram_bot.py &
BOT_PID=$!

# Wait for both processes
wait $SERVER_PID $BOT_PID
