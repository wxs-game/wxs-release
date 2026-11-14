const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script.js'), 'utf8');
const cashout = source.slice(source.indexOf('async function cashOutCrash()'), source.indexOf('\nfunction handleCrashAction()'));
for (const freebet of [true, false]) {
  test(`${freebet ? 'freebet' : 'regular'} cashout preserves gross lobby payout and displays credited amount`, async () => {
    const srv = { ok: true, mult: 2.22, win: freebet ? 0.12 : 0.22, gross_win: 0.22, balance: 1.12, freebet };
    let popup;
    const ctx = { crashGame: { phase: 'flying', betPlaced: true, startTime: 0, roundId: 'r' },
      crashFbBetId: freebet ? 'fb' : null, crashFreebets: [{ id: 'fb' }],
      crashLobby: { bets: [{ isUser: true }] }, currentTotalWin: 0, currentWinsCount: 0, currentMaxWin: 0,
      advanceLocalPhase() {}, lockEconomy: () => true, snapshotBalanceState: () => ({}),
      computeCrashMultAt: () => 2.22, crashNow: () => 1, crashRpc: async () => srv,
      roundMoney: n => Math.round((Number(n) + Number.EPSILON) * 100) / 100,
      setUIBalance() {}, renderCrashPlayersList() {}, renderCrashUI() {}, unlockEconomy() {},
      window: { showWinPopup: (...args) => { popup = args; } } };
    vm.createContext(ctx);
    await vm.runInContext(cashout + '\ncashOutCrash()', ctx);
    assert.equal(ctx.crashGame.cashoutMult, 2.22);
    assert.equal(ctx.crashGame.cashoutWin, 0.22);
    assert.equal(ctx.crashLobby.bets[0].winAmount, 0.22);
    assert.deepEqual(popup, [freebet ? 0.12 : 0.22, 2.22, freebet]);
  });
}
