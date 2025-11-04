const express = require('express');
const path = require('path');
const http = require('http');
const bodyParser = require('body-parser');
const { initGameServer } = require('./gameServer');
const { getOrCreatePlayer, getPlayerByTelegramId, updatePlayerBalance, initDb } = require('./db');

require('dotenv').config();

const PORT = process.env.PORT || 8080;
const WEB_APP_URL = process.env.WEB_APP_URL || '';

async function start() {
  await initDb();

  const app = express();
  app.use(bodyParser.json());

  // Serve miniapp static
  app.use('/miniapp', express.static(path.join(__dirname, '..', 'public', 'miniapp')));

  // Simple API to get or create player based on telegram_id and username
  app.get('/api/player', async (req, res) => {
    try {
      const telegram_id = req.query.telegram_id;
      const username = req.query.username || req.query.first_name || 'Player';
      if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
      const player = await getOrCreatePlayer(telegram_id, username);
      res.json(player);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Endpoint to top up balance (placeholder - requires wallet integration)
  app.post('/api/player/:telegram_id/topup', async (req, res) => {
    try {
      const telegram_id = req.params.telegram_id;
      const amount = Number(req.body.amount || 0);
      if (!telegram_id || amount <= 0) return res.status(400).json({ error: 'invalid' });
      const player = await getPlayerByTelegramId(telegram_id);
      if (!player) return res.status(404).json({ error: 'not_found' });
      const updated = await updatePlayerBalance(telegram_id, Number(player.balance || 0) + amount);
      res.json({ success: true, balance: Number(updated.balance) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // TON API endpoints: check balance and deposits
  const { getAddressBalance, findDepositsFrom } = require('./tonApi');

  app.get('/api/ton/balance', async (req, res) => {
    try {
      const address = req.query.address;
      if (!address) return res.status(400).json({ error: 'address required' });
      const balance = await getAddressBalance(address);
      res.json({ address, balance });
    } catch (e) {
      console.error('api ton balance error', e.message);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Config endpoint: return game address (safe to expose)
  app.get('/api/ton/config', async (req, res) => {
    try {
      res.json({ gameAddress: process.env.GAME_TON_ADDRESS || null });
    } catch (e) {
      res.status(500).json({ error: 'internal' });
    }
  });

  // Check deposits to the game address from a player's wallet since a timestamp
  app.post('/api/ton/check_deposit', async (req, res) => {
    try {
      const from = req.body.from;
      const since = Number(req.body.since || 0);
      if (!from) return res.status(400).json({ error: 'from required' });
      const found = await findDepositsFrom(from, since);
      res.json({ found });
    } catch (e) {
      console.error('api ton check_deposit error', e.message);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Place a bet (stake) to join a game: deduct stake from player's balance
  app.post('/api/player/:telegram_id/bet', async (req, res) => {
    try {
      const telegram_id = req.params.telegram_id;
      const stake = Number(req.body.stake || 0);
      if (!telegram_id || stake <= 0) return res.status(400).json({ error: 'invalid' });
      const player = await getPlayerByTelegramId(telegram_id);
      if (!player) return res.status(404).json({ error: 'not_found' });
      const currentBalance = Number(player.balance || 0);
      if (currentBalance < stake) return res.status(400).json({ error: 'insufficient_funds' });
      const updated = await updatePlayerBalance(telegram_id, currentBalance - stake);
      // Return new balance and accepted stake
      res.json({ success: true, balance: Number(updated.balance), stake });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  const server = http.createServer(app);

  // Init WebSocket game server
  initGameServer(server);

  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`MiniApp available at ${WEB_APP_URL || `http://localhost:${PORT}`}/miniapp/index.html`);
  });

  // Start Telegram bot
  require('./bot');
}

start().catch(err => {
  console.error('Failed to start server', err);
  process.exit(1);
});
