import React, { useEffect, useRef, useState } from 'react';
import { hapticFeedback } from '../utils/telegram';
import { GameClient } from '../game/client';
import '../styles/game.css';

interface GameCanvasProps {
  user: { id: number; username: string; firstName: string };
  betAmount: number;
  onGameOver: (score: number, earnings: number) => void;
  onExit: () => void;
}

export function GameCanvas({ user, betAmount, onGameOver, onExit }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameClientRef = useRef<GameClient | null>(null);
  const [gameState, setGameState] = useState<'loading' | 'playing' | 'dead'>('loading');
  const [score, setScore] = useState(0);
  const [playersCount, setPlayersCount] = useState(0);
  const [playerSize, setPlayerSize] = useState(5);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gameClient = new GameClient(
      canvas,
      user.id,
      betAmount,
      {
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
      }
    );

    gameClientRef.current = gameClient;

    gameClient.connect()
      .then(() => setGameState('playing'))
      .catch((error) => {
        console.error('Failed to connect to game:', error);
        onExit();
      });

    // Handle device motion for tilt-to-move
    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      if (gameState !== 'playing') return;

      const { beta, gamma } = event;
      if (beta !== null && gamma !== null) {
        const angle = Math.atan2(gamma, beta);
        gameClient.setDirection(angle);
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (gameState !== 'playing' || !canvas) return;

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

  return (
    <div className="game-container">
      <div className="game-header">
        <div className="game-stats">
          <div className="stat">
            <span className="stat-label">Размер</span>
            <span className="stat-value">{playerSize.toFixed(1)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Очки</span>
            <span className="stat-value">{score}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Игроков</span>
            <span className="stat-value">{playersCount}</span>
          </div>
        </div>
        <button className="btn-exit" onClick={handleExitClick}>✕ Выход</button>
      </div>

      <div className="game-canvas-wrapper">
        <canvas
          ref={canvasRef}
          className="game-canvas"
        />
        {gameState === 'loading' && (
          <div className="game-loading">
            <div className="spinner"></div>
            <p>Подключение к игре...</p>
          </div>
        )}
        {gameState === 'dead' && (
          <div className="game-over-screen">
            <h2>💀 Конец игры</h2>
            <p className="game-over-score">Ваш счёт: {score}</p>
            <button className="btn-primary" onClick={handleExitClick}>
              ← Назад в меню
            </button>
          </div>
        )}
      </div>

      <div className="game-controls">
        <p className="controls-info">
          {gameState === 'playing' 
            ? '👆 Касайтесь экрана для управления направлением'
            : gameState === 'loading'
            ? '⏳ Загрузка игры...'
            : '💀 Вы умерли!'}
        </p>
      </div>
    </div>
  );
}
