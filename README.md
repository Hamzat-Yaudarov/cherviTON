# Cherviton - Telegram Game

Многопользовательская игра похожая на Slither.io, встроенная в Telegram Mini App с поддержкой платежей через Telegram Stars.

## Структура проекта

```
.
├── backend/
│   ├── src/
│   │   ├── index.ts - Точка входа (Express + WebSocket сервер)
│   │   ├── bot/ - Telegram бот
│   │   ├── api/ - REST API
│   │   ├── game/ - Игровая логика
│   │   ├── db/ - Работа с БД
│   │   └── utils/ - Утилиты
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── main.tsx - Точка входа React
│   │   ├── App.tsx - Главный компонент
│   │   ├── components/ - React компоненты
│   │   ├── game/ - Игровой клиент
│   │   ├── api/ - API клиент
���   │   ├── utils/ - Утилиты
│   │   └── styles/ - CSS
│   ├── index.html
│   ├── vite.config.ts
│   └── tsconfig.json
├── package.json
├── .env.example
└── README.md
```

## Требования

- Node.js 16+
- PostgreSQL (Neon)
- Telegram Bot Token
- Telegram Bot API для Stars платежей

## Установка

1. Клонируйте репозиторий
2. Скопируйте файлы окружения:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

3. Заполните `.env` файлы с вашими данными:
   - TELEGRAM_BOT_TOKEN
   - DATABASE_URL (Neon PostgreSQL)
   - WEB_APP_URL (URL вашего приложения)

4. Установите зависимости:
   ```bash
   npm install
   npm run build:backend
   npm run build:frontend
   ```

## Запуск локально

```bash
npm run dev
```

Это запустит:
- Backend на http://localhost:8080
- Frontend на http://localhost:5173

## Развёртывание

Проект готов к развёртыванию на Railway:

1. Свяжите репозиторий с Railway
2. Установите переменные окружения в Railway
3. Использ��йте команду для запуска: `npm start`

## Функциональность

### Telegram Bot
- Команда `/start` - приветственное сообщение с кнопкой запуска игры
- Команда `/help` - справка по игре
- Команда `/stats` - статистика игрока
- Поддержка платежей через Telegram Stars

### MiniApp
- Отображение никнейма игрока в верхнем левом углу
- Отображение баланса ⭐ в верхнем правом углу
- Модальное окно пополнения баланса
- Выбор ставки перед началом игры (25, 50, 100, 200 ⭐)

### Игра
- Многопользовательский Slither.io-подобный геймплей
- До 15 игроков на одном сервере
- Автоматическое создание новых серверов при переполнении
- Собираемые шарики для роста и заработка ⭐
- Смерть при столкновении с границей, телом или более крупным игроком
- Система очков и рейтинга

### Платежи
- Интеграция с Telegram Stars API
- Попо��нение баланса в игре через реальные звёзды
- Отслеживание транзакций в БД
- Конвертация: 1 звезда = 1 ⭐ в игре

## API Endpoints

- `GET /api/balance?tg_id=<id>` - Получить баланс
- `GET /api/user?tg_id=<id>` - Получить профиль
- `POST /api/deduct-coins` - Вычесть монеты
- `POST /api/add-coins` - Добавить монеты
- `GET /api/servers` - Получить список серверов
- `GET /api/leaderboard?limit=100` - Получить рейтинг

## WebSocket Events

- `join` - Присоединиться к игре
- `move` - Отправить направление движения
- `leave` - Покинуть игру
- `state` - Получить состояние игры
- `ping` - Проверка соединения

## Лицензия

Proprietary
