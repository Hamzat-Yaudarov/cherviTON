# Deployment Guide for Cherviton

## ✅ Completed Components

### 1. Backend (Express + WebSocket + Telegram Bot)
- Express API server on port 8080
- WebSocket game server for real-time multiplayer
- Telegram bot with /start, /help, /stats commands
- Telegram Stars payment integration
- PostgreSQL database with Neon

### 2. Frontend (React + Vite)
- MiniApp with Telegram WebApp integration
- Game canvas with real-time rendering
- Balance display and top-up modal
- Bet selection screen
- Game controls with touch support

### 3. Game Logic
- Slither.io-style multiplayer gameplay
- Player management (up to 15 per server)
- Collision detection
- Pellet collection and growth system
- Auto-scaling game servers

### 4. Database Schema
- Users table with coins tracking
- Game servers table
- Game sessions table
- Transactions table for payment tracking

## 🚀 Deployment on Railway

### Step 1: Prepare for Deployment
1. Remove or fix the NODE_ENV setting in your environment
2. The frontend needs dev dependencies installed for building

```bash
# Locally, before pushing:
cd frontend
NODE_ENV=development npm install
npm run build
```

### Step 2: Update Environment Variables in Railway

```
TELEGRAM_BOT_TOKEN=8357920603:AAEcRZlAzCebZxQCIRLPQWRASZL-3upZOC8
DATABASE_URL=postgresql://neondb_owner:npg_PlnhbX7g1xYu@ep-shy-glitter-aghpyq5a-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
WEB_APP_URL=https://your-railway-domain.com
PORT=8080
NODE_ENV=production
```

### Step 3: Configure Railway Build

Set the build command to:
```
npm run build:backend
```

Set the start command to:
```
npm start
```

This will start the backend server on port 8080.

### Step 4: Serve Frontend from Backend

The frontend needs to be served from the backend. Update the backend's index.ts to serve static files:

```typescript
// Add to backend/src/index.ts after API routes
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});
```

## ⚙️ Important Configuration Notes

### NODE_ENV Issue
The current setup has NODE_ENV=production which prevents npm from installing devDependencies (required for building the frontend). For local development:

```bash
export NODE_ENV=development
npm install
npm run dev
```

### WebSocket Connection
The frontend connects to WebSocket at the same URL as the API. Make sure the WEB_APP_URL environment variable matches your Railway deployment URL.

### Telegram Bot Webhook (Alternative)
Instead of polling (current method), you can use webhook:

```typescript
bot.telegram.setWebhook(`${WEB_APP_URL}/bot`);
app.post('/bot', (req, res) => {
  bot.handleUpdate(req.body, res);
});
```

## 📊 API Endpoints

- `GET /api/balance?tg_id=<id>` - Get player balance
- `GET /api/user?tg_id=<id>` - Get player profile
- `POST /api/deduct-coins` - Deduct coins for game bet
- `POST /api/add-coins` - Add coins from game earnings
- `GET /api/servers` - List available game servers
- `GET /api/leaderboard?limit=100` - Get leaderboard

## 🎮 Game Features Implemented

### Game Mechanics
- ✅ Slither.io-style gameplay
- ✅ Multiplayer with WebSocket
- ✅ Up to 15 players per server
- ✅ Auto-scaling servers
- ✅ Collision detection
- ✅ Pellet collection
- ✅ Player growth
- ✅ Death and scoring

### Payment System
- ✅ Telegram Stars integration
- ✅ Balance top-up modal
- ✅ Bet selection (25, 50, 100, 200 ⭐)
- ✅ Coin earning from gameplay
- ✅ Transaction tracking

### MiniApp Features
- ✅ User profile display
- ✅ Balance display with top-up button
- ✅ Game canvas with real-time rendering
- ✅ Touch controls
- ✅ Game statistics
- ✅ Responsive design

## 🐛 Known Issues & TODOs

1. **Frontend Build**: NODE_ENV must be set to "development" when installing frontend dependencies
2. **Bot Polling**: Telegram bot uses polling in dev mode, causing restart conflicts. In production, use webhook instead.
3. **Game Rendering**: Canvas rendering is basic; could be optimized with WebGL or Babylon.js
4. **Collision Detection**: Uses simple circle-to-circle detection; could be improved with spatial hashing

## 🔒 Security Considerations

1. **Environment Variables**: Never commit `.env` files with secrets
2. **Database**: Use Neon's connection pooling
3. **WebSocket**: Consider adding authentication tokens to prevent unauthorized game access
4. **Rate Limiting**: Add rate limiting to API endpoints
5. **Input Validation**: Validate all incoming requests

## 📦 Production Checklist

- [ ] Configure DATABASE_URL in Railway
- [ ] Set TELEGRAM_BOT_TOKEN in Railway
- [ ] Set WEB_APP_URL to your Railway domain
- [ ] Build and test locally: `npm run build`
- [ ] Deploy to Railway
- [ ] Test Telegram /start command
- [ ] Test game connectivity
- [ ] Test Telegram Stars payment flow
- [ ] Monitor error logs in Railway

## 📚 File Structure

```
.
├── backend/
│   ├── src/
│   │   ├── index.ts - Main server
│   │   ├── bot/ - Telegram bot logic
│   │   ├── api/ - REST API routes
│   │   ├── game/ - Game server & logic
│   │   ├── db/ - Database operations
│   │   └── utils/ - Utilities
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx - Main component
│   │   ├── components/ - React components
│   │   ├── game/ - Game client
│   │   ├── api/ - API client
│   │   ├── utils/ - Utilities
│   │   └── styles/ - CSS
│   ├── index.html
│   └── package.json
├── package.json
└── README.md
```

## 🆘 Troubleshooting

### Bot not responding
- Check TELEGRAM_BOT_TOKEN is correct
- Check bot is not running elsewhere (polling conflict)
- Check database connection

### WebSocket connection fails
- Check WEB_APP_URL environment variable
- Ensure WebSocket port (8080) is open
- Check browser console for errors

### Database errors
- Verify DATABASE_URL is correct
- Check Neon database is online
- Check connection limits not exceeded

### Payment not working
- Verify TELEGRAM_BOT_TOKEN is valid
- Test with Telegram TestFlight app first
- Check pre_checkout_query handler is working
