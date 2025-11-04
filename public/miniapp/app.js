(function(){
  const params = new URLSearchParams(location.search);
  const username = params.get('username') || ('anon' + Math.floor(Math.random()*10000));

  const playerNickEl = document.getElementById('playerNick');
  const playerBalanceEl = document.getElementById('playerBalance');
  const connectWalletBtn = document.getElementById('connectWalletBtn');
  const topupMenu = document.getElementById('topupMenu');
  const topupBtn = document.getElementById('topupBtn');
  const topupAmount = document.getElementById('topupAmount');
  const betOptionsEl = document.getElementById('betOptions');
  const playBtn = document.getElementById('playBtn');
  const lobby = document.getElementById('lobby');
  const gameSection = document.getElementById('gameSection');
  const gameCanvas = document.getElementById('gameCanvas');
  const leaveBtn = document.getElementById('leaveBtn');

  let connectedWallet = false;
  let balance = 0;
  let ws = null;
  let currentBet = 1;

  playerNickEl.textContent = username;

  const BETS = [1,3,5,10];
  BETS.forEach(b=>{
    const bbtn = document.createElement('button');
    bbtn.className = 'bet-btn';
    bbtn.textContent = b + ' TON';
    bbtn.onclick = ()=>{
      currentBet = b;
      document.querySelectorAll('.bet-btn').forEach(n=>n.classList.remove('active'));
      bbtn.classList.add('active');
    };
    if(b===1) bbtn.classList.add('active');
    betOptionsEl.appendChild(bbtn);
  });

  async function fetchUser(){
    const res = await fetch(`/api/user?username=${encodeURIComponent(username)}`);
    const data = await res.json();
    balance = Number(data.user.balance || 0);
    playerBalanceEl.textContent = 'TON: ' + balance;
  }
  fetchUser();

  connectWalletBtn.addEventListener('click', ()=>{
    // simulate wallet connection
    connectedWallet = true;
    connectWalletBtn.textContent = 'Кошелёк подключён';
    connectWalletBtn.disabled = true;
  });

  playerBalanceEl.addEventListener('click', ()=>{
    if(!connectedWallet){
      alert('Сначала подключите кошелёк');
      return;
    }
    topupMenu.classList.toggle('hidden');
  });

  topupBtn.addEventListener('click', async ()=>{
    const amt = Number(topupAmount.value || 0);
    if(!amt || amt<=0) return alert('Введите сумму');
    // in real life we would trigger TON wallet transfer. Here we simulate: backend credits balance
    const res = await fetch('/api/deposit', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username, amount: amt})});
    const data = await res.json();
    if(data.ok){
      await fetchUser();
      topupMenu.classList.add('hidden');
    } else alert('Ошибка пополнения');
  });

  playBtn.addEventListener('click', ()=>{
    if(!connectedWallet) return alert('Подключите кошелёк');
    if(balance < currentBet) return alert('Недостаточно баланса');
    // open game
    startGame();
  });

  function startGame(){
    lobby.classList.add('hidden');
    gameSection.classList.remove('hidden');
    ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://') + location.host + '/ws');
    ws.onopen = ()=>{
      ws.send(JSON.stringify({type:'join', username, bet: currentBet}));
    };
    ws.onmessage = (ev)=>{
      const msg = JSON.parse(ev.data);
      if(msg.type==='state') renderState(msg.state);
      if(msg.type==='joined') console.log('joined as', msg.username);
      if(msg.type==='error') alert(msg.message);
    };

    const ctx = gameCanvas.getContext('2d');
    let mouse = {x:500,y:300, down:false};
    gameCanvas.addEventListener('mousemove', e=>{
      const rect = gameCanvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top;
    });

    leaveBtn.onclick = ()=>{
      if(ws) ws.send(JSON.stringify({type:'leave', username}));
      ws && ws.close();
      gameSection.classList.add('hidden');
      lobby.classList.remove('hidden');
      fetchUser();
    };

    function renderState(state){
      ctx.clearRect(0,0,gameCanvas.width, gameCanvas.height);
      // foods
      for(const f of state.foods){
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath(); ctx.arc(f.x,f.y,6,0,Math.PI*2); ctx.fill();
      }
      // snakes
      for(const p of state.players){
        ctx.fillStyle = p.color || '#00aa00';
        for(const seg of p.snake){
          ctx.beginPath(); ctx.arc(seg.x, seg.y, 6,0,Math.PI*2); ctx.fill();
        }
        // name
        if(p.snake[0]){
          ctx.fillStyle = '#000';
          ctx.fillText(p.username, p.snake[0].x+8, p.snake[0].y-8);
        }
      }
    }

    // send movement periodically
    setInterval(()=>{
      if(!ws || ws.readyState!==1) return;
      const dx = mouse.x - (gameCanvas.width/2);
      const dy = mouse.y - (gameCanvas.height/2);
      ws.send(JSON.stringify({type:'move', username, vx: dx, vy: dy}));
    }, 50);
  }

})();
