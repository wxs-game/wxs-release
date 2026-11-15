(() => {
    'use strict';

    const get = (name) => document.getElementById('wxsGift' + name);
    const mode = get('Mode');
    if (!mode) return;

    const dollar = get('Dollar');
    const dialog = get('Dialog');
    const search = get('Search');
    const list = get('List');
    const notice = get('Notice');
    const result = get('Result');
    const play = get('Play');
    const wheel = get('Wheel');
    const art = get('Art');
    const rotor = get('Rotor');
    const amount = get('Amount');
    const slider = get('Chance');
    const suggest = get('Suggest');
    const startingCash = 1_000_000;
    const dollars = (cents) => (cents / 100).toFixed(2) + ' $';
    let cashCents = startingCash;
    let stakeType = 'cash';
    let spinning = false;
    let rotation = 0;
    let displayedRoundChance;
    let requestedChance;
    let artSlug;
    const listedGifts = new Map();
    let requestedCatalog = false;
    const currency = new Intl.NumberFormat('ru', { maximumFractionDigits: 3 });
    const starter = ['xmasstocking', 'Xmas Stocking', 5];
    const snapshot = [
        starter, ['candycane', 'Candy Cane', 5], ['lolpop', 'Lol Pop', 5],
        ['cookieheart', 'Cookie Heart', 6], ['stellarrocket', 'Stellar Rocket', 6],
        ['lightsword', 'Light Sword', 7], ['bowtie', 'Bow Tie', 7],
        ['moonpendant', 'Moon Pendant', 8], ['snowglobe', 'Snow Globe', 8],
        ['bunnymuffin', 'Bunny Muffin', 10], ['finepen', 'Fine Pen', 10],
        ['hangingstar', 'Hanging Star', 11], ['tophat', 'Top Hat', 12],
        ['lovecandle', 'Love Candle', 13], ['sakuraflower', 'Sakura Flower', 14],
        ['recordplayer', 'Record Player', 15], ['lovepotion', 'Love Potion', 18],
        ['cupidcharm', 'Cupid Charm', 29], ['rarebird', 'Rare Bird', 33],
        ['toybear', 'Toy Bear', 40], ['diamondring', 'Diamond Ring', 41],
        ['genielamp', 'Genie Lamp', 44], ['swisswatch', 'Swiss Watch', 72],
        ['lootbag', 'Loot Bag', 159], ['astralshard', 'Astral Shard', 167]
    ];
    let prices = new Map(snapshot.map(([slug, name, price]) => [slug, { slug, name, price }]));
    let priceDate = '2026-11-15';
    let sourceStatus = 'Снимок цен Fragment';
    let loadedAt = 0;
    let request;
    let view;
    let stakeId;
    let targetSlug;
    let returnFocus;
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? 'preview';
    const storageKey = 'wxs-upgrader-demo-inventory-v1:' + userId;
    const stateKey = 'wxs-upgrader-demo-state-v2:' + userId;
    const makeItem = (gift) => ({ ...gift, id: crypto.getRandomValues(new Uint32Array(4)).join("-") });

    function readInventory() {
        try {
            const state = JSON.parse(localStorage.getItem(stateKey) ?? 'null');
            if (Array.isArray(state?.inventory) && Number.isSafeInteger(state.cashCents) && state.cashCents >= 0) {
                cashCents = state.cashCents;
                return state.inventory;
            }
            const items = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
            if (Array.isArray(items)) return items;
        } catch {
            // A disabled or unavailable store still allows a session demo.
        }
        return [makeItem(prices.get(starter[0]))];
    }

    let inventory = readInventory();

    function saveInventory() {
        try {
            localStorage.setItem(stateKey, JSON.stringify({ inventory, cashCents }));
        } catch {
            // Keep the inventory available in memory until the page closes.
        }
    }
    saveInventory();

    function textPrice(price) {
        return currency.format(price) + ' GRAM';
    }

    function imageFor(gift, lazy = false) {
        const image = document.createElement('img');
        image.alt = '';
        image.loading = lazy ? 'lazy' : 'eager';
        image.decoding = 'async';
        image.src = 'https://nft.fragment.com/gift/' + gift.slug + '-1.large.jpg';
        image.addEventListener('error', () => {
            image.addEventListener('error', () => {
                const fallback = document.createElement('span');
                fallback.className = 'wxs-gift-fallback';
                fallback.textContent = '🎁';
                fallback.setAttribute('aria-hidden', 'true');
                image.replaceWith(fallback);
            }, { once: true });
            image.src = 'https://api.changes.tg/original/' + encodeURIComponent(gift.slug) + '.png?size=256';
        }, { once: true });
        return image;
    }

    function currentTarget() {
        return prices.get(targetSlug) || listedGifts.get(targetSlug);
    }

    function centsForChance(target, chance) {
        return Math.max(1, Math.ceil(target.price * 100 * chance / 95));
    }

    function setSuggestedAmount(target, chance = 75) {
        requestedChance = chance;
        amount.value = (centsForChance(target, chance) / 100).toFixed(2);
    }

    function setStakeType(type) {
        stakeType = type;
        result.hidden = true;
        displayedRoundChance = undefined;
        update();
    }

    function update() {
        const item = inventory.find((gift) => gift.id === stakeId);
        const stake = item && (prices.get(item.slug) || item);
        const target = currentTarget();
        const usingCash = stakeType === 'cash';
        const betCents = Math.round(Number(amount.value) * 100);
        const bet = usingCash ? betCents / 100 : stake?.price;
        const chance = Number.isFinite(bet) && bet > 0 && target?.price > bet
            ? Math.min(usingCash ? requestedChance ?? 90 : 90, 95 * bet / target.price)
            : 0;
        const targetLabel = get('Target');
        targetLabel.hidden = !target;
        targetLabel.textContent = target ? target.name + ' · ' + (target.price ? textPrice(target.price) : 'цена недоступна') : '';
        wheel.hidden = !target;
        wheel.style.setProperty('--gift-sweep', (displayedRoundChance ?? chance) * 3.6 + 'deg');
        if (target?.slug !== artSlug) {
            artSlug = target?.slug;
            art.replaceChildren(...(target ? [imageFor(target)] : []));
        }
        get('Open').querySelector('span').textContent = target ? 'Сменить подарок' : 'Выбрать подарок';
        get('Stake').textContent = stake
            ? stake.name + ' · ' + textPrice(stake.price)
            : 'Выбрать подарок из инвентаря';
        get('Stake').hidden = usingCash;
        get('Cash').hidden = !usingCash;
        get('CashType').setAttribute('aria-pressed', String(usingCash));
        get('ItemType').setAttribute('aria-pressed', String(!usingCash));
        get('CashBalance').textContent = 'Демо-баланс ' + dollars(cashCents);
        const displayedChance = displayedRoundChance ?? chance;
        get('Odds').textContent = displayedChance ? new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(displayedChance) + '%' : '—';
        slider.value = chance ? String(Math.round(chance)) : '75';
        slider.disabled = spinning || !usingCash || !target?.price;
        suggest.hidden = !target?.price;
        if (target?.price) suggest.textContent = '≈75% за ' + dollars(centsForChance(target, 75));
        get('Count').textContent = inventory.length;
        for (const control of [amount, suggest, get('Open'), get('Stake'), get('CashType'), get('ItemType'), get('Inventory')]) {
            control.disabled = spinning;
        }
        const affordable = !usingCash || betCents <= cashCents;
        play.disabled = spinning || !chance || !affordable;
        play.textContent = spinning ? 'КРУТИМ…' : affordable ? 'АПГРЕЙДИТЬ' : 'НЕ ХВАТАЕТ ДЕМО $';
        return { target, chance, betCents, usingCash };
    }

    document.querySelectorAll('[data-upg-mode]').forEach((button) => {
        button.addEventListener('click', () => {
            const showGifts = button.dataset.upgMode === 'gifts';
            document.querySelectorAll('[data-upg-mode]').forEach((option) => {
                option.setAttribute('aria-pressed', String(option === button));
            });
            dollar.hidden = showGifts;
            mode.hidden = !showGifts;
        });
    });

    function parsePrices(csv) {
        const [header, ...lines] = csv.trim().split(/\r?\n/);
        const columns = header.replace(/^\uFEFF/, '').split(',');
        const dateIndex = columns.indexOf('date');
        const slugIndex = columns.indexOf('collection_slug');
        const nameIndex = columns.indexOf('collection_name');
        const priceIndex = columns.indexOf('floor_gram');
        if ([dateIndex, slugIndex, nameIndex, priceIndex].includes(-1)) throw new Error('Unknown format');

        const latest = new Map();
        for (const line of lines) {
            const cells = line.match(/(?:^|,)(?:"(?:[^"]|"")*"|[^,]*)/g)?.map((cell, index) => {
                const value = index ? cell.slice(1) : cell;
                return value.startsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value;
            });
            if (!cells) continue;
            const date = cells[dateIndex];
            const slug = cells[slugIndex]?.toLowerCase().replace(/[^a-z0-9]/g, '');
            const name = cells[nameIndex];
            const price = Number(cells[priceIndex]);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !slug || !name || !Number.isFinite(price) || price <= 0) continue;
            if ((latest.get(slug)?.date ?? '') > date) continue;
            latest.set(slug, { slug, name, price, date });
        }
        if (!latest.size) throw new Error('Empty catalog');
        return latest;
    }

    function refreshPrices() {
        if (request || Date.now() - loadedAt < 15 * 60_000) return;
        request = (async () => {
            try {
                const response = await fetch('https://tggifts.com/data/floors-daily.csv', {
                    signal: AbortSignal.timeout(6500)
                });
                if (!response.ok) throw new Error('Price request failed');
                const latest = parsePrices(await response.text());
                const newest = [...latest.values()].reduce((date, gift) => gift.date > date ? gift.date : date, '');
                if (newest < priceDate) throw new Error('Older snapshot');
                const oldTarget = currentTarget();
                prices = new Map([...latest].filter(([, gift]) => gift.date === newest));
                if (oldTarget?.price && requestedChance && currentTarget()?.price) setSuggestedAmount(currentTarget(), requestedChance);
                priceDate = newest;
                sourceStatus = 'Дневные цены Fragment';
                loadedAt = Date.now();
            } catch {
                sourceStatus = 'Обновление недоступно · сохранённые цены';
            } finally {
                request = null;
                update();
                if (dialog.open) render();
            }
        })();
    }

    async function refreshCatalog() {
        if (requestedCatalog) return;
        requestedCatalog = true;
        try {
            const response = await fetch('https://api.changes.tg/gifts', { signal: AbortSignal.timeout(6500) });
            if (!response.ok) throw new Error('Catalog request failed');
            const body = await response.json();
            const names = Array.isArray(body) ? body : body.gifts;
            if (!Array.isArray(names)) throw new Error('Unknown catalog format');
            for (const entry of names) {
                const name = typeof entry === 'string' ? entry : entry?.name;
                const slug = name?.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (slug) listedGifts.set(slug, { slug, name });
            }
            update();
            if (dialog.open && view === 'catalog') render();
        } catch {
            requestedCatalog = false;
        }
    }

    function tile(item, onSelect) {
        const gift = prices.get(item.slug) || item;
        const button = document.createElement('button');
        button.className = 'wxs-gift-tile';
        button.type = 'button';
        const image = imageFor(gift, true);
        const name = document.createElement('strong');
        name.textContent = gift.name;
        const label = document.createElement('small');
        label.textContent = gift.price ? textPrice(gift.price) : 'Цена недоступна';
        button.append(image, name, label);
        button.addEventListener('click', onSelect);
        return button;
    }

    function render() {
        const catalog = view === 'catalog';
        const query = search.value.trim().toLocaleLowerCase();
        const entries = catalog
            ? [...new Map([...listedGifts, ...prices]).values()].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.name.localeCompare(b.name))
            : inventory;
        const filtered = entries.filter((gift) => gift.name.toLocaleLowerCase().includes(query));
        get('Source').hidden = !catalog;
        get('PriceDate').textContent = '· ' + sourceStatus + ' · ' + priceDate;
        notice.hidden = filtered.length > 0;
        notice.textContent = query ? 'Подарки не найдены' : 'Инвентарь пуст';
        list.replaceChildren(...filtered.map((gift) => tile(gift, () => {
            if (catalog) {
                targetSlug = gift.slug;
                if (gift.price) setSuggestedAmount(gift);
            } else {
                stakeId = gift.id;
                stakeType = 'gift';
            }
            result.hidden = true;
            displayedRoundChance = undefined;
            update();
            dialog.close();
        })));
        if (!catalog && !inventory.length && !query) {
            const refill = document.createElement('button');
            refill.type = 'button';
            refill.textContent = 'Получить демоподарок';
            refill.addEventListener('click', () => {
                inventory = [makeItem(prices.get(starter[0]) || { slug: starter[0], name: starter[1], price: starter[2] })];
                stakeId = inventory[0].id;
                saveInventory();
                update();
                dialog.close();
            });
            list.append(refill);
        }
    }

    function open(viewName, trigger) {
        view = viewName;
        returnFocus = trigger;
        search.value = '';
        get('Title').textContent = view === 'catalog' ? 'Каталог Telegram-подарков' : 'Инвентарь';
        render();
        dialog.showModal();
        if (view === 'catalog') {
            refreshPrices();
            refreshCatalog();
        }
    }

    get('Open').addEventListener('click', (event) => open('catalog', event.currentTarget));
    for (const name of ['Stake', 'Inventory']) {
        get(name).addEventListener('click', (event) => open('inventory', event.currentTarget));
    }
    get('Game').addEventListener('click', () => mode.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    get('Close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => returnFocus?.focus());
    search.addEventListener('input', render);
    get('CashType').addEventListener('click', () => setStakeType('cash'));
    get('ItemType').addEventListener('click', () => setStakeType('gift'));
    suggest.addEventListener('click', () => {
        const target = currentTarget();
        if (!target?.price) return;
        setSuggestedAmount(target);
        setStakeType('cash');
    });
    slider.addEventListener('input', () => {
        const target = currentTarget();
        if (!target?.price) return;
        setSuggestedAmount(target, Number(slider.value));
        result.hidden = true;
        displayedRoundChance = undefined;
        update();
    });
    amount.addEventListener('input', () => {
        requestedChance = undefined;
        result.hidden = true;
        displayedRoundChance = undefined;
        update();
    });

    play.addEventListener('click', async () => {
        const { target, chance, betCents, usingCash } = update();
        if (play.disabled) return;
        const roll = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
        const won = roll < chance / 100;
        spinning = true;
        displayedRoundChance = chance;
        result.hidden = true;
        if (usingCash) cashCents -= betCents;
        else {
            inventory = inventory.filter((gift) => gift.id !== stakeId);
            stakeId = undefined;
        }
        if (won) inventory.push(makeItem(target));
        saveInventory();
        update();

        const angle = roll * 360;
        const landing = Math.floor(rotation / 360) * 360 + 5 * 360 + angle;
        if (rotor.animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
            try {
                await rotor.animate(
                    [{ transform: 'rotate(' + rotation + 'deg)' }, { transform: 'rotate(' + landing + 'deg)' }],
                    { duration: 2400, easing: 'cubic-bezier(.12,.69,.16,1)', fill: 'forwards' }
                ).finished;
            } catch {
                // The round is already settled even if animation is interrupted.
            }
        }
        rotation = angle;
        rotor.style.transform = 'rotate(' + angle + 'deg)';
        rotor.getAnimations?.().forEach((animation) => animation.cancel());
        spinning = false;
        update();
        result.dataset.win = String(won);
        result.textContent = won
            ? 'Победа! ' + target.name + ' добавлен в инвентарь.'
            : usingCash ? 'Мимо. Списано ' + dollars(betCents) + ' с демо-баланса.' : 'Мимо. Демоподарок списан.';
        result.hidden = false;
    });
    update();
})();
