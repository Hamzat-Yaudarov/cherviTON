import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import path from 'path';
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

// Serve static files from frontend dist
// In production, frontend/dist is built and available at this path
const frontendDistPath = path.resolve(process.cwd(), 'frontend/dist');
logger.info(`Serving frontend from: ${frontendDistPath}`);

app.use(express.static(frontendDistPath));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res, next) => {
  // Don't interfere with WebSocket connections or API
  if (req.path.startsWith('/api')) {
    return next();
  }

  // Try to serve index.html for SPA routing
  const indexPath = path.join(frontendDistPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      logger.warn(`Could not serve index.html: ${err.message}`);
      res.status(404).json({ error: 'Frontend not found' });
    }
  });
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
