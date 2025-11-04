const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const { getOrCreatePlayer } = require('./db');

const token = process.env.TELEGRAM_BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || '';

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set in environment');
}

// Use polling for simplicity
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, async msg => {
  const chatId = msg.chat.id;
  const telegram_id = msg.from.id.toString();
  const username = (msg.from.username || `${msg.from.first_name || ''} ${msg.from.last_name || ''}`).trim() || 'Player';

  try {
    await getOrCreatePlayer(telegram_id, username);
  } catch (err) {
    console.error('Error ensuring player in DB', err);
  }

  const url = `${WEB_APP_URL.replace(/\/$/, '')}/miniapp/index.html?telegram_id=${encodeURIComponent(telegram_id)}&username=${encodeURIComponent(username)}`;

  const text = `Привет, ${username}! Добро пожаловать. Нажми кнопку, чтобы открыть мини-приложение и начать игру. Валюта внутри �� Telegram-stars.`;
  const opts = {
    reply_markup: {
      inline_keyboard: [[{ text: 'Начать игру', url }]]
    }
  };

  bot.sendMessage(chatId, text, opts).catch(err => console.error('Failed to send /start reply', err));
});

module.exports = bot;
