import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { getTelegramUser } from './utils/telegram';
import { getBalance, deductCoins, addCoins } from './api/client';
import { GameCanvas } from './components/GameCanvas';
import { TopUpModal } from './components/TopUpModal';
import { BetSelector } from './components/BetSelector';
import './styles/app.css';
export default function App() {
    const [user, setUser] = useState(null);
    const [coins, setCoins] = useState(0);
    const [gameState, setGameState] = useState('menu');
    const [selectedBet, setSelectedBet] = useState(null);
    const [showTopUp, setShowTopUp] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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
            }
            catch (err) {
                setError('Failed to initialize user');
                console.error(err);
            }
            finally {
                setLoading(false);
            }
        };
        initUser();
    }, []);
    const handleStartGame = () => {
        setGameState('betting');
    };
    const handleBetSelected = async (bet) => {
        if (coins < bet) {
            setError('Insufficient coins for this bet');
            return;
        }
        try {
            setSelectedBet(bet);
            const updated = await deductCoins(user.id, bet);
            setCoins(updated.coins);
            setGameState('playing');
        }
        catch (err) {
            setError('Failed to place bet');
            console.error(err);
        }
    };
    const handleGameOver = async (score, earnings) => {
        try {
            const updated = await addCoins(user.id, earnings);
            setCoins(updated.coins);
            setGameState('menu');
            setSelectedBet(null);
        }
        catch (err) {
            setError('Failed to save game results');
            console.error(err);
        }
    };
    const handleTopUpSuccess = async () => {
        try {
            const balance = await getBalance(user.id);
            setCoins(balance.coins);
            setShowTopUp(false);
        }
        catch (err) {
            console.error('Failed to refresh balance after top-up', err);
        }
    };
    if (loading) {
        return (_jsx("div", { className: "app", children: _jsxs("div", { className: "loading-screen", children: [_jsx("div", { className: "spinner" }), _jsx("p", { children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0438\u0433\u0440\u044B..." })] }) }));
    }
    return (_jsxs("div", { className: "app", children: [_jsxs("header", { className: "header", children: [_jsx("div", { className: "header-left", children: _jsxs("span", { className: "username", children: ["\uD83D\uDC64 ", user?.firstName] }) }), _jsx("div", { className: "header-right", children: _jsxs("button", { className: "balance-button", onClick: () => setShowTopUp(true), children: [_jsx("span", { className: "star-icon", children: "\u2B50" }), _jsx("span", { className: "balance-value", children: coins })] }) })] }), _jsxs("main", { className: "main-content", children: [error && (_jsxs("div", { className: "error-message", children: [_jsx("p", { children: error }), _jsx("button", { onClick: () => setError(null), children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] })), gameState === 'menu' && (_jsxs("div", { className: "menu-screen", children: [_jsxs("div", { className: "game-logo", children: [_jsx("h1", { children: "\uD83D\uDC1B Cherviton" }), _jsx("p", { children: "\u041C\u043D\u043E\u0433\u043E\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0430\u044F \u0438\u0433\u0440\u0430" })] }), _jsxs("div", { className: "menu-content", children: [_jsx("p", { className: "description", children: "\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0439 \u0441\u0432\u043E\u0438\u043C \u0447\u0435\u0440\u0432\u044F\u043A\u043E\u043C, \u0435\u0448\u044C \u0448\u0430\u0440\u0438\u043A\u0438 \u0434\u0440\u0443\u0433\u0438\u0445 \u0438\u0433\u0440\u043E\u043A\u043E\u0432 \u0438 \u0440\u0430\u0441\u0442\u0438!" }), _jsx("button", { className: "btn-primary btn-play", onClick: handleStartGame, children: "\uD83C\uDFAE \u041D\u0430\u0447\u0430\u0442\u044C \u0438\u0433\u0440\u0443" }), _jsxs("div", { className: "info-cards", children: [_jsxs("div", { className: "info-card", children: [_jsx("span", { className: "icon", children: "\uD83C\uDFC6" }), _jsx("p", { children: "\u0412\u044B\u0436\u0438\u0432\u0430\u0439 \u0438 \u0437\u0430\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0439" })] }), _jsxs("div", { className: "info-card", children: [_jsx("span", { className: "icon", children: "\u2B50" }), _jsx("p", { children: "\u041F\u043E\u043F\u043E\u043B\u043D\u044F\u0439 \u0431\u0430\u043B\u0430\u043D\u0441 \u0447\u0435\u0440\u0435\u0437 Stars" })] }), _jsxs("div", { className: "info-card", children: [_jsx("span", { className: "icon", children: "\uD83C\uDFAF" }), _jsx("p", { children: "\u041F\u043E\u0431\u0435\u0436\u0434\u0430\u0439 \u0434\u0440\u0443\u0433\u0438\u0445 \u0438\u0433\u0440\u043E\u043A\u043E\u0432" })] })] })] })] })), gameState === 'betting' && (_jsx(BetSelector, { coins: coins, onBetSelected: handleBetSelected, onCancel: () => setGameState('menu') })), gameState === 'playing' && user && selectedBet && (_jsx(GameCanvas, { user: user, betAmount: selectedBet, onGameOver: handleGameOver, onExit: () => {
                            setGameState('menu');
                            setSelectedBet(null);
                        } }))] }), showTopUp && (_jsx(TopUpModal, { onSuccess: handleTopUpSuccess, onClose: () => setShowTopUp(false) }))] }));
}
//# sourceMappingURL=App.js.map