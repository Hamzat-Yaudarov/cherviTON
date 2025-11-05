import '../styles/game.css';
interface GameCanvasProps {
    user: {
        id: number;
        username: string;
        firstName: string;
    };
    betAmount: number;
    onGameOver: (score: number, earnings: number) => void;
    onExit: () => void;
}
export declare function GameCanvas({ user, betAmount, onGameOver, onExit }: GameCanvasProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=GameCanvas.d.ts.map