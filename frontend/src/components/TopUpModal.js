import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { openInvoice, hapticFeedback } from '../utils/telegram';
import '../styles/topup-modal.css';
const PACKAGES = [
    { id: '100_stars', stars: 100, label: '100 ⭐', badge: '' },
    { id: '500_stars', stars: 500, label: '500 ⭐', badge: 'Дешевле' },
    { id: '1000_stars', stars: 1000, label: '1000 ⭐', badge: 'Выгодно' },
    { id: '2500_stars', stars: 2500, label: '2500 ⭐', badge: 'Лучшая' }
];
export function TopUpModal({ onSuccess, onClose }) {
    const [selectedPackage, setSelectedPackage] = useState(null);
    const [loading, setLoading] = useState(false);
    const handleBuyStars = (packageId) => {
        setSelectedPackage(packageId);
        setLoading(true);
        hapticFeedback('selection');
        openInvoice(packageId, () => {
            hapticFeedback('notification');
            setLoading(false);
            onSuccess();
        }, () => {
            setLoading(false);
            setSelectedPackage(null);
        });
    };
    return (_jsx("div", { className: "modal-overlay", onClick: onClose, children: _jsxs("div", { className: "modal-content", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "modal-header", children: [_jsx("h2", { children: "\u2B50 \u041F\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u044C \u0431\u0430\u043B\u0430\u043D\u0441" }), _jsx("button", { className: "modal-close", onClick: onClose, children: "\u2715" })] }), _jsx("p", { className: "modal-description", children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0437\u0432\u0451\u0437\u0434 \u0434\u043B\u044F \u043F\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u044F \u0441\u0432\u043E\u0435\u0433\u043E \u0431\u0430\u043B\u0430\u043D\u0441\u0430" }), _jsx("div", { className: "packages-grid", children: PACKAGES.map((pkg) => (_jsxs("div", { className: "package-card", children: [pkg.badge && _jsx("div", { className: "package-badge", children: pkg.badge }), _jsxs("div", { className: "package-info", children: [_jsx("div", { className: "package-stars", children: pkg.label }), _jsx("p", { className: "package-desc", children: "Telegram Stars" })] }), _jsx("button", { className: `btn-primary btn-buy ${selectedPackage === pkg.id ? 'loading' : ''}`, onClick: () => handleBuyStars(pkg.id), disabled: loading, children: selectedPackage === pkg.id && loading ? 'Обработка...' : 'Купить' })] }, pkg.id))) }), _jsxs("div", { className: "modal-info", children: [_jsx("p", { children: "\uD83D\uDCB3 \u041F\u043B\u0430\u0442\u0451\u0436 \u0447\u0435\u0440\u0435\u0437 Telegram Stars" }), _jsx("p", { children: "\u2705 \u0421\u0440\u0435\u0434\u0441\u0442\u0432\u0430 \u043F\u043E\u0441\u0442\u0443\u043F\u0430\u044E\u0442 \u043C\u0433\u043D\u043E\u0432\u0435\u043D\u043D\u043E" })] }), _jsx("button", { className: "btn-secondary btn-modal-cancel", onClick: onClose, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] }) }));
}
//# sourceMappingURL=TopUpModal.js.map