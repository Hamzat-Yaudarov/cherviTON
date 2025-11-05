import WebSocket from 'ws';
import { GameServerManager } from './server.js';
import { Player } from './player.js';
import { getUser } from '../db/users.js';
import { logger } from '../utils/logger.js';

interface GameMessage {
  type: 'join' | 'move' | 'leave' | 'ping';
  payload?: any;
}

interface PlayerSession {
  playerId: string;
  tgId: number;
  ws: WebSocket;
  server?: any;
  player?: Player;
  joinTime: number;
}

export class GameWebSocketHandler {
  manager: GameServerManager;
  sessions: Map<string, PlayerSession> = new Map();
  updateInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.manager = new GameServerManager();
    this.startBroadcast();
  }

  handleConnection(ws: WebSocket, url: string): void {
    // Parse query parameters from WebSocket URL
    // URL format: /?tg_id=123456789
    const queryIndex = url.indexOf('?');
    let tgIdStr: string | null = null;

    if (queryIndex !== -1) {
      const queryString = url.substring(queryIndex + 1);
      const params = new URLSearchParams(queryString);
      tgIdStr = params.get('tg_id');
    }

    const playerId = `player_${Date.now()}_${Math.random()}`;

    logger.info(`WebSocket connection attempt, URL: ${url}, tg_id: ${tgIdStr}`);

    if (!tgIdStr) {
      logger.warn(`WebSocket connection rejected: tg_id is required`);
      ws.close(1008, 'tg_id is required');
      return;
    }

    const tgId = parseInt(tgIdStr);
    if (isNaN(tgId)) {
      logger.warn(`WebSocket connection rejected: invalid tg_id: ${tgIdStr}`);
      ws.close(1008, 'invalid tg_id');
      return;
    }

    const session: PlayerSession = {
      playerId,
      tgId,
      ws,
      joinTime: Date.now()
    };

    this.sessions.set(playerId, session);
    logger.info(`New WebSocket connection established: ${playerId} (tgId: ${tgId})`);

    ws.on('message', (data) => this.handleMessage(playerId, data));
    ws.on('close', () => this.handleClose(playerId));
    ws.on('error', (error) => this.handleError(playerId, error));

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      playerId,
      message: 'Connected to game server'
    }));
  }

  private async handleMessage(playerId: string, data: WebSocket.Data): Promise<void> {
    try {
      const session = this.sessions.get(playerId);
      if (!session) {
        logger.warn(`Received message for unknown session: ${playerId}`);
        return;
      }

      const message: GameMessage = JSON.parse(data.toString());
      logger.info(`Received message from ${playerId}: ${message.type}`);

      switch (message.type) {
        case 'join':
          await this.handlePlayerJoin(session, message.payload);
          break;
        case 'move':
          this.handlePlayerMove(session, message.payload);
          break;
        case 'leave':
          this.handlePlayerLeave(playerId);
          break;
        case 'ping':
          session.ws.send(JSON.stringify({ type: 'pong' }));
          break;
        default:
          logger.warn(`Unknown message type from ${playerId}: ${message.type}`);
      }
    } catch (error) {
      logger.error(`Error handling WebSocket message from ${playerId}`, error);
    }
  }

  private async handlePlayerJoin(session: PlayerSession, payload: any): Promise<void> {
    try {
      const { betAmount } = payload;
      logger.info(`Player ${session.playerId} (tgId: ${session.tgId}) attempting to join with bet: ${betAmount}`);

      const user = await getUser(session.tgId);
      if (!user) {
        logger.warn(`Join failed: User not found for tgId: ${session.tgId}`);
        session.ws.send(JSON.stringify({
          type: 'error',
          message: 'User not found'
        }));
        return;
      }

      if (user.coins < betAmount) {
        logger.warn(`Join failed: Insufficient coins for ${user.username}: has ${user.coins}, needs ${betAmount}`);
        session.ws.send(JSON.stringify({
          type: 'error',
          message: 'Insufficient coins'
        }));
        return;
      }

      // Get server for this player
      const server = this.manager.getServerForNewPlayer();
      logger.info(`Assigned server ${server.id} to player ${session.playerId}`);

      // Create player
      const x = Math.random() * server.mapSize;
      const y = Math.random() * server.mapSize;
      const player = new Player(
        session.playerId,
        session.tgId,
        user.username || `Player_${session.tgId}`,
        x,
        y,
        betAmount
      );

      // Add player to server
      if (!server.addPlayer(player)) {
        logger.warn(`Join failed: Server ${server.id} is full`);
        session.ws.send(JSON.stringify({
          type: 'error',
          message: 'Server is full'
        }));
        return;
      }

      // Deduct bet from coins
      const db = await import('../db/users.js');
      await db.updateUserCoins(session.tgId, -betAmount);
      logger.info(`Deducted ${betAmount} coins from ${user.username}`);

      session.server = server;
      session.player = player;

      // Send join confirmation
      const joinedMessage = {
        type: 'joined',
        serverId: server.id,
        player: player.getState(),
        mapSize: server.mapSize
      };
      logger.info(`Sending joined message to player ${session.playerId}`);
      session.ws.send(JSON.stringify(joinedMessage));

      logger.info(`Player ${user.username} successfully joined game server ${server.id} with bet ${betAmount}`);
    } catch (error) {
      logger.error(`Error in handlePlayerJoin for player ${session.playerId}`, error);
      session.ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to join game'
      }));
    }
  }

  private handlePlayerMove(session: PlayerSession, payload: any): void {
    if (!session.player || !session.player.alive) return;

    const { direction } = payload;
    if (typeof direction === 'number') {
      session.player.setDirection(direction);
    }
  }

  private handlePlayerLeave(playerId: string): void {
    const session = this.sessions.get(playerId);
    if (!session) return;

    if (session.server && session.player) {
      // Handle player death if still alive
      if (session.player.alive) {
        session.player.kill();
        const earnings = Math.floor((session.player.score ?? 0) * 0.1);

        // Update database with final stats
        const db = require('../db/users.js');
        db.updateUserCoins(session.tgId, earnings).catch((error: any) => {
          logger.error('Error updating coins on disconnect', error);
        });

        db.updateGameStats(session.tgId, earnings, session.player.score).catch((error: any) => {
          logger.error('Error updating game stats on disconnect', error);
        });

        logger.info(`Player ${session.player.username} disconnected while alive, score: ${session.player.score}`);
      }

      session.server.removePlayer(playerId);
      this.manager.cleanupEmptyServers();
    }

    this.sessions.delete(playerId);
    logger.info(`Player session ${playerId} removed`);
  }

  private handleClose(playerId: string): void {
    this.handlePlayerLeave(playerId);
  }

  private handleError(playerId: string, error: Error): void {
    logger.error(`WebSocket error for ${playerId}`, error);
  }

  private startBroadcast(): void {
    // Broadcast game state to all players
    this.updateInterval = setInterval(() => {
      const states: { [key: string]: any } = {};

      for (const [serverId, server] of this.manager.servers.entries()) {
        states[serverId] = server.getState();
      }

      // Send state to each connected player
      this.sessions.forEach((session) => {
        if (session.server && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify({
            type: 'state',
            gameState: session.server.getState()
          }));
        }
      });
    }, 100); // ~10 updates per second
  }

  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.sessions.forEach((session) => {
      session.ws.close();
    });

    this.manager.servers.forEach((server) => {
      server.destroy();
    });
  }
}
