import { Context } from 'telegraf';
import { logger } from '../utils/logger.js';
import { updateUserCoins } from '../db/users.js';
import { query } from '../db/connection.js';

const STAR_PRICES = {
  '100_stars': { stars: 100, description: '100 игровых звёзд' },
  '500_stars': { stars: 500, description: '500 игровых звёзд (подешевле!)' },
  '1000_stars': { stars: 1000, description: '1000 игровых звёзд (ещё подешевле!)' },
  '2500_stars': { stars: 2500, description: '2500 игровых звёзд (супер выгодно!)' },
};

export async function handlePreCheckoutQuery(ctx: Context) {
  try {
    const preCheckoutQuery = ctx.preCheckoutQuery;
    if (!preCheckoutQuery) return;

    // Always answer true - we accept all payments
    await ctx.answerPreCheckoutQuery(true);
    logger.info(`Pre-checkout query accepted for user ${ctx.from?.id}`);
  } catch (error) {
    logger.error('Error in handlePreCheckoutQuery', error);
    await ctx.answerPreCheckoutQuery(false, 'Ошибка при обработке платежа');
  }
}

export async function handleSuccessfulPayment(ctx: Context) {
  try {
    const payment = ctx.message?.successful_payment;
    const user = ctx.from;

    if (!payment || !user) return;

    const payload = payment.invoice_payload;
    const stars = payment.total_amount;

    logger.info(`Successful payment from user ${user.id}: ${stars} stars, payload: ${payload}`);

    // Update user coins
    await updateUserCoins(user.id, stars);

    // Record transaction
    await query(
      `INSERT INTO transactions (user_id, type, amount, status, payment_id) 
       VALUES ((SELECT id FROM users WHERE tg_id = $1), 'deposit', $2, 'completed', $3)`,
      [user.id, stars, payment.telegram_payment_charge_id]
    );

    await ctx.reply(
      `✅ <b>Платёж успешен!</b>\n\n` +
      `Ваш баланс пополнен на <b>${stars} ⭐</b>\n\n` +
      `Теперь вы можете использовать звёзды в игре!`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error('Error in handleSuccessfulPayment', error);
    await ctx.reply('Ошибка при обработке платежа. Свяжитесь с поддержкой.');
  }
}

export async function sendPaymentInvoice(ctx: Context, packageId: keyof typeof STAR_PRICES) {
  try {
    const pkg = STAR_PRICES[packageId];
    if (!pkg) {
      await ctx.reply('Неверный пакет звёзд');
      return;
    }

    await ctx.replyWithInvoice({
      title: pkg.description,
      description: 'Пополнение баланса в игре Cherviton',
      payload: packageId,
      provider_token: '', // Empty for Telegram Stars
      currency: 'XTR', // Telegram Stars currency
      prices: [
        {
          label: pkg.description,
          amount: pkg.stars // Amount in stars
        }
      ]
    } as any);

    logger.info(`Invoice sent to user ${ctx.from?.id} for package ${packageId}`);
  } catch (error) {
    logger.error('Error sending payment invoice', error);
    await ctx.reply('Ошибка при открытии платежной системы. Попробуйте позже.');
  }
}
