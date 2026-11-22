import * as T from '../vendor/three.module.js';
import { BLOCKS, CONFIG, usd } from './config.js';
import { uvFor } from './textures.js';

const { width, reach, fov } = CONFIG;
const sky = 0x9bcfbd;
const WORLD_FOG = new T.Fog(sky, 12, 44);
const box = new T.BoxGeometry(1, 1, 1);
const coin = new T.CylinderGeometry(.5, .5, .18, 8);
const sunlight = new T.Color('#fff6db');
const daylight = new T.Color('#b7eddf');
const shade = new T.Color('#536977');
const dummy = new T.Object3D();

function solidBox(parent, color, x, y, z, sx, sy, sz) {
    const mesh = new T.Mesh(box, new T.MeshBasicMaterial({ color }));
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
}

function scenery(scene) {
    const palettes = new Map();
    const add = (color, x, y, z, sx, sy, sz) => {
        if (!palettes.has(color)) palettes.set(color, []);
        palettes.get(color).push([x, y, z, sx, sy, sz]);
    };
    // The wooden entrance and the ledges frame the playable excavation.
    for (const x of [5.1, 14.9]) {
        add('#4b352f', x, 1.45, 16.9, .30, 2.9, .31);
        add('#8f6448', x - .03, 1.45, 17.07, .17, 2.8, .05);
        add('#bbc4a4', x, .17, 16.9, .48, .34, .48);
        add('#72523e', x, 2.53, 16.9, .47, .16, .48);
        add('#5b4234', x, 1.98, 17.09, .65, .10, .10);
        add('#422f28', x, 1.72, 17.15, .27, .40, .27);
        add('#ffbb60', x, 1.72, 17.30, .15, .24, .04);
        add('#ffe4a1', x, 1.75, 17.33, .067, .13, .035);
    }
    add('#614634', 10, 2.73, 16.9, 10.18, .28, .34);
    add('#9c704c', 10, 2.84, 17.02, 10.2, .075, .14);
    add('#442e28', 10, 2.75, 17.15, 1.22, .43, .17);
    add('#a6efd7', 10, 2.75, 17.25, .36, .09, .035);
    for (let i = 0; i < 13; i++) {
        for (const x of [0.38, 19.62]) {
            const z = 2.2 + i * 1.2;
            add('#795639', x, .32, z, .19, .64, .19);
            if (i < 12) add('#9c794f', x, .49, z + .60, .12, .10, 1.20);
        }
    }
    for (const [x, z, h] of [[2.5,2.8,2.6],[17.2,3.3,2.5],[1.2,8,2],[18.7,8.9,3],[1.4,13.5,1.8],[18.6,15,2.3]]) {
        add('#594630', x, h * .36, z, .22, h * .72, .24);
        add('#345e4a', x, h * .78, z, 1.6, .56, 1.55);
        add('#487c57', x, h, z, 1.13, .68, 1.12);
        add('#6e9c60', x, h + .39, z, .67, .22, .69);
    }
    // Distant silhouettes keep the quarry visually bounded without extra terrain chunks.
    for (let i = 0; i < 22; i++) {
        const h = 2.8 + ((i * 29) % 38) * .21;
        const x = -27 + i * 3.25;
        const z = -12 - ((i * 17) % 6) * 2;
        add('#6da899', x, h / 2 - 2, z, 5, h, 4.2);
        add('#88b6a4', x, h - 2, z, 3.2, .7, 3.6);
    }
    for (const [x,z,y,s] of [[-11,-6,7.2,1],[4,-11,8,1.6],[18,-14,9.7,1.2],[32,-7,8,1.45],[-5,8,10,1.2]]) {
        add('#d8ece1', x, y, z, 4*s, .34, 1.15*s);
        add('#edf1d9', x+.6*s, y+.27, z, 2.4*s, .28, .95*s);
    }
    for (const [color, transforms] of palettes) {
        const group = new T.InstancedMesh(box, new T.MeshBasicMaterial({ color }), transforms.length);
        transforms.forEach(([x, y, z, sx, sy, sz], index) => {
            dummy.position.set(x, y, z);
            dummy.scale.set(sx, sy, sz);
            dummy.updateMatrix();
            group.setMatrixAt(index, dummy.matrix);
        });
        scene.add(group);
    }
}

function makeTool() {
    const rig = new T.Group();
    const arm = new T.Group();
    solidBox(arm, '#b77c59', 0, -.45, 0, .24, .73, .23);
    solidBox(arm, '#234e4e', 0, -.63, 0, .27, .49, .253);
    solidBox(arm, '#427d76', 0, -.42, .12, .28, .115, .03);
    solidBox(arm, '#d2a37d', 0, -.16, .027, .255, .22, .25);
    const pick = new T.Group();
    pick.position.set(.018, -.12, -.10);
    pick.rotation.z = -.17;
    solidBox(pick, '#392c25', 0, .33, 0, .122, .93, .123);
    solidBox(pick, '#997152', -.033, .33, .065, .050, .87, .018);
    for (let i = 0; i < 5; i++) solidBox(pick, '#6f4d3b', 0, .06 + .12 * i, .073, .114, .04, .02);
    const head = new T.Group();
    pick.add(head);
    head.position.y = .78;
    for (const [i, [x, y]] of [[-.34,-.15],[-.26,-.07],[-.17,0],[-.07,.058],[.04,.066],[.15,.04],[.25,-.024],[.34,-.11],[.39,-.2]].entries()) {
        const offset = i * .0006;
        solidBox(head, '#17484a', x, y, offset, .092, .15, .126);
        solidBox(head, '#51cfc0', x, y+.016, .045 + offset, .087, .106, .056);
        solidBox(head, '#a4fff1', x, y+.05, .077 + offset, .086, .028, .02);
    }
    arm.add(pick);
    rig.add(arm);
    return rig;
}

export class MineScene {
    scene = new T.Scene();
    player = new T.Vector3(10.50, 0, 16.65);
    camera = new T.PerspectiveCamera(90, 1, .055, 64);
    cameraRay = new T.Vector3();
    position = new T.Vector3();
    velocity = new T.Vector3();
    marks = new Map();
    labels = [];
    effects = [];
    swing = 0;
    grounded = false;
    pendingJump = false;
    elapsed = 0;
    frameBudget = 0;
    pixelRatio = Math.min(devicePixelRatio || 1, 1.6);
    isCoarse = matchMedia('(pointer:coarse)').matches;

    constructor(canvas, prices, world, atlas) {
        this.canvas = canvas;
        this.prices = prices;
        this.world = world;
        this.renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
        this.renderer.setClearColor(sky);
        this.scene.background = new T.Color(sky);
        this.scene.fog = WORLD_FOG;
        this.material = new T.MeshBasicMaterial({ map: atlas, vertexColors: true });
        this.toolScene = new T.Scene();
        this.toolCamera = new T.PerspectiveCamera(53, 1, .03, 5);
        this.tool = makeTool();
        this.toolScene.add(this.tool);
        this.outline = new T.LineSegments(new T.EdgesGeometry(box), new T.LineBasicMaterial({ color: 0xe1ffee, transparent: true, opacity: .72 }));
        this.outline.scale.setScalar(1.005);
        this.outline.visible = false;
        this.scene.add(this.outline);
        this.particles = new T.InstancedMesh(box, new T.MeshBasicMaterial(), 84);
        this.particles.instanceMatrix.setUsage(T.DynamicDrawUsage);
        this.particles.frustumCulled = false;
        this.particles.count = 0;
        this.scene.add(this.particles);
        this.coins = new T.InstancedMesh(coin, new T.MeshBasicMaterial(), 84);
        this.coins.instanceMatrix.setUsage(T.DynamicDrawUsage);
        this.coins.frustumCulled = false;
        this.coins.count = 0;
        this.scene.add(this.coins);
        this.tnt = null;
        scenery(this.scene);
        for (const key of world.keys()) this.rebuild(key);
        for (let i = 0; i < 12; i++) {
            const label = document.createElement('span');
            label.className = 'price';
            label.hidden = true;
            prices.append(label);
            this.labels.push(label);
        }
        this.respawn();
        this.resize();
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas);
    }

    resize() {
        this.screenWidth = this.canvas.clientWidth;
        this.screenHeight = this.canvas.clientHeight;
        if (!this.screenWidth || !this.screenHeight) return;
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.screenWidth, this.screenHeight, false);
        this.camera.aspect = this.toolCamera.aspect = this.screenWidth / this.screenHeight;
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
        this.toolCamera.updateProjectionMatrix();
    }

    rebuild(key) {
        const previous = this.world.chunks.get(key);
        if (previous) {
            this.scene.remove(previous);
            previous.geometry.dispose();
            this.world.chunks.delete(key);
        }
        const faces = this.world.faces(key);
        this.marks.delete(key);
        if (!faces.length) return;
        const positions = [];
        const colors = [];
        const uvs = [];
        const indices = [];
        const oreFaces = [];
        const tint = new T.Color();
        for (const { x, y, z, block, face } of faces) {
            const offset = positions.length / 3;
            const tile = block === 3 && face.delta[1] !== 1 ? 12 : block;
            const caveLight = T.MathUtils.clamp((-y - 5) * .045, 0, .62);
            tint.copy(face.delta[1] === 1 ? sunlight : daylight).lerp(shade, caveLight).multiplyScalar(face.shade);
            for (const [vx, vy, vz] of face.vertices) {
                positions.push(x + vx, y + vy, z + vz);
                colors.push(tint.r, tint.g, tint.b);
            }
            uvs.push(...uvFor(tile));
            indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
            if (BLOCKS[block].price) {
                const [dx, dy, dz] = face.delta;
                oreFaces.push({
                    point: new T.Vector3(x+.5+dx*.515, y+.53+dy*.515, z+.5+dz*.515),
                    normal: new T.Vector3(dx, dy, dz),
                    index: x + z * width + (-y - 1) * width ** 2,
                    block,
                });
            }
        }
        const geometry = new T.BufferGeometry();
        geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();
        const mesh = new T.Mesh(geometry, this.material);
        this.world.chunks.set(key, mesh);
        if (oreFaces.length) this.marks.set(key, { bounds: geometry.boundingSphere, oreFaces });
        this.scene.add(mesh);
    }

    respawn() {
        this.player.set(10.50, 0, 16.65);
        this.velocity.set(0, 0, 0);
        this.yaw = 0;
        this.pitch = -.82;
        this.pendingJump = false;
        this.grounded = true;
        this.updateCamera();
    }

    look(dx, dy, touch) {
        const sensitivity = touch ? .0054 : .00265;
        this.yaw -= dx * sensitivity;
        this.pitch = T.MathUtils.clamp(this.pitch - dy * sensitivity, -1.52, 1.52);
    }

    updateCamera() {
        this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
        this.camera.position.set(this.player.x, this.player.y + 1.60, this.player.z);
        this.camera.updateMatrixWorld();
    }

    collides(x, y, z) {
        const r = .25;
        for (let bx = Math.floor(x-r); bx <= Math.floor(x+r); bx++) {
            for (let by = Math.floor(y+.001); by <= Math.floor(y+1.73); by++) {
                for (let bz = Math.floor(z-r); bz <= Math.floor(z+r); bz++) {
                    if (this.world.solid(bx, by, bz)) return true;
                }
            }
        }
        return false;
    }

    walk(dt, moveX, moveY) {
        const speed = 3.45;
        const length = Math.max(1, Math.hypot(moveX, moveY));
        const dx = speed / length * (moveX * Math.cos(this.yaw) + moveY * Math.sin(this.yaw));
        const dz = speed / length * (-moveX * Math.sin(this.yaw) + moveY * Math.cos(this.yaw));
        const feel = 1 - Math.exp(-dt * 16);
        this.velocity.x = T.MathUtils.lerp(this.velocity.x, dx, feel);
        this.velocity.z = T.MathUtils.lerp(this.velocity.z, dz, feel);
        if (this.pendingJump && this.grounded) this.velocity.y = 6.55;
        this.pendingJump = false;
        this.velocity.y = Math.max(-15, this.velocity.y - 18 * dt);
        for (const axis of ['x', 'z', 'y']) {
            this.position.copy(this.player);
            this.position[axis] += this.velocity[axis] * dt;
            if (!this.collides(this.position.x, this.position.y, this.position.z)) {
                this.player.copy(this.position);
                if (axis === 'y') this.grounded = false;
            } else {
                if (axis === 'y') this.grounded = this.velocity.y <= 0;
                this.velocity[axis] = 0;
            }
        }
        this.updateCamera();
    }

    hit() {
        this.camera.getWorldDirection(this.cameraRay);
        return this.world.ray(this.camera.position, this.cameraRay, reach);
    }

    target(hit) {
        this.outline.visible = !!hit;
        if (hit) this.outline.position.set(hit.x+.5, hit.y+.5, hit.z+.5);
    }

    pop(hit, kind) {
        const amount = kind === 'blast' ? 48 : kind === 'coins' ? 16 : 11;
        const color = BLOCKS[hit.block].color;
        const colors = kind === 'blast' ? ['#ffca68','#f88048','#d94d3e','#53483d'] : kind === 'coins' ? ['#ffcd69','#ffe4a1'] : [color];
        for (let i = 0; i < amount; i++) {
            this.effects.push({
                x: hit.x + .25 + Math.random()*.5, y: hit.y + .58, z: hit.z + .25 + Math.random()*.5,
                vx: (Math.random()-.5) * (kind === 'blast' ? 9 : 3.4), vy: 1.8 + Math.random()*4.2, vz: (Math.random()-.5)*3.7,
                size: kind === 'coins' ? .15 : .06 + Math.random()*.15, kind,
                color: new T.Color(colors[i % colors.length]), life: .46 + Math.random()*.55,
            });
        }
        if (this.effects.length > 84) this.effects.splice(0, this.effects.length - 84);
    }

    remove(hit) {
        for (const key of this.world.remove(hit)) this.rebuild(key);
        this.pop(hit, 'rubble');
    }

    showTnt(hit) {
        this.tnt = new T.Group();
        this.tnt.position.set(hit.x+.5, hit.y+.45, hit.z+.5);
        solidBox(this.tnt, '#bc3d42', 0, 0, 0, .72, .72, .72);
        solidBox(this.tnt, '#e6c4a3', 0, 0, 0, .74, .19, .74);
        solidBox(this.tnt, '#fcb45d', 0, .42, 0, .10, .15, .10);
        this.scene.add(this.tnt);
    }

    clearTnt() {
        if (!this.tnt) return;
        this.scene.remove(this.tnt);
        this.tnt.traverse((item) => item.material?.dispose());
        this.tnt = null;
    }

    badges() {
        const camera = this.camera;
        const candidates = [];
        const direction = new T.Vector3();
        const projected = new T.Vector3();
        for (const { bounds, oreFaces } of this.marks.values()) {
            if (bounds.center.distanceToSquared(camera.position) > (bounds.radius + 10) ** 2) continue;
            for (const face of oreFaces) {
                direction.subVectors(camera.position, face.point);
                const distance = direction.lengthSq();
                if (distance > 94 || direction.dot(face.normal) <= 0) continue;
                projected.copy(face.point).project(camera);
                if (Math.abs(projected.x) > .97 || Math.abs(projected.y) > .9 || projected.z < 0 || projected.z > 1) continue;
                candidates.push({ ...face, distance, x: (projected.x / 2 + .5) * this.screenWidth, y: (-projected.y / 2 + .5) * this.screenHeight });
            }
        }
        candidates.sort((a,b) => a.distance - b.distance);
        const visible = [];
        const seen = new Set();
        for (const item of candidates) {
            if (visible.length === this.labels.length) break;
            if (seen.has(item.index) || visible.some((other) => Math.abs(item.x-other.x) < 46 && Math.abs(item.y-other.y) < 16)) continue;
            direction.subVectors(item.point, camera.position).normalize();
            if (this.world.ray(camera.position, direction, Math.sqrt(item.distance) - .035)) continue;
            seen.add(item.index);
            visible.push(item);
        }
        this.labels.forEach((label, i) => {
            const item = visible[i];
            label.hidden = !item;
            if (!item) return;
            const ore = BLOCKS[item.block];
            label.style.setProperty('--ore', ore.color);
            label.textContent = usd(ore.price / 100);
            label.style.transform = `translate(${Math.round(item.x)}px,${Math.round(item.y)}px) translate(-50%,-135%)`;
        });
    }

    paint(dt, effectTime) {
        this.elapsed += dt;
        this.swing = Math.max(0, this.swing - 5.6 * dt);
        const swingAmount = Math.sin(this.swing * Math.PI);
        const gait = Math.hypot(this.velocity.x, this.velocity.z) * (this.grounded ? .006 : .002);
        const handX = this.toolCamera.aspect * .32;
        this.tool.scale.setScalar(.55);
        this.tool.position.set(handX - swingAmount * .14, -.42 + Math.sin(this.elapsed * 12) * gait - swingAmount * .12, -1.24);
        this.tool.rotation.set(-.68 - swingAmount*.95, -.32 + swingAmount*.38, -.24 + swingAmount*.56);
        if (this.tnt) this.tnt.scale.setScalar(1 + Math.sin(effectTime * 41) * .11);
        if (this.effects.length) {
            this.effects = this.effects.filter((effect) => (effect.life -= dt) > 0);
            this.particles.count = 0;
            this.coins.count = 0;
            this.effects.forEach((effect, i) => {
                effect.x += effect.vx * dt;
                effect.y += effect.vy * dt;
                effect.z += effect.vz * dt;
                effect.vy -= dt * 9.5;
                dummy.position.set(effect.x, effect.y, effect.z);
                dummy.rotation.set(this.elapsed*4+i, this.elapsed*6+i, i);
                dummy.scale.setScalar(effect.size);
                dummy.updateMatrix();
                const instances = effect.kind === 'coins' ? this.coins : this.particles;
                const slot = instances.count++;
                instances.setMatrixAt(slot, dummy.matrix);
                instances.setColorAt(slot, effect.color);
            });
            for (const instances of [this.particles, this.coins]) {
                instances.instanceMatrix.needsUpdate = true;
                if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
            }
        }
        this.renderer.autoClear = true;
        this.renderer.render(this.scene, this.camera);
        this.renderer.autoClear = false;
        this.renderer.clearDepth();
        this.renderer.render(this.toolScene, this.toolCamera);
    }
}
