import React from 'react';
import { hapticFeedback } from '../utils/telegram';
import '../styles/bet-selector.css';

interface BetSelectorProps {
  coins: number;
  onBetSelected: (bet: number) => void;
  onCancel: () => void;
}

const BET_OPTIONS = [25, 50, 100, 200];

export function BetSelector({ coins, onBetSelected, onCancel }: BetSelectorProps) {
  const handleBetClick = (bet: number) => {
    if (coins >= bet) {
      hapticFeedback('selection');
      onBetSelected(bet);
    }
  };

  return (
    <div className="bet-selector">
      <div className="bet-header">
        <h2>Выберите ставку</h2>
        <p className="current-balance">Ваш баланс: <strong>⭐ {coins}</strong></p>
      </div>

      <div className="bet-options">
        {BET_OPTIONS.map((bet) => (
          <button
            key={bet}
            className={`bet-option ${coins < bet ? 'disabled' : ''}`}
            onClick={() => handleBetClick(bet)}
            disabled={coins < bet}
          >
            <span className="bet-amount">⭐ {bet}</span>
            <span className="bet-label">
              {bet === 25 && '🌱 Новичок'}
              {bet === 50 && '🦗 Прыгун'}
              {bet === 100 && '🐢 Черепаха'}
              {bet === 200 && '🦕 Динозавр'}
            </span>
          </button>
        ))}
      </div>

      <button className="btn-secondary btn-cancel" onClick={onCancel}>
        ← Назад
      </button>
    </div>
  );
}
