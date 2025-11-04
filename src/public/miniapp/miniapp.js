(function(){
  // Utils
  function qs(selector, el=document) { return el.querySelector(selector); }
  function qsa(selector, el=document) { return Array.from(el.querySelectorAll(selector)); }
  function getQuery() { return Object.fromEntries(new URLSearchParams(location.search)); }

  const query = getQuery();
  // Allow telegram WebApp init data to override query params
  let telegram_id = query.telegram_id || null;
  let usernameParam = decodeURIComponent(query.username || 'Player');

  // If running inside Telegram Web App, prefer initData user
  if (window.Telegram && window.Telegram.WebApp) {
    try {
      const tg = window.Telegram.WebApp;
      const init = tg.initDataUnsafe || {};
      const user = init.user || {};
      if (user && user.id) telegram_id = String(user.id);
      if (user && (user.username || user.first_name)) {
        usernameParam = user.username || (user.first_name + (user.last_name ? ' ' + user.last_name : ''));
      }
      // optionally expand UI
      try { tg.expand && tg.expand(); } catch(e){}

      // Send initData to server for debugging
      try {
        const debugPayload = { initData: tg.initData || null, initDataUnsafe: tg.initDataUnsafe || null };
        fetch('/api/debug/tonconnect', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ telegram_init: debugPayload }) }).catch(e=>console.warn('debug send failed', e));
        // If initData/user is missing, show it to the user so they can paste logs for us
        if (!(tg.initData || tg.initDataUnsafe) || !(tg.initDataUnsafe && tg.initDataUnsafe.user)) {
          try {
            const info = JSON.stringify({ initData: tg.initData || null, initDataUnsafe: tg.initDataUnsafe || null }, null, 2);
            // show a dismissible overlay instead of alert for better UX
            const dbg = document.createElement('pre'); dbg.style.position='fixed'; dbg.style.left='8px'; dbg.style.right='8px'; dbg.style.bottom='8px'; dbg.style.maxHeight='40%'; dbg.style.overflow='auto'; dbg.style.background='rgba(0,0,0,0.8)'; dbg.style.color='#fff'; dbg.style.padding='12px'; dbg.style.zIndex='9999'; dbg.style.borderRadius='8px'; dbg.textContent = 'Telegram initData (debug):\n' + info + '\n\nСкопируйте и пришлите это в чат поддержки.';
            const close = document.createElement('button'); close.textContent='Закрыть'; close.style.marginLeft='8px'; close.onclick = ()=>{ dbg.remove(); };
            dbg.appendChild(document.createElement('br'));
            dbg.appendChild(close);
            document.body.appendChild(dbg);
          } catch(e) { console.warn('show debug failed', e); }
        }
      } catch(e) { console.warn('debug send error', e); }
    } catch(e) { console.warn('Telegram WebApp parse error', e); }
  }

  const playerNickEl = qs('#playerNick');
  const playerBalanceEl = qs('#playerBalance');
  const balanceBtn = qs('#balanceBtn');
  const connectWalletBtn = qs('#connectWallet');
  const playBtn = qs('#playBtn');
  const stakesEl = qs('#stakes');
  const modal = qs('#modal');
  const modalClose = qs('#modalClose');
  const modalTopup = qs('#modalTopup');
  const modalCheckBtn = qs('#modalCheck');
  const modalPayBtn = qs('#modalPay');
  const topupAmountInput = qs('#topupAmount');
  const topupPreset10 = qs('#topupPreset10');
  const gameArea = qs('#gameArea');
  const canvas = qs('#gameCanvas');
  const ctx = canvas.getContext('2d');

  // TonConnect UI initialization and game address
  let tonConnectUI = null;
  let gameAddress = null;
  (async function initTonConnect(){
    try {
      const cfg = await fetch('/api/ton/config').then(r=>r.json());
      gameAddress = cfg && cfg.gameAddress;
      if (window.TON_CONNECT_UI) {
        try {
          tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({ manifestUrl: '/miniapp/manifest.json' });
        } catch(e) { console.warn('TonConnectUI init failed', e); tonConnectUI = null; }
      }
    } catch(e) { console.error('initTonConnect error', e); }
  })();

  let selectedStake = 1;
  let balance = 0;
  let ws = null;
  let playerId = telegram_id;
  let leaveLockedUntil = null;
  let leaveTimerEl = qs('#leaveTimer');

  playerNickEl.textContent = usernameParam;

  // If inside Telegram, attempt to auto-open wallet connect modal (user still must confirm)
  if (window.Telegram && window.Telegram.WebApp) {
    setTimeout(()=>{
      // open wallet modal and try to initiate TonConnect connect (may be blocked in some clients)
      qs('#walletModal').style.display = 'flex';
      // try to auto-click TonConnect button
      setTimeout(()=>{ try { qs('#tcConnect') && qs('#tcConnect').click(); } catch(e){} }, 300);
    }, 500);
  }

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

  const modalCheck = qs('#modalCheck');
  modalCheck.addEventListener('click', async () => {
    // Check on-chain if user transferred to GAME_TON_ADDRESS
    const fromAddr = connectedWalletAddress || manualAddressInput.value && manualAddressInput.value.trim();
    if (!fromAddr) {
      alert('Сначала подключите кошелек или укажите адрес вручную.');
      return;
    }
    try {
      const since = Date.now() - 60 * 60 * 1000; // check last 60 minutes
      const res = await fetch('/api/ton/check_deposit', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ from: fromAddr, since }) });
      const j = await res.json();
      const found = (j && j.found) || [];
      if (found.length === 0) {
        alert('Платёж не найден. Проверьте перевод и попробуйте позже.');
        return;
      }
      // sum values
      const total = found.reduce((s, f) => s + (f.value||0), 0);
      // credit player's in-game balance
      const res2 = await fetch(`/api/player/${encodeURIComponent(telegram_id)}/topup`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amount: total }) });
      const j2 = await res2.json();
      if (j2 && j2.balance !== undefined) setBalance(Number(j2.balance));
      alert(`Найдено и зачислено ${total} TON`);
    } catch (e) {
      console.error(e);
      alert('Ошибка при проверке платежа');
    }
    modal.style.display = 'none';
  });

  connectWalletBtn.addEventListener('click', () => {
    // Open wallet modal
    qs('#walletModal').style.display = 'flex';
  });

  const walletClose = qs('#walletClose');
  const walletSave = qs('#walletSave');
  const tcConnectBtn = qs('#tcConnect');
  const tcConnectPrimary = qs('#tcConnectPrimary');
  const manualAddressInput = qs('#manualAddress');
  let connectedWalletAddress = null;

  // If in Telegram WebApp, hide manual address input and show primary Telegram connect button
  if (window.Telegram && window.Telegram.WebApp) {
    try { if (manualAddressInput) manualAddressInput.style.display = 'none'; } catch(e){}
    try { if (tcConnectPrimary) tcConnectPrimary.style.display = 'block'; } catch(e){}
  }

  walletClose.addEventListener('click', ()=> qs('#walletModal').style.display = 'none');
  walletSave.addEventListener('click', ()=>{
    const addr = manualAddressInput.value && manualAddressInput.value.trim();
    if (addr) {
      connectedWalletAddress = addr;
      connectWalletBtn.textContent = `Кошелек: ${addr.slice(0,6)}...${addr.slice(-6)}`;
      connectWalletBtn.disabled = true;
      qs('#walletModal').style.display = 'none';
    } else if (connectedWalletAddress) {
      qs('#walletModal').style.display = 'none';
    } else {
      alert('Введите адрес или используйте TonConnect');
    }
  });

  tcConnectBtn.addEventListener('click', async ()=>{
    await connectViaTonConnect();
  });

  // primary Telegram wallet connect button (bigger) — triggers same flow
  if (tcConnectPrimary) {
    tcConnectPrimary.addEventListener('click', async ()=>{
      await connectViaTonConnect();
    });
  }

  async function connectViaTonConnect() {
    // ensure SDK present
    if (!window.TonConnect && !window.TON_CONNECT_UI) {
      alert('TonConnect SDK не загружен. Попробуйте ещё раз.');
      return;
    }

    try {
      // create connector if missing
      if (!window.tonConnector) {
        const manifestUrl = '/miniapp/tonconnect-manifest.json';
        try { window.tonConnector = new window.TonConnect({ manifestUrl }); } catch(e) { console.warn('TonConnect ctor failed', e); }
      }

      let result = null;
      try {
        if (window.tonConnector && window.tonConnector.connect) {
          result = await window.tonConnector.connect();
        }
      } catch(e){ console.warn('tonConnector.connect error', e); }

      // Try TonConnectUI as fallback
      if ((!result || !result.account) && window.TON_CONNECT_UI) {
        try {
          const ui = new window.TON_CONNECT_UI.TonConnectUI({ manifestUrl: '/miniapp/tonconnect-manifest.json' });
          result = await ui.connect();
        } catch(e){ console.warn('TonConnectUI connect failed', e); }
      }

      // Normalize address extraction
      let addr = null;
      try {
        if (result) {
          // result may contain account or wallet or accounts
          addr = result.account || (result.wallet && (result.wallet.account || result.wallet.address)) || (result.accounts && result.accounts[0]);
          if (typeof addr === 'object' && addr.address) addr = addr.address;
        }
        // also try connector.account property
        if (!addr && window.tonConnector && window.tonConnector.account) {
          addr = window.tonConnector.account && (window.tonConnector.account.address || window.tonConnector.account);
        }
      } catch(e){ console.warn('extract addr error', e); }

      if (addr) {
        connectedWalletAddress = addr;
        connectWalletBtn.textContent = `Кошелек: ${connectedWalletAddress.slice(0,6)}...${connectedWalletAddress.slice(-6)}`;
        connectWalletBtn.disabled = true;
        qs('#walletModal').style.display = 'none';

        // persist to server
        try {
          await fetch(`/api/player/${encodeURIComponent(telegram_id)}/wallet`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ address: connectedWalletAddress }) });
        } catch(e){ console.error('Failed saving wallet to server', e); }

      } else {
        // Send debug info to server to inspect why TonConnect didn't return address
        try {
          await fetch('/api/debug/tonconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telegram_id, username: usernameParam, result }) });
        } catch (e) { console.error('Failed sending debug', e); }
        // Show clearer instructions to user
        const proceed = confirm('Кошелек подключён, но адрес не получен. Мы отправили отладочные данные. Попробовать снова? (OK — повторить подключение, Отмена — проверить перевод вручную)');
        qs('#walletModal').style.display = 'none';
        if (proceed) {
          // reopen modal for retry
          setTimeout(()=>{ qs('#walletModal').style.display = 'flex'; try { qs('#tcConnect') && qs('#tcConnect').click(); } catch(e){} }, 200);
        }
      }
    } catch (e) {
      console.error(e);
      alert('Не удалось подключить кошелек через TonConnect');
    }
  }

  qsa('.stake').forEach(btn => btn.addEventListener('click', (e) => {
    qsa('.stake').forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active');
    selectedStake = Number(e.target.dataset.stake);
  }));

  // topup preset
  topupPreset10 && topupPreset10.addEventListener('click', ()=>{ topupAmountInput.value = '10'; });

  // initiate payment via TonConnect UI
  modalPayBtn && modalPayBtn.addEventListener('click', async ()=>{
    const amount = Number(topupAmountInput.value || 0);
    if (!amount || amount <= 0) { alert('Введите корректную сумму'); return; }
    if (!gameAddress) { alert('Адрес приёма не настроен на сервере'); return; }
    const nano = String(Math.round(amount * 1e9));
    const tx = { validUntil: Math.floor(Date.now()/1000) + 120, messages: [{ address: gameAddress, amount: nano }] };
    try {
      if (tonConnectUI && tonConnectUI.sendTransaction) {
        await tonConnectUI.sendTransaction(tx);
      } else if (window.tonConnect && window.tonConnect.sendTransaction) {
        await window.tonConnect.sendTransaction(tx);
      } else {
        alert('TonConnect не доступен в этом окружении.');
        return;
      }
      alert('Транзакция инициирована. Пожалуйста подождите — начнётся проверка поступления.');
      const fromAddr = connectedWalletAddress || manualAddressInput.value && manualAddressInput.value.trim();
      if (!fromAddr) { alert('Не удалось определить адрес отправителя. Используйте кнопку "Проверить перевод" после отправки.'); return; }
      let foundTotal = 0;
      const since = Date.now() - 60 * 60 * 1000;
      for (let i=0;i<12;i++) {
        await new Promise(r=>setTimeout(r,5000));
        try {
          const res = await fetch('/api/ton/check_deposit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ from: fromAddr, since }) });
          const j = await res.json();
          const found = (j && j.found) || [];
          if (found.length>0) {
            foundTotal = found.reduce((s,f)=>s+(f.value||0),0);
            const res2 = await fetch(`/api/player/${encodeURIComponent(telegram_id)}/topup`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amount: foundTotal }) });
            const j2 = await res2.json();
            if (j2 && j2.balance !== undefined) setBalance(Number(j2.balance));
            alert(`Найдено и зачислено ${foundTotal} TON`);
            break;
          }
        } catch(e){ console.error('poll error', e); }
      }
      if (foundTotal===0) alert('Платёж не найден — попробуйте позже или нажмите "Проверить перевод"');
    } catch(e) {
      console.error('send tx error', e);
      alert('Ошибка при отправке транзакции');
    }
    modal.style.display = 'none';
  });

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

    // responsive canvas sizing
    function resizeCanvasToContainer() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const targetWidth = Math.max(300, rect.width);
      const targetHeight = Math.max(200, window.innerHeight - (document.querySelector('.miniapp-header')?.getBoundingClientRect().height || 80) - 40);
      canvas.style.width = targetWidth + 'px';
      canvas.style.height = targetHeight + 'px';
      canvas.width = Math.floor(targetWidth * dpr);
      canvas.height = Math.floor(targetHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeCanvasToContainer();
    window.addEventListener('resize', resizeCanvasToContainer);

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
    // prevent touch dragging to scroll the container
    try { canvas.style.touchAction = 'none'; canvas.ontouchstart = e=>e.preventDefault(); } catch(e){}
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

})();
