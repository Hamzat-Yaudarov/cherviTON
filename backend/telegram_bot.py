import os
import logging
import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
WEB_APP_URL = os.getenv('WEB_APP_URL', 'https://tele-game-worms.preview.emergentagent.com')

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command"""
    user = update.effective_user
    
    # Create inline button with MiniApp
    keyboard = [
        [
            InlineKeyboardButton(
                text="🎮 Играть",
                web_app=WebAppInfo(url=WEB_APP_URL)
            )
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    welcome_message = (
        f"Привет, {user.first_name}! 👋\n\n"
        "🐛 Добро пожаловать в игру Worm Battle!\n\n"
        "Это многопользовательская игра, где червяки сражаются за TON!\n\n"
        "🎯 Правила:\n"
        "• Выбирайте ставку: 1, 3, 5 или 10 TON\n"
        "• Управляйте червяком и собирайте шарики\n"
        "• Избегайте столкновений с другими червяками\n"
        "• Собирайте шарики погибших червяков, чтобы расти\n"
        "• Чем больше шариков соберёте, тем больше выигрыш!\n\n"
        "💰 Пополняйте баланс через TON Connect\n\n"
        "Нажмите кнопку ниже, чтобы начать!"
    )
    
    await update.message.reply_text(
        welcome_message,
        reply_markup=reply_markup
    )

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command"""
    help_text = (
        "📖 Помощь по игре:\n\n"
        "🎮 /start - Открыть игру\n"
        "❓ /help - Показать эту справку\n\n"
        "Для игры используйте кнопку 'Играть' в меню!"
    )
    await update.message.reply_text(help_text)

def main():
    """Start the bot"""
    application = Application.builder().token(BOT_TOKEN).build()
    
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    
    logger.info("Bot started")
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main()
