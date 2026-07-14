'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// ── Static file server ────────────────────────────────────────────────────────

const MIME = {
  '.html':'text/html','.js':'text/javascript','.css':'text/css',
  '.json':'application/json','.ico':'image/x-icon','.png':'image/png',
  '.jpg':'image/jpeg','.svg':'image/svg+xml','.map':'application/json'
};

const server = http.createServer((req, res) => {
  try {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') url = '/index.html';
    const fp = path.join(__dirname, url);
    if (!fp.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }
    fs.readFile(fp, (err, data) => {
      if (err) {
        if (path.extname(url)) { res.writeHead(404); res.end('Not found'); return; }
        fs.readFile(path.join(__dirname,'index.html'), (e2,d2) => {
          if (e2) { res.writeHead(500); res.end(); return; }
          res.writeHead(200,{'Content-Type':'text/html'}); res.end(d2);
        });
        return;
      }
      res.writeHead(200,{'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream'});
      res.end(data);
    });
  } catch(e) { res.writeHead(500); res.end(); }
});
server.on('error', e => console.error('HTTP error:',e));
process.on('uncaughtException',  e => console.error('Uncaught:',e));
process.on('unhandledRejection', e => console.error('Unhandled:',e));

const wss = new WebSocket.Server({ server });

// ── Colours ───────────────────────────────────────────────────────────────────

const PLAYER_COLORS = [0xff2222,0x2266ff,0xffe066,0x35c14d,0xff8cd9,0xff8c1a,0x1ae5e5,0x9b30ff];
const COLOR_NAMES   = {
  0xff2222:'Red',0x2266ff:'Blue',0xffe066:'Yellow',0x35c14d:'Green',
  0xff8cd9:'Pink',0xff8c1a:'Orange',0x1ae5e5:'Cyan',0x9b30ff:'Purple'
};
function colorName(hex){ return COLOR_NAMES[hex] || 'Player'; }

// ── Layout generation ─────────────────────────────────────────────────────────

const ROOM_THEMES = [
  {name:'Storage',color:0x2f5d4f},{name:'Cafeteria',color:0x5d4a2f},
  {name:'Electrical',color:0x2f4a5d},{name:'Admin',color:0x5d2f3a},
  {name:'Reactor',color:0x4a2f5d},{name:'Medbay',color:0x2f5d5d}
];

function shuffle(arr){ for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }

function generateLayout(){
  const themes = shuffle([...ROOM_THEMES]).slice(0,4);
  const slots = ['topLeft','topRight','bottomLeft','bottomRight'].map((id,i) => {
    const t = themes[i];
    const isTop = id.startsWith('top'), isLeft = id.endsWith('Left');
    const dc = (isTop?1:-1) * (5+Math.random()*9);
    const tx = (isLeft?-1:1) * (6+Math.random()*13);
    const tz = (isTop?1:-1) * (6+Math.random()*7);
    return { id, theme:t.name, color:t.color, doorCenter:dc, taskX:tx, taskZ:tz };
  });
  return { slots };
}

// ── Room system ───────────────────────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms      = new Map();   // code → roomState
const connections= new Map();   // playerId → { ws, roomCode }
let   nextId     = 1;

function genCode(){
  let c; do { c=Array.from({length:4},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join(''); } while(rooms.has(c)); return c;
}

function newRoom(code, isPublic){
  return {
    code, isPublic: !!isPublic, hostId:null,
    phase:'lobby',
    settings:{ impostorCount:1, killCooldownSec:25, isPublic:!!isPublic },
    players:new Map(),
    meeting:null, bodies:[], taskDone:new Set(),
    tasksTotalNeeded:0, nextBodyId:1, layout:null
  };
}

function pickColor(room){
  const used = new Set([...room.players.values()].map(p=>p.color));
  for(const c of PLAYER_COLORS) if(!used.has(c)) return c;
  return PLAYER_COLORS[0];
}

function bcast(room, msg, exceptId){
  const d=JSON.stringify(msg);
  for(const [id,p] of room.players){ if(id===exceptId)continue; if(p.ws.readyState===WebSocket.OPEN) p.ws.send(d); }
}
function bcastAll(room,msg){ bcast(room,msg,null); }

function sendTo(id,msg){
  const c=connections.get(id);
  if(c&&c.ws.readyState===WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

function getRoom(id){
  const c=connections.get(id); return c&&c.roomCode?rooms.get(c.roomCode):null;
}

function roster(room){
  return [...room.players.entries()].map(([id,p])=>({id,color:p.color,name:p.name,alive:p.alive}));
}

function aliveOfRole(room,role){
  return [...room.players.values()].filter(p=>p.role===role&&p.alive).length;
}

// ── Game constants ────────────────────────────────────────────────────────────

const KILL_RANGE   = 3.2;
const WITNESS_R    = 7;
const DISCUSS_MS   = 10000;
const VOTE_MS      = 20000;
const MAP_MARGIN_X = 21;
const MAP_MARGIN_Z = 15;
const TASKS_EACH   = 4;

// ── Game lifecycle ────────────────────────────────────────────────────────────

function startRoomGame(room){
  const ids = [...room.players.keys()];
  if(!ids.length) return;

  const ic    = Math.min(room.settings.impostorCount, Math.max(1, ids.length-1));
  const imp   = shuffle([...ids]).slice(0,ic);

  for(const id of ids){
    const p = room.players.get(id);
    p.alive=true; p.role=imp.includes(id)?'impostor':'crewmate';
    p.lastKillAt=0; p.calledMeeting=false;
    p.x=(Math.random()-0.5)*4; p.z=-10+(Math.random()-0.5)*4;
  }

  room.layout = generateLayout();
  room.bodies=[]; room.taskDone=new Set();
  room.tasksTotalNeeded = (ids.length-imp.length)*TASKS_EACH;
  room.phase='playing';

  bcastAll(room,{ type:'gameStarted', layout:room.layout, players:roster(room) });

  for(const id of ids){
    const p=room.players.get(id);
    sendTo(id,{ type:'role', role:p.role, fellow:p.role==='impostor'?imp.filter(x=>x!==id):[] });
  }
  console.log(`[${room.code}] Game started – ${imp.length} impostor(s) among ${ids.length}`);
}

function endGame(room,winner,reason){
  room.phase='ended';
  bcastAll(room,{
    type:'gameEnded', winner, reason,
    players:[...room.players.entries()].map(([id,p])=>({id,color:p.color,name:p.name,role:p.role,alive:p.alive}))
  });
  console.log(`[${room.code}] Game ended – ${winner} win (${reason})`);
}

function checkWinConditions(room){
  if(room.phase!=='playing'&&room.phase!=='meeting') return;
  const ai=aliveOfRole(room,'impostor'), ac=aliveOfRole(room,'crewmate');
  if(ai===0)          { endGame(room,'crewmates','All Impostors were ejected.'); return; }
  if(ai>=ac)          { endGame(room,'impostors','Impostors outnumber the crew.'); return; }
  if(room.tasksTotalNeeded>0&&room.taskDone.size>=room.tasksTotalNeeded)
                      { endGame(room,'crewmates','All tasks completed.'); }
}

// ── Kill ──────────────────────────────────────────────────────────────────────

function handleKill(room,id,targetId){
  if(room.phase!=='playing') return;
  const killer=room.players.get(id), target=room.players.get(targetId);
  if(!killer||!target||killer.role!=='impostor'||!killer.alive) return;
  if(!target.alive||target.role==='impostor') return;
  const cdMs=room.settings.killCooldownSec*1000;
  if(Date.now()-killer.lastKillAt<cdMs) return;
  const d=Math.hypot(killer.x-target.x,killer.z-target.z);
  if(d>KILL_RANGE) return;
  killer.lastKillAt=Date.now(); target.alive=false;
  const bodyId=room.nextBodyId++;
  room.bodies.push({id:bodyId,victimId:targetId,x:target.x,z:target.z,reported:false});
  bcastAll(room,{type:'playerDied',id:targetId,x:target.x,z:target.z,bodyId});
  sendTo(id,{type:'killAck',cooldownMs:cdMs});
  // Witness?
  for(const [pid,p] of room.players){
    if(pid===id||pid===targetId||!p.alive) continue;
    if(Math.hypot(p.x-target.x,p.z-target.z)<=WITNESS_R){ startMeeting(room,{calledBy:pid,reason:'witness',exposedKillerId:id}); break; }
  }
  checkWinConditions(room);
}

// ── Vent ──────────────────────────────────────────────────────────────────────

function handleVent(room,id,toX,toZ){
  if(room.phase!=='playing') return;
  const p=room.players.get(id);
  if(!p||p.role!=='impostor'||!p.alive) return;
  const cx=Math.max(-MAP_MARGIN_X,Math.min(MAP_MARGIN_X,toX));
  const cz=Math.max(-MAP_MARGIN_Z,Math.min(MAP_MARGIN_Z,toZ));
  const fx=p.x,fz=p.z; p.x=cx; p.z=cz;
  bcast(room,{type:'ventTeleport',id,fromX:fx,fromZ:fz,toX:cx,toZ:cz},id);
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

function handleTaskDone(room,id,taskIndex){
  if(room.phase!=='playing') return;
  const p=room.players.get(id);
  if(!p||!p.alive||p.role!=='crewmate') return;
  const key=id+':'+taskIndex;
  if(room.taskDone.has(key)) return;
  room.taskDone.add(key);
  bcastAll(room,{type:'taskProgress',done:room.taskDone.size,total:room.tasksTotalNeeded});
  checkWinConditions(room);
}

// ── Meetings / Voting ─────────────────────────────────────────────────────────

function startMeeting(room,{calledBy,reason,exposedKillerId}){
  if(room.phase!=='playing') return;
  room.phase='meeting';
  room.meeting={ calledBy,reason,exposedKillerId:exposedKillerId||null,
    phase:'discuss',endsAt:Date.now()+DISCUSS_MS,votes:new Map(),timer:null };
  bcastAll(room,{ type:'meetingStarted',calledBy,reason,
    exposedKillerId:room.meeting.exposedKillerId,
    endsAt:room.meeting.endsAt, players:roster(room) });
  room.meeting.timer=setTimeout(()=>{
    if(!room.meeting||room.meeting.phase!=='discuss') return;
    room.meeting.phase='vote'; room.meeting.endsAt=Date.now()+VOTE_MS;
    bcastAll(room,{type:'meetingPhase',phase:'vote',endsAt:room.meeting.endsAt});
    room.meeting.timer=setTimeout(()=>resolveMeeting(room),VOTE_MS);
  },DISCUSS_MS);
}

function handleCallMeeting(room,id,reason,bodyId){
  if(room.phase!=='playing') return;
  const p=room.players.get(id); if(!p||!p.alive) return;
  if(reason==='button'){ if(p.calledMeeting)return; p.calledMeeting=true; }
  else if(reason==='report'){ const b=room.bodies.find(b=>b.id===bodyId); if(!b||b.reported)return; b.reported=true; }
  else return;
  startMeeting(room,{calledBy:id,reason});
}

function handleVote(room,id,targetId){
  if(room.phase!=='meeting'||!room.meeting||room.meeting.phase!=='vote') return;
  const v=room.players.get(id); if(!v||!v.alive) return;
  room.meeting.votes.set(id,targetId||null);
  bcast(room,{type:'voteCast',voterId:id},null);
  const alive=[...room.players.values()].filter(p=>p.alive).length;
  if(room.meeting.votes.size>=alive){ clearTimeout(room.meeting.timer); resolveMeeting(room); }
}

function resolveMeeting(room){
  if(room.phase!=='meeting'||!room.meeting) return;
  const counts=new Map();
  for(const t of room.meeting.votes.values()){
    const k=t===null?'skip':t; counts.set(k,(counts.get(k)||0)+1);
  }
  let ejectedId=null,top=0,tie=false;
  for(const [k,c] of counts){
    if(c>top){top=c;ejectedId=k==='skip'?null:k;tie=false;}
    else if(c===top&&c>0) tie=true;
  }
  if(tie) ejectedId=null;
  let wasImpostor=null;
  if(ejectedId!==null&&room.players.has(ejectedId)){
    const e=room.players.get(ejectedId); e.alive=false; wasImpostor=e.role==='impostor';
  }
  const tally=[...counts.entries()].map(([k,c])=>({targetId:k==='skip'?null:k,count:c}));
  bcastAll(room,{ type:'meetingResult',ejectedId,wasImpostor,tally,
    reason:room.meeting.reason,exposedKillerId:room.meeting.exposedKillerId });
  room.meeting=null; room.phase='playing';
  checkWinConditions(room);
}

// ── Room actions ──────────────────────────────────────────────────────────────

function handleCreateRoom(id,msg){
  const conn=connections.get(id); if(!conn||conn.roomCode) return;
  const code=genCode();
  const isPublic=msg.isPublic===true;
  const room=newRoom(code,isPublic);
  const color=PLAYER_COLORS[0];
  const name=(msg.name||'').trim().slice(0,16)||colorName(color);
  room.players.set(id,{ ws:conn.ws,color,name,x:0,z:-5,rotY:0,alive:true,role:null,lastKillAt:0,calledMeeting:false });
  room.hostId=id; room.settings.isPublic=isPublic;
  rooms.set(code,room); conn.roomCode=code;
  sendTo(id,{type:'roomCreated',code,playerId:id,color,name,hostId:id,settings:room.settings,players:roster(room)});
  console.log(`[${code}] Created by player ${id}`);
}

function handleJoinRoom(id,msg){
  const conn=connections.get(id); if(!conn||conn.roomCode) return;
  const code=(msg.code||'').toUpperCase().trim();
  const room=rooms.get(code);
  if(!room){ sendTo(id,{type:'joinError',message:'Room "'+code+'" not found. Check the code and try again.'}); return; }
  if(room.phase!=='lobby'){ sendTo(id,{type:'joinError',message:'That game has already started.'}); return; }
  if(room.players.size>=10){ sendTo(id,{type:'joinError',message:'Room is full (10 players max).'}); return; }
  const color=pickColor(room);
  const name=(msg.name||'').trim().slice(0,16)||colorName(color);
  room.players.set(id,{ ws:conn.ws,color,name,x:0,z:-5,rotY:0,alive:true,role:null,lastKillAt:0,calledMeeting:false });
  conn.roomCode=code;
  sendTo(id,{type:'roomJoined',code,playerId:id,color,name,hostId:room.hostId,settings:room.settings,
    players:roster(room).filter(p=>p.id!==id)});
  bcast(room,{type:'lobbyPlayerJoined',id,color,name},id);
  console.log(`[${code}] Player ${id} joined (${room.players.size})`);
}

function handleLeaveRoom(id){
  const conn=connections.get(id); if(!conn||!conn.roomCode) return;
  const room=rooms.get(conn.roomCode); conn.roomCode=null;
  if(!room) return;
  room.players.delete(id);
  bcast(room,{type:'lobbyPlayerLeft',id},null);
  if(room.players.size===0){ rooms.delete(room.code); return; }
  if(id===room.hostId){
    room.hostId=[...room.players.keys()][0];
    bcastAll(room,{type:'hostChanged',id:room.hostId});
  }
  if(room.phase==='playing'||room.phase==='meeting') checkWinConditions(room);
}

function handleUpdateSettings(id,msg){
  const room=getRoom(id); if(!room||room.hostId!==id||room.phase!=='lobby') return;
  const s=msg.settings||{};
  if(s.impostorCount===1||s.impostorCount===2) room.settings.impostorCount=s.impostorCount;
  if([15,25,35,45].includes(s.killCooldownSec)) room.settings.killCooldownSec=s.killCooldownSec;
  if(typeof s.isPublic==='boolean') room.settings.isPublic=s.isPublic;
  bcastAll(room,{type:'settingsUpdated',settings:room.settings});
}

function handlePlayAgain(id){
  const room=getRoom(id); if(!room||room.hostId!==id) return;
  if(room.meeting&&room.meeting.timer) clearTimeout(room.meeting.timer);
  room.phase='lobby'; room.meeting=null; room.bodies=[]; room.taskDone=new Set();
  room.tasksTotalNeeded=0; room.layout=null; room.nextBodyId=1;
  for(const p of room.players.values()){
    p.alive=true; p.role=null; p.lastKillAt=0; p.calledMeeting=false;
    p.x=(Math.random()-0.5)*4; p.z=-10+(Math.random()-0.5)*4;
  }
  bcastAll(room,{type:'returnedToLobby',hostId:room.hostId,settings:room.settings,players:roster(room)});
}

// ── WebSocket connections ─────────────────────────────────────────────────────

wss.on('connection', ws => {
  ws.isAlive=true;
  ws.on('pong',()=>{ ws.isAlive=true; });

  const id=nextId++;
  connections.set(id,{ws,roomCode:null});
  sendTo(id,{type:'welcome',id});

  ws.on('message', raw => {
    let msg; try{ msg=JSON.parse(raw); }catch(e){ return; }
    const conn=connections.get(id); if(!conn) return;

    // Pre-room messages
    if(msg.type==='createRoom'){ handleCreateRoom(id,msg); return; }
    if(msg.type==='joinRoom')  { handleJoinRoom(id,msg);   return; }
    if(msg.type==='leaveRoom') { handleLeaveRoom(id);       return; }

    // Room-scoped messages
    const room=getRoom(id); const p=room?room.players.get(id):null;
    if(!room||!p) return;

    switch(msg.type){
      case 'updateSettings': handleUpdateSettings(id,msg); break;
      case 'start':
        if(id!==room.hostId||room.phase!=='lobby') return;
        if(room.players.size<1) return;
        startRoomGame(room); break;
      case 'playAgain': handlePlayAgain(id); break;
      case 'move':
        if(room.phase==='meeting') return;
        p.x=msg.x; p.z=msg.z; p.rotY=msg.rotY;
        bcast(room,{type:'move',id,x:msg.x,z:msg.z,rotY:msg.rotY},id); break;
      case 'kill':        handleKill(room,id,msg.targetId); break;
      case 'vent':        handleVent(room,id,msg.toX,msg.toZ); break;
      case 'taskDone':    handleTaskDone(room,id,msg.taskIndex); break;
      case 'callMeeting': handleCallMeeting(room,id,msg.reason,msg.bodyId); break;
      case 'vote':        handleVote(room,id,msg.targetId); break;
      case 'chat': {
        if(typeof msg.text!=='string') return;
        const text=msg.text.trim().slice(0,200); if(!text) return;
        const out=JSON.stringify({type:'chat',id,color:p.color,name:p.name,text});
        for(const [,pl] of room.players) if(pl.ws.readyState===WebSocket.OPEN) pl.ws.send(out);
        break;
      }
    }
  });

  ws.on('close', ()=>{ handleLeaveRoom(id); connections.delete(id); });
  ws.on('error', e=>console.error(`Player ${id} socket error:`,e.message));
});

// ── Heartbeat ─────────────────────────────────────────────────────────────────

const hb=setInterval(()=>{
  wss.clients.forEach(ws=>{ if(!ws.isAlive){ws.terminate();return;} ws.isAlive=false; try{ws.ping();}catch(e){} });
},25000);
wss.on('close',()=>clearInterval(hb));

server.listen(PORT,()=>console.log(`Space Mystery running → http://localhost:${PORT}`));
