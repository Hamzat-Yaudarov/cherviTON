#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# Install Python dependencies
echo "📦 Installing Python dependencies..."
python3 -m pip install --upgrade pip
python3 -m pip install -r backend/requirements.txt

# Install Node dependencies for frontend
echo "📦 Installing Node dependencies..."
cd frontend
yarn install --production=false

# Build frontend - set backend URL to relative path (same domain)
echo "🏗️ Building frontend..."
export REACT_APP_BACKEND_URL="${REACT_APP_BACKEND_URL:-/}"
yarn build

# Copy frontend build to backend/public for serving
echo "📋 Copying frontend build to backend..."
mkdir -p ../backend/public
cp -r build/* ../backend/public/

# Verify build exists
if [ -f ../backend/public/index.html ]; then
    echo "✅ Frontend build verified!"
else
    echo "❌ ERROR: Frontend build failed!"
    exit 1
fi

# Return to root
cd ..

# Set PORT from Railway environment variable
export PORT="${PORT:-8000}"
echo "📡 Using port: $PORT"

# Export WEB_APP_URL for the Telegram bot
export WEB_APP_URL="${WEB_APP_URL:-http://localhost:$PORT}"
echo "🌐 Web App URL: $WEB_APP_URL"

# Start the Telegram bot in the background
echo "🤖 Starting Telegram bot..."
cd backend
python3 telegram_bot.py > /tmp/telegram_bot.log 2>&1 &
BOT_PID=$!
echo "✅ Telegram bot started (PID: $BOT_PID)"

# Start the FastAPI server (this stays in foreground for Railway)
echo "🚀 Starting FastAPI server on port $PORT..."
exec python3 -m uvicorn server:app --host 0.0.0.0 --port $PORT
