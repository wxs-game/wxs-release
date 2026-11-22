export function multiplierFor(ticket) {
    if (ticket < 4) return 0;
    if (ticket < 12) return 0.7;
    if (ticket < 24) return 1;
    if (ticket < 36) return 1.4;
    return 1.15;
}

export function hex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const digest = (input) => crypto.subtle.digest('SHA-256', input).then((result) => new Uint8Array(result));

export async function makeSeed() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return { seed: hex(bytes), commitment: hex(await digest(bytes)) };
}

export async function receipt(seed, nonce) {
    const encoder = new TextEncoder();
    let bytes = await digest(encoder.encode(seed + ':' + nonce));
    let n = new DataView(bytes.buffer).getUint32(0);
    while (n >= 4294967280) {
        bytes = await digest(bytes);
        n = new DataView(bytes.buffer).getUint32(0);
    }
    const ticket = n % 40;
    return { ticket, multiplier: multiplierFor(ticket) };
}

export async function verify(result, expected) {
    if (!expected || result.commitment !== expected || !/^[a-f0-9]{64}$/.test(result.seed)) return false;
    const bytes = Uint8Array.from(result.seed.match(/../g), (part) => parseInt(part, 16));
    if (hex(await digest(bytes)) !== expected) return false;
    const checked = await receipt(result.seed, result.nonce);
    return checked.ticket === result.ticket && checked.multiplier === result.multiplier;
}
