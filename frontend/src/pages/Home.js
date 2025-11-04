import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Coins, Users, Trophy, Play } from 'lucide-react';
import { toast } from 'sonner';
import { API } from '../App';
import axios from 'axios';

const Home = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [selectedBet, setSelectedBet] = useState(1);
  const [showDonate, setShowDonate] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [walletConnected, setWalletConnected] = useState(false);

  const betOptions = [1, 3, 5, 10];

  useEffect(() => {
    initUser();
    fetchRooms();
  }, []);

  const initUser = async () => {
    // Get Telegram user data
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      const tgUser = tg.initDataUnsafe?.user;
      
      if (tgUser) {
        setUser({
          id: tgUser.id,
          username: tgUser.username || tgUser.first_name
        });

        // Register player
        try {
          await axios.post(`${API}/player/register`, {
            user_id: tgUser.id,
            username: tgUser.username || tgUser.first_name,
            wallet_address: null,
            balance: 0
          });

          // Fetch player data
          const response = await axios.get(`${API}/player/${tgUser.id}`);
          setBalance(parseFloat(response.data.balance));
        } catch (error) {
          console.error('Error initializing user:', error);
        }
      }
    } else {
      // Demo user for testing
      const demoUser = { id: 123456, username: 'DemoPlayer' };
      setUser(demoUser);
      
      try {
        await axios.post(`${API}/player/register`, {
          user_id: demoUser.id,
          username: demoUser.username,
          wallet_address: null,
          balance: 10
        });
        setBalance(10);
      } catch (error) {
        console.error('Error:', error);
      }
    }
  };

  const fetchRooms = async () => {
    try {
      const response = await axios.get(`${API}/game/rooms`);
      setRooms(response.data.rooms);
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }
  };

  const handleConnectWallet = async () => {
    toast.info('Подключение TON Connect...');
    
    // Simulate wallet connection for demo
    setTimeout(() => {
      setWalletConnected(true);
      toast.success('Кошелёк подключен!');
    }, 1500);
  };

  const handleDonate = async (amount) => {
    if (!walletConnected) {
      toast.error('Сначала подключите кошелёк!');
      return;
    }

    toast.info(`Обработка доната ${amount} TON...`);
    
    // Simulate donation
    setTimeout(async () => {
      try {
        await axios.post(`${API}/donation/add`, {
          user_id: user.id,
          amount: amount,
          transaction_hash: `demo_${Date.now()}`
        });
        
        setBalance(balance + amount);
        toast.success(`Донат ${amount} TON успешно зачислен!`);
        setShowDonate(false);
      } catch (error) {
        toast.error('Ошибка при обработке доната');
      }
    }, 2000);
  };

  const handleCreateRoom = async () => {
    if (!user) {
      toast.error('Ошибка инициализации пользователя');
      return;
    }

    if (balance < selectedBet) {
      toast.error('Недостаточно средств! Пополните баланс.');
      return;
    }

    try {
      const response = await axios.post(`${API}/game/create-room`, {
        user_id: user.id,
        bet_amount: selectedBet,
        username: user.username
      });

      toast.success('Комната создана! Ожидание игроков...');
      navigate(`/game?room=${response.data.room_id}&bet=${selectedBet}`);
    } catch (error) {
      toast.error('Ошибка при создании комнаты');
    }
  };

  const handleJoinRoom = async (roomId, betAmount) => {
    if (!user) return;

    if (balance < betAmount) {
      toast.error('Недостаточно средств!');
      return;
    }

    try {
      await axios.post(`${API}/game/join/${roomId}`, {
        user_id: user.id,
        bet_amount: betAmount,
        username: user.username
      });

      toast.success('Присоединение к игре...');
      navigate(`/game?room=${roomId}&bet=${betAmount}`);
    } catch (error) {
      toast.error('Ошибка при присоединении');
    }
  };

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="glass p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              🐛 Worm Battle
            </h1>
            <p className="text-gray-400 mt-1">@{user?.username || 'Загрузка...'}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400">Баланс</div>
            <div className="text-2xl font-bold text-purple-400">{balance.toFixed(2)} TON</div>
          </div>
        </div>
      </div>

      {/* Wallet & Donate Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <button
          onClick={handleConnectWallet}
          disabled={walletConnected}
          className={`glass p-6 flex items-center justify-center gap-3 transition-all ${
            walletConnected ? 'opacity-60' : 'hover:bg-white/10 cursor-pointer'
          }`}
          data-testid="connect-wallet-btn"
        >
          <Wallet size={24} className="text-purple-400" />
          <span className="font-semibold">
            {walletConnected ? '✓ Кошелёк подключен' : 'Подключить TON кошелёк'}
          </span>
        </button>

        <button
          onClick={() => setShowDonate(true)}
          className="glass p-6 flex items-center justify-center gap-3 hover:bg-white/10 transition-all cursor-pointer"
          data-testid="donate-btn"
        >
          <Coins size={24} className="text-yellow-400" />
          <span className="font-semibold">Пополнить баланс</span>
        </button>
      </div>

      {/* Donate Modal */}
      {showDonate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass p-8 max-w-md w-full" data-testid="donate-modal">
            <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              💰 Пополнение баланса
            </h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              {[1, 3, 5, 10, 20, 50].map((amount) => (
                <button
                  key={amount}
                  onClick={() => handleDonate(amount)}
                  className="btn-primary py-4"
                  data-testid={`donate-${amount}-btn`}
                >
                  {amount} TON
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowDonate(false)}
              className="btn-secondary w-full"
              data-testid="close-donate-btn"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Bet Selection */}
      <div className="glass p-6 mb-6">
        <h2 className="text-xl font-bold mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          🎯 Выберите ставку
        </h2>
        <div className="grid grid-cols-4 gap-4">
          {betOptions.map((bet) => (
            <button
              key={bet}
              onClick={() => setSelectedBet(bet)}
              className={`p-4 rounded-xl font-bold text-lg transition-all ${
                selectedBet === bet
                  ? 'bg-purple-600 text-white scale-105'
                  : 'bg-white/5 hover:bg-white/10'
              }`}
              data-testid={`bet-${bet}-btn`}
            >
              {bet} TON
            </button>
          ))}
        </div>
      </div>

      {/* Start Game Button */}
      <button
        onClick={handleCreateRoom}
        className="btn-primary w-full py-5 text-xl mb-6 flex items-center justify-center gap-3"
        data-testid="start-game-btn"
      >
        <Play size={24} />
        Начать игру
      </button>

      {/* Available Rooms */}
      <div className="glass p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          <Users size={24} className="text-green-400" />
          Открытые комнаты
        </h2>
        {rooms.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Нет доступных комнат. Создайте свою!</p>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => (
              <div
                key={room.room_id}
                className="bg-white/5 p-4 rounded-xl flex items-center justify-between hover:bg-white/10 transition-all"
                data-testid={`room-${room.room_id}`}
              >
                <div>
                  <div className="font-semibold">Ставка: {room.bet_amount} TON</div>
                  <div className="text-sm text-gray-400">
                    Игроков: {room.players.length} / 10
                  </div>
                </div>
                <button
                  onClick={() => handleJoinRoom(room.room_id, room.bet_amount)}
                  className="btn-secondary px-6"
                  data-testid={`join-room-${room.room_id}-btn`}
                >
                  Войти
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Game Info */}
      <div className="glass p-6 mt-6">
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          <Trophy size={20} className="text-yellow-400" />
          Правила игры
        </h3>
        <ul className="space-y-2 text-gray-300 text-sm">
          <li>• Управляйте червяком, перемещая палец по экрану</li>
          <li>• Собирайте шарики, чтобы расти и зарабатывать TON</li>
          <li>• Избегайте столкновений лицом с другими червяками</li>
          <li>• Когда червяк умирает, из него выпадают шарики</li>
          <li>• Чем больше шариков соберёте, тем больше выигрыш!</li>
        </ul>
      </div>
    </div>
  );
};

export default Home;
