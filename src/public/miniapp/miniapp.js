import { TonConnect } from 'https://unpkg.com/@tonconnect/sdk@1.8.3/dist/tonconnect.browser.js';

(function(){
  // Utils
  function qs(selector, el=document) { return el.querySelector(selector); }
  function qsa(selector, el=document) { return Array.from(el.querySelectorAll(selector)); }
  function getQuery() { return Object.fromEntries(new URLSearchParams(location.search)); }

  const query = getQuery();
  const telegram_id = query.telegram_id;
  const usernameParam = decodeURIComponent(query.username || 'Player');

  const playerNickEl = qs('#playerNick');
  const playerBalanceEl = qs('#playerBalance');
  const balanceBtn = qs('#balanceBtn');
  const connectWalletBtn = qs('#connectWallet');
  const playBtn = qs('#playBtn');
  const stakesEl = qs('#stakes');
  const modal = qs('#modal');
  const modalClose = qs('#modalClose');
  const modalTopup = qs('#modalTopup');
  const gameArea = qs('#gameArea');
  const canvas = qs('#gameCanvas');
  const ctx = canvas.getContext('2d');

  let selectedStake = 1;
  let balance = 0;
  let ws = null;
  let playerId = telegram_id;
  let leaveLockedUntil = null;
  let leaveTimerEl = qs('#leaveTimer');

  playerNickEl.textContent = usernameParam;

  function setBalance(b) { balance = b; playerBalanceEl.innerHTML = `TON: ${balance} <button id="balanceBtn">Пополнить</button> <span id="leaveTimer" class="leave-timer" style="margin-left:12px;font-size:13px;color:#cbd5e1"></span>`; const btn = qs('#balanceBtn'); btn && btn.addEventListener('click', onBalanceClick); leaveTimerEl = qs('#leaveTimer'); }

  function startLeaveTimer(ms) {
    leaveLockedUntil = Date.now() + ms;
    const iv = setInterval(()=>{
      const rem = Math.max(0, leaveLockedUntil - Date.now());
      const m = Math.floor(rem/60000); const s = Math.floor((rem%60000)/1000);
      if (leaveTimerEl) leaveTimerEl.textContent = rem>0 ? `Нельзя выйти: ${m}:${String(s).padStart(2,'0')}` : '';
      if (rem <= 0) clearInterval(iv);
    }, 500);
  }

  async function fetchPlayer() {
    if (!telegram_id) return;
    try {
      const res = await fetch(`/api/player?telegram_id=${encodeURIComponent(telegram_id)}&username=${encodeURIComponent(usernameParam)}`);
      const data = await res.json();
      setBalance(Number(data.balance || 0));
    } catch (e) {
      console.error(e);
    }
  }

  function onBalanceClick() {
    modal.style.display = 'flex';
  }

  modalClose.addEventListener('click', () => modal.style.display = 'none');
  modalTopup.addEventListener('click', async () => {
    // Demo topup: call server endpoint to top up
    try {
      const res = await fetch(`/api/player/${encodeURIComponent(telegram_id)}/topup`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amount: 10 }) });
      const j = await res.json();
      if (j && j.balance !== undefined) setBalance(Number(j.balance));
    } catch (e) { console.error(e); }
    modal.style.display = 'none';
  });

  // TX reporting
  const txHashInput = qs('#txHashInput');
  const reportTxBtn = qs('#reportTxBtn');
  const gameAddressEl = qs('#gameAddress');
  if (gameAddressEl) gameAddressEl.textContent = (window.GAME_TON_ADDRESS || '{{GAME_TON_ADDRESS}}');

  reportTxBtn && reportTxBtn.addEventListener('click', async () => {
    const txHash = txHashInput && txHashInput.value && txHashInput.value.trim();
    if (!txHash) return alert('Введите txHash');
    try {
      const res = await fetch(`/api/player/${encodeURIComponent(telegram_id)}/report_tx`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash }) });
      const j = await res.json();
      if (!res.ok) return alert(j && j.error ? j.error : 'Ошибка при проверке транзакции');
      setBalance(Number(j.balance || 0));
      alert(`Зачислено ${j.credited} TON`);
    } catch (e) {
      console.error(e);
      alert('Ошибка сети при проверке транзакции');
    }
  });

  // TonConnect setup
  const connector = new TonConnect({ manifestUrl: 'https://cherviton-production.up.railway.app/miniapp/tonconnect-manifest.json' });

  connectWalletBtn.addEventListener('click', async () => {
    try {
      await connector.connect();
      // try to obtain wallet address from known places
      const walletAddr = (connector && connector.account && connector.account.address) || (connector.wallet && connector.wallet.account && connector.wallet.account.address) || null;
      if (!walletAddr) {
        // Some implementations require waiting for "connect" event
        // Fallback: read from connector.transport?.endpoint
        console.warn('Wallet connected but address not found immediately');
      }
      connectWalletBtn.textContent = walletAddr ? `Кошелек: ${walletAddr}` : 'Кошелек подключён';
      connectWalletBtn.disabled = true;

      // send wallet mapping to server
      if (walletAddr && telegram_id) {
        try {
          await fetch(`/api/player/${encodeURIComponent(telegram_id)}/link_wallet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet_address: walletAddr }) });
        } catch (e) { console.error('Failed linking wallet with server', e); }
      }
    } catch (err) {
      console.error('Ошибка подключения', err);
      alert('Не удалось подключить кошелёк');
    }
  });

  qsa('.stake').forEach(btn => btn.addEventListener('click', (e) => {
    qsa('.stake').forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active');
    selectedStake = Number(e.target.dataset.stake);
  }));

  playBtn.addEventListener('click', async () => {
    // Must have wallet connected in this demo
    if (!connectWalletBtn.disabled) { modal.style.display = 'flex'; return; }
    // Place bet via API (deduct stake)
    try {
      const res = await fetch(`/api/player/${encodeURIComponent(telegram_id)}/bet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stake: selectedStake }) });
      const j = await res.json();
      if (!res.ok) {
        alert(j && j.error ? j.error : 'Не удалось сделать ставку');
        return;
      }
      setBalance(Number(j.balance || 0));
    } catch (e) {
      console.error(e);
      alert('Ошибка сети при попытке сделать ставку');
      return;
    }

    startGame();
  });

  // Game rendering
  let state = null;

  function startGame() {
    // Show canvas
    document.querySelector('.lobby').style.display = 'none';
    gameArea.style.display = 'block';

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${location.host}/ws?telegram_id=${encodeURIComponent(telegram_id)}&username=${encodeURIComponent(usernameParam)}&stake=${selectedStake}`;
    ws = new WebSocket(wsUrl);

    // start local leave timer for 5 minutes
    startLeaveTimer(5 * 60 * 1000);

    ws.addEventListener('open', ()=> console.log('ws open'));
    ws.addEventListener('message', evt => {
      try { const data = JSON.parse(evt.data); if (data.type === 'state') state = data; }
      catch(e){console.error(e);} 
    });

    // Input handling
    window.addEventListener('mousemove', (e)=>{
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
      // compute direction from player's position if known
      if (!state) return;
      const me = state.players.find(p => p.id === playerId) || { x: canvas.width/2, y: canvas.height/2 };
      const dir = Math.atan2(my - me.y, mx - me.x);
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', dir }));
    });

    // Render loop
    requestAnimationFrame(renderLoop);
  }

  function renderLoop() {
    if (state) {
      // clear
      ctx.fillStyle = '#071024';
      ctx.fillRect(0,0,canvas.width,canvas.height);

      // draw balls
      for (const b of state.balls) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, Math.PI*2); ctx.fill();
      }

      // draw players
      for (const p of state.players) {
        ctx.fillStyle = p.id === playerId ? '#10b981' : '#60a5fa';
        // draw head
        ctx.beginPath(); ctx.arc(p.x, p.y, 6 + p.length*0.6, 0, Math.PI*2); ctx.fill();
        // draw body as series of circles (simple)
        for (let i = 1; i < p.length * 5 && i < 100; i += 3) {
          ctx.globalAlpha = 0.8 - i*0.002;
          ctx.beginPath(); ctx.arc(p.x - i, p.y - i, Math.max(2, 6 + (p.length - i*0.02)), 0, Math.PI*2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // HUD
      ctx.fillStyle = '#fff';
      ctx.font = '14px Arial';
      ctx.fillText(`Игроков на сервере: ${state.players.length}`, 10, 18);
    }
    requestAnimationFrame(renderLoop);
  }

  // Initial load
  fetchPlayer();
  // fetch server config (game address)
  (async ()=>{ try { const r = await fetch('/api/config'); if (r.ok) { const c = await r.json(); window.GAME_TON_ADDRESS = c.GAME_TON_ADDRESS; const ga = qs('#gameAddress'); if (ga) ga.textContent = c.GAME_TON_ADDRESS || 'GAME_TON_ADDRESS'; } } catch(e){} })();

})();
