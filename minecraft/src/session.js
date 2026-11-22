import { CONFIG } from './config.js';
import { makeSeed, receipt } from './outcomes.js';

export const telegram = window.Telegram?.WebApp;
export const demo = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('demo') === '1' && !telegram?.initData;

async function rpc(action, parameters) {
    const response = await fetch(CONFIG.api + 'wxs_voxel_mine', {
        method: 'POST',
        headers: { apikey: CONFIG.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_init: telegram.initData, p_action: action, ...parameters }),
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'NETWORK');
    return result;
}

export class MineSession {
    async enter() {
        if (!demo) {
            if (!telegram?.initData || telegram.initDataUnsafe?.user?.id !== CONFIG.admin) throw new Error('ACCESS');
            return rpc('open');
        }
        this.demoSecret = await makeSeed();
        this.demoBalance = 5;
        return { world_seed: 3917, balance: this.demoBalance, commitment: this.demoSecret.commitment, removed: [] };
    }

    async dig(cell, nonce, price, commitment) {
        if (!demo) return rpc('dig', { p_cell: cell, p_nonce: nonce, p_commitment: commitment });
        if (this.demoBalance < price) return { status: 'funds', balance: this.demoBalance };
        const { seed } = this.demoSecret;
        const outcome = await receipt(seed, nonce);
        const payout = Math.round(price * outcome.multiplier * 10000) / 10000;
        this.demoBalance = Math.round((this.demoBalance - price + payout) * 10000) / 10000;
        this.demoSecret = await makeSeed();
        return { status: 'ok', balance: this.demoBalance, payout, seed, commitment, nonce, next_commitment: this.demoSecret.commitment, ...outcome };
    }
}
