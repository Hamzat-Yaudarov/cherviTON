export interface PlayerState {
  id: string;
  tgId: number;
  username: string;
  x: number;
  y: number;
  direction: number; // angle in radians
  size: number;
  body: Array<{ x: number; y: number }>; // body segments
  speed: number;
  alive: boolean;
  score: number;
}

export class Player {
  id: string;
  tgId: number;
  username: string;
  x: number;
  y: number;
  direction: number = 0; // angle in radians
  size: number = 5; // radius
  body: Array<{ x: number; y: number }> = [];
  speed: number = 4;
  alive: boolean = true;
  score: number = 0;
  betAmount: number = 0;
  joinTime: number;

  static readonly MIN_SIZE = 5;
  static readonly MAX_SIZE = 50;
  static readonly GRID_SIZE = 1000;

  constructor(
    id: string,
    tgId: number,
    username: string,
    x: number,
    y: number,
    betAmount: number
  ) {
    this.id = id;
    this.tgId = tgId;
    this.username = username;
    this.x = x;
    this.y = y;
    this.betAmount = betAmount;
    this.joinTime = Date.now();
    
    // Initialize body
    for (let i = 0; i < 10; i++) {
      this.body.push({
        x: this.x - (i * 2),
        y: this.y
      });
    }
  }

  update(): void {
    if (!this.alive) return;

    // Move head in direction
    this.x += Math.cos(this.direction) * this.speed;
    this.y += Math.sin(this.direction) * this.speed;

    // Update body - add new segment at head, remove tail
    this.body.unshift({ x: this.x, y: this.y });
    
    // Remove tail segments to maintain size ratio
    const segmentLength = this.size * 2;
    while (this.body.length > segmentLength) {
      this.body.pop();
    }
  }

  grow(amount: number = 1): void {
    this.size = Math.min(this.size + amount, Player.MAX_SIZE);
    this.score += amount;
  }

  getHeadPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  getBodySegments(): Array<{ x: number; y: number }> {
    return this.body;
  }

  getState(): PlayerState {
    return {
      id: this.id,
      tgId: this.tgId,
      username: this.username,
      x: this.x,
      y: this.y,
      direction: this.direction,
      size: this.size,
      body: this.body,
      speed: this.speed,
      alive: this.alive,
      score: this.score
    };
  }

  setDirection(direction: number): void {
    this.direction = direction;
  }

  kill(): void {
    this.alive = false;
  }

  isAlive(): boolean {
    return this.alive;
  }

  isOutOfBounds(mapSize: number): boolean {
    return (
      this.x < -this.size ||
      this.x > mapSize + this.size ||
      this.y < -this.size ||
      this.y > mapSize + this.size
    );
  }
}
