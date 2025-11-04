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

  // expose GAME_TON_ADDRESS via a small endpoint for client-side
  app.get('/api/config', (req, res) => {
    res.json({ GAME_TON_ADDRESS: process.env.GAME_TON_ADDRESS || null });
  });

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

  // Link Telegram player with wallet address (TonConnect)
  app.post('/api/player/:telegram_id/link_wallet', async (req, res) => {
    try {
      const telegram_id = req.params.telegram_id;
      const wallet_address = req.body.wallet_address;
      if (!telegram_id || !wallet_address) return res.status(400).json({ error: 'invalid' });
      const player = await getPlayerByTelegramId(telegram_id);
      if (!player) return res.status(404).json({ error: 'not_found' });
      const updated = await require('./db').linkPlayerWallet(telegram_id, wallet_address);
      res.json({ success: true, wallet_address: updated.wallet_address });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Report transaction: client sends txHash after sending TON to GAME_TON_ADDRESS
  app.post('/api/player/:telegram_id/report_tx', async (req, res) => {
    try {
      const telegram_id = req.params.telegram_id;
      const txHash = req.body.txHash;
      if (!telegram_id || !txHash) return res.status(400).json({ error: 'invalid' });
      const db = require('./db');
      const player = await getPlayerByTelegramId(telegram_id);
      if (!player) return res.status(404).json({ error: 'not_found' });

      // Check idempotency
      const exists = await db.processedTxExists(txHash);
      if (exists) return res.status(400).json({ error: 'tx_already_processed' });

      const TONAPI_KEY = process.env.TONAPI_KEY;
      const GAME_TON_ADDRESS = process.env.GAME_TON_ADDRESS;
      if (!TONAPI_KEY || !GAME_TON_ADDRESS) return res.status(500).json({ error: 'server_misconfigured' });

      // Fetch transaction from tonapi
      const url = `https://tonapi.io/v2/blockchain/transactions/${encodeURIComponent(txHash)}`;
      const apiRes = await fetch(url, { headers: { Authorization: `Bearer ${TONAPI_KEY}` } });
      if (!apiRes.ok) return res.status(400).json({ error: 'tx_not_found' });
      const data = await apiRes.json();

      // Parse transaction details
      const tx = data.transaction || data;
      const status = tx.status || (tx.transaction && tx.transaction.status) || null;

      // Locate in_msg
      const inMsg = (tx.in_msg) || (tx.transaction && tx.transaction.in_msg) || null;
      const fromAddr = inMsg && (inMsg.source && inMsg.source.address || inMsg.source) || null;
      const toAddr = inMsg && (inMsg.destination && inMsg.destination.address || inMsg.destination) || null;
      const value = inMsg && (inMsg.value || inMsg.value) || 0;

      // Basic validation
      if (String(status).toLowerCase() !== 'success') return res.status(400).json({ error: 'tx_not_success' });

      // Accept match if from and to match either friendly forms or substrings
      const matchesFrom = fromAddr && String(fromAddr).toLowerCase().includes(String(player.wallet_address || '').toLowerCase());
      const matchesTo = toAddr && String(toAddr).toLowerCase().includes(String(GAME_TON_ADDRESS).toLowerCase());

      if (!matchesFrom || !matchesTo) {
        return res.status(400).json({ error: 'tx_address_mismatch', details: { fromAddr, toAddr, expectedFrom: player.wallet_address, expectedTo: GAME_TON_ADDRESS } });
      }

      // Value: assume TON has 9 decimals (nano)
      const amountTon = Number(value) / 1e9;
      if (!amountTon || amountTon <= 0) return res.status(400).json({ error: 'tx_value_invalid' });

      // credit player balance
      const newBal = await updatePlayerBalance(telegram_id, Number(player.balance || 0) + amountTon);
      await db.saveProcessedTx(txHash, telegram_id, amountTon);

      res.json({ success: true, credited: amountTon, balance: Number(newBal.balance) });
    } catch (err) {
      console.error('report_tx error', err);
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
