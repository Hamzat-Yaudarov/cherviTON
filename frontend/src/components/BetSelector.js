import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { hapticFeedback } from '../utils/telegram';
import '../styles/bet-selector.css';
const BET_OPTIONS = [25, 50, 100, 200];
export function BetSelector({ coins, onBetSelected, onCancel }) {
    const handleBetClick = (bet) => {
        if (coins >= bet) {
            hapticFeedback('selection');
            onBetSelected(bet);
        }
    };
    return (_jsxs("div", { className: "bet-selector", children: [_jsxs("div", { className: "bet-header", children: [_jsx("h2", { children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0442\u0430\u0432\u043A\u0443" }), _jsxs("p", { className: "current-balance", children: ["\u0412\u0430\u0448 \u0431\u0430\u043B\u0430\u043D\u0441: ", _jsxs("strong", { children: ["\u2B50 ", coins] })] })] }), _jsx("div", { className: "bet-options", children: BET_OPTIONS.map((bet) => (_jsxs("button", { className: `bet-option ${coins < bet ? 'disabled' : ''}`, onClick: () => handleBetClick(bet), disabled: coins < bet, children: [_jsxs("span", { className: "bet-amount", children: ["\u2B50 ", bet] }), _jsxs("span", { className: "bet-label", children: [bet === 25 && '🌱 Новичок', bet === 50 && '🦗 Прыгун', bet === 100 && '🐢 Черепаха', bet === 200 && '🦕 Динозавр'] })] }, bet))) }), _jsx("button", { className: "btn-secondary btn-cancel", onClick: onCancel, children: "\u2190 \u041D\u0430\u0437\u0430\u0434" })] }));
}
//# sourceMappingURL=BetSelector.js.map