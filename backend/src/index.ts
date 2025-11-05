import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { startBot } from './bot/index.js';
import { initializeDatabase } from './db/schema.js';
import { GameWebSocketHandler } from './game/websocket.js';
import apiRoutes from './api/routes.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Serve static files from frontend dist
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Don't interfere with WebSocket connections
  if (req.path.startsWith('/api') || req.headers.upgrade === 'websocket') {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

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
    try {
      await initializeDatabase();
      logger.info('Database initialized');
    } catch (dbError) {
      logger.warn('Database initialization failed, continuing without DB', dbError);
      // Don't exit - API can still work even if DB is temporarily unavailable
    }

    const port = parseInt(process.env.PORT || '8080');

    httpServer.listen(port, '0.0.0.0', () => {
      logger.info(`Server listening on port ${port}`);
    });

    // Start Telegram bot
    try {
      await startBot();
    } catch (botError) {
      logger.warn('Telegram bot initialization failed', botError);
      // Continue - bot can fail but server should keep running
    }
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();
