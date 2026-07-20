// ===============================
// LEGEND ARENA — ORIGINAL MOBILE MOBA MODE
// ===============================

(function(){
  const canvas = document.createElement('canvas');
  canvas.id = 'mobaCanvas';
  canvas.className = 'hidden';
  document.body.appendChild(canvas);

  const hud = document.createElement('div');
  hud.id = 'mobaHud';
  hud.className = 'hidden';
  hud.innerHTML = `
    <div id="mobaTop">
      <div><strong>LEGEND ARENA</strong><span id="mobaScore"> Blue 0 · Red 0</span></div>
      <div id="mobaBoard">Astra 0/0/0 · Gold 0 · Lv 1</div>
      <button id="mobaExit">EXIT</button>
    </div>
    <div id="mobaTip">Destroy the enemy crystal. Drag left to move, aim/tap skills on the right.</div>
    <div id="mobaMiniMap"><canvas id="mobaMiniCanvas" width="150" height="90"></canvas></div>
    <div id="mobaJoy"><div id="mobaStick"></div></div>
    <div id="mobaSkills">
      <button data-skill="basic" class="mobaSkill basic">⚔<span>Attack</span></button>
      <button data-skill="dash" class="mobaSkill dash">➤<span>Dash</span></button>
      <button data-skill="bolt" class="mobaSkill bolt">✦<span>Bolt</span></button>
      <button data-skill="ult" class="mobaSkill ult">☄<span>Ult</span></button>
    </div>
  `;
  document.body.appendChild(hud);

  const ctx = canvas.getContext('2d');
  const mini = hud.querySelector('#mobaMiniCanvas').getContext('2d');
  const W = 2600, H = 1560;
  let running = false, last = 0, camX = 0, camY = 0, joyId = null, move = {x:0,y:0}, nextWaveAt = 1;
  let score = {blue:0, red:0}, tick = 0, entities = [], projectiles = [], particles = [];
  let playerStats = { kills:0, deaths:0, assists:0, gold:0, xp:0 };

  const player = hero('Astra', 360, H - 350, '#31a8ff', true);
  const enemyHero = hero('Rivenox', W - 360, 350, '#ff4d61', false);
  const blueBase = crystal(190, H - 190, '#37a9ff', 'blue');
  const redBase = crystal(W - 190, 190, '#ff4d61', 'red');
  const towers = [
    tower(580, H - 440, '#37a9ff', 'blue'), tower(1020, H - 720, '#37a9ff', 'blue'), tower(1450, 650, '#37a9ff', 'blue'),
    tower(W - 580, 440, '#ff4d61', 'red'), tower(W - 1020, 720, '#ff4d61', 'red'), tower(W - 1450, H - 650, '#ff4d61', 'red')
  ];

  function hero(name,x,y,color,isPlayer){ return {type:'hero', name, x, y, r:34, color, team:isPlayer?'blue':'red', hp:1200, maxHp:1200, speed:260, isPlayer, basicCd:0, atkCd:0, dashCd:0, boltCd:0, ultCd:0, respawn:0, level:1, dead:false}; }
  function minion(x,y,team){ return {type:'minion', x, y, r:20, team, color:team==='blue'?'#54c4ff':'#ff6575', hp:210, maxHp:210, speed:115, atkCd:0}; }
  function tower(x,y,color,team){ return {type:'tower', x, y, r:42, team, color, hp:1600, maxHp:1600, atkCd:0}; }
  function crystal(x,y,color,team){ return {type:'crystal', x, y, r:58, team, color, hp:2400, maxHp:2400}; }
  function jungle(x,y){ return {type:'jungle', x, y, r:26, team:'neutral', color:'#b98cff', hp:520, maxHp:520, atkCd:0, bounty:75}; }

  function resize(){
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener('resize', resize); resize();

  function startMoba(){
    running = true; last = performance.now(); tick = 0; nextWaveAt = 1; score = {blue:0, red:0}; playerStats = { kills:0, deaths:0, assists:0, gold:0, xp:0 };
    entities = [player, enemyHero, blueBase, redBase, ...towers, jungle(760, 390), jungle(W - 760, H - 390), jungle(1280, 330), jungle(1320, H - 330)]; projectiles = []; particles = [];
    Object.assign(player, hero('Astra', 360, H - 350, '#31a8ff', true));
    Object.assign(enemyHero, hero('Rivenox', W - 360, 350, '#ff4d61', false));
    blueBase.hp = blueBase.maxHp; redBase.hp = redBase.maxHp; towers.forEach(t=>t.hp=t.maxHp);
    document.getElementById('menuScreen').classList.add('hidden');
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('gameContainer').classList.add('hidden');
    canvas.classList.remove('hidden'); hud.classList.remove('hidden');
    requestAnimationFrame(loop);
  }
  window.startMoba = startMoba;

  function loop(now){
    if(!running) return;
    const dt = Math.min(0.033, (now - last) / 1000); last = now; tick += dt;
    update(dt); draw(); requestAnimationFrame(loop);
  }

  function update(dt){
    spawnWaves(); cooldowns(dt); movePlayer(dt); updateEnemy(dt); updateMinions(dt); updateTowers(dt); updateProjectiles(dt); updateParticles(dt);
    camX = clamp(player.x - innerWidth/2, 0, W - innerWidth); camY = clamp(player.y - innerHeight/2, 0, H - innerHeight);
    hud.querySelector('#mobaScore').textContent = ` Blue ${score.blue} · Red ${score.red}`;
    hud.querySelector('#mobaBoard').textContent = `Astra ${playerStats.kills}/${playerStats.deaths}/${playerStats.assists} · Gold ${playerStats.gold} · Lv ${player.level}`;
    [...hud.querySelectorAll('.mobaSkill')].forEach(btn=>{
      const cd = player[btn.dataset.skill + 'Cd'] || 0;
      btn.classList.toggle('cooling', cd > 0); btn.style.setProperty('--cd', Math.min(1, cd / ({basic:.55,dash:5,bolt:3.2,ult:16}[btn.dataset.skill] || 1)));
    });
    if(redBase.hp <= 0 || blueBase.hp <= 0){ hud.querySelector('#mobaTip').textContent = redBase.hp <= 0 ? 'VICTORY! Enemy crystal destroyed.' : 'DEFEAT! Your crystal fell.'; }
  }

  function spawnWaves(){
    if(tick < nextWaveAt) return;
    for(let i=0;i<4;i++){
      entities.push(minion(260+i*38,H-260+i*14,'blue'), minion(W-260-i*38,260-i*14,'red'));
    }
    nextWaveAt += 7;
  }
  function cooldowns(dt){ ['basicCd','atkCd','dashCd','boltCd','ultCd'].forEach(k=>player[k]=Math.max(0,(player[k]||0)-dt)); enemyHero.atkCd=Math.max(0,enemyHero.atkCd-dt); entities.forEach(e=>{ if(e.atkCd) e.atkCd=Math.max(0,e.atkCd-dt); }); }
  function movePlayer(dt){ if(player.hp<=0) return; const l=Math.hypot(move.x,move.y); if(l){ player.x=clamp(player.x+move.x/l*player.speed*dt,80,W-80); player.y=clamp(player.y+move.y/l*player.speed*dt,80,H-80); } }
  function updateEnemy(dt){ if(enemyHero.hp<=0) return; const target = nearest(enemyHero, 'blue'); if(!target) return; approach(enemyHero,target,dt,210); if(dist(enemyHero,target)<170 && enemyHero.atkCd<=0){ shoot(enemyHero,target,170,90,520); enemyHero.atkCd=0.85; } }
  function updateMinions(dt){ for(const m of entities.filter(e=>e.type==='minion'&&e.hp>0)){ const target=nearest(m,m.team==='blue'?'red':'blue'); if(!target) continue; if(dist(m,target)>75) approach(m,target,dt,m.speed); else if(m.atkCd<=0){ shoot(m,target,55,28,420); m.atkCd=1.05; } } entities = entities.filter(e=>e.type!=='minion'||e.hp>0); }
  function updateTowers(dt){ for(const t of entities.filter(e=>e.type==='tower'&&e.hp>0)){ t.atkCd=Math.max(0,t.atkCd-dt); const target=nearest(t,t.team==='blue'?'red':'blue',360); if(target&&t.atkCd<=0){ shoot(t,target,360,95,650); t.atkCd=1.15; } } }
  function updateProjectiles(dt){ for(const p of projectiles){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt; for(const e of entities){ if((e.team!==p.team || e.team==='neutral')&&e.hp>0&&dist(p,e)<e.r+8){ e.hp-=p.dmg; p.life=0; burst(e.x,e.y,p.color); if(e.hp<=0) handleDeath(e,p.team); break; } } } projectiles=projectiles.filter(p=>p.life>0); }
  function handleDeath(e, killerTeam){
    if(e.type==='hero' && !e.dead){
      e.dead = true; score[killerTeam]++;
      if(e===enemyHero){ playerStats.kills++; playerStats.gold += 220; gainXp(120); }
      if(e===player){ playerStats.deaths++; }
      const wait = e===player ? 2600 : 2200;
      setTimeout(()=>{ e.hp=e.maxHp; e.dead=false; e.x=e.team==='blue'?360:W-360; e.y=e.team==='blue'?H-350:350; burst(e.x,e.y,e.color,20); }, wait);
    }
    if(e.type==='minion' && killerTeam==='blue'){ playerStats.gold += 28; gainXp(18); }
    if(e.type==='jungle'){ if(killerTeam==='blue'){ playerStats.gold += e.bounty; gainXp(70); player.hp=Math.min(player.maxHp, player.hp+160); } setTimeout(()=>{ e.hp=e.maxHp; burst(e.x,e.y,e.color,14); }, 6500); }
  }
  function gainXp(amount){ playerStats.xp += amount; const need = player.level * 120; if(playerStats.xp >= need){ playerStats.xp -= need; player.level++; player.maxHp += 90; player.hp = player.maxHp; player.speed += 8; burst(player.x,player.y,'#ffd166',24); } }
  function updateParticles(dt){ particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}); particles=particles.filter(p=>p.life>0); }

  function useSkill(kind){
    if(player.hp<=0) return;
    const target = nearest(player,'red', kind==='ult'?520:360) || nearest(player,'neutral',300) || enemyHero;
    if(kind==='basic' && player.basicCd<=0){ shoot(player,target,420,105 + player.level*10,760); player.basicCd=.55; }
    if(kind==='dash' && player.dashCd<=0){ const l=Math.hypot(move.x,move.y)||1; player.x=clamp(player.x+(move.x||1)/l*220,80,W-80); player.y=clamp(player.y+move.y/l*220,80,H-80); player.dashCd=5; burst(player.x,player.y,'#8ee7ff'); }
    if(kind==='bolt' && player.boltCd<=0){ shoot(player,target,560,190 + player.level*14,930,'#78f7ff'); player.boltCd=3.2; }
    if(kind==='ult' && player.ultCd<=0){ for(const e of entities){ if(e.team!=='blue'&&e.hp>0&&dist(player,e)<340){ e.hp-=340 + player.level*18; burst(e.x,e.y,'#c77dff',18); if(e.hp<=0) handleDeath(e,'blue'); } } player.ultCd=16; }
  }

  function draw(){
    ctx.clearRect(0,0,innerWidth,innerHeight); ctx.save(); ctx.translate(-camX,-camY); drawMap(); entities.forEach(drawEntity); projectiles.forEach(p=>{ctx.fillStyle=p.color; circle(p.x,p.y,7);}); particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;circle(p.x,p.y,p.r);ctx.globalAlpha=1;}); ctx.restore(); drawMini(); }
  function drawMap(){
    const g=ctx.createLinearGradient(0,0,W,H); g.addColorStop(0,'#182146'); g.addColorStop(.5,'#203354'); g.addColorStop(1,'#351a30'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=42; ctx.beginPath(); ctx.moveTo(220,H-220); ctx.lineTo(W-220,220); ctx.stroke();
    ctx.strokeStyle='rgba(120,220,255,.18)'; ctx.lineWidth=4; for(let x=0;x<W;x+=180){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();} for(let y=0;y<H;y+=180){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    ctx.fillStyle='rgba(80,255,180,.12)'; circle(580,H-420,150); ctx.fillStyle='rgba(255,90,120,.12)'; circle(W-580,420,150); ctx.fillStyle='rgba(60,255,160,.12)'; circle(780,390,92); circle(W-760,H-390,92); ctx.fillStyle='rgba(185,140,255,.16)'; circle(1280,330,74); circle(1320,H-330,74);
  }
  function drawEntity(e){ if(e.hp<=0) return; ctx.save(); ctx.shadowColor=e.color; ctx.shadowBlur=e.type==='crystal'?28:12; ctx.fillStyle=e.color; circle(e.x,e.y,e.r); ctx.shadowBlur=0; if(e.type==='hero'){ ctx.fillStyle='#10182d'; circle(e.x+10,e.y-8,10); ctx.fillStyle='#dff8ff'; circle(e.x+13,e.y-10,4); ctx.fillStyle='#fff'; ctx.font='700 15px Segoe UI'; ctx.textAlign='center'; ctx.fillText(e.name,e.x,e.y-e.r-30); } if(e.type==='jungle'){ ctx.fillStyle='rgba(255,255,255,.35)'; circle(e.x-7,e.y-8,7); } if(e.type==='tower'){ ctx.strokeStyle='#fff'; ctx.lineWidth=5; circleStroke(e.x,e.y,e.r+9); } hpBar(e); ctx.restore(); }
  function hpBar(e){ const w=e.r*2.2; ctx.fillStyle='rgba(0,0,0,.45)'; ctx.fillRect(e.x-w/2,e.y-e.r-20,w,8); ctx.fillStyle=e.team==='blue'?'#46d77d':'#ff4d61'; ctx.fillRect(e.x-w/2,e.y-e.r-20,w*Math.max(0,e.hp/e.maxHp),8); }
  function drawMini(){ mini.clearRect(0,0,150,90); mini.fillStyle='#11182c'; mini.fillRect(0,0,150,90); for(const e of entities){ if(e.hp<=0) continue; mini.fillStyle=e.team==='blue'?'#37a9ff':(e.team==='red'?'#ff4d61':'#b98cff'); mini.fillRect(e.x/W*150-2,e.y/H*90-2,4,4); } }

  function nearest(from, enemyTeam, range=9999){ let best=null, bd=range; for(const e of entities){ if(e===from||e.team!==enemyTeam||e.hp<=0) continue; const d=dist(from,e); if(d<bd){bd=d;best=e;} } return best; }
  function approach(a,b,dt,s){ const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1; a.x+=dx/l*s*dt; a.y+=dy/l*s*dt; }
  function shoot(a,b,range,dmg,speed,color){ const d=dist(a,b); if(d>range) return; const dx=(b.x-a.x)/(d||1),dy=(b.y-a.y)/(d||1); projectiles.push({x:a.x,y:a.y,vx:dx*speed,vy:dy*speed,team:a.team,dmg,life:1.1,color:color||a.color}); }
  function burst(x,y,color,n=10){ for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2, sp=80+Math.random()*180; particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:3+Math.random()*5,life:.35+Math.random()*.35,color}); } }
  function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); } function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); } function circle(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); } function circleStroke(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke(); }

  const joy = hud.querySelector('#mobaJoy'), stick = hud.querySelector('#mobaStick');
  function setJoy(e){ const r=joy.getBoundingClientRect(), c=r.width/2, max=48; let x=e.clientX-r.left-c,y=e.clientY-r.top-c,d=Math.hypot(x,y); if(d>max){x=x/d*max;y=y/d*max;} move={x,y}; stick.style.transform=`translate(${x}px,${y}px)`; }
  joy.addEventListener('pointerdown',e=>{joyId=e.pointerId;joy.setPointerCapture(e.pointerId);setJoy(e);});
  joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)setJoy(e);});
  ['pointerup','pointercancel'].forEach(ev=>joy.addEventListener(ev,e=>{if(e.pointerId===joyId){joyId=null;move={x:0,y:0};stick.style.transform='translate(0,0)';}}));
  hud.querySelectorAll('.mobaSkill').forEach(btn=>btn.addEventListener('pointerdown',e=>{e.preventDefault();useSkill(btn.dataset.skill);}));
  hud.querySelector('#mobaExit').onclick=()=>{running=false;canvas.classList.add('hidden');hud.classList.add('hidden');document.getElementById('menuScreen').classList.remove('hidden');};

  document.addEventListener('DOMContentLoaded',()=>{
    const menuBtns=document.getElementById('menuBtns'); if(!menuBtns) return;
    const b=document.createElement('button'); b.id='mobaPlayBtn'; b.className='sm-btn btn-moba'; b.textContent='⚔ PLAY LEGEND ARENA'; b.onclick=startMoba; menuBtns.prepend(b);
  });
})();
