import { CONFIG } from './config.js';

const { width, depth } = CONFIG;
const area = width * width;
const chunkSize = 5;
export const indexOf = (x, depth, z) => ((depth - 1) * width + z) * width + x;

export function blockAt(x, depth, z, seed) {
    const lip = Math.min(x, width - 1 - x, z, width - 1 - z);
    const basin = Math.min(lip, Math.max(0, 16 - z), Math.max(0, z - 2));
    const empty = basin < 1 ? 0 : basin < 2 ? 1 : basin < 4 ? 2 : basin < 6 ? 4 : 6;
    if (depth <= empty) return 0;

    if (depth === 3 && z === 13 && x >= 6 && x <= 12) return 5 + (x - 6);
    if (depth === 2 && z === 15 && x >= 8 && x <= 12) return [7, 6, 5, 8, 11][x - 8];
    const cell = indexOf(x, depth, z);
    const n = (cell * 379 + seed * 527) % 65521;
    const roll = (n * (n + 17) + 1319) % 1000;
    if (depth > empty + 1 && roll < 95) {
        if (roll < 8) return depth > 7 ? 11 : 7;
        if (roll < 17) return depth > 6 ? 10 : 6;
        if (roll < 27) return depth > 5 ? 9 : 7;
        if (roll < 38) return 8;
        if (roll < 55) return 7;
        if (roll < 75) return 6;
        return 5;
    }
    if (depth === 1) return 3;
    if (empty === 0 && depth <= 3) return 2;
    return depth > 30 || roll > 930 ? 4 : 1;
}

// Vertices are counterclockwise from the exposed side.
export const FACES = [
    { delta: [1, 0, 0], shade: 0.78, vertices: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
    { delta: [-1, 0, 0], shade: 0.87, vertices: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
    { delta: [0, 1, 0], shade: 1.0, vertices: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
    { delta: [0, -1, 0], shade: 0.59, vertices: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
    { delta: [0, 0, 1], shade: 0.91, vertices: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
    { delta: [0, 0, -1], shade: 0.74, vertices: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
];

export class World {
    cells = new Uint8Array(area * depth);
    chunks = new Map();

    constructor(seed, removed) {
        for (let d = 1; d <= depth; d++) {
            for (let z = 0; z < width; z++) {
                for (let x = 0; x < width; x++) this.cells[indexOf(x, d, z)] = blockAt(x, d, z, seed);
            }
        }
        for (const cell of removed) this.cells[cell] = 0;
    }

    get(x, y, z) {
        if (x < 0 || x >= width || z < 0 || z >= width || y >= 0 || y < -depth) return 0;
        return this.cells[indexOf(x, -y, z)];
    }

    solid(x, y, z) {
        return x < 0 || z < 0 || x >= width || z >= width || y < -depth || this.get(x, y, z) !== 0;
    }

    remove(hit) {
        const { x, y, z } = hit;
        this.cells[indexOf(x, -y, z)] = 0;
        const affected = new Set([this.chunkKey(x, y, z)]);
        for (const { delta: [dx, dy, dz] } of FACES) {
            if (this.get(x + dx, y + dy, z + dz)) affected.add(this.chunkKey(x + dx, y + dy, z + dz));
        }
        return affected;
    }

    chunkKey(x, y, z) {
        return Math.floor(x / chunkSize) + ':' + Math.floor((-y - 1) / chunkSize) + ':' + Math.floor(z / chunkSize);
    }

    *keys() {
        for (let x = 0; x < width; x += chunkSize) {
            for (let d = 0; d < depth; d += chunkSize) {
                for (let z = 0; z < width; z += chunkSize) yield this.chunkKey(x, -d - 1, z);
            }
        }
    }

    faces(key) {
        const [cx, cd, cz] = key.split(':').map((part) => Number(part) * chunkSize);
        const output = [];
        for (let x = cx; x < cx + chunkSize; x++) {
            for (let y = -cd - chunkSize; y <= -cd - 1; y++) {
                for (let z = cz; z < cz + chunkSize; z++) {
                    const block = this.get(x, y, z);
                    if (!block) continue;
                    for (const face of FACES) {
                        const [dx, dy, dz] = face.delta;
                        if (this.solid(x + dx, y + dy, z + dz)) continue;
                        output.push({ x, y, z, block, face });
                    }
                }
            }
        }
        return output;
    }

    // Grid traversal without triangle intersections or per-block meshes.
    ray(origin, direction, distance) {
        const cell = [Math.floor(origin.x), Math.floor(origin.y), Math.floor(origin.z)];
        const from = [origin.x, origin.y, origin.z];
        const slope = [direction.x, direction.y, direction.z];
        const step = slope.map(Math.sign);
        const stride = slope.map((v) => 1 / Math.abs(v));
        const next = slope.map((v, i) => v === 0 ? Infinity : (cell[i] + (v > 0 ? 1 : 0) - from[i]) / v);
        let t = 0;
        while (t <= distance) {
            const [x, y, z] = cell;
            const block = this.get(x, y, z);
            if (block) return { x, y, z, block, t };
            const axis = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : (next[1] < next[2] ? 1 : 2);
            t = next[axis];
            cell[axis] += step[axis];
            next[axis] += stride[axis];
        }
        return null;
    }
}
