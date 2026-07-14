// ===============================
// ROLE SYSTEM · MEETING UI · SOUNDS · GAME END
// ===============================

// ── Web Audio sounds ──────────────────────────────────────────────────────────

let _actx = null;
function actx(){ if(!_actx) _actx=new(window.AudioContext||window.webkitAudioContext)(); if(_actx.state==='suspended')_actx.resume(); return _actx; }

function tone(freq,type,dur,vol,delay,ramp){
  try{
    const ctx=actx(),osc=ctx.createOscillator(),g=ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type=type||'sine'; osc.frequency.setValueAtTime(freq,ctx.currentTime+(delay||0));
    if(ramp) osc.frequency.linearRampToValueAtTime(ramp,ctx.currentTime+(delay||0)+dur);
    g.gain.setValueAtTime(vol||0.18,ctx.currentTime+(delay||0));
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+(delay||0)+dur);
    osc.start(ctx.currentTime+(delay||0)); osc.stop(ctx.currentTime+(delay||0)+dur);
  }catch(e){}
}

function sfxKill(){   tone(180,'sawtooth',.06,.25); tone(90,'sawtooth',.18,.30,.04); tone(60,'sine',.35,.20,.12); }
function sfxVent(){   tone(900,'sine',.08,.12); tone(300,'sine',.2,.1,.06,120); }
function sfxReport(){ tone(600,'square',.05,.14); tone(800,'square',.05,.14,.06); tone(600,'square',.05,.14,.12); }
function sfxMeeting(){ for(let i=0;i<3;i++){ tone(880,'square',.15,.12,i*.32); tone(660,'square',.15,.12,i*.32+.16); } }
function sfxTask(){   tone(523,'sine',.08,.14); tone(659,'sine',.08,.14,.09); tone(784,'sine',.15,.14,.18); }
function sfxChat(){   tone(880,'sine',.06,.07); }
function sfxEject(){  tone(440,'sine',.25,.14); tone(330,'sine',.35,.14,.2); tone(220,'sawtooth',.5,.18,.4); }
function sfxVote(){   tone(660,'square',.06,.06); }
window.sfxChat = sfxChat;

// ── Task progress bar ─────────────────────────────────────────────────────────

let _taskBarFill=null, _taskCountText=null;

function initTaskBar(){
  const bar=document.createElement('div'); bar.id='taskProgressBar';
  bar.innerHTML='<span id="taskCountText">Tasks: 0 / 0</span><div id="taskBarTrack"><div id="taskBarFill"></div></div>';
  document.body.appendChild(bar);
  _taskBarFill=document.getElementById('taskBarFill');
  _taskCountText=document.getElementById('taskCountText');
}

function onTaskProgress(done,total){
  if(_taskCountText) _taskCountText.textContent='Tasks: '+done+' / '+total;
  if(_taskBarFill) _taskBarFill.style.width=(total>0?Math.round(done/total*100):0)+'%';
  sfxTask();
}
window.onTaskProgress = onTaskProgress;

// ── Role notification ─────────────────────────────────────────────────────────

function onRoleAssigned(role, fellows){
  window.myRole=role;
  const el=document.createElement('div'); el.id='roleOverlay'; el.className=role;
  el.innerHTML=`<div id="roleTitle">${role==='impostor'?'YOU ARE THE IMPOSTOR':'YOU ARE A CREWMATE'}</div>
    <div id="roleSub">${role==='impostor'?(fellows.length?'Team: '+fellows.map(i=>'#'+i).join(', '):'Eliminate the crew. Stay hidden.'):'Complete tasks and vote out the Impostor.'}</div>`;
  document.body.appendChild(el);
  setTimeout(()=>el.classList.add('fade-out'),2800);
  setTimeout(()=>el.remove(),3400);
}
window.onRoleAssigned = onRoleAssigned;

function enterGhostMode(){
  window.isGhost=true; window.myAlive=false;
  makeGhostly(player);
  showHint('You are a ghost. Walk through walls.');
  updateActionBar();
}
window.enterGhostMode = enterGhostMode;

// ── Action bar ────────────────────────────────────────────────────────────────

let _actionBar=null, _killBtn=null, _ventBtn=null, _reportBtn=null, _meetingBtn=null;
let _killCooldownEnd=0;

function initActionBar(){
  _actionBar=document.createElement('div'); _actionBar.id='actionBar';
  _killBtn    =makeBtn('KILL',   'action-kill',    tryKill);
  _ventBtn    =makeBtn('VENT',   'action-vent',    tryVent);
  _reportBtn  =makeBtn('REPORT', 'action-report',  tryReport);
  _meetingBtn =makeBtn('MEETING','action-meeting',  tryMeeting);
  [_killBtn,_ventBtn,_reportBtn,_meetingBtn].forEach(b=>_actionBar.appendChild(b));
  document.body.appendChild(_actionBar);
}

function makeBtn(label,cls,fn){
  const b=document.createElement('button'); b.className='action-btn '+cls;
  b.textContent=label; b.addEventListener('click',fn); return b;
}

function updateActionBar(){
  if(!_actionBar) return;
  const imp=window.myRole==='impostor'&&window.myAlive&&!window.isGhost;
  const crew=window.myRole==='crewmate'&&window.myAlive&&!window.isGhost&&!window.meetingActive;
  _killBtn.style.display   =imp   ?'flex':'none';
  _ventBtn.style.display   =imp   ?'flex':'none';
  _reportBtn.style.display =crew&&_reportNearby ?'flex':'none';
  _meetingBtn.style.display=crew&&_meetingBtnNearby?'flex':'none';
}
window.updateActionBar = updateActionBar;

// ── Proximity state ───────────────────────────────────────────────────────────

let _nearTarget=null,_nearVent=null,_nearBody=null;
let _reportNearby=false,_meetingBtnNearby=false;

const KILL_DIST=3.0,VENT_DIST=2.5,REPORT_DIST=3.0,MEET_DIST=3.0;

function updateRoleActions(){
  if(!window.gameStarted||window.meetingActive) return;
  const px=player.position.x, pz=player.position.z;

  // Kill target
  _nearTarget=null;
  if(window.myRole==='impostor'&&window.myAlive){
    let bd=KILL_DIST;
    for(const [id,rp] of Object.entries(window.remotePlayers)){
      if(!rp.alive)continue;
      const d=Math.hypot(rp.group.position.x-px,rp.group.position.z-pz);
      if(d<bd){bd=d;_nearTarget=id;}
    }
  }

  // Vent
  _nearVent=null;
  if(window.myRole==='impostor'&&window.myAlive&&window.VENTS){
    let bd=VENT_DIST;
    for(const v of window.VENTS){
      const d=Math.hypot(v.x-px,v.z-pz);
      if(d<bd){bd=d;_nearVent=v;}
    }
  }

  // Body report
  _nearBody=null; _reportNearby=false;
  if(window.myRole==='crewmate'&&window.myAlive){
    let bd=REPORT_DIST;
    for(const [bid,b] of Object.entries(_bodies)){
      const d=Math.hypot(b.x-px,b.z-pz);
      if(d<bd){bd=d;_nearBody={id:parseInt(bid),...b};}
    }
    _reportNearby=_nearBody!==null;
  }

  // Emergency button
  _meetingBtnNearby=false;
  if(window.myRole==='crewmate'&&window.myAlive&&window.MEETING_BUTTON_POS){
    _meetingBtnNearby=Math.hypot(window.MEETING_BUTTON_POS.x-px,window.MEETING_BUTTON_POS.z-pz)<MEET_DIST;
  }

  // Kill cooldown label
  if(_killCooldownEnd>0){
    const left=Math.max(0,Math.ceil((_killCooldownEnd-Date.now())/1000));
    _killBtn.textContent=left>0?'KILL '+left+'s':'KILL';
    _killBtn.disabled=left>0;
    if(left===0)_killCooldownEnd=0;
  }

  updateActionBar();
}
window.updateRoleActions = updateRoleActions;

function tryKill(){
  if(!_nearTarget){showHint('No one in range.');return;}
  sendToServer({type:'kill',targetId:parseInt(_nearTarget)});
}
function tryVent(){
  if(!_nearVent){showHint('No vent nearby.');return;}
  const others=(window.VENTS||[]).filter(v=>v!==_nearVent);
  if(!others.length){showHint('No other vent connected.');return;}
  const dest=others[Math.floor(Math.random()*others.length)];
  sendToServer({type:'vent',toX:dest.x,toZ:dest.z}); sfxVent();
}
function tryReport(){
  if(!_nearBody){showHint('No body nearby.');return;}
  sfxReport(); sendToServer({type:'callMeeting',reason:'report',bodyId:_nearBody.id});
}
function tryMeeting(){
  if(!_meetingBtnNearby){showHint('Too far from the button.');return;}
  sfxMeeting(); sendToServer({type:'callMeeting',reason:'button'});
}

// ── Bodies ────────────────────────────────────────────────────────────────────

const _bodies={};

function onPlayerDied(id,x,z,bodyId){
  const rp=window.remotePlayers[id];
  const body=createBodyProp(rp?rp.color:0xaaaaaa);
  body.position.set(x,0,z); body.rotation.y=Math.random()*Math.PI*2;
  scene.add(body); _bodies[bodyId]={mesh:body,x,z};
  if(rp) rp.group.visible=false;
  if(id===window.getMyId()){enterGhostMode();sfxKill();}
  else sfxReport();
}
window.onPlayerDied = onPlayerDied;

function onKillAck(cooldownMs){ _killCooldownEnd=Date.now()+cooldownMs; sfxKill(); }
window.onKillAck = onKillAck;

function onVentTeleport(pid,toX,toZ){
  if(pid===window.getMyId()){ player.position.set(toX,0,toZ); sfxVent(); }
}
window.onVentTeleport = onVentTeleport;

// ── Hint toast ────────────────────────────────────────────────────────────────

let _hintTimer=null;
function showHint(text){
  let el=document.getElementById('hintToast');
  if(!el){el=document.createElement('div');el.id='hintToast';document.body.appendChild(el);}
  el.textContent=text; el.style.opacity='1'; el.classList.remove('fade-out');
  clearTimeout(_hintTimer); _hintTimer=setTimeout(()=>el.classList.add('fade-out'),2200);
}
window.showHint = showHint;

// ── Meeting UI ────────────────────────────────────────────────────────────────

let _meetingEl=null,_meetingPhase='discuss',_localVote=null,_playerCards={},_timerInt=null;

function onMeetingStarted(msg){
  sfxMeeting(); window.meetingActive=true; moveX=0; moveY=0;
  _meetingPhase='discuss'; _localVote=null; _playerCards={};
  if(_meetingEl)_meetingEl.remove();
  _meetingEl=buildMeetingUI(msg);
  document.body.appendChild(_meetingEl);
  startMeetingClock(msg.endsAt);
  updateActionBar();
}
window.onMeetingStarted = onMeetingStarted;

function onMeetingPhase(phase,endsAt){
  _meetingPhase=phase;
  if(phase==='vote'){
    const lbl=document.getElementById('meetingPhaseLabel');
    if(lbl) lbl.textContent='🗳 Vote someone out!';
    _meetingEl.querySelectorAll('.player-card:not(.dead-card)').forEach(c=>c.classList.add('can-vote'));
    const skip=document.getElementById('skipVoteBtn'); if(skip)skip.style.display='flex';
    clearInterval(_timerInt); startMeetingClock(endsAt);
  }
}
window.onMeetingPhase = onMeetingPhase;

function onVoteCast(voterId){
  sfxVote();
  const card=_playerCards[voterId]; if(card)card.classList.add('has-voted');
}
window.onVoteCast = onVoteCast;

function onMeetingResult(msg){
  clearInterval(_timerInt);
  const {ejectedId,wasImpostor,reason,exposedKillerId}=msg;
  const res=document.createElement('div'); res.id='meetingResultBanner';
  const isSelf=ejectedId===window.getMyId();
  const rp=ejectedId?window.remotePlayers[ejectedId]:null;
  const who=ejectedId===null?'No one was ejected.'
    :(isSelf?'You were ejected.':(rp?colorName(rp.color)+' was ejected.':'A player was ejected.'));
  const role=ejectedId!==null?(wasImpostor?'They WERE the Impostor.':'They were innocent.'):'';
  const wit=reason==='witness'?'A witness saw the kill.':'';
  res.innerHTML=[who,role,wit].filter(Boolean).map(l=>`<div>${l}</div>`).join('');
  if(_meetingEl)_meetingEl.appendChild(res);
  sfxEject();
  if(ejectedId!==null){
    const rp2=window.remotePlayers[ejectedId]; if(rp2)rp2.group.visible=false;
    if(isSelf) enterGhostMode();
  }
  setTimeout(()=>{
    if(_meetingEl){_meetingEl.remove();_meetingEl=null;}
    window.meetingActive=false; updateActionBar();
  },4200);
}
window.onMeetingResult = onMeetingResult;

function buildMeetingUI(msg){
  const ov=document.createElement('div'); ov.id='meetingOverlay';
  const bg=document.createElement('div'); bg.id='meetingBg'; ov.appendChild(bg);

  const callerRp=window.remotePlayers[msg.calledBy];
  const callerName=msg.calledBy===window.getMyId()?'You called':(callerRp?colorName(callerRp.color)+' called':'Emergency');

  const hdr=document.createElement('div'); hdr.id='meetingHeader';
  hdr.innerHTML=`<div id="meetingIcon">🚨</div>
    <div id="meetingTitle">EMERGENCY MEETING</div>
    <div id="meetingSubtitle">${callerName} a meeting</div>`;
  ov.appendChild(hdr);

  const pl=document.createElement('div'); pl.id='meetingPhaseLabel'; pl.textContent='💬 Discuss…'; ov.appendChild(pl);
  const tl=document.createElement('div'); tl.id='meetingTimerEl'; ov.appendChild(tl);

  const grid=document.createElement('div'); grid.id='meetingGrid';

  // Self card first
  const selfCard=buildPlayerCard({id:window.getMyId(),color:window.getMyColor(),alive:window.myAlive},msg);
  grid.appendChild(selfCard); _playerCards[window.getMyId()]=selfCard;

  for(const p of msg.players){
    if(p.id===window.getMyId())continue;
    const card=buildPlayerCard(p,msg); grid.appendChild(card); _playerCards[p.id]=card;
  }
  ov.appendChild(grid);

  const skip=document.createElement('button'); skip.id='skipVoteBtn';
  skip.textContent='⏭ Skip Vote'; skip.style.display='none';
  skip.addEventListener('click',()=>castVote(null)); ov.appendChild(skip);

  return ov;
}

function buildPlayerCard(p,msg){
  const card=document.createElement('div'); card.className='player-card';
  let hex=p.color;
  if(p.id===window.getMyId()&&window.getMyColor()) hex=window.getMyColor();
  else if(!hex&&window.remotePlayers[p.id]) hex=window.remotePlayers[p.id].color;
  const hexStr=hex?'#'+hex.toString(16).padStart(6,'0'):'#888';
  const darkHex=hex?'#'+Math.max(0,parseInt(hex.toString(16),16)-0x303030).toString(16).padStart(6,'0'):'#444';
  const name=p.id===window.getMyId()?'You':(window.remotePlayers[p.id]?colorName(window.remotePlayers[p.id].color):(p.name||colorName(hex||0)));
  const alive=p.alive!==false;
  if(!alive)card.classList.add('dead-card');
  if(msg.reason==='witness'&&msg.exposedKillerId===p.id)card.classList.add('exposed-killer');

  card.innerHTML=`
    <div class="pc-avatar" style="background:${hexStr}">
      <svg viewBox="-1 -1 10 13" width="40" height="50">
        <ellipse cx="4" cy="5" rx="3.8" ry="5" fill="${hexStr}"/>
        <rect x="0.4" y="7.5" width="7.2" height="1.1" rx="0.5" fill="${darkHex}" opacity="0.7"/>
        <rect x="1.2" y="9.2" width="2.2" height="2.8" rx="0.8" fill="${darkHex}"/>
        <rect x="4.6" y="9.2" width="2.2" height="2.8" rx="0.8" fill="${darkHex}"/>
        <rect x="5.6" y="3.5" width="1.8" height="3" rx="0.5" fill="${darkHex}"/>
        <rect x="0.8" y="2.8" width="4.5" height="2.8" rx="1.2" fill="#9ee8ff" opacity="0.92"/>
        <rect x="1.1" y="3.1" width="1.6" height="1" rx="0.5" fill="rgba(255,255,255,0.6)"/>
        ${!alive?'<line x1="0.5" y1="0.5" x2="7.5" y2="9.5" stroke="#f44" stroke-width="1.3"/><line x1="7.5" y1="0.5" x2="0.5" y2="9.5" stroke="#f44" stroke-width="1.3"/>':''}
      </svg>
    </div>
    <div class="pc-name">${escHtmlAI(name)}</div>
  `;

  if(alive&&p.id!==window.getMyId()){
    card.addEventListener('click',()=>{
      if(_meetingPhase!=='vote'||_localVote!==null||window.isGhost)return;
      castVote(p.id);
      card.classList.add('voted-for');
    });
  }
  return card;
}

function castVote(targetId){
  if(_localVote!==null)return;
  _localVote=targetId===null?'skip':targetId;
  const myCard=_playerCards[window.getMyId()]; if(myCard)myCard.classList.add('has-voted');
  const skip=document.getElementById('skipVoteBtn'); if(skip)skip.disabled=true;
  sendToServer({type:'vote',targetId}); sfxVote();
}

function startMeetingClock(endsAt){
  const el=document.getElementById('meetingTimerEl');
  clearInterval(_timerInt);
  _timerInt=setInterval(()=>{
    const left=Math.max(0,Math.ceil((endsAt-Date.now())/1000));
    if(el)el.textContent=left+'s';
    if(left===0)clearInterval(_timerInt);
  },250);
}

// ── Game end screen (STAYS until host clicks Play Again) ──────────────────────

function onGameEnded(msg, isHost){
  clearInterval(_timerInt);
  if(_meetingEl){_meetingEl.remove();_meetingEl=null;}
  window.meetingActive=false;

  const myRole=window.myRole;
  const win=(myRole==='crewmate'&&msg.winner==='crewmates')||(myRole==='impostor'&&msg.winner==='impostors');

  sfxEject();

  const ov=document.createElement('div');
  ov.id='gameEndOverlay';
  ov.className=win?'win':'lose';

  const titleText = msg.winner==='crewmates' ? '🛸 Crewmates Win!' : '💀 Impostors Win!';

  const roleRows=msg.players.map(p=>{
    const rp=window.remotePlayers[p.id];
    const col=rp?'#'+rp.color.toString(16).padStart(6,'0'):(p.color?'#'+p.color.toString(16).padStart(6,'0'):'#888');
    const name=p.id===window.getMyId()?'You':(p.name||colorName(p.color||0));
    return `<div class="end-player-row">
      <span class="end-dot" style="background:${col}"></span>
      <span>${escHtmlAI(name)}</span>
      <span class="end-role ${p.role||'spectator'}">${p.role||'spectator'}</span>
    </div>`;
  }).join('');

  ov.innerHTML=`
    <div id="endTitle">${titleText}</div>
    <div id="endReason">${escHtmlAI(msg.reason)}</div>
    <div id="endRoles">${roleRows}</div>
    <div id="endActions">
      ${isHost
        ? `<button class="end-btn end-btn-again" id="endPlayAgainBtn">▶ PLAY AGAIN</button>`
        : `<div class="end-host-only">Waiting for host to start a new round…</div>`
      }
      <button class="end-btn end-btn-leave" id="endLeaveBtn">✕ LEAVE GAME</button>
    </div>
  `;

  document.body.appendChild(ov);

  const againBtn=document.getElementById('endPlayAgainBtn');
  if(againBtn) againBtn.addEventListener('click',()=>{ sendToServer({type:'playAgain'}); });

  document.getElementById('endLeaveBtn').addEventListener('click',()=>{
    sendToServer({type:'leaveRoom'});
    ov.remove();
    window.gameStarted=false; window.myRole=null; window.myAlive=true; window.isGhost=false;
    // Reset scene
    for(const id in window.remotePlayers) window.removeRemotePlayer(id);
    document.getElementById('gameContainer').classList.add('hidden');
    document.getElementById('menuScreen').classList.remove('hidden');
  });
}
window.onGameEnded = onGameEnded;

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtmlAI(s){
  if(!s)return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded',()=>{
  initTaskBar();
  initActionBar();
});
