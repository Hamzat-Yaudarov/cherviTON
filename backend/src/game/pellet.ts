export interface PelletState {
  id: string;
  x: number;
  y: number;
  size: number;
  value: number;
}

export class Pellet {
  id: string;
  x: number;
  y: number;
  size: number = 1;
  value: number = 1; // coins earned when collected

  constructor(id: string, x: number, y: number, value: number = 1) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.value = value;
  }

  getState(): PelletState {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      size: this.size,
      value: this.value
    };
  }

  isCollected(playerX: number, playerY: number, playerSize: number): boolean {
    const distance = Math.sqrt(
      Math.pow(playerX - this.x, 2) + Math.pow(playerY - this.y, 2)
    );
    return distance < playerSize + this.size;
  }
}
