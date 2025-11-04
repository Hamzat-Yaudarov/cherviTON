import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { startBot } from './bot/index.js';
import { initializeDatabase } from './db/schema.js';
import { GameWebSocketHandler } from './game/websocket.js';
import apiRoutes from './api/routes.js';
import { logger } from './utils/logger.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// API routes
app.use('/api', apiRoutes);

// WebSocket setup
const wss = new WebSocketServer({ server: httpServer });
const gameHandler = new GameWebSocketHandler();

wss.on('connection', (ws, req) => {
  const url = req.url || '';
  gameHandler.handleConnection(ws, url);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  gameHandler.stop();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Start server
async function startServer() {
  try {
    logger.info('Initializing database...');
    await initializeDatabase();
    logger.info('Database initialized');

    const port = parseInt(process.env.PORT || '8080');
    
    httpServer.listen(port, '0.0.0.0', () => {
      logger.info(`Server listening on port ${port}`);
    });

    // Start Telegram bot
    await startBot();
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();
