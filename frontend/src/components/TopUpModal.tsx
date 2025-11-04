import React, { useState } from 'react';
import { openInvoice, hapticFeedback } from '../utils/telegram';
import '../styles/topup-modal.css';

interface TopUpModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

const PACKAGES = [
  { id: '100_stars', stars: 100, label: '100 ⭐', badge: '' },
  { id: '500_stars', stars: 500, label: '500 ⭐', badge: 'Дешевле' },
  { id: '1000_stars', stars: 1000, label: '1000 ⭐', badge: 'Выгодно' },
  { id: '2500_stars', stars: 2500, label: '2500 ⭐', badge: 'Лучшая' }
];

export function TopUpModal({ onSuccess, onClose }: TopUpModalProps) {
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleBuyStars = (packageId: string) => {
    setSelectedPackage(packageId);
    setLoading(true);
    hapticFeedback('selection');

    openInvoice(
      packageId,
      () => {
        hapticFeedback('notification');
        setLoading(false);
        onSuccess();
      },
      () => {
        setLoading(false);
        setSelectedPackage(null);
      }
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⭐ Пополнить баланс</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <p className="modal-description">
          Выберите количество звёзд для пополнения своего баланса
        </p>

        <div className="packages-grid">
          {PACKAGES.map((pkg) => (
            <div key={pkg.id} className="package-card">
              {pkg.badge && <div className="package-badge">{pkg.badge}</div>}
              <div className="package-info">
                <div className="package-stars">{pkg.label}</div>
                <p className="package-desc">Telegram Stars</p>
              </div>
              <button
                className={`btn-primary btn-buy ${selectedPackage === pkg.id ? 'loading' : ''}`}
                onClick={() => handleBuyStars(pkg.id)}
                disabled={loading}
              >
                {selectedPackage === pkg.id && loading ? 'Обработка...' : 'Купить'}
              </button>
            </div>
          ))}
        </div>

        <div className="modal-info">
          <p>💳 Платёж через Telegram Stars</p>
          <p>✅ Средства поступают мгновенно</p>
        </div>

        <button className="btn-secondary btn-modal-cancel" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
