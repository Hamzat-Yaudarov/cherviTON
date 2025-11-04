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
    const params = new URLSearchParams(url);
    const tgIdStr = params.get('tg_id');
    const playerId = `player_${Date.now()}_${Math.random()}`;

    if (!tgIdStr) {
      ws.close(1008, 'tg_id is required');
      return;
    }

    const tgId = parseInt(tgIdStr);

    const session: PlayerSession = {
      playerId,
      tgId,
      ws,
      joinTime: Date.now()
    };

    this.sessions.set(playerId, session);
    logger.info(`New WebSocket connection: ${playerId} (tgId: ${tgId})`);

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
      if (!session) return;

      const message: GameMessage = JSON.parse(data.toString());

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
      }
    } catch (error) {
      logger.error('Error handling WebSocket message', error);
    }
  }

  private async handlePlayerJoin(session: PlayerSession, payload: any): Promise<void> {
    try {
      const { betAmount } = payload;

      const user = await getUser(session.tgId);
      if (!user) {
        session.ws.send(JSON.stringify({
          type: 'error',
          message: 'User not found'
        }));
        return;
      }

      if (user.coins < betAmount) {
        session.ws.send(JSON.stringify({
          type: 'error',
          message: 'Insufficient coins'
        }));
        return;
      }

      // Get server for this player
      const server = this.manager.getServerForNewPlayer();

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
        session.ws.send(JSON.stringify({
          type: 'error',
          message: 'Server is full'
        }));
        return;
      }

      // Deduct bet from coins
      const db = await import('../db/users.js');
      await db.updateUserCoins(session.tgId, -betAmount);

      session.server = server;
      session.player = player;

      // Send join confirmation
      session.ws.send(JSON.stringify({
        type: 'joined',
        serverId: server.id,
        player: player.getState(),
        mapSize: server.mapSize
      }));

      logger.info(`Player ${user.username} joined game server ${server.id} with bet ${betAmount}`);
    } catch (error) {
      logger.error('Error in handlePlayerJoin', error);
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
      // Check if player can leave (must be alive or 5 minutes passed)
      const aliveTime = Date.now() - session.player.joinTime;
      const minPlayTime = 5 * 60 * 1000; // 5 minutes

      if (session.player.alive && aliveTime < minPlayTime) {
        // Cannot leave while alive and within 5 minutes
        session.ws.send(JSON.stringify({
          type: 'error',
          message: `Cannot leave while alive. Play time: ${Math.round(aliveTime / 1000)}s / 300s`
        }));
        return;
      }

      session.server.removePlayer(playerId);
      this.manager.cleanupEmptyServers();
    }

    this.sessions.delete(playerId);
    logger.info(`Player ${playerId} disconnected`);
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
