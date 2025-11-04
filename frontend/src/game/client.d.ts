export interface GameState {
    player?: {
        id: string;
        x: number;
        y: number;
        size: number;
        score: number;
        body: Array<{
            x: number;
            y: number;
        }>;
    };
    players: Array<{
        id: string;
        x: number;
        y: number;
        size: number;
        score: number;
        body: Array<{
            x: number;
            y: number;
        }>;
        username: string;
    }>;
    pellets: Array<{
        id: string;
        x: number;
        y: number;
        size: number;
    }>;
}
export interface GameClientCallbacks {
    onStateUpdate?: (state: GameState) => void;
    onGameOver?: (score: number, earnings: number) => void;
    onError?: (error: string) => void;
}
export declare class GameClient {
    private canvas;
    private ctx;
    private ws;
    private tgId;
    private betAmount;
    private playerId;
    private direction;
    private gameState;
    private callbacks;
    private animationFrameId;
    private lastDirectionSent;
    constructor(canvas: HTMLCanvasElement, tgId: number, betAmount: number, callbacks?: GameClientCallbacks);
    private resizeCanvas;
    connect(): Promise<void>;
    private handleMessage;
    private updateGameState;
    setDirection(direction: number): void;
    private sendMessage;
    private startRenderLoop;
    private render;
    private drawGrid;
    private drawPellets;
    private drawPlayers;
    private drawPlayerInfo;
    disconnect(): void;
}
//# sourceMappingURL=client.d.ts.map