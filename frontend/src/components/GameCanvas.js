import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useRef, useState } from 'react';
import { hapticFeedback } from '../utils/telegram';
import { GameClient } from '../game/client';
import '../styles/game.css';
export function GameCanvas({ user, betAmount, onGameOver, onExit }) {
    const canvasRef = useRef(null);
    const gameClientRef = useRef(null);
    const [gameState, setGameState] = useState('loading');
    const [score, setScore] = useState(0);
    const [playersCount, setPlayersCount] = useState(0);
    const [playerSize, setPlayerSize] = useState(5);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        const gameClient = new GameClient(canvas, user.id, betAmount, {
            onStateUpdate: (state) => {
                setScore(Math.floor(state.player?.score ?? 0));
                setPlayerSize(state.player?.size ?? 5);
                setPlayersCount(state.players?.length ?? 0);
            },
            onGameOver: (score, earnings) => {
                hapticFeedback('notification');
                setGameState('dead');
                setTimeout(() => {
                    onGameOver(score, earnings);
                }, 2000);
            }
        });
        gameClientRef.current = gameClient;
        gameClient.connect()
            .then(() => setGameState('playing'))
            .catch((error) => {
            console.error('Failed to connect to game:', error);
            onExit();
        });
        // Handle device motion for tilt-to-move
        const handleDeviceMotion = (event) => {
            if (gameState !== 'playing')
                return;
            const { beta, gamma } = event;
            if (beta !== null && gamma !== null) {
                const angle = Math.atan2(gamma, beta);
                gameClient.setDirection(angle);
            }
        };
        const handleTouchMove = (event) => {
            if (gameState !== 'playing' || !canvas)
                return;
            const touch = event.touches[0];
            const rect = canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const angle = Math.atan2(y - centerY, x - centerX);
            gameClient.setDirection(angle);
        };
        window.addEventListener('devicemotion', handleDeviceMotion);
        canvas.addEventListener('touchmove', handleTouchMove);
        return () => {
            window.removeEventListener('devicemotion', handleDeviceMotion);
            canvas.removeEventListener('touchmove', handleTouchMove);
            gameClient.disconnect();
        };
    }, [user.id, betAmount, gameState, onGameOver, onExit]);
    const handleExitClick = () => {
        if (gameClientRef.current) {
            gameClientRef.current.disconnect();
        }
        onExit();
    };
    return (_jsxs("div", { className: "game-container", children: [_jsxs("div", { className: "game-header", children: [_jsxs("div", { className: "game-stats", children: [_jsxs("div", { className: "stat", children: [_jsx("span", { className: "stat-label", children: "\u0420\u0430\u0437\u043C\u0435\u0440" }), _jsx("span", { className: "stat-value", children: playerSize.toFixed(1) })] }), _jsxs("div", { className: "stat", children: [_jsx("span", { className: "stat-label", children: "\u041E\u0447\u043A\u0438" }), _jsx("span", { className: "stat-value", children: score })] }), _jsxs("div", { className: "stat", children: [_jsx("span", { className: "stat-label", children: "\u0418\u0433\u0440\u043E\u043A\u043E\u0432" }), _jsx("span", { className: "stat-value", children: playersCount })] })] }), _jsx("button", { className: "btn-exit", onClick: handleExitClick, children: "\u2715 \u0412\u044B\u0445\u043E\u0434" })] }), _jsxs("div", { className: "game-canvas-wrapper", children: [_jsx("canvas", { ref: canvasRef, className: "game-canvas" }), gameState === 'loading' && (_jsxs("div", { className: "game-loading", children: [_jsx("div", { className: "spinner" }), _jsx("p", { children: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043A \u0438\u0433\u0440\u0435..." })] })), gameState === 'dead' && (_jsxs("div", { className: "game-over-screen", children: [_jsx("h2", { children: "\uD83D\uDC80 \u041A\u043E\u043D\u0435\u0446 \u0438\u0433\u0440\u044B" }), _jsxs("p", { className: "game-over-score", children: ["\u0412\u0430\u0448 \u0441\u0447\u0451\u0442: ", score] }), _jsx("button", { className: "btn-primary", onClick: handleExitClick, children: "\u2190 \u041D\u0430\u0437\u0430\u0434 \u0432 \u043C\u0435\u043D\u044E" })] }))] }), _jsx("div", { className: "game-controls", children: _jsx("p", { className: "controls-info", children: gameState === 'playing'
                        ? '👆 Касайтесь экрана для управления направлением'
                        : gameState === 'loading'
                            ? '⏳ Загрузка игры...'
                            : '💀 Вы умерли!' }) })] }));
}
//# sourceMappingURL=GameCanvas.js.map