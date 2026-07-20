// ===============================
// CONTROLS
// ===============================
// Uses Pointer Events so the same code handles touch,
// mouse, and pen input (fixes the joystick not working
// for desktop/trackpad/mouse users). Keyboard (WASD /
// arrow keys) is also supported as a fallback.

const joystick =
document.getElementById("joystick");

const stick =
document.getElementById("stick");

// ===============================
// JOYSTICK (touch, mouse, or pen)
// ===============================

let joystickPointerId = null;

function updateStick(e){

    e.preventDefault();

    const rect = joystick.getBoundingClientRect();

    const stickSize = stick.offsetWidth || 40;
    const center = rect.width / 2;
    const maxTravel = Math.max(24, (rect.width - stickSize) / 2 - 6);

    let x = e.clientX - (rect.left + center);
    let y = e.clientY - (rect.top + center);

    let d = Math.sqrt(x*x + y*y);

    if(d > maxTravel){
        x = x/d*maxTravel;
        y = y/d*maxTravel;
    }

    stick.style.left = (center - stickSize / 2 + x) + "px";
    stick.style.top = (center - stickSize / 2 + y) + "px";

    moveX = x/maxTravel;
    moveY = -y/maxTravel;

}

function resetStick(){

    joystickPointerId = null;

    moveX = 0;
    moveY = 0;

    const rect = joystick.getBoundingClientRect();
    const stickSize = stick.offsetWidth || 40;
    const center = rect.width / 2;
    stick.style.left = (center - stickSize / 2) + "px";
    stick.style.top = (center - stickSize / 2) + "px";

}

joystick.addEventListener("pointerdown", e=>{

    joystickPointerId = e.pointerId;

    // Ensures we keep getting move/up events for this
    // pointer even if it slides off the joystick element
    if(joystick.setPointerCapture){
        joystick.setPointerCapture(e.pointerId);
    }

    updateStick(e);

});

joystick.addEventListener("pointermove", e=>{

    if(e.pointerId !== joystickPointerId) return;

    updateStick(e);

});

joystick.addEventListener("pointerup", e=>{

    if(e.pointerId !== joystickPointerId) return;

    resetStick();

});

joystick.addEventListener("pointercancel", e=>{

    if(e.pointerId !== joystickPointerId) return;

    resetStick();

});

// ===============================
// CAMERA LOOK (touch, mouse, or pen
// on the right half of the screen)
// ===============================

let looking = false;
let lookPointerId = null;
let lastX = 0;

document.addEventListener("pointerdown", e=>{

    // Ignore taps/clicks on UI elements (joystick, task
    // button, task overlay) so they don't spin the camera
    if(e.target.closest("#joystick, #taskBtn, #taskOverlay, #actionBar, #chatPanel, #chatToggleBtn")) return;

    if(e.clientX > window.innerWidth/2){

        e.preventDefault();

        looking = true;
        lookPointerId = e.pointerId;
        lastX = e.clientX;

    }

}, { passive:false });

document.addEventListener("pointermove", e=>{

    if(!looking || e.pointerId !== lookPointerId) return;

    e.preventDefault();

    yaw -= (e.clientX - lastX) * 0.005;
    lastX = e.clientX;

}, { passive:false });

function endLook(e){

    if(e.pointerId !== lookPointerId) return;

    looking = false;
    lookPointerId = null;

}

document.addEventListener("pointerup", endLook);
document.addEventListener("pointercancel", endLook);

// ===============================
// KEYBOARD FALLBACK (WASD / arrows)
// ===============================

const heldKeys = { up:false, down:false, left:false, right:false };

function applyKeyboardMove(){

    // Don't fight with an active joystick touch/drag
    if(joystickPointerId !== null) return;

    let x = 0, y = 0;

    if(heldKeys.up) y += 1;
    if(heldKeys.down) y -= 1;
    if(heldKeys.left) x -= 1;
    if(heldKeys.right) x += 1;

    moveX = x;
    moveY = y;

}

window.addEventListener("keydown", e=>{

    if(e.key === "w" || e.key === "W" || e.key === "ArrowUp") heldKeys.up = true;
    else if(e.key === "s" || e.key === "S" || e.key === "ArrowDown") heldKeys.down = true;
    else if(e.key === "a" || e.key === "A" || e.key === "ArrowLeft") heldKeys.left = true;
    else if(e.key === "d" || e.key === "D" || e.key === "ArrowRight") heldKeys.right = true;
    else return;

    applyKeyboardMove();

});

window.addEventListener("keyup", e=>{

    if(e.key === "w" || e.key === "W" || e.key === "ArrowUp") heldKeys.up = false;
    else if(e.key === "s" || e.key === "S" || e.key === "ArrowDown") heldKeys.down = false;
    else if(e.key === "a" || e.key === "A" || e.key === "ArrowLeft") heldKeys.left = false;
    else if(e.key === "d" || e.key === "D" || e.key === "ArrowRight") heldKeys.right = false;
    else return;

    applyKeyboardMove();

});