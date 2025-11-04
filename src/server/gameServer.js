const WebSocket = require('ws');
const url = require('url');
const { v4: uuidv4 } = require('uuid');
const { updatePlayerBalance, getPlayerByTelegramId } = require('./db');

// Game settings
const MAX_PLAYERS_PER_ROOM = 15;
const TICK_RATE = 50; // ms
const MAP_SIZE = { width: 1200, height: 800 };

const rooms = new Map(); // roomId -> room object

function createRoom() {
  const id = uuidv4();
  const room = {
    id,
    players: new Map(), // telegram_id -> player
    balls: [],
    startedAt: null,
    createdAt: Date.now(),
    lockedUntil: null
  };
  rooms.set(id, room);
  return room;
}

function findRoomWithSpace() {
  for (const room of rooms.values()) {
    if (room.players.size < MAX_PLAYERS_PER_ROOM) return room;
  }
  return createRoom();
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function initGameServer(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    (async () => {
      const params = url.parse(req.url, true).query;
      const telegram_id = params.telegram_id;
      const username = params.username || `Player-${telegram_id}`;

      if (!telegram_id) {
        ws.close(1008, 'telegram_id required');
        return;
      }

      // Assign to a room
      const room = findRoomWithSpace();

      // Load player from DB to sync balance
      let dbPlayer = null;
      try {
        dbPlayer = await getPlayerByTelegramId(telegram_id);
      } catch (e) {
        console.error('Failed loading player from DB', e);
      }

      const player = {
        id: telegram_id,
        username,
        ws,
        x: Math.random() * MAP_SIZE.width,
        y: Math.random() * MAP_SIZE.height,
        dir: Math.random() * Math.PI * 2,
        speed: 2 + Math.random() * 2,
        length: 8,
        segments: [],
        alive: true,
        balance: Number((dbPlayer && dbPlayer.balance) || 0),
        stake: Number(params.stake || 1),
        joinedAt: Date.now(),
        canLeaveAt: null
      };

      room.players.set(telegram_id, player);

      // If room is newly started, set startedAt and prevent leaving for 5 minutes from start
      if (!room.startedAt) {
        room.startedAt = Date.now();
      }
      const leaveLock = (room.startedAt || Date.now()) + 5 * 60 * 1000;
      for (const p of room.players.values()) p.canLeaveAt = leaveLock;

      ws.on('message', message => {
        let data;
        try {
          data = JSON.parse(message);
        } catch (e) {
          return;
        }
        if (data.type === 'input') {
          // change direction
          player.dir = Number(data.dir) || player.dir;
        }
      });

      ws.on('close', () => {
        const p = room.players.get(telegram_id);
        if (!p) return;
        // If leave lock expired, remove player from room, else mark disconnected and keep data
        if (Date.now() >= (p.canLeaveAt || 0)) {
          room.players.delete(telegram_id);
        } else {
          p.ws = null;
          p.disconnectedAt = Date.now();
        }
      });

      // send initial handshake
      try { ws.send(JSON.stringify({ type: 'joined', roomId: room.id, playerId: telegram_id })); } catch(e){}
    })();
  });

  // Game loop per room
  setInterval(() => {
    for (const room of rooms.values()) {
      // Update each player
      for (const player of room.players.values()) {
        if (!player.alive) continue;
        // Move head
        player.x += Math.cos(player.dir) * player.speed;
        player.y += Math.sin(player.dir) * player.speed;

        // keep inside map
        if (player.x < 0 || player.x > MAP_SIZE.width || player.y < 0 || player.y > MAP_SIZE.height) {
          // player dies on border collision
          killPlayer(room, player);
          continue;
        }

        // Add segment
        player.segments.unshift({ x: player.x, y: player.y });
        // Limit segments according to length
        while (player.segments.length > player.length * 5) player.segments.pop();

        // Check collisions with other players bodies
        for (const other of room.players.values()) {
          if (!other.alive) continue;
          if (other.id === player.id) continue;
          // check head-to-body collision
          for (let i = 0; i < other.segments.length; i += 3) {
            const seg = other.segments[i];
            if (!seg) continue;
            if (distance(player, seg) < 6) {
              // head collided with other's body
              killPlayer(room, player);
            }
          }
          // head-on collision: compare size (length)
          const headDist = distance(player, other);
          if (headDist < 6) {
            if (player.length > other.length) {
              // bigger dies per user's rule: "when bigger worm collides head-on with smaller, big dies"
              killPlayer(room, player);
            } else if (player.length < other.length) {
              killPlayer(room, other);
            } else {
              // equal - both die
              killPlayer(room, player);
              killPlayer(room, other);
            }
          }
        }

        // Check balls pickup
        for (let i = room.balls.length - 1; i >= 0; i--) {
          const b = room.balls[i];
          if (distance(player, b) < 10) {
            player.length += 1;
            player.balance += b.value;
            room.balls.splice(i, 1);
            updatePlayerBalance(player.id, player.balance).catch(err => console.error('Failed saving balance', err));
          }
        }
      }

      // Broadcast state
      const payload = {
        type: 'state',
        players: Array.from(room.players.values()).map(p => ({ id: p.id, x: p.x, y: p.y, length: p.length, alive: p.alive, username: p.username })),
        balls: room.balls.map(b => ({ x: b.x, y: b.y, value: b.value })),
        map: MAP_SIZE
      };

      for (const p of room.players.values()) {
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
          try {
            p.ws.send(JSON.stringify(payload));
          } catch (e) {
            // ignore
          }
        }
      }
    }
  }, TICK_RATE);
}

function killPlayer(room, player) {
  if (!player.alive) return;
  player.alive = false;
  // Drop balls along segments
  const totalBalls = Math.max(5, Math.floor(player.length * 2));
  const valuePerBall = Math.max(1, Math.floor((player.balance || 0) / totalBalls));
  for (let i = 0; i < totalBalls; i++) {
    const seg = player.segments[i * Math.max(1, Math.floor(player.segments.length / totalBalls))] || { x: player.x, y: player.y };
    room.balls.push({ x: seg.x + (Math.random() - 0.5) * 8, y: seg.y + (Math.random() - 0.5) * 8, value: valuePerBall });
  }
  // Reset player's length and balance
  player.length = 3;
  player.balance = Math.max(0, (player.balance || 0) - valuePerBall * totalBalls);
  updatePlayerBalance(player.id, player.balance).catch(err => console.error('Failed saving balance', err));
}

// Periodic cleanup: remove empty rooms older than 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of Array.from(rooms.entries())) {
    const activePlayers = Array.from(room.players.values()).filter(p => p.ws || (!p.ws && Date.now() < (p.canLeaveAt || 0)) );
    if (activePlayers.length === 0 && (now - room.createdAt) > 10 * 60 * 1000) {
      rooms.delete(id);
    }
  }
}, 60 * 1000);

module.exports = { initGameServer };
