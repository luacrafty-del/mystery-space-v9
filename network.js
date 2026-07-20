// ===============================
// MULTIPLAYER NETWORKING
// ===============================

const COLOR_NAMES_NET = {
  0xff2222:'Red',0x2266ff:'Blue',0xffe066:'Yellow',0x35c14d:'Green',
  0xff8cd9:'Pink',0xff8c1a:'Orange',0x1ae5e5:'Cyan',0x9b30ff:'Purple'
};
function colorName(hex){ return COLOR_NAMES_NET[hex] || 'Player'; }
window.colorName = colorName;

// ── State ────────────────────────────────────────────────────────────────────

let ws            = null;
let myId          = null;
let myColor       = null;
let myRoomCode    = null;
let isHostClient  = false;

window.myRole     = null;
window.myAlive    = true;
window.isGhost    = false;
window.meetingActive = false;
window.gameStarted   = false;

const remotePlayers = {};
window.remotePlayers = remotePlayers;

// ── Connection ────────────────────────────────────────────────────────────────

let reconnectAttempt = 0;
let reconnectTimer   = null;
let pendingAction    = null;  // { type:'create'|'join', name, code, isPublic }

function connectToServer(onOpen){
  if(ws && ws.readyState === WebSocket.OPEN){
    if(typeof onOpen === 'function') onOpen();
    if(pendingAction) sendPendingRoomActionNow();
    return;
  }

  if(ws && ws.readyState === WebSocket.CONNECTING) return;

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  try { ws = new WebSocket(proto + '://' + location.host); }
  catch(e){ scheduleReconnect(); return; }

  const slowHint = setTimeout(()=>{
    if(ws && ws.readyState === WebSocket.CONNECTING)
      setMenuStatus('Still connecting – server may be starting up…');
  }, 5000);

  ws.onopen = () => {
    clearTimeout(slowHint);
    reconnectAttempt = 0;
    if(typeof onOpen === 'function') onOpen();
  };

  ws.onmessage = e => {
    let msg; try{ msg = JSON.parse(e.data); }catch(err){ return; }
    handleServerMessage(msg);
  };

  ws.onclose = () => {
    clearTimeout(slowHint);
    // Only auto-reconnect once we're actually in-game
    if(window.gameStarted){ scheduleReconnect(); }
    else { setMenuStatus(''); showMenuBtns(); }
    for(const id in remotePlayers) removeRemotePlayer(id);
  };

  ws.onerror = () => {};
}

function scheduleReconnect(){
  reconnectAttempt++;
  const delay = reconnectAttempt === 1 ? 300 : Math.min(1000 * reconnectAttempt, 8000);
  showConnectOverlay('Disconnected – reconnecting' + (reconnectAttempt > 1 ? ' in ' + Math.round(delay/1000)+'s…' : '…'));
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(()=>{
    connectToServer(()=>{ hideConnectOverlay(); sendPendingRoomAction(); });
  }, delay);
}

window.addEventListener('online', ()=>{
  if(!ws || ws.readyState === WebSocket.CLOSED){ clearTimeout(reconnectTimer); reconnectAttempt=0; connectToServer(sendPendingRoomAction); }
});
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible' && window.gameStarted && (!ws || ws.readyState===WebSocket.CLOSED)){
    clearTimeout(reconnectTimer); reconnectAttempt=0; connectToServer(sendPendingRoomAction);
  }
});

function sendPendingRoomActionNow(){
  if(!pendingAction || !ws || ws.readyState !== WebSocket.OPEN) return false;

  const action = pendingAction;
  if(action.type === 'create'){
    sendToServer({ type:'createRoom', name:action.name, isPublic:action.isPublic });
  } else {
    sendToServer({ type:'joinRoom', name:action.name, code:action.code });
  }
  pendingAction = null;
  return true;
}

function sendPendingRoomAction(){
  sendPendingRoomActionNow();
}

// ── Send helpers ─────────────────────────────────────────────────────────────

function sendToServer(msg){
  if(!ws || ws.readyState !== WebSocket.OPEN) return false;
  try{ ws.send(JSON.stringify(msg)); return true; }catch(e){ return false; }
}
window.sendToServer = sendToServer;

// ── Message dispatcher ────────────────────────────────────────────────────────

function handleServerMessage(msg){
  switch(msg.type){

    // ── Pre-room ──
    case 'welcome':
      myId = msg.id;
      window.getMyId = () => myId;
      // Now send the pending room action (create or join)
      sendPendingRoomActionNow();
      break;

    case 'roomCreated':
      myId       = msg.playerId;
      myColor    = msg.color;
      myRoomCode = msg.code;
      isHostClient = true;
      window.getMyId = () => myId;
      applyLocalColor(msg.color);
      if(typeof onRoomEntered === 'function') onRoomEntered(msg, true);
      break;

    case 'roomJoined':
      myId       = msg.playerId;
      myColor    = msg.color;
      myRoomCode = msg.code;
      isHostClient = msg.hostId === msg.playerId;
      window.getMyId = () => myId;
      applyLocalColor(msg.color);
      if(typeof onRoomEntered === 'function') onRoomEntered(msg, isHostClient);
      break;

    case 'joinError':
      setJoinError(msg.message);
      showMenuBtns();
      setMenuStatus('');
      break;

    // ── Lobby ──
    case 'lobbyPlayerJoined':
      if(typeof onLobbyPlayerJoined === 'function') onLobbyPlayerJoined(msg);
      break;

    case 'lobbyPlayerLeft':
      if(typeof onLobbyPlayerLeft === 'function') onLobbyPlayerLeft(msg.id);
      break;

    case 'settingsUpdated':
      if(typeof onSettingsUpdated === 'function') onSettingsUpdated(msg.settings);
      break;

    case 'hostChanged':
      isHostClient = msg.id === myId;
      if(typeof onHostChanged === 'function') onHostChanged(msg.id);
      break;

    case 'returnedToLobby':
      window.gameStarted = false;
      isHostClient = msg.hostId === myId;
      if(typeof onReturnedToLobby === 'function') onReturnedToLobby(msg);
      break;

    // ── Game start ──
    case 'gameStarted':
      setupGameScene(msg.players);
      beginGame(msg.layout);
      break;

    case 'role':
      window.myRole = msg.role;
      if(typeof onRoleAssigned === 'function') onRoleAssigned(msg.role, msg.fellow || []);
      break;

    // ── In-game movement ──
    case 'move':
      updateRemotePlayer(msg.id, msg.x, msg.z, msg.rotY);
      break;

    case 'playerDied':
      if(typeof onPlayerDied === 'function') onPlayerDied(msg.id, msg.x, msg.z, msg.bodyId);
      break;

    case 'killAck':
      if(typeof onKillAck === 'function') onKillAck(msg.cooldownMs);
      break;

    case 'ventTeleport':
      if(typeof onVentTeleport === 'function') onVentTeleport(msg.id, msg.toX, msg.toZ);
      break;

    case 'taskProgress':
      if(typeof onTaskProgress === 'function') onTaskProgress(msg.done, msg.total);
      break;

    case 'meetingStarted':
      if(typeof onMeetingStarted === 'function') onMeetingStarted(msg);
      break;

    case 'meetingPhase':
      if(typeof onMeetingPhase === 'function') onMeetingPhase(msg.phase, msg.endsAt);
      break;

    case 'voteCast':
      if(typeof onVoteCast === 'function') onVoteCast(msg.voterId);
      break;

    case 'meetingResult':
      if(typeof onMeetingResult === 'function') onMeetingResult(msg);
      break;

    case 'gameEnded':
      if(typeof onGameEnded === 'function') onGameEnded(msg, isHostClient);
      break;

    case 'chat':
      if(typeof onChatMessage === 'function') onChatMessage(msg.id, msg.color, msg.name, msg.text);
      break;
  }
}

// ── Scene setup for game start ────────────────────────────────────────────────

function setupGameScene(players){
  // Clear any leftover remote players from a previous round
  for(const id in remotePlayers) removeRemotePlayer(id);

  for(const p of players){
    if(p.id === myId) continue;
    addRemotePlayer(p.id, p.color, p.x || 0, p.z || -5, p.rotY || 0, p.alive !== false);
  }
}

function beginGame(layout){
  try{
    if(!window.gameStarted){
      buildMap(layout);
      if(typeof initTasks === 'function') initTasks(layout);
    }
  }catch(err){
    console.error('Failed to build game world:', err);
    window.gameStarted = false;
    document.getElementById('gameContainer').classList.add('hidden');
    document.getElementById('lobbyScreen').classList.remove('hidden');
    addChatSystemMsg('Could not create the world on this device. Please refresh and try again.');
    return;
  }

  showGameContainer();
  window.gameStarted = true;

  player.position.set(0, 0, -10);
  window.myAlive = true;
  window.isGhost = false;
  if(typeof updateActionBar === 'function') updateActionBar();
}

// ── Remote player management ──────────────────────────────────────────────────

function addRemotePlayer(id, color, x, z, rotY, alive){
  if(remotePlayers[id]) return;
  const group = createCrewmate(color);
  group.position.set(x, 0, z);
  group.rotation.y = rotY || 0;
  scene.add(group);
  remotePlayers[id] = { group, target:{ x, z, rotY:rotY||0 }, color, alive:alive!==false };
  if(!remotePlayers[id].alive) remotePlayers[id].group.visible = false;
}

function updateRemotePlayer(id, x, z, rotY){
  const rp = remotePlayers[id]; if(!rp) return;
  rp.target.x = x; rp.target.z = z; rp.target.rotY = rotY;
}

function removeRemotePlayer(id){
  const rp = remotePlayers[id]; if(!rp) return;
  scene.remove(rp.group); delete remotePlayers[id];
}

function updateRemotePlayers(){
  for(const id in remotePlayers){
    const rp = remotePlayers[id];
    const dx = rp.target.x - rp.group.position.x;
    const dz = rp.target.z - rp.group.position.z;
    const moving = Math.hypot(dx, dz) > 0.015;
    rp.group.position.x += dx * 0.2;
    rp.group.position.z += dz * 0.2;
    let diff = rp.target.rotY - rp.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    rp.group.rotation.y += diff * 0.2;
    if(typeof animateWalk === 'function') animateWalk(rp.group, moving);
  }
}

// ── Local position broadcast ──────────────────────────────────────────────────

let lastSent = { x:null, z:null, rotY:null };
let lastSendTime = 0;

function sendPositionUpdate(){
  if(window.meetingActive || !window.gameStarted) return;
  if(!ws || ws.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if(now - lastSendTime < 50) return;
  const x = player.position.x, z = player.position.z, rotY = player.rotation.y;
  if(lastSent.x !== null &&
     Math.abs(x - lastSent.x) < 0.01 &&
     Math.abs(z - lastSent.z) < 0.01 &&
     Math.abs(rotY - lastSent.rotY) < 0.01) return;
  lastSent = {x, z, rotY}; lastSendTime = now;
  sendToServer({ type:'move', x, z, rotY });
}

// ── Colour helper ─────────────────────────────────────────────────────────────

function applyLocalColor(color){
  if(!player.userData.bodyMesh) return;
  const c = new THREE.Color(color);
  const dark = c.clone().multiplyScalar(0.55);
  player.userData.bodyMesh.material.color.copy(c);
  if(player.userData.backpackMesh) player.userData.backpackMesh.material.color.copy(dark);
  if(player.userData.legLeft)  player.userData.legLeft.children[0].material.color.copy(dark);
  if(player.userData.legRight) player.userData.legRight.children[0].material.color.copy(dark);
}

// ── Screen helpers ────────────────────────────────────────────────────────────

function showGameContainer(){
  document.getElementById('menuScreen').classList.add('hidden');
  document.getElementById('lobbyScreen').classList.add('hidden');
  document.getElementById('gameContainer').classList.remove('hidden');
}

function showConnectOverlay(text){
  const el = document.getElementById('connectOverlay');
  if(el){ el.classList.remove('hidden'); if(text) document.getElementById('connectText').textContent = text; }
}
function hideConnectOverlay(){
  const el = document.getElementById('connectOverlay');
  if(el) el.classList.add('hidden');
}

function setMenuStatus(text){
  const el = document.getElementById('menuStatus');
  if(!el) return;
  el.textContent = text;
  el.classList.toggle('hidden', !text);
}
function setJoinError(text){
  const el = document.getElementById('joinError');
  if(el){ el.textContent = text; }
}
function showMenuBtns(){
  const hb = document.getElementById('hostBtn'), jb = document.getElementById('joinBtn');
  if(hb) hb.disabled = false;
  if(jb) jb.disabled = false;
}

function updatePlayerCount(){
  const el = document.getElementById('hud');
  if(!el) return;
  const n = Object.keys(remotePlayers).length + 1;
  el.textContent = 'Online: ' + n;
}

// ── Public API ────────────────────────────────────────────────────────────────

window.getMyId      = () => myId;
window.getMyColor   = () => myColor;
window.getIsHost    = () => isHostClient;
window.getMyRoom    = () => myRoomCode;
window.updateRemotePlayers  = updateRemotePlayers;
window.sendPositionUpdate   = sendPositionUpdate;
window.removeRemotePlayer   = removeRemotePlayer;

// ── Menu wiring (runs after DOM ready) ───────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  const hostBtn    = document.getElementById('hostBtn');
  const joinBtn    = document.getElementById('joinBtn');
  const joinPanel  = document.getElementById('joinPanel');
  const joinGoBtn  = document.getElementById('joinGoBtn');
  const codeInput  = document.getElementById('codeInput');
  const nameInput  = document.getElementById('nameInput');

  function getName(){ return (nameInput.value || '').trim().slice(0,16); }

  hostBtn.addEventListener('click', () => {
    hostBtn.disabled = true; joinBtn.disabled = true;
    setMenuStatus('Creating room…'); setJoinError('');
    pendingAction = { type:'create', name:getName(), isPublic:false };
    connectToServer();
  });

  joinBtn.addEventListener('click', () => {
    joinPanel.classList.toggle('hidden');
    if(!joinPanel.classList.contains('hidden')) codeInput.focus();
  });

  function doJoin(){
    const code = codeInput.value.trim().toUpperCase();
    if(code.length < 4){ setJoinError('Enter the 4-letter room code.'); return; }
    setJoinError('');
    hostBtn.disabled = true; joinBtn.disabled = true;
    setMenuStatus('Joining room ' + code + '…');
    pendingAction = { type:'join', name:getName(), code };
    connectToServer();
  }

  joinGoBtn.addEventListener('click', doJoin);
  codeInput.addEventListener('keydown', e => { if(e.key === 'Enter') doJoin(); });
  codeInput.addEventListener('input',   () => { codeInput.value = codeInput.value.toUpperCase(); });

  // Leave lobby
  document.getElementById('leaveBtn').addEventListener('click', () => {
    sendToServer({ type:'leaveRoom' });
    ws && ws.close();
    ws = null; pendingAction = null; myRoomCode = null;
    window.gameStarted = false;
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('menuScreen').classList.remove('hidden');
    showMenuBtns(); setMenuStatus('');
  });

  // ── Chat ──────────────────────────────────────────────────────────────────

  const chatToggle  = document.getElementById('chatToggleBtn');
  const chatPanel   = document.getElementById('chatPanel');
  const chatClose   = document.getElementById('chatCloseBtn');
  const chatInput   = document.getElementById('chatInput');
  const chatSend    = document.getElementById('chatSendBtn');
  const chatMsgs    = document.getElementById('chatMessages');
  const chatUnread  = document.getElementById('chatUnread');

  let chatOpen    = false;
  let unreadCount = 0;

  chatToggle.addEventListener('click', () => {
    chatOpen = !chatOpen;
    chatPanel.classList.toggle('hidden', !chatOpen);
    if(chatOpen){ unreadCount=0; chatUnread.classList.add('hidden'); chatInput.focus(); scrollChat(); }
  });
  chatClose.addEventListener('click', () => {
    chatOpen = false; chatPanel.classList.add('hidden');
  });

  function scrollChat(){ chatMsgs.scrollTop = chatMsgs.scrollHeight; }

  function sendChat(){
    const text = chatInput.value.trim(); if(!text) return;
    sendToServer({ type:'chat', text });
    chatInput.value = '';
  }
  chatSend.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendChat(); } });

  window.onChatMessage = function(id, color, name, text){
    const div = document.createElement('div');
    div.className = 'chat-msg';
    const hexStr = color ? '#' + color.toString(16).padStart(6,'0') : '#888';
    const senderName = id === myId ? 'You' : (name || colorName(color || 0x888888));
    div.innerHTML = `<span class="chat-sender" style="color:${hexStr}">${escHtml(senderName)}</span><span class="chat-text">${escHtml(text)}</span>`;
    chatMsgs.appendChild(div);
    scrollChat();
    if(!chatOpen){ unreadCount++; chatUnread.textContent=unreadCount; chatUnread.classList.remove('hidden'); }
    if(typeof sfxChat === 'function' && id !== myId) sfxChat();
  };

  function escHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── Start game button ─────────────────────────────────────────────────────

  document.getElementById('startGameBtn').addEventListener('click', () => {
    sendToServer({ type:'start' });
  });

});
