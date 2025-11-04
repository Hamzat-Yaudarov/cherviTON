from fastapi import FastAPI, APIRouter, HTTPException, WebSocket
from fastapi.websockets import WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime, timezone
import os
import logging
import asyncio
import json
import asyncpg
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# PostgreSQL connection
DB_URL = os.environ.get('NEON_DB_URL', '')
if not DB_URL:
    raise ValueError("❌ NEON_DB_URL environment variable not set")

db_pool = None

# Telegram Bot Token
BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
if not BOT_TOKEN:
    raise ValueError("❌ TELEGRAM_BOT_TOKEN environment variable not set")

app = FastAPI()

# Setup logging FIRST
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add middleware BEFORE routers
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add request logging middleware
@app.middleware("http")
async def log_requests(request, call_next):
    logger.info(f"→ {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        logger.info(f"← {request.method} {request.url.path} - {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"✗ {request.method} {request.url.path} - Error: {e}", exc_info=True)
        raise

api_router = APIRouter(prefix="/api")

# Game state management
active_games: Dict[str, dict] = {}
player_connections: Dict[int, WebSocket] = {}

class Player(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: int
    username: str
    wallet_address: Optional[str] = None
    balance: float = 0.0

class GameRoom(BaseModel):
    model_config = ConfigDict(extra="ignore")
    room_id: str
    bet_amount: float
    players: List[dict] = []
    status: str = "waiting"  # waiting, active, finished
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BetRequest(BaseModel):
    user_id: int
    bet_amount: float  # 1, 3, 5, or 10 TON
    username: str

class WalletConnect(BaseModel):
    user_id: int
    wallet_address: str

class DonationRequest(BaseModel):
    user_id: int
    amount: float
    transaction_hash: str

class WormPosition(BaseModel):
    user_id: int
    x: float
    y: float
    segments: List[dict]
    length: int
    alive: bool

# Database initialization
async def init_db():
    global db_pool
    try:
        logger.info(f"Connecting to database: {DB_URL[:50]}...")
        db_pool = await asyncpg.create_pool(DB_URL, min_size=1, max_size=10, timeout=10)
        logger.info("✅ Database pool created successfully")

        async with db_pool.acquire() as conn:
            logger.info("Creating tables...")
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS players (
                    user_id BIGINT PRIMARY KEY,
                    username TEXT NOT NULL,
                    wallet_address TEXT,
                    balance DECIMAL(20, 9) DEFAULT 0,
                    total_games INTEGER DEFAULT 0,
                    wins INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            ''')

            await conn.execute('''
                CREATE TABLE IF NOT EXISTS transactions (
                    id SERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    transaction_type TEXT NOT NULL,
                    amount DECIMAL(20, 9) NOT NULL,
                    transaction_hash TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT NOW()
                )
            ''')

            await conn.execute('''
                CREATE TABLE IF NOT EXISTS game_history (
                    id SERIAL PRIMARY KEY,
                    room_id TEXT NOT NULL,
                    bet_amount DECIMAL(20, 9) NOT NULL,
                    winner_id BIGINT,
                    players JSONB NOT NULL,
                    duration INTEGER,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            ''')
            logger.info("✅ Tables created successfully")
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}", exc_info=True)
        raise

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Telegram Worm Game API", "status": "running"}

@api_router.post("/player/register")
async def register_player(player: Player):
    async with db_pool.acquire() as conn:
        await conn.execute(
            'INSERT INTO players (user_id, username, wallet_address, balance) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET username = $2',
            player.user_id, player.username, player.wallet_address, player.balance
        )
    return {"status": "success", "message": "Player registered"}

@api_router.get("/player/{user_id}")
async def get_player(user_id: int):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT * FROM players WHERE user_id = $1',
            user_id
        )
        if not row:
            raise HTTPException(status_code=404, detail="Player not found")
        return dict(row)

@api_router.post("/wallet/connect")
async def connect_wallet(wallet: WalletConnect):
    async with db_pool.acquire() as conn:
        await conn.execute(
            'UPDATE players SET wallet_address = $1 WHERE user_id = $2',
            wallet.wallet_address, wallet.user_id
        )
    return {"status": "success", "message": "Wallet connected"}

@api_router.post("/donation/add")
async def add_donation(donation: DonationRequest):
    async with db_pool.acquire() as conn:
        # Add transaction record
        await conn.execute(
            'INSERT INTO transactions (user_id, transaction_type, amount, transaction_hash, status) VALUES ($1, $2, $3, $4, $5)',
            donation.user_id, 'donation', donation.amount, donation.transaction_hash, 'completed'
        )
        
        # Update player balance
        await conn.execute(
            'UPDATE players SET balance = balance + $1 WHERE user_id = $2',
            donation.amount, donation.user_id
        )
    
    return {"status": "success", "message": "Donation added", "amount": donation.amount}

@api_router.post("/game/create-room")
async def create_game_room(bet: BetRequest):
    if bet.bet_amount not in [1, 3, 5, 10]:
        raise HTTPException(status_code=400, detail="Invalid bet amount. Choose 1, 3, 5, or 10 TON")
    
    async with db_pool.acquire() as conn:
        player = await conn.fetchrow('SELECT * FROM players WHERE user_id = $1', bet.user_id)
        if not player or player['balance'] < bet.bet_amount:
            raise HTTPException(status_code=400, detail="Insufficient balance")
    
    room_id = f"room_{bet.user_id}_{int(datetime.now(timezone.utc).timestamp())}"
    
    active_games[room_id] = {
        "room_id": room_id,
        "bet_amount": bet.bet_amount,
        "players": [{"user_id": bet.user_id, "username": bet.username, "ready": True}],
        "status": "waiting",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    return {"status": "success", "room_id": room_id, "bet_amount": bet.bet_amount}

@api_router.get("/game/rooms")
async def get_available_rooms():
    available = [room for room in active_games.values() if room["status"] == "waiting" and len(room["players"]) < 10]
    return {"rooms": available}

@api_router.post("/game/join/{room_id}")
async def join_game_room(room_id: str, bet: BetRequest):
    if room_id not in active_games:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room = active_games[room_id]
    
    if room["bet_amount"] != bet.bet_amount:
        raise HTTPException(status_code=400, detail="Bet amount doesn't match room")
    
    if len(room["players"]) >= 10:
        raise HTTPException(status_code=400, detail="Room is full")
    
    async with db_pool.acquire() as conn:
        player = await conn.fetchrow('SELECT * FROM players WHERE user_id = $1', bet.user_id)
        if not player or player['balance'] < bet.bet_amount:
            raise HTTPException(status_code=400, detail="Insufficient balance")
    
    room["players"].append({"user_id": bet.user_id, "username": bet.username, "ready": True})
    
    if len(room["players"]) >= 2:
        room["status"] = "active"
    
    return {"status": "success", "room": room}

@api_router.post("/game/end")
async def end_game(room_id: str, winner_id: int, results: dict):
    if room_id not in active_games:
        raise HTTPException(status_code=404, detail="Room not found")
    
    room = active_games[room_id]
    bet_amount = room["bet_amount"]
    players = room["players"]
    
    # Calculate winnings distribution
    async with db_pool.acquire() as conn:
        # Deduct bets from all players
        for player in players:
            await conn.execute(
                'UPDATE players SET balance = balance - $1, total_games = total_games + 1 WHERE user_id = $2',
                bet_amount, player["user_id"]
            )
        
        # Add winnings based on orbs collected
        for user_id, orbs_collected in results.items():
            if orbs_collected > 0:
                winnings = (orbs_collected / 100.0) * (bet_amount * len(players))
                await conn.execute(
                    'UPDATE players SET balance = balance + $1 WHERE user_id = $2',
                    winnings, int(user_id)
                )
        
        # Update winner stats
        if winner_id:
            await conn.execute(
                'UPDATE players SET wins = wins + 1 WHERE user_id = $1',
                winner_id
            )
        
        # Save game history
        await conn.execute(
            'INSERT INTO game_history (room_id, bet_amount, winner_id, players) VALUES ($1, $2, $3, $4)',
            room_id, bet_amount, winner_id, json.dumps(players)
        )
    
    del active_games[room_id]
    
    return {"status": "success", "message": "Game ended"}

# WebSocket for real-time game
@app.websocket("/ws/game/{room_id}/{user_id}")
async def game_websocket(websocket: WebSocket, room_id: str, user_id: int):
    await websocket.accept()
    player_connections[user_id] = websocket
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Broadcast to all players in the room
            if room_id in active_games:
                room = active_games[room_id]
                for player in room["players"]:
                    player_id = player["user_id"]
                    if player_id in player_connections and player_id != user_id:
                        try:
                            await player_connections[player_id].send_text(data)
                        except:
                            pass
    
    except WebSocketDisconnect:
        if user_id in player_connections:
            del player_connections[user_id]

app.include_router(api_router)

@app.on_event("startup")
async def startup():
    await init_db()
    logger.info("Database initialized")

@app.on_event("shutdown")
async def shutdown():
    if db_pool:
        await db_pool.close()

# Serve React frontend static files
frontend_build_dir = Path(__file__).parent / "public"

# Log frontend directory status
if frontend_build_dir.exists():
    logger.info(f"✅ Frontend build directory found at: {frontend_build_dir}")
    logger.info(f"   Contents: {list(frontend_build_dir.iterdir())[:5]}")

    # Mount static files
    static_dir = frontend_build_dir / "static"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
        logger.info(f"✅ Static files mounted from: {static_dir}")
    else:
        logger.warning(f"⚠️  Static directory not found at: {static_dir}")
else:
    logger.error(f"❌ Frontend build directory NOT FOUND at: {frontend_build_dir}")
    logger.error(f"   Current directory: {Path(__file__).parent}")
    logger.error(f"   Available directories: {list(Path(__file__).parent.iterdir())}")

# Frontend serving handlers - MUST be defined AFTER router inclusion
@app.get("/")
async def serve_index():
    """Serve React app root"""
    try:
        index_file = frontend_build_dir / "index.html"
        if index_file.exists():
            logger.debug(f"Serving index.html from {index_file}")
            return FileResponse(index_file, media_type="text/html")
        logger.error(f"index.html not found at {index_file}")
        raise HTTPException(status_code=404, detail="index.html not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving index.html: {e}")
        raise HTTPException(status_code=500, detail="Error serving frontend")

@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    """Serve React app for all non-API/WS routes"""
    try:
        # Don't intercept API and WebSocket routes
        if full_path.startswith("api/") or full_path.startswith("ws/"):
            raise HTTPException(status_code=404, detail="Not found")

        # Try to serve static file
        file_path = frontend_build_dir / full_path
        try:
            # Resolve paths to check if file is within frontend_build_dir
            if file_path.is_file() and str(file_path.resolve()).startswith(str(frontend_build_dir.resolve())):
                logger.debug(f"Serving file: {full_path}")
                return FileResponse(file_path)
        except Exception as e:
            logger.debug(f"Error serving file {full_path}: {e}")

        # Return index.html for all other routes (SPA routing)
        index_file = frontend_build_dir / "index.html"
        if index_file.exists():
            logger.debug(f"Serving SPA route: {full_path} -> index.html")
            return FileResponse(index_file, media_type="text/html")

        logger.warning(f"Frontend file not found: {full_path}, index.html missing")
        raise HTTPException(status_code=404, detail="Frontend file not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving frontend route {full_path}: {e}")
        raise HTTPException(status_code=500, detail="Error serving frontend")
