import * as THREE from '../vendor/three.module.js';
import { BLOCKS } from './config.js';

const side = 24;
const stride = side + 2;
const atlasWidth = stride * 16;
const stoneSide = 128;
const atlasHeight = stride + stoneSide;
const stoneUrl = new URL('../../assets/minecraft/stone.png', import.meta.url);

function noise(x, y, salt) {
    const mixed = Math.imul(x + salt * 47, 0x45d9f3b) ^ Math.imul(y + salt * 109, 0x119de1f3);
    return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
}

function pixel(id, x, y) {
    const rock = BLOCKS[id >= 5 && id <= 11 ? 1 : id]?.color ?? '#8f6746';
    let rgb = rock.slice(1).match(/../g).map((pair) => parseInt(pair, 16));
    const patch = noise(x >> 2, y >> 2, id);
    const grain = noise(x, y, 1);
    let shade = 0.78 + patch * 0.28 + grain * 0.12;
    if (id === 12) {
        const turf = y < 4 + Math.floor(noise(x >> 1, 1, 12) * 4);
        rgb = turf ? [102, 149, 100] : [127, 97, 75];
        if (turf && y === 0) shade += .13;
    }
    if (id === 1 || id === 4 || (id >= 5 && id <= 11)) {
        const fold = (y + Math.floor(x / 6) + Math.floor(noise(x >> 2, 4, 2) * 3)) % 9;
        shade += fold === 0 ? -0.13 : fold === 1 ? 0.10 : 0;
    }
    if (id >= 5 && id <= 11) {
        // Inset clusters with a dark rim and a bright upper facet.
        const veins = [[5,5,3], [17,7,4], [11,16,4], [20,19,2], [3,17,2]];
        for (const [cx, cy, radius] of veins) {
            const dx = x - cx - (id % 3 - 1);
            const dy = y - cy;
            const distance = Math.abs(dx) + Math.abs(dy) + (grain > .83 ? 1 : 0);
            if (distance > radius + 1) continue;
            const ore = BLOCKS[id].color.slice(1).match(/../g).map((pair) => parseInt(pair, 16));
            rgb = ore;
            shade = distance === radius + 1 ? 0.56 : dy < 0 ? 1.17 : 0.84 + grain * 0.22;
            if (id === 5 && dy < 0) shade = 1.48;
            break;
        }
    }
    if (id === 13) shade = .73 + (x % 7 > 1 ? .18 : 0) + noise(x, y >> 2, 13) * .17;
    if (id === 14) rgb = (y > 9 && y < 15) ? [229, 198, 163] : [176, 45, 43];
    if (id === 15) rgb = [228, 154, 67];
    return rgb.map((value) => Math.min(255, Math.round(value * shade)));
}

export async function makeAtlas() {
    const stone = new Image();
    stone.src = stoneUrl.href;
    await stone.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = stoneSide;
    const context = canvas.getContext('2d');
    context.drawImage(stone, 0, 0);
    const stonePixels = context.getImageData(0, 0, stoneSide, stoneSide).data;
    const pixels = new Uint8Array(atlasWidth * atlasHeight * 4);
    const clamp = (n) => Math.max(0, Math.min(side - 1, n));
    for (let id = 2; id < 16; id++) {
        for (let y = -1; y <= side; y++) {
            for (let x = -1; x <= side; x++) {
                const [r, g, b] = pixel(id, clamp(x), clamp(y));
                const offset = ((side - y) * atlasWidth + id * stride + x + 1) * 4;
                pixels.set([r, g, b, 255], offset);
            }
        }
    }
    for (let y = 0; y < stoneSide; y++) {
        const row = y * stoneSide * 4;
        const offset = (atlasHeight - y - 1) * atlasWidth * 4;
        pixels.set(stonePixels.subarray(row, row + stoneSide * 4), offset);
    }
    const texture = new THREE.DataTexture(pixels, atlasWidth, atlasHeight);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
}

export function uvFor(tile) {
    // The GLB samples its stone texture with a two-texel inset on each edge.
    if (tile === 1) {
        const start = 2 / atlasWidth;
        const end = (stoneSide - 2) / atlasWidth;
        const low = (stride + 2) / atlasHeight;
        const high = (atlasHeight - 2) / atlasHeight;
        return [start, low, end, low, end, high, start, high];
    }
    const start = (tile * stride + 1.5) / atlasWidth;
    const end = (tile * stride + side + 0.5) / atlasWidth;
    const low = 1.5 / atlasHeight;
    const high = (side + 0.5) / atlasHeight;
    return [start, low, end, low, end, high, start, high];
}
