import { BLOCKS, CONFIG, usd } from './config.js';
import { World, indexOf } from './world.js';
import { MineScene } from './scene.js';
import { makeAtlas } from './textures.js';
import { demo, MineSession, telegram } from './session.js';
import { verify } from './outcomes.js';

const $ = (name) => document.getElementById(name);
const mine = $('mine');
const canvas = $('view');
const guide = $('guide');
const stick = $('stick');
const session = new MineSession();
const keys = new Set();
const touchMove = { x: 0, y: 0 };
let scene;
let commitment;
let lastTarget;
let digging = false;
let nextDigAt = 0;
let pending;
let aimed = null;
let explosion;
let toastTimer;
let life = true;
let previous = 0;
let badgeTimer = 0;
let movePointer;
let lookPointer;
let lastLook;
let adaptiveSeconds = 0;
let slowFrames = 0;
let terrainKey;
let terrain = new Set();
let minedBlocks = 0;

function updateSafeArea() {
    const inset = telegram?.contentSafeAreaInset;
    if (!inset) return;
    document.documentElement.style.setProperty('--tg-top', (inset.top + 8) + 'px');
    document.documentElement.style.setProperty('--tg-bottom', (inset.bottom + 8) + 'px');
}

function balance(amount) {
    $('balance').textContent = usd(amount);
}

function updateExperience() {
    const level = Math.floor(minedBlocks / 10);
    const indicator = $('level');
    indicator.textContent = String(level);
    indicator.hidden = level === 0;
    const experience = $('experience');
    experience.value = minedBlocks % 10;
    experience.setAttribute('aria-label', 'Опыт добычи, уровень ' + level);
}

function updateHealth(alive) {
    const hearts = $('hearts');
    hearts.classList.toggle('depleted', !alive);
    hearts.setAttribute('aria-label', alive ? 'Полное здоровье' : 'Здоровье исчерпано');
}

function toast(title, text, kind) {
    const popup = $('toast');
    popup.querySelector('b').textContent = title;
    popup.querySelector('small').textContent = text;
    popup.dataset.kind = kind;
    popup.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { popup.hidden = true; }, 2700);
}

function haptic(kind) {
    try { telegram?.HapticFeedback?.notificationOccurred(kind); } catch { /* Optional WebApp feedback. */ }
}

function remove(hit) {
    if (terrainKey && !BLOCKS[hit.block].price) {
        terrain.add(indexOf(hit.x, -hit.y, hit.z));
        try { localStorage.setItem(terrainKey, JSON.stringify([...terrain])); } catch { /* Storage can be disabled. */ }
    }
    scene.remove(hit);
    minedBlocks++;
    updateExperience();
    badgeTimer = 0;
}

async function dig() {
    if (!scene || !life || guide.open || digging || performance.now() < nextDigAt) return;
    const hit = pending?.hit ?? scene.hit();
    if (!hit) return;
    nextDigAt = performance.now() + 260;
    scene.swing = 1;
    const ore = BLOCKS[hit.block];
    if (!ore.price) {
        if (hit.x === 10 && hit.y === -1 && hit.z === 16) {
            toast('Площадка возрождения', 'Этот блок держит вход в шахту', 'error');
            return;
        }
        remove(hit);
        return;
    }
    pending ??= { hit, cell: indexOf(hit.x, -hit.y, hit.z), nonce: crypto.randomUUID() };
    digging = true;
    try {
        const result = await session.dig(pending.cell, pending.nonce, ore.price / 100, commitment);
        if (result.status === 'funds') {
            balance(result.balance);
            pending = null;
            toast('Недостаточно средств', ore.name + ' · ' + usd(ore.price / 100), 'error');
            haptic('error');
            return;
        }
        if (result.status === 'changed' || result.status === 'depleted') {
            if (result.status === 'depleted') remove(hit);
            pending = null;
            balance(result.balance);
            commitment = result.commitment;
            toast('Шахта обновилась', 'Продолжай добычу', 'error');
            return;
        }
        if (result.status !== 'ok') throw new Error('UNEXPECTED_RESULT');
        pending = null;
        balance(result.balance);
        remove(hit);
        if (result.multiplier === 0) {
            life = false;
            explosion = { hit, start: performance.now(), burst: false };
            scene.showTnt(hit);
            haptic('error');
        } else {
            if (result.payout > 0) scene.pop(hit, 'coins');
            toast(ore.name + ' · ' + result.multiplier.toFixed(2) + '×', 'Выплата ' + usd(result.payout), 'win');
            haptic('success');
        }
        const checked = verify(result, commitment);
        commitment = result.next_commitment;
        const verified = await checked;
        $('proof').textContent = [
            verified ? 'Исход подтверждён' : 'Хеш требует проверки',
            'SHA-256 до ставки: ' + result.commitment,
            'Секрет после ставки: ' + result.seed,
            'Nonce: ' + result.nonce,
            'Билет: ' + result.ticket + ' / 39',
        ].join('\n');
    } catch (error) {
        const auth = /wxs_.*(?:auth|blocked|expired|required|access)/.test(error.message);
        toast(auth ? 'Доступ закрыт' : 'Не удалось завершить добычу',
            auth ? 'Открой игру заново через бота' : 'Нажми добычу ещё раз для проверки операции', 'error');
    } finally {
        digging = false;
    }
}

function animateExplosion(now) {
    if (!explosion) return;
    const since = now - explosion.start;
    if (since >= 610 && !explosion.burst) {
        explosion.burst = true;
        scene.clearTnt();
        scene.pop(explosion.hit, 'blast');
        $('damage').style.opacity = '1';
        updateHealth(false);
        $('death').hidden = false;
        toast('Взрыв ТНТ', 'Ставка сгорела', 'error');
    }
    if (explosion.burst) $('damage').style.opacity = String(Math.max(0, 1 - (since - 610) / 490));
    if (since < 2230) return;
    scene.respawn();
    life = true;
    explosion = null;
    $('death').hidden = true;
    updateHealth(true);
    badgeTimer = 0;
}

function frame(now) {
    const real = previous ? (now - previous) / 1000 : 0;
    const dt = Math.min(real, .05);
    previous = now;
    if (!guide.open) {
        if (life) {
            const keyboardX = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
            const keyboardY = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
            const steps = Math.ceil(dt / (1 / 90));
            for (let i = 0; i < steps; i++) scene.walk(dt / steps, keyboardX + touchMove.x, keyboardY + touchMove.y);
            aimed = scene.hit();
        } else {
            aimed = null;
        }
        scene.target(aimed);
        if (aimed?.block !== lastTarget) {
            lastTarget = aimed?.block;
            const target = $('target');
            target.hidden = !aimed;
            if (aimed) {
                const ore = BLOCKS[aimed.block];
                target.textContent = ore.name + (ore.price ? ' · ' + usd(ore.price / 100) : ' · бесплатно');
            }
        }
    }
    animateExplosion(now);
    const depth = Math.min(CONFIG.depth, Math.max(0, Math.floor(-scene.player.y + .05)));
    const depthText = String(depth).padStart(2, '0') + ' м';
    if ($('depth').textContent !== depthText) $('depth').textContent = depthText;
    if ((badgeTimer -= dt) <= 0) {
        scene.badges();
        badgeTimer = .08;
    }
    scene.paint(dt, now / 1000);
    if (real > 0 && real < .1 && !document.hidden) {
        adaptiveSeconds += real;
        slowFrames += Number(real > .021);
        if (adaptiveSeconds > 2) {
            if (slowFrames > 24 && scene.pixelRatio > .8) {
                scene.pixelRatio = Math.max(.8, scene.pixelRatio - .15);
                scene.resize();
            }
            adaptiveSeconds = 0;
            slowFrames = 0;
        }
    }
    requestAnimationFrame(frame);
}

function clearMove() {
    keys.clear();
    movePointer = lookPointer = undefined;
    touchMove.x = touchMove.y = 0;
    stick.firstElementChild.style.transform = '';
}

function controls() {
    const pressed = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyF']);
    window.addEventListener('keydown', (event) => {
        if (guide.open || !pressed.has(event.code) || event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        keys.add(event.code);
        if (event.code === 'Space' && !event.repeat) scene.pendingJump = true;
        if (event.code === 'KeyF' && !event.repeat) void dig();
    });
    window.addEventListener('keyup', (event) => keys.delete(event.code));
    window.addEventListener('blur', clearMove);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearMove();
    });

    canvas.addEventListener('pointerdown', (event) => {
        if (lookPointer !== undefined) return;
        if (event.pointerType === 'mouse') {
            if (event.button !== 0) return;
            if (document.pointerLockElement === canvas) {
                void dig();
                return;
            }
            if (canvas.requestPointerLock) {
                canvas.requestPointerLock()?.catch?.(() => {});
                return;
            }
        }
        lookPointer = event.pointerId;
        lastLook = { x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
        if (lookPointer !== event.pointerId) return;
        scene.look(event.clientX - lastLook.x, event.clientY - lastLook.y, event.pointerType !== 'mouse');
        lastLook = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('lostpointercapture', () => { lookPointer = undefined; });
    document.addEventListener('mousemove', (event) => {
        if (document.pointerLockElement === canvas && !guide.open) scene.look(event.movementX, event.movementY, false);
    });

    const slideStick = (event) => {
        if (event.pointerId !== movePointer) return;
        const rect = stick.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        const max = Math.max(26, Math.hypot(x, y));
        touchMove.x = x / max;
        touchMove.y = y / max;
        stick.firstElementChild.style.transform = `translate(${touchMove.x * 24}px,${touchMove.y * 24}px)`;
    };
    stick.addEventListener('pointerdown', (event) => {
        if (movePointer !== undefined) return;
        movePointer = event.pointerId;
        stick.setPointerCapture(event.pointerId);
        slideStick(event);
    });
    stick.addEventListener('pointermove', slideStick);
    stick.addEventListener('lostpointercapture', (event) => {
        if (event.pointerId !== movePointer) return;
        movePointer = undefined;
        touchMove.x = touchMove.y = 0;
        stick.firstElementChild.style.transform = '';
    });
    $('jump').addEventListener('click', () => { scene.pendingJump = true; });
    $('dig').addEventListener('click', () => { void dig(); });
    $('help').addEventListener('click', () => {
        if (document.pointerLockElement) document.exitPointerLock();
        clearMove();
        guide.showModal();
    });
}

async function start() {
    $('open-bot').href = CONFIG.bot;
    try {
        telegram?.ready();
        if (telegram?.initData) {
            telegram.expand();
            if (telegram.isVersionAtLeast?.('7.7')) telegram.disableVerticalSwipes?.();
            if (telegram.isVersionAtLeast?.('8.0')) {
                telegram.onEvent('contentSafeAreaChanged', updateSafeArea);
                updateSafeArea();
            }
        }
        const state = await session.enter();
        if (!Number.isInteger(state.world_seed) || !Array.isArray(state.removed)) throw new Error('STATE');
        commitment = state.commitment;
        balance(state.balance);
        if (demo) {
            $('demo-label').hidden = false;
        } else {
            terrainKey = 'wxs-mine-terrain-v1:' + CONFIG.admin + ':' + state.world_seed;
            try {
                const saved = JSON.parse(localStorage.getItem(terrainKey) ?? '[]');
                terrain = new Set(saved.filter((cell) => Number.isInteger(cell) && cell >= 0 && cell < CONFIG.width ** 2 * CONFIG.depth));
            } catch { /* Start with the server's paid blocks if local storage is unavailable. */ }
        }
        const removed = new Set([...state.removed, ...terrain]);
        minedBlocks = removed.size;
        updateExperience();
        const atlas = await makeAtlas();
        mine.hidden = false;
        scene = new MineScene(canvas, $('prices'), new World(state.world_seed, removed), atlas);
        $('entry').hidden = true;
        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            toast('Графика приостановлена', 'Перезапусти Mini App, если сцена не восстановится', 'error');
        });
        controls();
        requestAnimationFrame(frame);
    } catch (error) {
        mine.hidden = true;
        const showBot = error.message === 'ACCESS' || /wxs_.*(?:auth|blocked|expired|required|access)/.test(error.message);
        const unsupported = /WebGL/i.test(error.message);
        $('entry-status').textContent = showBot ? 'Открой шахту командой /mimecraft в личном чате @wxsgame.'
            : unsupported ? 'Для 3D-сцены требуется WebGL 2.' : 'Не удалось открыть шахту. Попробуй перезапустить Mini App.';
        $('open-bot').hidden = !showBot;
    }
}
void start();
