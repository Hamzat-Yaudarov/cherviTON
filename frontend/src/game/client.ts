export interface GameState {
  player?: {
    id: string;
    x: number;
    y: number;
    size: number;
    score: number;
    body: Array<{ x: number; y: number }>;
  };
  players: Array<{
    id: string;
    x: number;
    y: number;
    size: number;
    score: number;
    body: Array<{ x: number; y: number }>;
    username: string;
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
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight - 120;
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${(import.meta.env.VITE_WS_URL as string) || 'ws://localhost:8080'}?tg_id=${this.tgId}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.sendMessage({
            type: 'join',
            payload: { betAmount: this.betAmount }
          });
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
            
            if (message.type === 'joined') {
              this.playerId = message.player.id;
              resolve();
              this.startRenderLoop();
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
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
    } else if (this.gameState.player && !this.gameState.player.alive) {
      // Player is dead
      const earnings = Math.floor((this.gameState.player.score ?? 0) * 0.1);
      this.callbacks.onGameOver?.(Math.floor(this.gameState.player.score ?? 0), earnings);
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
    const render = () => {
      this.render();
      this.animationFrameId = requestAnimationFrame(render);
    };
    this.animationFrameId = requestAnimationFrame(render);
  }

  private render(): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

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
      ctx.arc(pellet.x % this.canvas.width, pellet.y % this.canvas.height, pellet.size + 1, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawPlayers(): void {
    const ctx = this.ctx;

    this.gameState.players.forEach(player => {
      const isOwnPlayer = player.id === this.playerId;
      
      // Draw body
      ctx.fillStyle = isOwnPlayer ? '#00ff00' : `hsl(${Math.random() * 360}, 100%, 50%)`;
      
      player.body.forEach((segment, index) => {
        const opacity = 1 - (index / player.body.length) * 0.5;
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc(segment.x % this.canvas.width, segment.y % this.canvas.height, player.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
      });
      
      ctx.globalAlpha = 1;
      
      // Draw head
      ctx.fillStyle = isOwnPlayer ? '#00ff00' : '#ff6b00';
      const head = player.body[0] || { x: player.x, y: player.y };
      ctx.beginPath();
      ctx.arc(head.x % this.canvas.width, head.y % this.canvas.height, player.size, 0, Math.PI * 2);
      ctx.fill();

      // Draw username
      if (isOwnPlayer) {
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.username, head.x % this.canvas.width, (head.y % this.canvas.height) - player.size - 5);
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
