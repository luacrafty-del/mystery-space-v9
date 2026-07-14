// ===============================
// SPACE MYSTERY
// GAME ENGINE
// ===============================

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080f);

// Camera
const camera = new THREE.PerspectiveCamera(
70,
window.innerWidth/window.innerHeight,
0.1,
1000
);

// Renderer
const renderer = new THREE.WebGLRenderer({
antialias:true
});

renderer.setSize(
window.innerWidth,
window.innerHeight
);

// Without this, MeshStandardMaterial-lit surfaces render noticeably
// too dark (linear output with no gamma correction) — this is what
// was making the floor/walls read as "straight black" even with
// plenty of lights in the scene.
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

renderer.domElement.id = "gameCanvas";
document.getElementById("gameContainer").appendChild(
renderer.domElement
);

// Lighting
const ambientLight =
new THREE.AmbientLight(
0xffffff,
0.55
);

scene.add(
ambientLight
);

const hemiLight = new THREE.HemisphereLight(0xcfe8ff, 0x2a2f3a, 0.85);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.position.set(15, 25, 10);
scene.add(sunLight);

// ===============================
// GAME UPDATE
// ===============================

// Set once the host starts the game and the map/tasks
// for this session have been built (see network.js)
window.gameStarted = false;

function update(){

    if(!window.gameStarted) return;

    // Player
    if(typeof updatePlayer==="function"){
        updatePlayer();
    }

    // Tasks
    if(typeof checkTask==="function"){
        checkTask();
    }

    // Roles: kill/vent/report/meeting-button proximity + cooldowns
    if(typeof updateRoleActions==="function"){
        updateRoleActions();
    }

    // Emergency button idle pulse
    if(window.meetingButtonModel && window.meetingButtonModel.userData.dome){
        window.meetingButtonModel.userData.pulseTime += 0.05;
        const pulse = 0.7 + Math.sin(window.meetingButtonModel.userData.pulseTime) * 0.35;
        window.meetingButtonModel.userData.dome.material.emissiveIntensity = pulse;
    }

    // Multiplayer: smooth remote players toward their
    // latest known position, and tell the server where
    // we are
    if(typeof updateRemotePlayers==="function"){
        updateRemotePlayers();
    }

    if(typeof sendPositionUpdate==="function"){
        sendPositionUpdate();
    }

}
// ===============================
// GAME LOOP
// ===============================

function animate(){

requestAnimationFrame(animate);

update();

renderer.render(
scene,
camera
);

}

animate();

// ===============================
// RESIZE
// ===============================

window.addEventListener(
"resize",
()=>{

camera.aspect=
window.innerWidth/
window.innerHeight;

camera.updateProjectionMatrix();

renderer.setSize(
window.innerWidth,
window.innerHeight
);

}
);