# Railway Deployment Guide

This guide explains how to deploy the Telegram Worm Game bot and MiniApp to Railway.

## Prerequisites

1. A Railway account (https://railway.app)
2. A Neon PostgreSQL database (already created)
3. A Telegram Bot Token from BotFather
4. The deployment repository linked to your Railway project

## Environment Variables

Set the following environment variables in your Railway project settings:

| Variable | Description | Example |
|----------|-------------|---------|
| `NEON_DB_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db?sslmode=require` |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token | `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11` |
| `DB_NAME` | Database name | `neondb` |
| `PORT` | Server port (default: 8000) | `8000` |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |
| `WEB_APP_URL` | Your deployed MiniApp URL | `https://your-app.railway.app` |
| `REACT_APP_BACKEND_URL` | Frontend backend URL (default: current domain) | `/` or `https://your-app.railway.app` |

## Deployment Steps

1. **Connect your Git repository to Railway**
   - Go to Railway Dashboard
   - Click "New Project"
   - Select "Deploy from GitHub"
   - Choose your repository

2. **Configure Environment Variables**
   - In Railway project settings, add the variables above
   - Make sure to set `WEB_APP_URL` to your Railway app URL
   - Set `REACT_APP_BACKEND_URL` to `/` (relative URL) since frontend and backend are on the same domain

3. **Deploy**
   - Railway will automatically detect the `start.sh` script
   - It will build and deploy the app
   - Monitor the logs in the Railway dashboard

## Project Structure

```
├── backend/
│   ├── server.py           # FastAPI server for API & MiniApp serving
│   ├── telegram_bot.py     # Telegram bot using polling
│   ├── requirements.txt    # Python dependencies
│   └── .env.example        # Environment variables template
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json        # Node dependencies
│   └── .env.example        # Frontend environment template
└── start.sh               # Railway deployment script
```

## How It Works

1. The `start.sh` script:
   - Installs Python dependencies
   - Installs Node dependencies
   - Builds the React frontend to `frontend/build`
   - Starts the FastAPI server (serves API + frontend)
   - Starts the Telegram bot in polling mode

2. The FastAPI server (`backend/server.py`):
   - Runs on port `8000` (or `$PORT` environment variable)
   - Serves the React MiniApp build at `/`
   - Provides API endpoints at `/api/`
   - Handles WebSocket connections for real-time game updates
   - Manages game sessions and player data in Neon PostgreSQL

3. The Telegram bot (`backend/telegram_bot.py`):
   - Runs in parallel with the server
   - Uses polling (no webhook required)
   - Displays the MiniApp via `WEB_APP_URL` environment variable

## Troubleshooting

### Bot not responding
- Check that `TELEGRAM_BOT_TOKEN` is correct in Railway environment variables
- Verify that the bot is running (check Railway logs)
- Ensure `WEB_APP_URL` is set to your deployed app URL

### Frontend not loading
- Check that `REACT_APP_BACKEND_URL` is set correctly (default: `/`)
- Verify that the backend build completed successfully
- Check Railway logs for build errors

### Database connection error
- Verify `NEON_DB_URL` is correct
- Ensure Neon database is running and accessible
- Check that connection pooling is enabled in Neon

### WebSocket connection fails
- Ensure your Railway plan supports WebSockets
- Check that the WebSocket route is correctly served at `/ws/game/{room_id}/{user_id}`
- Verify CORS settings allow your frontend domain

## Production Checklist

- [ ] `.env` file is in `.gitignore` and not committed
- [ ] All sensitive variables are set in Railway, not in code
- [ ] `WEB_APP_URL` is set to your actual deployment URL
- [ ] Database migrations are applied (tables created automatically)
- [ ] Telegram bot token is valid and unique per deployment
- [ ] CORS origins are restricted appropriately (not `*` in production)
- [ ] Database backups are configured in Neon
- [ ] Error monitoring is set up (optional: Sentry, etc.)
