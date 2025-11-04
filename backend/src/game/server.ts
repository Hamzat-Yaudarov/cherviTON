import { Player, PlayerState } from './player.js';
import { Pellet, PelletState } from './pellet.js';
import { logger } from '../utils/logger.js';
import { query } from '../db/connection.js';
import { updateUserCoins, updateGameStats } from '../db/users.js';

export interface GameState {
  players: PlayerState[];
  pellets: PelletState[];
  timestamp: number;
}

export class GameServer {
  id: string;
  players: Map<string, Player> = new Map();
  pellets: Map<string, Pellet> = new Map();
  
  maxPlayers: number = 15;
  mapSize: number = 1000;
  
  tickRate: number = 60; // updates per second
  tickInterval: NodeJS.Timeout | null = null;
  lastTickTime: number = Date.now();
  
  createdAt: number = Date.now();
  autoRemoveTimeout: number = 5 * 60 * 1000; // 5 minutes

  constructor(id: string) {
    this.id = id;
    this.startGameLoop();
  }

  addPlayer(player: Player): boolean {
    if (this.players.size >= this.maxPlayers) {
      return false;
    }
    this.players.set(player.id, player);
    logger.info(`Player ${player.username} joined server ${this.id}`);
    return true;
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) {
      this.players.delete(playerId);
      logger.info(`Player ${player.username} left server ${this.id}`);
      
      // Drop pellets from dead player's body
      if (!player.alive) {
        this.createPelletsFromPlayer(player);
      }
    }
  }

  createPelletsFromPlayer(player: Player): void {
    // Drop pellets at every 5th body segment
    for (let i = 0; i < player.body.length; i += 5) {
      const segment = player.body[i];
      const pelletId = `pellet_${Date.now()}_${Math.random()}`;
      const pellet = new Pellet(pelletId, segment.x, segment.y, 1);
      this.pellets.set(pelletId, pellet);
    }
  }

  private startGameLoop(): void {
    const updateInterval = 1000 / this.tickRate;
    this.tickInterval = setInterval(() => this.update(), updateInterval);
  }

  stopGameLoop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private update(): void {
    if (this.players.size === 0) {
      // Auto-remove empty servers after timeout
      const now = Date.now();
      if (now - this.createdAt > this.autoRemoveTimeout) {
        this.stopGameLoop();
        return;
      }
    }

    // Update all alive players
    this.players.forEach(player => {
      if (player.alive) {
        player.update();
        
        // Check boundaries
        if (player.isOutOfBounds(this.mapSize)) {
          player.kill();
          this.handlePlayerDeath(player);
        }
      }
    });

    // Check collisions
    this.checkCollisions();

    // Check pellet collection
    this.checkPelletCollection();

    // Spawn new pellets if needed
    this.maintainPellets();
  }

  private checkCollisions(): void {
    const alivePlayers = Array.from(this.players.values()).filter(p => p.alive);

    for (let i = 0; i < alivePlayers.length; i++) {
      const player1 = alivePlayers[i];
      const head1 = player1.getHeadPosition();

      // Check collision with other players' bodies
      for (let j = 0; j < alivePlayers.length; j++) {
        if (i === j) continue;
        
        const player2 = alivePlayers[j];
        const body = player2.getBodySegments();

        // Check head collision with player2's body
        for (const segment of body) {
          const distance = Math.sqrt(
            Math.pow(head1.x - segment.x, 2) + 
            Math.pow(head1.y - segment.y, 2)
          );

          if (distance < player1.size + player2.size) {
            // Collision occurred
            if (player1.size < player2.size) {
              player1.kill();
              this.handlePlayerDeath(player1);
              player2.grow(player1.score / 10);
            } else if (player1.size > player2.size) {
              player2.kill();
              this.handlePlayerDeath(player2);
              player1.grow(player2.score / 10);
            }
          }
        }

        // Check head-to-head collision with smaller opponent
        const head2 = player2.getHeadPosition();
        const headDistance = Math.sqrt(
          Math.pow(head1.x - head2.x, 2) + 
          Math.pow(head1.y - head2.y, 2)
        );

        if (headDistance < player1.size + player2.size) {
          if (player1.size > player2.size) {
            player2.kill();
            this.handlePlayerDeath(player2);
            player1.grow(player2.score / 10);
          } else if (player2.size > player1.size) {
            player1.kill();
            this.handlePlayerDeath(player1);
            player2.grow(player1.score / 10);
          }
        }
      }
    }
  }

  private checkPelletCollection(): void {
    this.players.forEach(player => {
      if (!player.alive) return;

      const pelletsToRemove: string[] = [];
      const head = player.getHeadPosition();

      this.pellets.forEach((pellet, pelletId) => {
        if (pellet.isCollected(head.x, head.y, player.size)) {
          player.grow(pellet.value);
          pelletsToRemove.push(pelletId);
        }
      });

      pelletsToRemove.forEach(id => this.pellets.delete(id));
    });
  }

  private maintainPellets(): void {
    // Keep pellet count between 100 and 300
    const currentPellets = this.pellets.size;
    const desiredPellets = 200;

    if (currentPellets < desiredPellets) {
      const toSpawn = desiredPellets - currentPellets;
      for (let i = 0; i < toSpawn; i++) {
        const pelletId = `pellet_${Date.now()}_${Math.random()}`;
        const x = Math.random() * this.mapSize;
        const y = Math.random() * this.mapSize;
        const pellet = new Pellet(pelletId, x, y, 1);
        this.pellets.set(pelletId, pellet);
      }
    }
  }

  private handlePlayerDeath(player: Player): void {
    logger.info(`Player ${player.username} died with score ${player.score}`);
    
    // Create pellets from player body
    this.createPelletsFromPlayer(player);
    
    // Update database asynchronously
    const earnings = Math.floor(player.score * 0.1); // 10% of score in coins
    updateUserCoins(player.tgId, earnings).catch(error => {
      logger.error('Error updating user coins on death', error);
    });
    
    updateGameStats(player.tgId, earnings, player.score).catch(error => {
      logger.error('Error updating game stats', error);
    });
  }

  getState(): GameState {
    return {
      players: Array.from(this.players.values()).map(p => p.getState()),
      pellets: Array.from(this.pellets.values()).map(p => p.getState()),
      timestamp: Date.now()
    };
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  getAlivePlayerCount(): number {
    return Array.from(this.players.values()).filter(p => p.alive).length;
  }

  isEmpty(): boolean {
    return this.players.size === 0;
  }

  isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }

  destroy(): void {
    this.stopGameLoop();
    this.players.clear();
    this.pellets.clear();
  }
}

export class GameServerManager {
  servers: Map<string, GameServer> = new Map();
  maxPlayersPerServer: number = 15;

  createServer(): GameServer {
    const serverId = `server_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const server = new GameServer(serverId);
    this.servers.set(serverId, server);
    logger.info(`Created new game server: ${serverId}`);
    return server;
  }

  getServerForNewPlayer(): GameServer {
    // Find server with space
    for (const server of this.servers.values()) {
      if (!server.isFull()) {
        return server;
      }
    }

    // Create new server if all are full
    return this.createServer();
  }

  getServer(serverId: string): GameServer | undefined {
    return this.servers.get(serverId);
  }

  removeServer(serverId: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.destroy();
      this.servers.delete(serverId);
      logger.info(`Removed game server: ${serverId}`);
    }
  }

  cleanupEmptyServers(): void {
    for (const [serverId, server] of this.servers.entries()) {
      if (server.isEmpty()) {
        this.removeServer(serverId);
      }
    }
  }
}
