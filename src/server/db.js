const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.NEON_CONNECTION;

if (!connectionString) {
  console.warn('NEON_CONNECTION not set; database features will fail.');
}

const pool = new Pool({ connectionString });

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        telegram_id TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        balance NUMERIC DEFAULT 0,
        wallet_address TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        room_id TEXT NOT NULL,
        started_at TIMESTAMP DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS processed_txs (
        id SERIAL PRIMARY KEY,
        tx_hash TEXT UNIQUE NOT NULL,
        telegram_id TEXT,
        amount NUMERIC,
        created_at TIMESTAMP DEFAULT now()
      );
    `);
  } finally {
    client.release();
  }
}

async function getOrCreatePlayer(telegram_id, username) {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT * FROM players WHERE telegram_id = $1', [telegram_id]);
    if (res.rows.length) return res.rows[0];
    const insert = await client.query(
      'INSERT INTO players (telegram_id, username, balance, wallet_address) VALUES ($1, $2, $3, $4) RETURNING *',
      [telegram_id, username, 0, null]
    );
    return insert.rows[0];
  } finally {
    client.release();
  }
}

async function getPlayerByTelegramId(telegram_id) {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT * FROM players WHERE telegram_id = $1', [telegram_id]);
    return res.rows[0] || null;
  } finally {
    client.release();
  }
}

async function updatePlayerBalance(telegram_id, balance) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      'UPDATE players SET balance = $1 WHERE telegram_id = $2 RETURNING *',
      [balance, telegram_id]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
}

async function linkPlayerWallet(telegram_id, wallet_address) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      'UPDATE players SET wallet_address = $1 WHERE telegram_id = $2 RETURNING *',
      [wallet_address, telegram_id]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
}

async function processedTxExists(txHash) {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT id FROM processed_txs WHERE tx_hash = $1', [txHash]);
    return res.rows.length > 0;
  } finally {
    client.release();
  }
}

async function saveProcessedTx(txHash, telegram_id, amount) {
  const client = await pool.connect();
  try {
    const res = await client.query('INSERT INTO processed_txs (tx_hash, telegram_id, amount) VALUES ($1, $2, $3) RETURNING *', [txHash, telegram_id, amount]);
    return res.rows[0];
  } finally {
    client.release();
  }
}

module.exports = { pool, initDb, getOrCreatePlayer, getPlayerByTelegramId, updatePlayerBalance, linkPlayerWallet, processedTxExists, saveProcessedTx };
