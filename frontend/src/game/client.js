export class GameClient {
    constructor(canvas, tgId, betAmount, callbacks = {}) {
        Object.defineProperty(this, "canvas", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ctx", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "ws", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "tgId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "betAmount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "playerId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "direction", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "gameState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: { players: [], pellets: [] }
        });
        Object.defineProperty(this, "callbacks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "animationFrameId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "lastDirectionSent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.tgId = tgId;
        this.betAmount = betAmount;
        this.callbacks = callbacks;
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    resizeCanvas() {
        const container = this.canvas.parentElement;
        if (container) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight - 120;
        }
    }
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                // Construct WebSocket URL
                // In dev: connect to localhost:8080 backend
                // In prod: connect to same host as frontend
                let wsUrl;
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    // Development: connect to backend on port 8080
                    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                    wsUrl = `${protocol}//localhost:8080/?tg_id=${this.tgId}`;
                }
                else {
                    // Production: connect to same host as frontend
                    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                    wsUrl = `${protocol}//${window.location.host}/?tg_id=${this.tgId}`;
                }
                console.log('Connecting to WebSocket:', wsUrl);
                this.ws = new WebSocket(wsUrl);
                // Set timeout for connection
                const connectionTimeout = setTimeout(() => {
                    if (this.playerId === null) {
                        console.error('WebSocket connection timeout');
                        this.ws?.close();
                        reject(new Error('Game connection timeout - please try again'));
                    }
                }, 10000); // 10 second timeout
                this.ws.onopen = () => {
                    console.log('WebSocket connected, sending join message');
                    this.sendMessage({
                        type: 'join',
                        payload: { betAmount: this.betAmount }
                    });
                };
                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        console.log('Received WebSocket message:', message.type);
                        this.handleMessage(message);
                        if (message.type === 'joined') {
                            clearTimeout(connectionTimeout);
                            this.playerId = message.player.id;
                            console.log('Game joined, player ID:', this.playerId);
                            resolve();
                            this.startRenderLoop();
                        }
                        else if (message.type === 'error') {
                            clearTimeout(connectionTimeout);
                            console.error('Game error:', message.message);
                            reject(new Error(message.message || 'Game connection error'));
                        }
                    }
                    catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                };
                this.ws.onerror = (error) => {
                    clearTimeout(connectionTimeout);
                    console.error('WebSocket error:', error);
                    reject(new Error('WebSocket connection failed'));
                };
                this.ws.onclose = () => {
                    clearTimeout(connectionTimeout);
                    console.log('WebSocket closed');
                    if (this.callbacks.onGameOver && this.playerId) {
                        this.callbacks.onGameOver(Math.floor(this.gameState.player?.score ?? 0), 0);
                    }
                };
            }
            catch (error) {
                reject(error);
            }
        });
    }
    handleMessage(message) {
        switch (message.type) {
            case 'joined':
                console.log('Joined game:', message);
                break;
            case 'state':
                this.updateGameState(message.gameState);
                break;
            case 'error':
                console.error('Game error:', message.message);
                this.callbacks.onError?.(message.message);
                break;
        }
    }
    updateGameState(state) {
        // Find own player
        const ownPlayer = state.players.find((p) => p.id === this.playerId);
        if (ownPlayer) {
            this.gameState = {
                player: ownPlayer,
                players: state.players,
                pellets: state.pellets
            };
        }
        else if (this.gameState.player && !this.gameState.player.alive) {
            // Player is dead
            const earnings = Math.floor((this.gameState.player.score ?? 0) * 0.1);
            this.callbacks.onGameOver?.(Math.floor(this.gameState.player.score ?? 0), earnings);
        }
        this.callbacks.onStateUpdate?.(this.gameState);
    }
    setDirection(direction) {
        this.direction = direction;
        // Send direction update every 100ms to avoid flooding
        const now = Date.now();
        if (now - this.lastDirectionSent > 100) {
            this.sendMessage({
                type: 'move',
                payload: { direction }
            });
            this.lastDirectionSent = now;
        }
    }
    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
    startRenderLoop() {
        const render = () => {
            this.render();
            this.animationFrameId = requestAnimationFrame(render);
        };
        this.animationFrameId = requestAnimationFrame(render);
    }
    render() {
        const { width, height } = this.canvas;
        const ctx = this.ctx;
        // Clear canvas
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);
        // Draw grid
        this.drawGrid();
        // Draw pellets
        this.drawPellets();
        // Draw players
        this.drawPlayers();
        // Draw own player info
        if (this.gameState.player) {
            this.drawPlayerInfo();
        }
    }
    drawGrid() {
        const ctx = this.ctx;
        const gridSize = 50;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let x = 0; x < this.canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < this.canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.canvas.width, y);
            ctx.stroke();
        }
    }
    drawPellets() {
        const ctx = this.ctx;
        this.gameState.pellets.forEach(pellet => {
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(pellet.x % this.canvas.width, pellet.y % this.canvas.height, pellet.size + 1, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    drawPlayers() {
        const ctx = this.ctx;
        this.gameState.players.forEach(player => {
            const isOwnPlayer = player.id === this.playerId;
            // Draw body
            ctx.fillStyle = isOwnPlayer ? '#00ff00' : `hsl(${Math.random() * 360}, 100%, 50%)`;
            player.body.forEach((segment, index) => {
                const opacity = 1 - (index / player.body.length) * 0.5;
                ctx.globalAlpha = opacity;
                ctx.beginPath();
                ctx.arc(segment.x % this.canvas.width, segment.y % this.canvas.height, player.size * 0.8, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
            // Draw head
            ctx.fillStyle = isOwnPlayer ? '#00ff00' : '#ff6b00';
            const head = player.body[0] || { x: player.x, y: player.y };
            ctx.beginPath();
            ctx.arc(head.x % this.canvas.width, head.y % this.canvas.height, player.size, 0, Math.PI * 2);
            ctx.fill();
            // Draw username
            if (isOwnPlayer) {
                ctx.fillStyle = '#00ff00';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(player.username, head.x % this.canvas.width, (head.y % this.canvas.height) - player.size - 5);
            }
        });
    }
    drawPlayerInfo() {
        // Player info drawn in stats panel outside canvas
    }
    disconnect() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.sendMessage({ type: 'leave' });
            }
            this.ws.close();
            this.ws = null;
        }
    }
}
//# sourceMappingURL=client.js.map