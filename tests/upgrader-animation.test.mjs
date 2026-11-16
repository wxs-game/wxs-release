import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const animation = source.slice(source.indexOf('function upgAnimate('), source.indexOf('/* ---------- интерфейс ---------- */'));
for (const random of [0.1, 0.9]) {
    for (const fallback of [false, true]) {
        test(`six second monotone spin, braking ${random}, fallback ${fallback}`, async () => {
            let finish, frames, options, now = 0;
            const angles = [];
            const upg = { theta: 348, stack: { classList: { add() {}, remove() {} } }, rotor: {} };
            if (!fallback) upg.rotor.animate = (f, o) => {
                frames = f; options = o;
                return { finished: { then(fn) { finish = fn; } }, cancel() {} };
            };
            const context = vm.createContext({
                upg, UPG_SPIN_MS: 6000, Math: Object.assign(Object.create(Math), { random: () => random }),
                window: { matchMedia: () => ({ matches: false }) },
                cancelAnimationFrame() {}, requestAnimationFrame(fn) { finish = fn; return 1; },
                setTimeout() { return 1; }, clearTimeout() {}, performance: { now: () => 0 },
                upgPickTarget: (lo, hi) => (lo + hi) / 2 % 360,
                upgDraw() {}, upgPaintLose() {}, upgSetRotorAngle(a) { angles.push(a); upg.theta = a; }
            });
            vm.runInContext(animation, context);
            const result = context.upgAnimate(true, 53);
            if (fallback) {
                while (now < 6000) { now += 1000 / 60; finish(now); }
            } else {
                assert.equal(options.duration, 6000);
                angles.push(...frames.map(f => Number(f.transform.match(/rotate\((.*?)deg/)[1])));
                finish();
            }
            await result;
            for (let i = 1; i < angles.length; i++) assert.ok(angles[i] >= angles[i - 1] - 1e-8);
            assert.equal(upg.result, 'win');
            assert.ok(Math.abs(upg.theta % 360 - 180) < 1e-8);
        });
    }
}
