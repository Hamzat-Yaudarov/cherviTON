import React, { useEffect, useState } from 'react';
import { getTelegramUser } from './utils/telegram';
import { getBalance, deductCoins, addCoins } from './api/client';
import { GameCanvas } from './components/GameCanvas';
import { TopUpModal } from './components/TopUpModal';
import { BetSelector } from './components/BetSelector';
import './styles/app.css';

interface UserData {
  id: number;
  username: string;
  firstName: string;
  coins: number;
}

export default function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [coins, setCoins] = useState(0);
  const [gameState, setGameState] = useState<'menu' | 'betting' | 'playing'>('menu');
  const [selectedBet, setSelectedBet] = useState<number | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize user from Telegram
  useEffect(() => {
    const initUser = async () => {
      try {
        const tgUser = getTelegramUser();
        if (!tgUser) {
          setError('Telegram WebApp not initialized');
          setLoading(false);
          return;
        }

        setUser({
          id: tgUser.id,
          username: tgUser.username || 'Anonymous',
          firstName: tgUser.first_name || 'Guest',
          coins: 0
        });

        // Get initial balance
        const balance = await getBalance(tgUser.id);
        setCoins(balance.coins);
      } catch (err) {
        setError('Failed to initialize user');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    initUser();
  }, []);

  const handleStartGame = () => {
    setGameState('betting');
  };

  const handleBetSelected = async (bet: number) => {
    if (coins < bet) {
      setError('Insufficient coins for this bet');
      return;
    }

    try {
      setSelectedBet(bet);
      const updated = await deductCoins(user!.id, bet);
      setCoins(updated.coins);
      setGameState('playing');
    } catch (err) {
      setError('Failed to place bet');
      console.error(err);
    }
  };

  const handleGameOver = async (score: number, earnings: number) => {
    try {
      const updated = await addCoins(user!.id, earnings);
      setCoins(updated.coins);
      setGameState('menu');
      setSelectedBet(null);
    } catch (err) {
      setError('Failed to save game results');
      console.error(err);
    }
  };

  const handleTopUpSuccess = async () => {
    try {
      const balance = await getBalance(user!.id);
      setCoins(balance.coins);
      setShowTopUp(false);
    } catch (err) {
      console.error('Failed to refresh balance after top-up', err);
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Загрузка игры...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <span className="username">👤 {user?.firstName}</span>
        </div>
        <div className="header-right">
          <button
            className="balance-button"
            onClick={() => setShowTopUp(true)}
          >
            <span className="star-icon">⭐</span>
            <span className="balance-value">{coins}</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="main-content">
        {error && (
          <div className="error-message">
            <p>{error}</p>
            <button onClick={() => setError(null)}>Закрыть</button>
          </div>
        )}

        {gameState === 'menu' && (
          <div className="menu-screen">
            <div className="game-logo">
              <h1>🐛 Cherviton</h1>
              <p>Многопользовательская игра</p>
            </div>
            <div className="menu-content">
              <p className="description">
                Управляй своим червяком, ешь шарики других игроков и расти!
              </p>
              <button
                className="btn-primary btn-play"
                onClick={handleStartGame}
              >
                🎮 Начать игру
              </button>
              <div className="info-cards">
                <div className="info-card">
                  <span className="icon">🏆</span>
                  <p>Выживай и зарабатывай</p>
                </div>
                <div className="info-card">
                  <span className="icon">⭐</span>
                  <p>Пополняй баланс через Stars</p>
                </div>
                <div className="info-card">
                  <span className="icon">🎯</span>
                  <p>Побеждай других игроков</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {gameState === 'betting' && (
          <BetSelector
            coins={coins}
            onBetSelected={handleBetSelected}
            onCancel={() => setGameState('menu')}
          />
        )}

        {gameState === 'playing' && user && selectedBet && (
          <GameCanvas
            user={user}
            betAmount={selectedBet}
            onGameOver={handleGameOver}
            onExit={() => {
              setGameState('menu');
              setSelectedBet(null);
            }}
          />
        )}
      </main>

      {/* Top-up modal */}
      {showTopUp && (
        <TopUpModal
          onSuccess={handleTopUpSuccess}
          onClose={() => setShowTopUp(false)}
        />
      )}
    </div>
  );
}
