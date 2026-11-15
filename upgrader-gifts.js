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
    const makeItem = (gift) => ({ ...gift, id: crypto.getRandomValues(new Uint32Array(4)).join("-") });

    function readInventory() {
        try {
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
            localStorage.setItem(storageKey, JSON.stringify(inventory));
        } catch {
            // Keep the inventory available in memory until the page closes.
        }
    }
    saveInventory();

    function textPrice(price) {
        return currency.format(price) + ' GRAM';
    }

    function update() {
        const item = inventory.find((gift) => gift.id === stakeId);
        const stake = item && (prices.get(item.slug) || item);
        const target = prices.get(targetSlug);
        const chance = stake && target && target.price > stake.price
            ? Math.min(90, 95 * stake.price / target.price)
            : 0;
        const targetLabel = get('Target');
        targetLabel.hidden = !target;
        targetLabel.textContent = target ? target.name + ' · ' + textPrice(target.price) : '';
        get('Open').querySelector('span').textContent = target ? 'Сменить подарок' : 'Выбрать подарок';
        get('Stake').textContent = stake
            ? stake.name + ' · ' + textPrice(stake.price)
            : 'Выбрать подарок из инвентаря';
        get('Odds').textContent = chance ? currency.format(chance) + '%' : '—';
        get('Count').textContent = inventory.length;
        play.disabled = !chance;
        return { stake, target, chance };
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
                prices = new Map([...latest].filter(([, gift]) => gift.date === newest));
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

    function tile(item, onSelect) {
        const gift = prices.get(item.slug) || item;
        const button = document.createElement('button');
        button.className = 'wxs-gift-tile';
        button.type = 'button';
        const image = document.createElement('img');
        image.loading = 'lazy';
        image.alt = '';
        image.addEventListener('error', () => {
            const fallback = document.createElement('span');
            fallback.className = 'wxs-gift-fallback';
            fallback.textContent = '🎁';
            fallback.setAttribute('aria-hidden', 'true');
            image.replaceWith(fallback);
        }, { once: true });
        image.src = 'https://nft.fragment.com/gift/' + gift.slug + '-1.large.jpg';
        const name = document.createElement('strong');
        name.textContent = gift.name;
        const label = document.createElement('small');
        label.textContent = textPrice(gift.price);
        button.append(image, name, label);
        button.addEventListener('click', onSelect);
        return button;
    }

    function render() {
        const catalog = view === 'catalog';
        const query = search.value.trim().toLocaleLowerCase();
        const entries = catalog
            ? [...prices.values()].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
            : inventory;
        const filtered = entries.filter((gift) => gift.name.toLocaleLowerCase().includes(query));
        get('Source').hidden = !catalog;
        get('PriceDate').textContent = '· ' + sourceStatus + ' · ' + priceDate;
        notice.hidden = filtered.length > 0;
        notice.textContent = query ? 'Подарки не найдены' : 'Инвентарь пуст';
        list.replaceChildren(...filtered.map((gift) => tile(gift, () => {
            if (catalog) targetSlug = gift.slug;
            else stakeId = gift.id;
            result.hidden = true;
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
        if (view === 'catalog') refreshPrices();
    }

    get('Open').addEventListener('click', (event) => open('catalog', event.currentTarget));
    for (const name of ['Stake', 'Inventory']) {
        get(name).addEventListener('click', (event) => open('inventory', event.currentTarget));
    }
    get('Game').addEventListener('click', () => mode.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    get('Close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => returnFocus?.focus());
    search.addEventListener('input', render);
    play.addEventListener('click', () => {
        const { target, chance } = update();
        if (!chance) return;
        const won = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 < chance / 100;
        inventory = inventory.filter((gift) => gift.id !== stakeId);
        if (won) inventory.push(makeItem(target));
        stakeId = undefined;
        saveInventory();
        update();
        result.dataset.win = String(won);
        result.textContent = won
            ? 'Победа! ' + target.name + ' добавлен в инвентарь.'
            : 'Мимо. Демоподарок списан.';
        result.hidden = false;
    });
    update();
})();
