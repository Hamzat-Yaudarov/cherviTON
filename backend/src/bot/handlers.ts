import { Context } from 'telegraf';
import { getOrCreateUser } from '../db/users.js';
import { logger } from '../utils/logger.js';

export async function handleStart(ctx: Context) {
  try {
    const user = ctx.from;
    if (!user) return;

    // Create or get user
    await getOrCreateUser(user.id, {
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
    });

    const webAppUrl = process.env.WEB_APP_URL || 'https://cherviton-production.up.railway.app';

    await ctx.reply(
      '🐛 Добро пожаловать в Cherviton!\n\n' +
      'Это захватывающая многопользовательская игра, где ты управляешь червяком 🪱\n\n' +
      '⭐ Заработай звёзды и выживай дольше других!\n',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎮 Начать игру',
                web_app: { url: webAppUrl }
              }
            ]
          ]
        }
      }
    );

    logger.info(`User started bot: ${user.id}`);
  } catch (error) {
    logger.error('Error in handleStart', error);
    await ctx.reply('Ошибка при запуске. Попробуйте позже.');
  }
}

export async function handleHelp(ctx: Context) {
  await ctx.reply(
    '📖 Справка по игре:\n\n' +
    '🎮 <b>Как играть:</b>\n' +
    '1. Нажмите кнопку "Начать игру"\n' +
    '2. Выберите размер ставки (25, 50, 100 или 200 ⭐)\n' +
    '3. Управляйте червяком стрелками или свайпом\n' +
    '4. Ешьте шарики других игроков чтобы расти\n' +
    '5. Избегайте столкновений с границами и другими червяками\n\n' +
    '⭐ <b>Как получить звёзды:</b>\n' +
    'Собирайте шарики в игре или пополняйте баланс через Telegram Stars\n\n' +
    '💀 <b>Как умереть:</b>\n' +
    '• Столкновение с границей карты\n' +
    '• Столкновение с телом другого червяка\n' +
    '• Столкновение лицом с более крупным червяком\n',
    { parse_mode: 'HTML' }
  );
}

export async function handleStats(ctx: Context) {
  try {
    const user = ctx.from;
    if (!user) return;

    const { getUser } = await import('../db/users.js');
    const userData = await getUser(user.id);

    if (!userData) {
      await ctx.reply('Пользователь не найден');
      return;
    }

    await ctx.reply(
      '📊 <b>Ваша статистика:</b>\n\n' +
      `⭐ Баланс: ${userData.coins}\n` +
      `🎮 Игр сыграно: ${userData.games_played}\n` +
      `💰 Всего заработано: ${userData.total_earned}\n` +
      `🏆 Лучший результат: ${userData.highest_score}\n`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error('Error in handleStats', error);
    await ctx.reply('Ошибка при получении статистики');
  }
}
