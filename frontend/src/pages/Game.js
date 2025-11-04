import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Users, Trophy } from 'lucide-react';
import { API } from '../App';
import axios from 'axios';

const Game = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  
  const roomId = searchParams.get('room');
  const betAmount = parseFloat(searchParams.get('bet'));
  
  const [gameState, setGameState] = useState('waiting'); // waiting, playing, finished
  const [players, setPlayers] = useState([]);
  const [myWorm, setMyWorm] = useState(null);
  const [score, setScore] = useState(0);
  const [orbsCollected, setOrbsCollected] = useState(0);
  const [worms, setWorms] = useState([]);
  const [orbs, setOrbs] = useState([]);
  const [userId, setUserId] = useState(null);

  // Game constants
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;
  const WORM_SPEED = 3;
  const WORM_SEGMENT_SIZE = 10;
  const ORB_SIZE = 6;

  useEffect(() => {
    initGame();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (gameState === 'playing') {
      const gameLoop = setInterval(() => {
        updateGame();
        drawGame();
      }, 1000 / 60); // 60 FPS

      return () => clearInterval(gameLoop);
    }
  }, [gameState, myWorm, worms, orbs]);

  const initGame = async () => {
    // Get user ID
    let uid = 123456;
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      const tgUser = tg.initDataUnsafe?.user;
      if (tgUser) uid = tgUser.id;
    }
    setUserId(uid);

    // Initialize my worm
    const initialWorm = {
      id: uid,
      x: Math.random() * (CANVAS_WIDTH - 100) + 50,
      y: Math.random() * (CANVAS_HEIGHT - 100) + 50,
      angle: Math.random() * Math.PI * 2,
      segments: [],
      length: 10,
      alive: true,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`
    };

    // Initialize segments
    for (let i = 0; i < initialWorm.length; i++) {
      initialWorm.segments.push({
        x: initialWorm.x - i * WORM_SEGMENT_SIZE,
        y: initialWorm.y
      });
    }

    setMyWorm(initialWorm);
    setWorms([initialWorm]);

    // Generate initial orbs
    const initialOrbs = [];
    for (let i = 0; i < 50; i++) {
      initialOrbs.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        color: `hsl(${Math.random() * 360}, 80%, 60%)`,
        value: 1
      });
    }
    setOrbs(initialOrbs);

    // Connect WebSocket
    connectWebSocket(uid);

    // Start game after 3 seconds
    setTimeout(() => {
      setGameState('playing');
      toast.success('Игра началась!');
    }, 3000);
  };

  const connectWebSocket = (uid) => {
    // Build WebSocket URL based on current domain
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/game/${roomId}/${uid}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'player_update') {
        // Update other players
        setWorms((prev) => {
          const filtered = prev.filter(w => w.id !== data.worm.id);
          return [...filtered, data.worm];
        });
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
    };

    wsRef.current = ws;
  };

  const updateGame = () => {
    if (!myWorm || !myWorm.alive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Update worm position based on mouse/touch
    const newWorm = { ...myWorm };
    
    // Move worm head
    newWorm.x += Math.cos(newWorm.angle) * WORM_SPEED;
    newWorm.y += Math.sin(newWorm.angle) * WORM_SPEED;

    // Boundary collision (worm dies)
    if (newWorm.x < 0 || newWorm.x > CANVAS_WIDTH || newWorm.y < 0 || newWorm.y > CANVAS_HEIGHT) {
      newWorm.alive = false;
      handleWormDeath(newWorm);
      setMyWorm(newWorm);
      return;
    }

    // Update segments
    newWorm.segments.unshift({ x: newWorm.x, y: newWorm.y });
    if (newWorm.segments.length > newWorm.length) {
      newWorm.segments.pop();
    }

    // Check orb collection
    setOrbs((prevOrbs) => {
      return prevOrbs.filter((orb) => {
        const dist = Math.hypot(orb.x - newWorm.x, orb.y - newWorm.y);
        if (dist < WORM_SEGMENT_SIZE) {
          // Collected orb
          newWorm.length += 1;
          setOrbsCollected((prev) => prev + orb.value);
          setScore((prev) => prev + orb.value);
          return false;
        }
        return true;
      });
    });

    // Check collision with other worms
    worms.forEach((otherWorm) => {
      if (otherWorm.id === newWorm.id || !otherWorm.alive) return;

      // Check head-to-body collision
      otherWorm.segments.forEach((segment, index) => {
        if (index === 0) return; // Skip head
        const dist = Math.hypot(segment.x - newWorm.x, segment.y - newWorm.y);
        if (dist < WORM_SEGMENT_SIZE) {
          newWorm.alive = false;
          handleWormDeath(newWorm);
        }
      });

      // Check head-to-head collision
      const headDist = Math.hypot(otherWorm.x - newWorm.x, otherWorm.y - newWorm.y);
      if (headDist < WORM_SEGMENT_SIZE) {
        // Bigger worm survives
        if (newWorm.length < otherWorm.length) {
          newWorm.alive = false;
          handleWormDeath(newWorm);
        }
      }
    });

    setMyWorm(newWorm);

    // Send update to server
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'player_update',
        worm: newWorm
      }));
    }
  };

  const handleWormDeath = (worm) => {
    toast.error('Вы погибли!');
    
    // Drop orbs from dead worm
    const newOrbs = worm.segments.map((segment) => ({
      x: segment.x,
      y: segment.y,
      color: worm.color,
      value: betAmount / worm.segments.length
    }));
    
    setOrbs((prev) => [...prev, ...newOrbs]);
    
    // End game after 3 seconds
    setTimeout(() => {
      endGame();
    }, 3000);
  };

  const drawGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = '#0a0e27';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < CANVAS_WIDTH; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let i = 0; i < CANVAS_HEIGHT; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(CANVAS_WIDTH, i);
      ctx.stroke();
    }

    // Draw orbs
    orbs.forEach((orb) => {
      ctx.fillStyle = orb.color;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, ORB_SIZE, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw worms
    worms.forEach((worm) => {
      if (!worm.alive) return;

      // Draw segments
      worm.segments.forEach((segment, index) => {
        ctx.fillStyle = worm.color;
        ctx.globalAlpha = 1 - (index / worm.segments.length) * 0.3;
        ctx.beginPath();
        ctx.arc(segment.x, segment.y, WORM_SEGMENT_SIZE, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Draw head with eyes
      if (worm.segments.length > 0) {
        const head = worm.segments[0];
        ctx.fillStyle = 'white';
        const eyeOffset = 5;
        const eyeAngle = worm.angle;
        ctx.beginPath();
        ctx.arc(
          head.x + Math.cos(eyeAngle + 0.3) * eyeOffset,
          head.y + Math.sin(eyeAngle + 0.3) * eyeOffset,
          2,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.beginPath();
        ctx.arc(
          head.x + Math.cos(eyeAngle - 0.3) * eyeOffset,
          head.y + Math.sin(eyeAngle - 0.3) * eyeOffset,
          2,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    });
  };

  const handleCanvasMove = (e) => {
    if (!myWorm || !myWorm.alive || gameState !== 'playing') return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if (e.type.startsWith('touch')) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const mouseX = ((clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const mouseY = ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

    const angle = Math.atan2(mouseY - myWorm.y, mouseX - myWorm.x);
    setMyWorm((prev) => ({ ...prev, angle }));
  };

  const endGame = async () => {
    setGameState('finished');
    
    try {
      await axios.post(`${API}/game/end`, null, {
        params: {
          room_id: roomId,
          winner_id: userId,
          results: JSON.stringify({ [userId]: orbsCollected })
        }
      });
    } catch (error) {
      console.error('Error ending game:', error);
    }

    toast.success(`Игра окончена! Собрано шариков: ${orbsCollected}`);
  };

  return (
    <div className="min-h-screen p-4">
      {/* Header */}
      <div className="glass p-4 mb-4 flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
          data-testid="back-btn"
        >
          <ArrowLeft size={20} />
          Назад
        </button>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-xs text-gray-400">Ставка</div>
            <div className="text-lg font-bold text-purple-400">{betAmount} TON</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400">Счёт</div>
            <div className="text-lg font-bold text-yellow-400">{score}</div>
          </div>
        </div>
      </div>

      {/* Game Status */}
      {gameState === 'waiting' && (
        <div className="glass p-8 mb-4 text-center">
          <h2 className="text-2xl font-bold mb-2">Ожидание игроков...</h2>
          <p className="text-gray-400">Игра начнётся через несколько секунд</p>
        </div>
      )}

      {gameState === 'finished' && (
        <div className="glass p-8 mb-4 text-center">
          <Trophy size={48} className="text-yellow-400 mx-auto mb-4" />
          <h2 className="text-3xl font-bold mb-2">Игра окончена!</h2>
          <p className="text-xl text-gray-300 mb-4">Собрано шариков: {orbsCollected}</p>
          <button
            onClick={() => navigate('/')}
            className="btn-primary"
            data-testid="back-home-btn"
          >
            На главную
          </button>
        </div>
      )}

      {/* Game Canvas */}
      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="game-canvas cursor-none"
          onMouseMove={handleCanvasMove}
          onTouchMove={handleCanvasMove}
          data-testid="game-canvas"
        />
      </div>

      {/* Instructions */}
      <div className="glass p-4 mt-4 text-center">
        <p className="text-sm text-gray-400">
          {gameState === 'playing'
            ? '🎮 Перемещайте палец/мышь для управления червяком'
            : 'Приготовьтесь к игре!'}
        </p>
      </div>
    </div>
  );
};

export default Game;
