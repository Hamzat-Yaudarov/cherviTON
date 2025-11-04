import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';
import { handleStart, handleHelp, handleStats } from './handlers.js';
import { handlePreCheckoutQuery, handleSuccessfulPayment, sendPaymentInvoice } from './payments.js';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not defined');
}

export const bot = new Telegraf(token);

// Commands
bot.command('start', handleStart);
bot.command('help', handleHelp);
bot.command('stats', handleStats);

// Inline buttons for payments
bot.action(/^buy_(\w+)$/, async (ctx) => {
  const packageId = ctx.match[1] as keyof typeof import('./payments.js').STAR_PRICES;
  await sendPaymentInvoice(ctx, packageId);
});

// Payment handlers
bot.on('pre_checkout_query', handlePreCheckoutQuery);
bot.on('successful_payment', handleSuccessfulPayment);

// Error handler
bot.catch((err, ctx) => {
  logger.error(`Telegraf error for ${ctx.updateType}`, err);
});

// Launch bot
export async function startBot() {
  try {
    logger.info('Starting Telegram bot...');
    await bot.launch();
    logger.info('Telegram bot started successfully');
  } catch (error) {
    logger.error('Error starting bot', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.once('SIGINT', () => {
  logger.info('Shutting down bot...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  logger.info('Shutting down bot...');
  bot.stop('SIGTERM');
});
