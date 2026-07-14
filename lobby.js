// ===============================
// LOBBY & MENU UI
// ===============================

// ── Star canvas (menu background) ────────────────────────────────────────────

(function initStarCanvas(){
  const canvas = document.getElementById('starCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, stars = [];

  function resize(){
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    stars = Array.from({length:180}, () => ({
      x: Math.random()*W, y: Math.random()*H,
      r: Math.random()*1.4 + 0.2,
      speed: Math.random()*0.12 + 0.02,
      opacity: Math.random()*0.6 + 0.2,
      twinkleSpeed: Math.random()*0.02 + 0.005,
      twinklePhase: Math.random()*Math.PI*2
    }));
  }
  window.addEventListener('resize', resize);
  resize();

  let t = 0;
  function drawStars(){
    ctx.clearRect(0, 0, W, H);
    t += 0.016;
    for(const s of stars){
      const op = s.opacity + Math.sin(t*60*s.twinkleSpeed + s.twinklePhase) * 0.2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(200,220,255,${Math.max(0,Math.min(1,op))})`;
      ctx.fill();
      // slow drift
      s.y -= s.speed;
      if(s.y < -2) { s.y = H+2; s.x = Math.random()*W; }
    }
    // Draw a few tiny shooting stars occasionally
    requestAnimationFrame(drawStars);
  }
  drawStars();
})();

// ── Lobby state ───────────────────────────────────────────────────────────────

let lobbyPlayers  = {};   // id -> { color, name }
let lobbySettings = { impostorCount:1, killCooldownSec:25, isPublic:false };
let lobbyHostId   = null;
let lobbyMyId     = null;

// ── Called by network.js when we enter a room (create or join) ───────────────

window.onRoomEntered = function(msg, asHost){
  lobbyMyId     = msg.playerId;
  lobbyHostId   = msg.hostId;
  lobbySettings = { ...msg.settings };
  lobbyPlayers  = {};

  // Seed with all players already in room (includes self)
  for(const p of msg.players){
    lobbyPlayers[p.id] = { color:p.color, name:p.name };
  }
  // Add self if not in the list (roomCreated doesn't include self in msg.players check)
  if(!lobbyPlayers[msg.playerId]){
    lobbyPlayers[msg.playerId] = { color:msg.color, name:msg.name };
  }

  showLobbyScreen(msg.code, asHost);
};

window.onLobbyPlayerJoined = function(msg){
  lobbyPlayers[msg.id] = { color:msg.color, name:msg.name };
  refreshLobbyPlayers();
  refreshPlayerStage();
  addChatSystemMsg(msg.name + ' joined the lobby.');
};

window.onLobbyPlayerLeft = function(id){
  const p = lobbyPlayers[id];
  if(p) addChatSystemMsg(p.name + ' left.');
  delete lobbyPlayers[id];
  refreshLobbyPlayers();
  refreshPlayerStage();
};

window.onSettingsUpdated = function(settings){
  lobbySettings = { ...settings };
  renderSettings(window.getIsHost());
};

window.onHostChanged = function(newHostId){
  lobbyHostId = newHostId;
  const isNowHost = newHostId === lobbyMyId;
  if(isNowHost) addChatSystemMsg('You are now the host.');
  renderSettings(isNowHost);
  renderStartArea(isNowHost);
};

window.onReturnedToLobby = function(msg){
  lobbyHostId   = msg.hostId;
  lobbySettings = { ...msg.settings };
  lobbyPlayers  = {};
  for(const p of msg.players) lobbyPlayers[p.id] = { color:p.color, name:p.name };

  // Remove game end overlay if present
  const end = document.getElementById('gameEndOverlay');
  if(end) end.remove();

  const isHost = msg.hostId === lobbyMyId;
  const codeEl = document.getElementById('lobbyCodeValue');
  const code = codeEl ? codeEl.textContent : '';

  showLobbyScreen(code, isHost);
  addChatSystemMsg('Returned to lobby.');
};

// ── Show lobby screen ─────────────────────────────────────────────────────────

function showLobbyScreen(code, asHost){
  document.getElementById('menuScreen').classList.add('hidden');
  document.getElementById('gameContainer').classList.add('hidden');
  document.getElementById('lobbyScreen').classList.remove('hidden');

  document.getElementById('lobbyCodeValue').textContent = code;

  // Copy code button
  document.getElementById('copyCodeBtn').onclick = () => {
    navigator.clipboard.writeText(code).then(()=>{
      const btn = document.getElementById('copyCodeBtn');
      btn.textContent = '✅'; setTimeout(()=>{ btn.textContent='📋'; }, 1500);
    }).catch(()=>{
      prompt('Copy this room code:', code);
    });
  };

  renderSettings(asHost);
  renderStartArea(asHost);
  refreshLobbyPlayers();
  refreshPlayerStage();
}

// ── Settings panel ────────────────────────────────────────────────────────────

function renderSettings(asHost){
  const box = document.getElementById('settingsContent');
  if(!box) return;
  box.innerHTML = '';

  // Impostor count
  const impRow = makeSettingRow('Impostors',
    makeOptionGroup([1,2], lobbySettings.impostorCount, asHost, v => {
      lobbySettings.impostorCount = v;
      sendToServer({ type:'updateSettings', settings:{ impostorCount:v } });
    })
  );
  box.appendChild(impRow);

  // Kill cooldown
  const cdRow = makeSettingRow('Kill CD',
    makeOptionGroup([15,25,35,45], lobbySettings.killCooldownSec, asHost, v => {
      lobbySettings.killCooldownSec = v;
      sendToServer({ type:'updateSettings', settings:{ killCooldownSec:v } });
    }, v => v+'s')
  );
  box.appendChild(cdRow);

  // Public / Private toggle
  const privRow = makeSettingRow('Visibility',
    makeToggle(lobbySettings.isPublic ? 'Public' : 'Private', lobbySettings.isPublic, asHost, v => {
      lobbySettings.isPublic = v;
      sendToServer({ type:'updateSettings', settings:{ isPublic:v } });
    })
  );
  box.appendChild(privRow);
}

function makeSettingRow(label, control){
  const row = document.createElement('div');
  row.className = 'setting-row';
  const lbl = document.createElement('span');
  lbl.className = 'setting-label';
  lbl.textContent = label;
  row.appendChild(lbl);
  row.appendChild(control);
  return row;
}

function makeOptionGroup(values, current, enabled, onChange, format){
  const group = document.createElement('div');
  group.className = 'setting-control';
  for(const v of values){
    const btn = document.createElement('button');
    btn.className = 'sopt' + (v === current ? ' active' : '');
    btn.textContent = format ? format(v) : v;
    btn.disabled = !enabled;
    btn.addEventListener('click', () => {
      if(!enabled) return;
      group.querySelectorAll('.sopt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(v);
    });
    group.appendChild(btn);
  }
  return group;
}

function makeToggle(label, isOn, enabled, onChange){
  const wrap = document.createElement('div');
  wrap.className = 'toggle-wrap';
  const tog = document.createElement('div');
  tog.className = 'toggle' + (isOn ? ' on' : '');
  const lbl = document.createElement('span');
  lbl.className = 'toggle-label';
  lbl.textContent = isOn ? 'Public' : 'Private';
  if(enabled){
    tog.addEventListener('click', () => {
      const newVal = !tog.classList.contains('on');
      tog.classList.toggle('on', newVal);
      lbl.textContent = newVal ? 'Public' : 'Private';
      onChange(newVal);
    });
    tog.style.cursor = 'pointer';
  }
  wrap.appendChild(tog);
  wrap.appendChild(lbl);
  return wrap;
}

// ── Start / waiting area ──────────────────────────────────────────────────────

function renderStartArea(asHost){
  const startBtn  = document.getElementById('startGameBtn');
  const waitText  = document.getElementById('lobbyWaitText');
  if(!startBtn || !waitText) return;
  if(asHost){
    startBtn.classList.remove('hidden');
    waitText.classList.add('hidden');
  } else {
    startBtn.classList.add('hidden');
    waitText.classList.remove('hidden');
  }
}

// ── Player list (sidebar) ─────────────────────────────────────────────────────

function refreshLobbyPlayers(){
  const list  = document.getElementById('lobbyPlayerList');
  const badge = document.getElementById('lobbyCountBadge');
  if(!list) return;

  const entries = Object.entries(lobbyPlayers);
  if(badge) badge.textContent = entries.length + '/10';

  list.innerHTML = '';
  // Sort: host first, then others
  entries.sort(([a],[b]) => (a==lobbyHostId?-1:b==lobbyHostId?1:0));

  for(const [id, p] of entries){
    const row = document.createElement('div');
    row.className = 'player-row';
    const hexStr = p.color ? '#'+p.color.toString(16).padStart(6,'0') : '#888';
    const isHost = parseInt(id) === lobbyHostId;
    const isSelf = parseInt(id) === lobbyMyId;
    row.innerHTML = `
      <span class="player-dot" style="background:${hexStr}"></span>
      <span class="player-row-name">${escHtmlL(p.name)}${isSelf?' <em style="opacity:.5;font-size:10px">(you)</em>':''}</span>
      ${isHost ? '<span class="player-host-badge">👑</span>' : ''}
    `;
    list.appendChild(row);
  }
}

// ── Player stage (spaceship interior crewmates) ───────────────────────────────

function refreshPlayerStage(){
  const stage = document.getElementById('playerStage');
  if(!stage) return;
  stage.innerHTML = '';

  const entries = Object.entries(lobbyPlayers);
  // Sort host first so they're on the left
  entries.sort(([a],[b]) => (a==lobbyHostId?-1:b==lobbyHostId?1:0));

  for(const [id, p] of entries){
    const hexStr = p.color ? '#'+p.color.toString(16).padStart(6,'0') : '#888';
    const darkHex = darkenHex(hexStr, 50);
    const isHost  = parseInt(id) === lobbyHostId;

    const el = document.createElement('div');
    el.className = 'lobby-crewmate';
    el.innerHTML = `
      ${isHost ? '<span class="host-crown">👑</span>' : ''}
      <svg viewBox="-1 -1 10 13" width="48" height="60">
        <!-- Body -->
        <ellipse cx="4" cy="5" rx="3.8" ry="5" fill="${hexStr}"/>
        <!-- Belt -->
        <rect x="0.4" y="7.5" width="7.2" height="1.1" rx="0.5" fill="${darkHex}" opacity="0.7"/>
        <!-- Left leg -->
        <rect x="1.2" y="9.2" width="2.2" height="2.8" rx="0.8" fill="${darkHex}"/>
        <!-- Right leg -->
        <rect x="4.6" y="9.2" width="2.2" height="2.8" rx="0.8" fill="${darkHex}"/>
        <!-- Left arm -->
        <ellipse cx="0.4" cy="6.5" rx="0.9" ry="1.5" fill="${hexStr}"/>
        <!-- Right arm -->
        <ellipse cx="7.6" cy="6.5" rx="0.9" ry="1.5" fill="${hexStr}"/>
        <!-- Backpack -->
        <rect x="5.6" y="3.5" width="1.8" height="3" rx="0.5" fill="${darkHex}"/>
        <!-- Visor -->
        <rect x="0.8" y="2.8" width="4.5" height="2.8" rx="1.2" fill="#9ee8ff" opacity="0.92"/>
        <!-- Visor shine -->
        <rect x="1.1" y="3.1" width="1.6" height="1" rx="0.5" fill="rgba(255,255,255,0.6)"/>
        <!-- Eyes (dark outline on visor) -->
        <ellipse cx="2.4" cy="4" rx="0.5" ry="0.4" fill="rgba(0,40,80,0.3)"/>
        <ellipse cx="3.9" cy="4" rx="0.5" ry="0.4" fill="rgba(0,40,80,0.3)"/>
      </svg>
      <div class="lobby-name">${escHtmlL(p.name)}</div>
    `;
    stage.appendChild(el);
  }
}

// ── Chat system messages ──────────────────────────────────────────────────────

function addChatSystemMsg(text){
  const msgs = document.getElementById('chatMessages');
  if(!msgs) return;
  const div = document.createElement('div');
  div.className = 'chat-msg chat-system';
  div.textContent = '• ' + text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtmlL(s){
  if(!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function darkenHex(hex, amount){
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const clamp = v => Math.max(0,Math.min(255,v));
  return '#'+[clamp(r-amount),clamp(g-amount),clamp(b-amount)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
