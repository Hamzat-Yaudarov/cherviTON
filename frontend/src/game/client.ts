export interface GameState {
  player?: {
    id: string;
    x: number;
    y: number;
    size: number;
    score: number;
    body: Array<{ x: number; y: number }>;
    alive: boolean;
  };
  players: Array<{
    id: string;
    x: number;
    y: number;
    size: number;
    score: number;
    body: Array<{ x: number; y: number }>;
    username: string;
    alive: boolean;
  }>;
  pellets: Array<{ id: string; x: number; y: number; size: number }>;
}

export interface GameClientCallbacks {
  onStateUpdate?: (state: GameState) => void;
  onGameOver?: (score: number, earnings: number) => void;
  onError?: (error: string) => void;
}

export class GameClient {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ws: WebSocket | null = null;
  private tgId: number;
  private betAmount: number;
  private playerId: string | null = null;
  private direction: number = 0;
  private gameState: GameState = { players: [], pellets: [] };
  private callbacks: GameClientCallbacks;
  private animationFrameId: number | null = null;
  private lastDirectionSent: number = 0;

  constructor(
    canvas: HTMLCanvasElement,
    tgId: number,
    betAmount: number,
    callbacks: GameClientCallbacks = {}
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.tgId = tgId;
    this.betAmount = betAmount;
    this.callbacks = callbacks;
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas(): void {
    const container = this.canvas.parentElement;
    if (container) {
      this.canvas.width = Math.max(container.clientWidth, 320);
      this.canvas.height = Math.max(container.clientHeight - 120, 200);
      console.log(`Canvas resized to: ${this.canvas.width}x${this.canvas.height}`);
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Construct WebSocket URL
        // In dev: connect to localhost:8080 backend
        // In prod: connect to same host as frontend
        let wsUrl: string;

        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          // Development: connect to backend on port 8080
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${protocol}//localhost:8080/?tg_id=${this.tgId}`;
        } else {
          // Production: connect to same host as frontend
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${protocol}//${window.location.host}/?tg_id=${this.tgId}`;
        }

        console.log('Connecting to WebSocket:', wsUrl);
        this.ws = new WebSocket(wsUrl);

        // Set timeout for connection
        const connectionTimeout = setTimeout(() => {
          if (this.playerId === null) {
            console.error('WebSocket connection timeout');
            this.ws?.close();
            reject(new Error('Game connection timeout - please try again'));
          }
        }, 10000); // 10 second timeout

        this.ws.onopen = () => {
          console.log('WebSocket connected, sending join message');
          this.sendMessage({
            type: 'join',
            payload: { betAmount: this.betAmount }
          });
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('Received WebSocket message:', message.type);
            this.handleMessage(message);

            if (message.type === 'joined') {
              clearTimeout(connectionTimeout);
              this.playerId = message.player.id;
              console.log('Game joined, player ID:', this.playerId);
              resolve();
              this.startRenderLoop();
            } else if (message.type === 'error') {
              clearTimeout(connectionTimeout);
              console.error('Game error:', message.message);
              reject(new Error(message.message || 'Game connection error'));
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error('WebSocket error:', error);
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = () => {
          clearTimeout(connectionTimeout);
          console.log('WebSocket closed');
          if (this.callbacks.onGameOver && this.playerId) {
            this.callbacks.onGameOver(Math.floor(this.gameState.player?.score ?? 0), 0);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case 'joined':
        console.log('Joined game:', message);
        break;
      case 'state':
        this.updateGameState(message.gameState);
        break;
      case 'error':
        console.error('Game error:', message.message);
        this.callbacks.onError?.(message.message);
        break;
    }
  }

  private updateGameState(state: any): void {
    // Find own player
    const ownPlayer = state.players.find((p: any) => p.id === this.playerId);

    if (ownPlayer) {
      this.gameState = {
        player: ownPlayer,
        players: state.players,
        pellets: state.pellets
      };

      // Check if player just died
      if (!ownPlayer.alive && this.gameState.player?.alive !== false) {
        const earnings = Math.floor((ownPlayer.score ?? 0) * 0.1);
        this.callbacks.onGameOver?.(Math.floor(ownPlayer.score ?? 0), earnings);
      }
    } else if (this.gameState.player && this.gameState.player.alive) {
      // Player was alive but is no longer in the player list = dead
      const earnings = Math.floor((this.gameState.player.score ?? 0) * 0.1);
      this.callbacks.onGameOver?.(Math.floor(this.gameState.player.score ?? 0), earnings);
      this.gameState.player.alive = false;
    }

    this.callbacks.onStateUpdate?.(this.gameState);
  }

  setDirection(direction: number): void {
    this.direction = direction;

    // Send direction update every 100ms to avoid flooding
    const now = Date.now();
    if (now - this.lastDirectionSent > 100) {
      this.sendMessage({
        type: 'move',
        payload: { direction }
      });
      this.lastDirectionSent = now;
    }
  }

  private sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private startRenderLoop(): void {
    console.log('Starting render loop');
    const render = () => {
      try {
        this.render();
      } catch (error) {
        console.error('Error in render loop:', error);
      }
      this.animationFrameId = requestAnimationFrame(render);
    };
    this.animationFrameId = requestAnimationFrame(render);
  }

  private render(): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    if (width === 0 || height === 0) {
      console.warn('Canvas has zero dimensions:', width, height);
      return;
    }

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    this.drawGrid();

    // Draw pellets
    this.drawPellets();

    // Draw players
    this.drawPlayers();

    // Draw own player info
    if (this.gameState.player) {
      this.drawPlayerInfo();
    }
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    const gridSize = 50;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    for (let x = 0; x < this.canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y < this.canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }
  }

  private drawPellets(): void {
    const ctx = this.ctx;

    this.gameState.pellets.forEach(pellet => {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(pellet.x % this.canvas.width, pellet.y % this.canvas.height, Math.max(pellet.size + 2, 3), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawPlayers(): void {
    const ctx = this.ctx;

    this.gameState.players.forEach(player => {
      const isOwnPlayer = player.id === this.playerId;

      // Draw body segments
      player.body.forEach((segment, index) => {
        const opacity = 1 - (index / player.body.length) * 0.5;
        ctx.globalAlpha = opacity;

        // Body color
        if (isOwnPlayer) {
          ctx.fillStyle = '#00ff00';
        } else {
          const hue = (player.id.charCodeAt(0) || 0) % 360;
          ctx.fillStyle = `hsl(${hue}, 100%, 45%)`;
        }

        ctx.beginPath();
        ctx.arc(segment.x % this.canvas.width, segment.y % this.canvas.height, player.size * 0.75, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;

      // Draw head (larger and brighter)
      const head = player.body[0] || { x: player.x, y: player.y };
      ctx.fillStyle = isOwnPlayer ? '#00ff00' : `hsl(${(player.id.charCodeAt(0) || 0) % 360}, 100%, 55%)`;
      ctx.shadowColor = isOwnPlayer ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 100, 0, 0.3)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(head.x % this.canvas.width, head.y % this.canvas.height, player.size * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';

      // Draw username for own player
      if (isOwnPlayer) {
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.username, head.x % this.canvas.width, (head.y % this.canvas.height) - player.size * 1.5);
      }
    });
  }

  private drawPlayerInfo(): void {
    // Player info drawn in stats panel outside canvas
  }

  disconnect(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: 'leave' });
      }
      this.ws.close();
      this.ws = null;
    }
  }
}
