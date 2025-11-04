import express from 'express';
import path from 'path';
import http from 'http';
import { WebSocketServer } from 'ws';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Telegraf, Markup } from 'telegraf';
import { initDb, getUserByUsername, createUserIfNotExists, updateUserBalance, transferBalance, setWalletAddress, recordTransaction } from '../db/client.js';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const __dirname = path.resolve();
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Simple in-memory game state for demonstration
const GAME = {
  players: new Map(), // username -> {ws, snake, length, alive, color}
  foods: [],
  tickInterval: null,
};

function randColor() {
  return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
}

function spawnFood(x, y, value=1) {
  const food = { id: Date.now() + Math.random(), x, y, value };
  GAME.foods.push(food);
}

function initGameLoop() {
  if (GAME.tickInterval) return;
  GAME.tickInterval = setInterval(() => {
    // move snakes
    for (const [username, p] of GAME.players) {
      if (!p.alive) continue;
      const head = p.snake[0];
      head.x += p.vx;
      head.y += p.vy;
      // wall collision
      if (head.x < 0 || head.x > 1000 || head.y < 0 || head.y > 600) {
        handleDeath(username);
        continue;
      }
      // append new head
      p.snake.unshift({ x: head.x, y: head.y });
      while (p.snake.length > p.length) p.snake.pop();
    }

    // collisions between snakes
    const playersArray = Array.from(GAME.players.entries());
    for (let i=0;i<playersArray.length;i++){
      const [aName,a]=playersArray[i];
      if(!a.alive) continue;
      const aHead = a.snake[0];
      for (let j=0;j<playersArray.length;j++){
        if(i===j) continue;
        const [bName,b]=playersArray[j];
        if(!b.alive) continue;
        // check head-to-body
        for(let k=0;k<b.snake.length;k++){
          const seg = b.snake[k];
          const dx = aHead.x - seg.x; const dy = aHead.y - seg.y;
          if(Math.hypot(dx,dy) < 10){
            // head-on between heads
            if(k===0){
              // head-on collision: per rules larger dies when head-on
              if(a.length > b.length){
                handleDeath(aName);
              } else if(a.length < b.length){
                handleDeath(bName);
              } else {
                // equal - both die
                handleDeath(aName);
                handleDeath(bName);
              }
            } else {
              // a dies colliding into body of b
              handleDeath(aName);
            }
            break;
          }
        }
      }
    }

    // food collection
    for (const [uname, p] of GAME.players) {
      if (!p.alive) continue;
      const head = p.snake[0];
      for (let i = GAME.foods.length - 1; i >= 0; i--) {
        const f = GAME.foods[i];
        const d = Math.hypot(head.x - f.x, head.y - f.y);
        if (d < 12) {
          p.length += f.value;
          GAME.foods.splice(i,1);
          // credit user with TON for collected food
          updateUserBalance(uname, f.value).catch(console.error);
        }
      }
    }

    // broadcast state
    const state = {
      players: Array.from(GAME.players.values()).map(p=>({username:p.username,length:p.length, snake:p.snake, color:p.color, alive:p.alive})),
      foods: GAME.foods,
    };
    const payload = JSON.stringify({type:'state', state});
    for (const [,p] of GAME.players){
      if(p.ws && p.ws.readyState===p.ws.OPEN) p.ws.send(payload);
    }
  }, 1000/15);
}

function stopGameLoop(){
  if(GAME.tickInterval) clearInterval(GAME.tickInterval);
  GAME.tickInterval = null;
}

async function handleDeath(username){
  const p = GAME.players.get(username);
  if(!p || !p.alive) return;
  p.alive = false;
  // spawn foods along body, distributing pot (TON) if present
  const body = p.snake || [];
  const segCount = Math.max(1, body.length);
  let pot = p.pot || 0;
  if(pot > 0){
    const base = Math.floor(pot / segCount);
    let rem = pot - base * segCount;
    for(let i=0;i<segCount;i++){
      const seg = body[i] || {x: Math.random()*900+50, y: Math.random()*400+50};
      const val = base + (rem>0 ? 1 : 0);
      if(rem>0) rem--;
      if(val>0) spawnFood(seg.x, seg.y, val);
    }
  } else {
    for (const seg of body){
      spawnFood(seg.x, seg.y, 1);
    }
  }
  p.pot = 0;
  // update DB: transfers happen when collected via food collection logic
}

wss.on('connection', (ws, req)=>{
  ws.isAlive = true;
  ws.on('pong', ()=> ws.isAlive = true);
  ws.on('message', async (msg)=>{
    try{
      const data = JSON.parse(msg.toString());
      if(data.type==='join'){
        const username = data.username || ('anon'+Math.floor(Math.random()*10000));
        await createUserIfNotExists(username);
        const user = await getUserByUsername(username);
        // check bet
        const bet = Number(data.bet || 0);
        if(bet>0 && user && Number(user.balance) < bet){
          ws.send(JSON.stringify({type:'error', message:'Недостаточно баланса'}));
          return;
        }
        if(bet>0){
          // deduct bet
          await updateUserBalance(username, -bet);
        }
        const player = {
          ws,
          username,
          snake:[{x:Math.random()*800+50, y:Math.random()*400+50}],
          vx:0, vy:0,
          length: 10 + Math.floor(Math.random()*10),
          alive: true,
          color: randColor(),
          pot: bet || 0,
        };
        GAME.players.set(username, player);
        initGameLoop();
        ws.send(JSON.stringify({type:'joined', username}));
      } else if(data.type==='move'){
        const p = GAME.players.get(data.username);
        if(p && p.alive){
          // normalize velocity
          const speed = 4;
          const len = Math.hypot(data.vx, data.vy) || 1;
          p.vx = (data.vx/len)*speed;
          p.vy = (data.vy/len)*speed;
        }
      } else if(data.type==='leave'){
        const name = data.username;
        GAME.players.delete(name);
        if(GAME.players.size===0) stopGameLoop();
      }
    }catch(err){console.error('ws msg err',err)}
  });
  ws.on('close', ()=>{
    // find and remove player by ws
    for(const [k,p] of GAME.players){
      if(p.ws===ws) GAME.players.delete(k);
    }
    if(GAME.players.size===0) stopGameLoop();
  });
});

// API endpoints
app.get('/api/user', async (req,res)=>{
  const username = String(req.query.username||'').trim();
  if(!username) return res.status(400).json({error:'username required'});
  const user = await createUserIfNotExists(username);
  res.json({user});
});

app.post('/api/deposit', async (req,res)=>{
  const { username, amount } = req.body;
  if(!username || !amount) return res.status(400).json({error:'username and amount required'});
  const amt = Number(amount);
  if(isNaN(amt) || amt<=0) return res.status(400).json({error:'invalid amount'});
  await updateUserBalance(username, amt);
  res.json({ok:true});
});

// Wallet connect endpoints (simulation). For production integrate TON Connect / Telegram Wallet verification.
app.post('/api/wallet/connect', async (req,res)=>{
  const { username, wallet } = req.body;
  if(!username || !wallet) return res.status(400).json({error:'username and wallet required'});
  await createUserIfNotExists(username);
  await setWalletAddress(username, wallet);
  res.json({ok:true});
});

app.get('/api/wallet/info', async (req,res)=>{
  const username = String(req.query.username||'').trim();
  if(!username) return res.status(400).json({error:'username required'});
  const user = await getUserByUsername(username);
  res.json({wallet: user ? user.wallet_address : null, balance: user ? Number(user.balance) : 0});
});

// In production this endpoint should be called after on-chain transfer verification (webhook) or by signed proof from wallet
app.post('/api/wallet/deposit_notify', async (req,res)=>{
  const { username, amount } = req.body;
  if(!username || !amount) return res.status(400).json({error:'username and amount required'});
  const amt = Number(amount);
  if(isNaN(amt) || amt<=0) return res.status(400).json({error:'invalid amount'});
  await updateUserBalance(username, amt);
  res.json({ok:true});
});

// TON Connect simulation endpoints
app.post('/api/ton/connect', async (req,res)=>{
  // Expected: { username, wallet, proof }
  const { username, wallet, proof } = req.body;
  if(!username || !wallet) return res.status(400).json({error:'username and wallet required'});
  // In real implementation verify proof using TON libs; here we accept as simulation
  await createUserIfNotExists(username);
  await setWalletAddress(username, wallet);
  await recordTransaction(username, 0, 'wallet_connect', {wallet, proof});
  res.json({ok:true, wallet});
});

app.post('/api/ton/deposit_webhook', async (req,res)=>{
  // Expected: { wallet, amount, external_tx_id }
  const { wallet, amount, external_tx_id } = req.body;
  if(!wallet || !amount) return res.status(400).json({error:'wallet and amount required'});
  // Find user by wallet
  const { poolQuery } = await import('../db/client.js');
  const q = await poolQuery("SELECT username FROM users WHERE wallet_address=$1", [wallet]).catch(()=>null);
  const username = q && q.rows && q.rows[0] ? q.rows[0].username : null;
  if(!username) return res.status(404).json({error:'user not found'});
  const amt = Number(amount);
  if(isNaN(amt) || amt<=0) return res.status(400).json({error:'invalid amount'});
  await updateUserBalance(username, amt);
  await recordTransaction(username, amt, 'deposit_onchain', {external_tx_id});
  res.json({ok:true});
});

// initialize DB and start services
(async ()=>{
  await initDb();

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if(botToken){
    try{
      const bot = new Telegraf(botToken, {telegram: {webhookReply: true}});
      function sanitizeWebAppUrl(raw){
        if(!raw) return '';
        let s = String(raw).trim();
        // remove wrapping quotes
        if((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))){
          s = s.slice(1,-1);
        }
        // remove trailing commas
        s = s.replace(/,\s*$/,'');
        s = s.trim();
        return s;
      }

      bot.start(async (ctx)=>{
        const username = ctx.from.username || ctx.from.first_name || ('user'+ctx.from.id);
        const rawWeb = sanitizeWebAppUrl(process.env.WEB_APP_URL || '');
        const webAppBase = rawWeb || '';
        const url = `${webAppBase}${webAppBase.includes('?') ? '&' : '?'}username=${encodeURIComponent(username)}`;
        await createUserIfNotExists(username);
        await ctx.reply('Добро пожаловать! Нажмите кнопку, чтобы открыть мини-игру.', Markup.inlineKeyboard([
          Markup.button.webApp('Начать игру', url)
        ]));
      });
      // basic command to check balance
      bot.command('balance', async (ctx)=>{
        const username = ctx.from.username || ctx.from.first_name || ('user'+ctx.from.id);
        const user = await createUserIfNotExists(username);
        await ctx.reply(`Ваш баланс: ${user.balance} TON`);
      });
      // Try starting bot with polling; if polling is disabled on the Telegram side (409), fallback to webhook
      try{
        await bot.launch();
        console.log('Telegram bot started (polling)');
      }catch(err){
        console.warn('Bot polling failed, attempting webhook mode:', err && err.description ? err.description : err.message || err);
        try{
          const webUrlRaw = sanitizeWebAppUrl(process.env.WEB_APP_URL || '');
          if(!webUrlRaw) throw new Error('WEB_APP_URL not set, cannot configure webhook');
          const webUrl = webUrlRaw.startsWith('http') ? webUrlRaw : `https://${webUrlRaw}`;
          const hookPath = '/telegram-webhook';
          // mount webhook route explicitly
          app.post(hookPath, express.json(), (req,res,next)=> bot.webhookCallback(hookPath)(req,res).catch(next));
          // ensure no duplicated slashes
          const full = webUrl.endsWith('/') ? webUrl.slice(0,-1) + hookPath : webUrl + hookPath;
          await bot.telegram.setWebhook(full);
          console.log('Telegram webhook set to', full);
        }catch(inner){
          console.error('Failed to set webhook for Telegram bot:', inner);
        }
      }
      console.log('Telegram bot setup complete');
    }catch(err){console.error('bot err',err)}
  } else {
    console.warn('TELEGRAM_BOT_TOKEN not set, bot disabled');
  }

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, ()=>console.log('Server listening on', PORT));
})();
