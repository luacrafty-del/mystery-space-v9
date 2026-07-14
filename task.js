// ===============================
// TASK SYSTEM
// ===============================

window.taskOpen = false;

// ── Open / close ──────────────────────────────────────────────────────────────

window.openTask = function(){
  if(!window.activeTask) return;
  window.taskOpen = true;
  moveX = 0; moveY = 0;

  document.getElementById('taskBtn').style.display = 'none';
  const ov = document.getElementById('taskOverlay');
  ov.style.display = 'flex';

  // Set title from task label
  const titleEl = document.getElementById('taskTitle');
  if(titleEl) titleEl.textContent = 'Fix Wiring – ' + (window.activeTask.label || 'Task');

  buildWireTask();
};

window.closeTask = function(){
  window.taskOpen = false;
  document.getElementById('taskOverlay').style.display = 'none';
  const content = document.getElementById('taskContent');
  if(content) content.innerHTML = '';
};

// ── Wire connecting minigame ──────────────────────────────────────────────────
// Three coloured wires on the left, three sockets on the right.
// Player must click a left wire then click its matching right socket.
// On completion the task is marked done and sent to the server.

const WIRE_COLORS = [
  { name:'red',    hex:'#ff3a3a' },
  { name:'yellow', hex:'#ffd600' },
  { name:'cyan',   hex:'#00d8e8' }
];

let wireState = null; // { pairs:[{leftDone,rightDone}], selected, canvas, ctx }

function buildWireTask(){
  const content = document.getElementById('taskContent');
  if(!content) return;
  content.innerHTML = '';

  // Shuffle which right socket matches which left wire
  const rightOrder = [0,1,2].sort(()=>Math.random()-0.5);

  wireState = {
    rightOrder,       // rightOrder[i] = which color is in right socket i
    selected: null,   // index of selected left wire (null = none)
    connected: new Array(3).fill(false), // connected[colorIndex] = done
    drawnLines: []    // { from, to, colorHex }
  };

  const canvas = document.createElement('canvas');
  canvas.width  = 320;
  canvas.height = 200;
  canvas.style.cssText = 'border-radius:10px;cursor:pointer;display:block;';
  content.appendChild(canvas);

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:12px;color:#6a8ab8;margin-top:10px;text-align:center;';
  hint.textContent = 'Click a wire on the left, then its matching socket on the right.';
  content.appendChild(hint);

  wireState.canvas = canvas;
  wireState.ctx    = canvas.getContext('2d');
  wireState.hint   = hint;

  drawWireCanvas();

  canvas.addEventListener('click', handleWireClick);
}

function drawWireCanvas(){
  const { canvas, ctx, rightOrder, connected, selected, drawnLines } = wireState;
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#0d1228';
  ctx.fillRect(0, 0, W, H);

  // Panel labels
  ctx.fillStyle = 'rgba(100,160,255,0.1)';
  ctx.fillRect(0, 0, 72, H);
  ctx.fillRect(W-72, 0, 72, H);

  ctx.fillStyle = '#4a6880';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('INPUT', 36, 18);
  ctx.fillText('OUTPUT', W-36, 18);

  const leftX  = 62;
  const rightX = W - 62;

  // Draw already-connected lines
  for(const line of drawnLines){
    ctx.beginPath();
    ctx.moveTo(line.fromX, line.fromY);
    // Bezier curve for a nice wire look
    const cx = (line.fromX + line.toX) / 2;
    ctx.bezierCurveTo(cx, line.fromY, cx, line.toY, line.toX, line.toY);
    ctx.strokeStyle = line.hex;
    ctx.lineWidth = 3;
    ctx.shadowColor = line.hex;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Left wires
  for(let i = 0; i < 3; i++){
    const y = 60 + i * 40;
    const color = WIRE_COLORS[i];
    const done = connected[i];

    // Wire nub
    ctx.fillStyle = done ? '#333' : color.hex;
    ctx.beginPath();
    ctx.roundRect(10, y-10, 52, 20, 6);
    ctx.fill();

    // Glow for selected
    if(selected === i && !done){
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = done ? '#555' : '#000';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(color.name, 36, y+4);

    // Connector dot
    ctx.beginPath();
    ctx.arc(leftX, y, 7, 0, Math.PI*2);
    ctx.fillStyle = done ? '#2a3040' : color.hex;
    ctx.fill();
    if(!done){
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Right sockets
  for(let i = 0; i < 3; i++){
    const y = 60 + i * 40;
    const colorIdx = rightOrder[i];
    const color = WIRE_COLORS[colorIdx];
    const done = connected[colorIdx];

    // Socket
    ctx.fillStyle = done ? '#1a2030' : 'rgba(20,30,55,0.9)';
    ctx.strokeStyle = done ? '#2a3a50' : color.hex;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(W-62, y-10, 52, 20, 6);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = done ? '#444' : '#000';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(color.name, W-36, y+4);

    // Socket dot
    ctx.beginPath();
    ctx.arc(rightX, y, 7, 0, Math.PI*2);
    ctx.fillStyle = done ? color.hex : '#1a2030';
    ctx.fill();
    ctx.strokeStyle = color.hex;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Completion flash
  if(wireState.justCompleted){
    ctx.fillStyle = 'rgba(68,255,136,0.15)';
    ctx.fillRect(0,0,W,H);
    wireState.justCompleted = false;
  }
}

function handleWireClick(e){
  if(!wireState) return;
  const rect = wireState.canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (wireState.canvas.width / rect.width);
  const my = (e.clientY - rect.top)  * (wireState.canvas.height / rect.height);

  const leftX  = 62;
  const rightX = wireState.canvas.width - 62;

  // Check left wire clicks
  for(let i = 0; i < 3; i++){
    const y = 60 + i * 40;
    if(wireState.connected[i]) continue;
    if(Math.hypot(mx - leftX, my - y) < 18 || (mx > 10 && mx < leftX+10 && Math.abs(my-y)<14)){
      wireState.selected = wireState.selected === i ? null : i;
      drawWireCanvas();
      return;
    }
  }

  // Check right socket clicks (only if something is selected)
  if(wireState.selected !== null){
    for(let i = 0; i < 3; i++){
      const y = 60 + i * 40;
      const colorIdxHere = wireState.rightOrder[i];
      if(wireState.connected[colorIdxHere]) continue;
      if(Math.hypot(mx - rightX, my - y) < 18 || (mx > rightX-10 && mx < rightX+52 && Math.abs(my-y)<14)){
        // Check if it's the correct match
        const selectedColorIdx = wireState.selected;
        if(colorIdxHere === selectedColorIdx){
          // Correct!
          wireState.connected[selectedColorIdx] = true;
          wireState.drawnLines.push({
            fromX: leftX, fromY: 60 + selectedColorIdx * 40,
            toX: rightX,  toY:  y,
            hex: WIRE_COLORS[selectedColorIdx].hex
          });
          wireState.selected = null;
          wireState.justCompleted = true;
          drawWireCanvas();
          // Check all done
          if(wireState.connected.every(Boolean)){
            onWireTaskComplete();
          }
        } else {
          // Wrong – flash red briefly
          wireState.selected = null;
          wireState.hint.textContent = '❌ Wrong socket! Try again.';
          wireState.hint.style.color = '#ff5555';
          setTimeout(()=>{
            if(wireState && wireState.hint){
              wireState.hint.textContent = 'Click a wire on the left, then its matching socket on the right.';
              wireState.hint.style.color = '#6a8ab8';
            }
          }, 1400);
          drawWireCanvas();
        }
        return;
      }
    }
    // Clicked nowhere useful – deselect
    wireState.selected = null;
    drawWireCanvas();
  }
}

function onWireTaskComplete(){
  const task = window.activeTask;
  if(!task || task.completed) return;

  // Visual feedback
  if(wireState && wireState.hint){
    wireState.hint.textContent = '✅ Wires connected!';
    wireState.hint.style.color = '#44ff88';
  }

  // Mark complete locally
  if(typeof markTaskCompleteVisual === 'function') markTaskCompleteVisual(task);

  // Tell the server
  sendToServer({ type:'taskDone', taskIndex: task.index });

  // Close the overlay after a short delay
  setTimeout(()=>{ window.closeTask(); }, 900);
}
