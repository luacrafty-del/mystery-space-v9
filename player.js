// ===============================
// CREWMATE FACTORY
// (used for local player AND remote players)
// ===============================

function makeLeg(material, xOffset){

    // A small pivot group at the hip so the leg can swing like a
    // pendulum instead of rotating around its own middle.
    const legGroup = new THREE.Group();
    legGroup.position.set(xOffset, 0.35, 0.05);

    const legMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.19, 0.5, 12),
        material
    );
    legMesh.position.y = -0.25;

    legGroup.add(legMesh);

    return legGroup;

}

function createCrewmate(color){

    const group = new THREE.Group();

    const bodyColor = new THREE.Color(color);
    const darkColor = bodyColor.clone().multiplyScalar(0.55);

    // BODY

    const body = new THREE.Mesh(

    new THREE.SphereGeometry(1,32,32),

    new THREE.MeshStandardMaterial({
    color:bodyColor,
    roughness:0.5,
    metalness:0.05
    })

    );

    body.scale.set(
    1,
    1.3,
    0.8
    );

    body.position.y = 0.7;

    group.add(body);

    // BELT

    const belt = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.09, 8, 20),
        new THREE.MeshStandardMaterial({ color:darkColor, roughness:0.7 })
    );
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1, 1, 0.85);
    belt.position.y = 0.25;
    group.add(belt);

    // ARMS (small nubs at the sides for a fuller silhouette)

    const armGeometry = new THREE.SphereGeometry(0.24, 14, 14);
    const armMaterial = new THREE.MeshStandardMaterial({ color:bodyColor, roughness:0.5 });

    const armLeft = new THREE.Mesh(armGeometry, armMaterial);
    armLeft.scale.set(0.8, 1.15, 0.8);
    armLeft.position.set(-0.95, 0.55, 0.1);
    group.add(armLeft);

    const armRight = new THREE.Mesh(armGeometry, armMaterial);
    armRight.scale.set(0.8, 1.15, 0.8);
    armRight.position.set(0.95, 0.55, 0.1);
    group.add(armRight);

    // BACKPACK (opposite side from the visor)

    const backpack = new THREE.Mesh(

    new THREE.BoxGeometry(0.7, 0.9, 0.35),

    new THREE.MeshStandardMaterial({
    color:darkColor,
    roughness:0.6
    })

    );

    backpack.position.set(0, 0.75, 0.55);

    group.add(backpack);

    // VISOR

    const visor = new THREE.Mesh(

    new THREE.BoxGeometry(
    0.85,
    0.45,
    0.2
    ),

    new THREE.MeshStandardMaterial({
    color:0x8fe6ff,
    roughness:0.12,
    metalness:0.35,
    emissive:0x1a4a55,
    emissiveIntensity:0.4
    })

    );

    visor.position.set(
    0,
    1.0,
    -0.7
    );

    group.add(visor);

    // Small glassy highlight so the visor reads as reflective glass
    // rather than a flat colored panel.
    const visorHighlight = new THREE.Mesh(
        new THREE.PlaneGeometry(0.28, 0.13),
        new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.55 })
    );
    visorHighlight.position.set(-0.18, 1.12, -0.805);
    group.add(visorHighlight);

    // LEGS (pivoted at the hip so they can swing while walking)

    const legMaterial = new THREE.MeshStandardMaterial({ color:darkColor, roughness:0.7 });

    const legLeft = makeLeg(legMaterial, -0.32);
    const legRight = makeLeg(legMaterial, 0.32);

    group.add(legLeft);
    group.add(legRight);

    // Soft contact shadow blob so the character feels grounded
    // without needing real-time shadow mapping.
    const shadowBlob = new THREE.Mesh(
        new THREE.CircleGeometry(0.55, 20),
        new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.28, depthWrite:false })
    );
    shadowBlob.rotation.x = -Math.PI / 2;
    shadowBlob.position.y = -0.885;
    group.add(shadowBlob);

    // Keep handles for later color updates / walk animation
    group.userData.bodyMesh = body;
    group.userData.backpackMesh = backpack;
    group.userData.legMaterial = legMaterial;
    group.userData.legLeft = legLeft;
    group.userData.legRight = legRight;
    group.userData.walkPhase = 0;
    group.userData.idleTime = Math.random() * 10;

    return group;

}

// ===============================
// WALK / IDLE ANIMATION
// (shared by local + remote players)
// ===============================

function animateWalk(group, moving){

    const d = group.userData;
    if(!d.legLeft || !d.legRight) return;

    d.idleTime += 0.05;

    if(moving){
        d.walkPhase += 0.35;
        const swing = Math.sin(d.walkPhase) * 0.55;
        d.legLeft.rotation.x = swing;
        d.legRight.rotation.x = -swing;
        if(d.bodyMesh) d.bodyMesh.position.y = 0.7 + Math.abs(Math.sin(d.walkPhase)) * 0.05;
    }else{
        d.legLeft.rotation.x *= 0.8;
        d.legRight.rotation.x *= 0.8;
        if(d.bodyMesh) d.bodyMesh.position.y = 0.7 + Math.sin(d.idleTime) * 0.012;
    }

}

// ===============================
// GHOST / BODY PROP HELPERS
// ===============================

// Turns a crewmate group semi-transparent (used for the local
// player once they've died, and for late-joining spectators).
function makeGhostly(group){
    group.traverse(child=>{
        if(child.material){
            child.material = child.material.clone();
            child.material.transparent = true;
            child.material.opacity = 0.35;
            child.material.depthWrite = false;
        }
    });
}

// A crumpled body left behind at a kill location — reusable
// crewmate geometry, laid flat, dimmed, with the legs no longer
// posed for walking.
function createBodyProp(color){

    const group = createCrewmate(color);

    group.traverse(child=>{
        if(child.material){
            child.material = child.material.clone();
            child.material.roughness = Math.min(1, (child.material.roughness || 0.5) + 0.1);
        }
    });

    group.userData.legLeft.rotation.x = 0.9;
    group.userData.legRight.rotation.x = -0.5;

    group.rotation.z = Math.PI / 2;
    group.position.y = 0.35;

    return group;

}

// ===============================
// PLAYER (local, controlled by this client)
// ===============================

const player = createCrewmate(0xff2222);

scene.add(player);

player.position.set(
    0,
    0,
    -10
    );

// ===============================
// TASK OBJECTS (one per room, created
// once the server sends the map layout)
// ===============================

function createTaskMarker(x, z, index, label){

    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1,1,1),
        new THREE.MeshStandardMaterial({
            color:0x00ff00,
            emissive:0x0a4a0a,
            emissiveIntensity:0.6,
            roughness:0.4
        })
    );

    mesh.position.set(x,0.5,z);

    scene.add(mesh);

    return { mesh, position: mesh.position, completed:false, index, label };

}

let tasks = [];
window.tasks = tasks;

// Called from network.js once the game actually starts,
// using the same layout every connected client received
function initTasks(layout){

    tasks = layout.slots.map((slot, i) => createTaskMarker(slot.taskX, slot.taskZ, i, slot.theme));
    window.tasks = tasks;

}

function markTaskCompleteVisual(task){
    task.completed = true;
    task.mesh.material.color.set(0x555555);
    task.mesh.material.emissive.set(0x111111);
    task.mesh.material.emissiveIntensity = 0.1;
}
window.markTaskCompleteVisual = markTaskCompleteVisual;

// ===============================
// TASK DETECTION
// ===============================

let taskNearby = false;
let activeTask = null;
window.activeTask = null;

function checkTask(){

    // Nothing to check until the game has actually started,
    // and nothing while a task/meeting is already open
    if(!window.gameStarted) return;
    if(window.taskOpen || window.meetingActive || window.isGhost) return;

    const button = document.getElementById("taskBtn");

    let nearest = null;
    let nearestDist = Infinity;

    for(const t of tasks){

        if(t.completed) continue;

        const distance = player.position.distanceTo(t.position);

        if(distance < 3 && distance < nearestDist){
            nearest = t;
            nearestDist = distance;
        }

    }

    if(nearest){
        taskNearby = true;
        activeTask = nearest;
        window.activeTask = nearest;
        button.style.display = "flex";
    }else{
        taskNearby = false;
        activeTask = null;
        window.activeTask = null;
        button.style.display = "none";
    }

}

// ===============================
// VARIABLES
// ===============================

let moveX = 0;
let moveY = 0;

let yaw = 0;

const speed = 0.10;

const radius = 0.6;


// ===============================
// PLAYER UPDATE
// ===============================

function updatePlayer(){

if(window.meetingActive){
    if(typeof animateWalk === "function") animateWalk(player, false);
    return;
}

const forwardX = Math.sin(yaw);
const forwardZ = Math.cos(yaw);

const rightX = Math.cos(yaw);
const rightZ = -Math.sin(yaw);


// Camera-relative movement

let dx =
forwardX*moveY -
rightX*moveX;

let dz =
forwardZ*moveY -
rightZ*moveX;


// Normalize so diagonal isn't faster

const len =
Math.sqrt(dx*dx + dz*dz);

if(len > 0){

dx /= len;
dz /= len;

}


const nx =
player.position.x +
dx * speed;

const nz =
player.position.z +
dz * speed;

// Ghosts (dead players / spectators) pass through walls
const noclip = window.isGhost;

if(noclip || !blocked(nx,player.position.z,radius))
player.position.x = nx;

if(noclip || !blocked(player.position.x,nz,radius))
player.position.z = nz;


// Smooth rotation

if(len > 0){

const target =
Math.atan2(-dx,-dz);

let diff =
target -
player.rotation.y;

diff =
Math.atan2(
Math.sin(diff),
Math.cos(diff)
);

player.rotation.y += diff * 0.15;

}

if(typeof animateWalk === "function") animateWalk(player, len > 0);


// Camera follow

// ===============================
// SMOOTH CAMERA FOLLOW
// ===============================

const targetX =
player.position.x -
Math.sin(yaw) * 6;

const targetY = 3;

const targetZ =
player.position.z -
Math.cos(yaw) * 6;

camera.position.lerp(

new THREE.Vector3(
targetX,
targetY,
targetZ
),

0.15

);

camera.lookAt(

player.position.x,
1,
player.position.z

);

}

document.getElementById("taskBtn").onclick = function(){

    if(!taskNearby || !activeTask) return;
    if(window.meetingActive) return;

    openTask();

};
