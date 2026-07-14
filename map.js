// ===============================
// MAP
// ===============================
// Facility layout: a plus-shaped central corridor with
// four room "slots" around it. Which theme/color goes in
// each slot, where its doorway sits, and where its task
// spawns are all decided by the server (see server.js
// generateLayout) so every game looks different, but
// every connected player sees the SAME layout.

const walls = [];

const OUTER_X = 22;
const OUTER_Z = 16;

// Fixed geometry per slot — only the door position and
// room color/theme change between games, not the shape.
const SLOT_GEOMETRY = {
    topLeft:     { wallX:-3, zMin: 3, zMax: OUTER_Z, centerX:-12.5, centerZ: 9.5, ventX:-19, ventZ: 14 },
    topRight:    { wallX: 3, zMin: 3, zMax: OUTER_Z, centerX: 12.5, centerZ: 9.5, ventX: 19, ventZ: 14 },
    bottomLeft:  { wallX:-3, zMin:-OUTER_Z, zMax:-3, centerX:-12.5, centerZ:-9.5, ventX:-19, ventZ:-14 },
    bottomRight: { wallX: 3, zMin:-OUTER_Z, zMax:-3, centerX: 12.5, centerZ:-9.5, ventX: 19, ventZ:-14 }
};

const ROOM_W = 19;
const ROOM_D = 13;
const WALL_HEIGHT = 4;
const CEILING_Y = WALL_HEIGHT + 0.3;

// The emergency meeting button lives in the central corridor,
// just off the exact crossing so it doesn't sit under the main light.
const MEETING_BUTTON_POS = { x: 0, z: -2.5 };
window.MEETING_BUTTON_POS = MEETING_BUTTON_POS;
window.VENTS = [];

// ===============================
// SOFT GLOW TEXTURE (generated once, reused everywhere —
// no external image/network dependency)
// ===============================

let glowTexture = null;

function getGlowTexture(){

    if(glowTexture) return glowTexture;

    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0,    "rgba(255,250,225,1)");
    gradient.addColorStop(0.35, "rgba(255,240,190,0.55)");
    gradient.addColorStop(1,    "rgba(255,240,190,0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    glowTexture = new THREE.CanvasTexture(canvas);
    return glowTexture;

}

// ===============================
// CREATE WALL
// ===============================

function createWall(x, z, w, d){

    const wall = new THREE.Mesh(
        new THREE.BoxGeometry(w, WALL_HEIGHT, d),
        new THREE.MeshStandardMaterial({
            color: 0x4d5566,
            roughness: 0.8
        })
    );

    wall.position.set(x, WALL_HEIGHT / 2, z);

    scene.add(wall);

    walls.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2
    });

}

// ===============================
// FLOOR PATCH (visual only)
// ===============================

function paintFloor(x, z, w, d, color){

    const patch = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.02, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
    );

    patch.position.set(x, -0.89, z);

    scene.add(patch);

}

// ===============================
// CEILING LIGHT (visual panel + real light + glow halo + floor pool)
// ===============================

function addCeilingLight(x, z, intensity){

    const panel = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.15, 3),
        new THREE.MeshStandardMaterial({
            color: 0xfff6dd,
            emissive: 0xfff6dd,
            emissiveIntensity: 2.2,
            roughness: 0.5
        })
    );

    panel.position.set(x, CEILING_Y - 0.2, z);

    scene.add(panel);

    const light = new THREE.PointLight(0xfff2cf, intensity, 26, 1.5);
    light.position.set(x, CEILING_Y - 0.6, z);

    scene.add(light);

    // Billboard glow halo around the panel — this is what actually
    // reads as "glowing" rather than just a bright flat square.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: 0xfff2cf,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }));
    halo.scale.set(5.5, 5.5, 1);
    halo.position.set(x, CEILING_Y - 0.35, z);
    scene.add(halo);

    // Soft pool of light projected on the floor beneath it
    const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(11, 11),
        new THREE.MeshBasicMaterial({
            map: getGlowTexture(),
            color: 0xfff2cf,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, -0.87, z);
    scene.add(pool);

}

// ===============================
// VENT (imposter-only shortcut between rooms)
// ===============================

function createVent(x, z, label){

    const group = new THREE.Group();

    const housing = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.1, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.8, metalness: 0.3 })
    );
    housing.position.y = -0.94;
    group.add(housing);

    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(2.35, 0.05, 1.65),
        new THREE.MeshStandardMaterial({ color: 0x8b93a1, roughness: 0.4, metalness: 0.7 })
    );
    frame.position.y = -0.865;
    group.add(frame);

    for(let i = 0; i < 6; i++){
        const slat = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 0.06, 0.14),
            new THREE.MeshStandardMaterial({ color: 0x555c66, roughness: 0.5, metalness: 0.6 })
        );
        slat.position.set(0, -0.885, -0.6 + i * 0.24);
        group.add(slat);
    }

    const boltGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.8, roughness: 0.3 });
    [[-0.95,-0.65],[0.95,-0.65],[-0.95,0.65],[0.95,0.65]].forEach(([bx,bz])=>{
        const bolt = new THREE.Mesh(boltGeo, boltMat);
        bolt.position.set(bx, -0.86, bz);
        group.add(bolt);
    });

    group.position.set(x, 0, z);
    scene.add(group);

    return group;

}

// ===============================
// EMERGENCY MEETING BUTTON (detailed prop)
// ===============================

function createMeetingButton(x, z){

    const group = new THREE.Group();

    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.6, 0.3, 24),
        new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.3 })
    );
    base.position.y = -0.85;
    group.add(base);

    const stripeCount = 16;
    for(let i = 0; i < stripeCount; i++){
        const angle = (i / stripeCount) * Math.PI * 2;
        const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.32, 0.06),
            new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0xffcc00 : 0x1a1a1a, roughness: 0.5 })
        );
        stripe.position.set(Math.cos(angle) * 1.55, -0.7, Math.sin(angle) * 1.55);
        stripe.rotation.y = -angle;
        group.add(stripe);
    }

    const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.9, 0.5, 20),
        new THREE.MeshStandardMaterial({ color: 0x4a4f58, roughness: 0.5, metalness: 0.4 })
    );
    pedestal.position.y = -0.4;
    group.add(pedestal);

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.68, 0.05, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffbb33, emissiveIntensity: 1.2 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.12;
    group.add(ring);

    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.65, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({
            color: 0xff2b2b,
            emissive: 0x8a0000,
            emissiveIntensity: 0.7,
            roughness: 0.25,
            metalness: 0.1
        })
    );
    dome.position.y = -0.1;
    group.add(dome);

    // Glow halo so it reads as "press me" from across the room
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: 0xff4444,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.7
    }));
    halo.scale.set(3.2, 3.2, 1);
    halo.position.set(0, 0.1, 0);
    group.add(halo);

    group.userData.dome = dome;
    group.userData.pulseTime = 0;

    group.position.set(x, 0, z);
    scene.add(group);

    return group;

}

// ===============================
// BUILD MAP FROM SERVER LAYOUT
// ===============================

function buildMap(layout){

    // FLOOR

    const floor = new THREE.Mesh(
        new THREE.BoxGeometry(OUTER_X * 2, 0.2, OUTER_Z * 2),
        new THREE.MeshStandardMaterial({ color: 0x5c6270, roughness: 0.92 })
    );

    floor.position.y = -1;

    scene.add(floor);

    // ROOF (keeps the facility from feeling like an open box;
    // ceiling lights below keep it from reading as "dark")

    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(OUTER_X * 2, 0.3, OUTER_Z * 2),
        new THREE.MeshStandardMaterial({ color: 0xa9b3c2, roughness: 0.75 })
    );

    roof.position.y = CEILING_Y;

    scene.add(roof);

    // CORRIDOR FLOOR + LIGHT

    paintFloor(0, 0, 6, OUTER_Z * 2, 0x717a8c);
    paintFloor(0, 0, OUTER_X * 2, 6, 0x717a8c);

    addCeilingLight(0, 0, 2.0);
    addCeilingLight(0, OUTER_Z * 0.55, 1.8);
    addCeilingLight(0, -OUTER_Z * 0.55, 1.8);

    // OUTER WALLS

    createWall(0, OUTER_Z, OUTER_X * 2, 0.5);
    createWall(0, -OUTER_Z, OUTER_X * 2, 0.5);
    createWall(-OUTER_X, 0, 0.5, OUTER_Z * 2);
    createWall(OUTER_X, 0, 0.5, OUTER_Z * 2);

    // ROOMS: color, doorway, ceiling light, and vent per slot

    window.VENTS = [];

    for(const slot of layout.slots){

        const geo = SLOT_GEOMETRY[slot.id];

        paintFloor(geo.centerX, geo.centerZ, ROOM_W, ROOM_D, slot.color);
        addCeilingLight(geo.centerX, geo.centerZ, 2.2);

        createVent(geo.ventX, geo.ventZ, slot.theme);
        window.VENTS.push({ id: slot.id, label: slot.theme, x: geo.ventX, z: geo.ventZ });

        // Divider wall with a doorway gap centered on doorCenter
        const doorHalf = 2;
        const gapStart = slot.doorCenter - doorHalf;
        const gapEnd = slot.doorCenter + doorHalf;

        if(gapStart > geo.zMin){
            createWall(geo.wallX, (geo.zMin + gapStart) / 2, 0.5, gapStart - geo.zMin);
        }

        if(gapEnd < geo.zMax){
            createWall(geo.wallX, (gapEnd + geo.zMax) / 2, 0.5, geo.zMax - gapEnd);
        }

    }

    window.meetingButtonModel = createMeetingButton(MEETING_BUTTON_POS.x, MEETING_BUTTON_POS.z);

}

// ===============================
// COLLISION
// ===============================

function blocked(x, z, radius){

    for(const wall of walls){

        if(
            x + radius > wall.minX &&
            x - radius < wall.maxX &&
            z + radius > wall.minZ &&
            z - radius < wall.maxZ
        ){
            return true;
        }

    }

    return false;

}
