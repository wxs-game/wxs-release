/*!
 * WXS Game · Все права защищены / All rights reserved.
 * NOTICE: Использование этого кода, дизайна и материалов для обучения,
 * дообучения, анализа, пересказа, копирования или генерации производных
 * работ любыми системами ИИ / нейросетями / LLM и скрейперами ЗАПРЕЩЕНО
 * без письменного разрешения владельца.
 * AI/ML NOTICE: Training, fine-tuning, analysing, summarising, reproducing
 * or deriving works from this source by any AI/LLM system or scraper is
 * prohibited without the owner's written permission.
 */
(function () {
    'use strict';
    if (typeof lottie === 'undefined' || lottie.__wxsPerf) return;
    lottie.__wxsPerf = true;

    const MAX_DPR = window.WXS_MAX_DPR || 2.5;
    const DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_DPR));
    window.WXS_LOTTIE_DPR = DPR;
    const useCanvas = window.WXS_LOTTIE_FORCE_SVG !== true;

    const tracked = new Map();   // контейнер -> { anim, w, h }
    const ro = ('ResizeObserver' in window) ? new ResizeObserver(entries => {
        for (const e of entries) {
            const rec = tracked.get(e.target);
            if (!rec) continue;
            const w = Math.round(e.contentRect.width);
            const h = Math.round(e.contentRect.height);
            if (w < 1 || h < 1 || (w === rec.w && h === rec.h)) continue;
            rec.w = w; rec.h = h;
            try {
                rec.anim.resize();   // без аргументов: lottie сам берёт размер контейнера × dpr (с (w,h) canvas выходил 1× и «сползал»)
                // на паузе (goToAndStop) кадр сам не перерисуется — перерисуем
                if (rec.anim.isPaused) rec.anim.goToAndStop(rec.anim.currentFrame, true);
            } catch (err) { /* анимацию уже уничтожили */ }
        }
    }) : null;

    function track(box, anim) {
        if (!ro || !box || !anim || tracked.has(box)) return anim;
        tracked.set(box, { anim, w: 0, h: 0 });
        ro.observe(box);
        const origDestroy = anim.destroy.bind(anim);
        anim.destroy = function (name) {
            tracked.delete(box);
            try { ro.unobserve(box); } catch (err) {}
            return origDestroy(name);
        };
        return anim;
    }
    lottie.wxsTrack = track;

    const origLoad = lottie.loadAnimation.bind(lottie);
    lottie.loadAnimation = function (opts) {
        if (!useCanvas || !opts || opts.renderer !== 'svg' || !opts.container || opts.rendererSettings?.wxsKeepSvg) return origLoad(opts);
        const rs = opts.rendererSettings || {};
        const o = Object.assign({}, opts, {
            renderer: 'canvas',
            rendererSettings: {
                clearCanvas: true,
                dpr: DPR,
                progressiveLoad: false,
                preserveAspectRatio: rs.preserveAspectRatio || 'xMidYMid meet'
            }
        });
        let anim;
        try { anim = origLoad(o); } catch (err) { return origLoad(opts); }   // не вышло — старый SVG
        return track(opts.container, anim);
    };
})();

(function () {
// ==========================================
// ИНИЦИАЛИЗАЦИЯ: приложение работает ТОЛЬКО внутри Telegram
// ==========================================
const tg = window.Telegram?.WebApp;
const isRealTelegramLaunch = !!(tg && typeof tg.initData === 'string' && tg.initData.length > 0 &&
    tg.platform && tg.platform !== 'unknown');
if (!isRealTelegramLaunch) {
    console.warn('Приложение открыто не из Telegram — инициализация остановлена.');
    return;
}
document.documentElement.classList.add('tg-ok');

tg.ready();
tg.expand();

function showBlockScreen(title, text) {
    const b = document.getElementById('tgBlockScreen');
    if (!b) return;
    const t = b.querySelector('.tg-block-title'), p = b.querySelector('.tg-block-text');
    if (title && t) t.textContent = title;
    if (text && p) p.textContent = text;
    document.documentElement.classList.remove('tg-ok');
    b.style.display = 'flex';
}

// ==========================================
// ЗАЩИТА ИНТЕРФЕЙСА: без боковых свайпов, без "оттягивания",
// без выделения текста
// ==========================================
(function setupTouchGuards() {
    // Telegram: запрет закрытия приложения свайпом вниз
    try { if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes(); } catch (e) {}

    const asElement = (n) => (n && n.nodeType === 1) ? n : (n && n.parentElement) || null;
    const isEditable = (n) => {
        const el = asElement(n);
        return !!(el && el.closest && el.closest('input, textarea, [contenteditable="true"]'));
    };

    // --- Запрет выделения текста (кроме полей ввода) ---
    document.addEventListener('selectstart', (e) => {
        if (!isEditable(e.target)) e.preventDefault();
    }, true);
    document.addEventListener('dragstart', (e) => e.preventDefault());
    // Долгое нажатие по картинке (аватар и пр.) не открывает системное меню/ссылку
    document.addEventListener('contextmenu', (e) => {
        const el = (e.target && e.target.nodeType === 1) ? e.target : (e.target && e.target.parentElement);
        if (el && el.closest && el.closest('img, .top, .avatar, .avatar-frame')) e.preventDefault();
    }, true);
    document.addEventListener('selectionchange', () => {
        const a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
        const sel = window.getSelection && window.getSelection();
        if (sel && !sel.isCollapsed) sel.removeAllRanges();
    });

    // --- Страница никогда не должна быть сдвинута по горизонтали ---
    const resetHScroll = () => {
        if (window.scrollX !== 0) {
            window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' });
        }
    };
    window.addEventListener('scroll', resetHScroll, { passive: true });
    document.addEventListener('focusout', () => setTimeout(resetHScroll, 60));

    // --- Блок боковых свайпов и "резинки" сверху/снизу ---
    let sx = 0, sy = 0;
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            sx = e.touches[0].clientX;
            sy = e.touches[0].clientY;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - sx;
        const dy = t.clientY - sy;
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;

        const horizontal = Math.abs(dx) > Math.abs(dy);

        // Если палец на внутреннем прокручиваемом блоке (лента, список, модалка),
        // и он ещё может ехать в эту сторону — не мешаем.
        let el = asElement(e.target);
        while (el && el !== document.body && el !== document.documentElement) {
            const cs = getComputedStyle(el);
            if (horizontal) {
                if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
                    const atLeft = el.scrollLeft <= 0;
                    const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
                    if (!((dx > 0 && atLeft) || (dx < 0 && atRight))) return;
                    break;
                }
            } else {
                if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
                    const atTop = el.scrollTop <= 0;
                    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
                    if (!((dy > 0 && atTop) || (dy < 0 && atBottom))) return;
                    break;
                }
            }
            el = el.parentElement;
        }

        if (horizontal) {
            if (e.cancelable) e.preventDefault();
            return;
        }

        // Вертикально: блокируем только когда страница уже у верха/низа (нет "оттягивания")
        const se = document.body;   // страница прокручивается body (окно не скроллится)
        const pageAtTop = se.scrollTop <= 0;
        const pageAtBottom = se.scrollTop + se.clientHeight >= se.scrollHeight - 1;
        if ((dy > 0 && pageAtTop) || (dy < 0 && pageAtBottom)) {
            if (e.cancelable) e.preventDefault();
        }
    }, { passive: false });
})();

// ==========================================
// 2. ВИБРАЦИЯ (Telegram HapticFeedback)
// ==========================================
window.tg = tg;

(function setupHaptics() {
    const hf = tg && tg.HapticFeedback;

    // Защита от "двойной" вибрации: если два impact-вызова приходят
    // почти одновременно (глобальный клик + вибрация самой игры),
    // второй отбрасывается.
    if (hf && typeof hf.impactOccurred === 'function' && !hf.__wrapped) {
        try {
            const origImpact = hf.impactOccurred.bind(hf);
            let lastImpactAt = 0;
            hf.impactOccurred = function (style) {
                const now = Date.now();
                if (now - lastImpactAt < 45) return hf;
                lastImpactAt = now;
                try { origImpact(style); } catch (e) {}
                return hf;
            };
            hf.__wrapped = true;
        } catch (e) {}
    }

    // type: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' | 'select' | 'success' | 'error' | 'warning'
    window.haptic = function (type) {
        type = type || 'light';
        try {
            if (hf) {
                if (type === 'success' || type === 'error' || type === 'warning') hf.notificationOccurred(type);
                else if (type === 'select') hf.selectionChanged();
                else hf.impactOccurred(type);
                return;
            }
            if (navigator.vibrate) navigator.vibrate(type === 'heavy' ? 30 : 12);
        } catch (e) {}
    };

    // Вибрация на КАЖДЫЙ тап по кнопкам, плиткам игр, мин, 
    // нижнему меню и любым элементам с onclick. Слушатель один, на уровне
    // документа, поэтому работает и для элементов, которые создаются позже.
    const CLICKABLE = 'button, a, [onclick], .game, .nav-item, .mines-tile, .mine-tile, .pct-btn, .action, label, select, input[type="checkbox"], input[type="radio"]';
    document.addEventListener('click', function (e) {
        const el = e.target && e.target.closest ? e.target.closest(CLICKABLE) : null;
        if (!el) return;
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
        window.haptic('light');
    }, true);
})();

const SUPABASE_URL = 'https://nkovsjhwinbbapsqvpnu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_GVUZWdR9qVSHwL7aL63W8w_g7rtfJkN';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Переменные состояния пользователя
let currentBalance = 0.00;
let currentTurnover = 0.00;
let currentMaxWin = 0.00;
let currentTotalWin = 0.00;
let currentBetsCount = 0;
let currentWinsCount = 0;
let currentDeposits = 0.00;
let currentWithdrawals = 0.00;

// Состояние блока «Доказуемая честность» (заполняется из строки раунда сервера)
let currentCrashState = { salt: '', hash: '', crashPoint: 1.00, isFinished: false };

// Вызывать при выходе со страницы краша — прячет раскрытый ключ обратно,
// чтобы при следующем заходе он снова появился только после нового краша.
function hideCrashRoundKey() {
    const keyInput = document.getElementById('crashRoundKeyInput');
    if (keyInput) keyInput.value = '';
}

// ==========================================
// ОБРАБОТЧИКИ СОБЫТИЙ ОКНА И КОПИРОВАНИЯ
// ==========================================
function openCrashFairnessModal() {
    const content = document.getElementById('crashFairnessContent');
    if (content) {                       // чистое состояние: никаких «застрявших» сдвигов от прошлого жеста
        content.classList.remove('dragging');
        content.style.transform = '';
    }
    document.getElementById('crashFairnessModal')?.classList.remove('hidden');
    document.body.classList.add('fairness-modal-open');
    if (content) {                       // выезд — один раз, на открытии
        content.classList.remove('opening');
        void content.offsetWidth;
        content.classList.add('opening');
        const done = () => content.classList.remove('opening');
        content.addEventListener('animationend', done, { once: true });
        content.addEventListener('animationcancel', done, { once: true });
    }
}

function closeCrashFairnessModal() {
    document.getElementById('crashFairnessModal')?.classList.add('hidden');
    document.body.classList.remove('fairness-modal-open');

    const content = document.getElementById('crashFairnessContent');
    if (content) {
        content.classList.remove('dragging');
        content.style.transform = '';
    }
}

// ==========================================
// ПЕРЕТЯГИВАНИЕ ВНИЗ ДЛЯ ЗАКРЫТИЯ ДОК ЧЕСТНОСТИ
// ==========================================
(function initCrashFairnessDrag() {
    const handle = document.getElementById('crashFairnessDragHandle');
    const content = document.getElementById('crashFairnessContent');
    if (!handle || !content) return;

    const CLOSE_DISTANCE = 90;     // px вниз — закрываем при отпускании
    const FLICK_SPEED = 0.55;      // px/мс — быстрый «щелчок» вниз закрывает и при малой дистанции
    const FLICK_MIN = 24;          // ...но не меньше этой дистанции
    const TAP_SLOP = 8;            // сдвиг меньше этого — это тап, а не перетягивание
    const CLICK_BLOCK_MS = 450;    // после жеста гасим «фантомный» клик по тому, что под пальцем

    let activeId = null;
    let startY = 0, lastY = 0, lastT = 0, speed = 0, dy = 0;
    let dragged = false;           // был ли реальный жест (в любую сторону)
    let closing = false;
    let blockClicksUntil = 0;

    // Любой жест (вверх, вниз, отменённый) не должен «просочиться» кликом в то, что под пальцем
    // или под шторкой (кнопка ставки, шестерёнка честности, ссылка проверки и т.п.).
    document.addEventListener('click', (e) => {
        if (performance.now() < blockClicksUntil) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }, true);

    function setY(y) {
        content.style.transform = y > 0 ? `translate3d(0, ${y}px, 0)` : '';
    }

    function finish(e) {
        if (activeId === null || (e && e.pointerId !== activeId)) return;
        try { handle.releasePointerCapture(activeId); } catch (err) {}
        activeId = null;
        content.classList.remove('dragging');

        if (dragged) blockClicksUntil = performance.now() + CLICK_BLOCK_MS;

        const cancelled = !!(e && e.type === 'pointercancel');
        const shouldClose = !cancelled && dy > 0 &&
            (dy > CLOSE_DISTANCE || (speed > FLICK_SPEED && dy > FLICK_MIN));

        if (shouldClose) {
            closeAnimated();
        } else {
            setY(0);                // плавно возвращается на место (transition в CSS)
        }
        dy = 0; speed = 0;
    }

    function closeAnimated() {
        if (closing) return;
        closing = true;
        content.style.transform = 'translate3d(0, 100%, 0)';
        setTimeout(() => {
            closing = false;
            closeCrashFairnessModal();
        }, 180);
    }

    handle.addEventListener('pointerdown', (e) => {
        if (activeId !== null || closing) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        activeId = e.pointerId;
        content.classList.remove('opening');   // палец на язычке — выезд больше не нужен
        startY = lastY = e.clientY;
        lastT = performance.now();
        dy = 0; speed = 0; dragged = false;
        content.classList.add('dragging');
        try { handle.setPointerCapture(activeId); } catch (err) {}
    });

    handle.addEventListener('pointermove', (e) => {
        if (e.pointerId !== activeId) return;
        const raw = e.clientY - startY;

        if (Math.abs(raw) > TAP_SLOP) dragged = true;

        // Вверх тянуть некуда: шторка стоит на месте (без «пружины» и пустой щели снизу)
        dy = Math.max(0, raw);

        const now = performance.now();
        const dt = now - lastT;
        if (dt > 0) speed = 0.8 * speed + 0.2 * ((e.clientY - lastY) / dt);
        lastY = e.clientY; lastT = now;

        if (dragged) setY(dy);
        if (e.cancelable) e.preventDefault();
    });

    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    handle.addEventListener('lostpointercapture', finish);

    // Тап по полоске без перетягивания закрывает меню. Закрываем по click (а не по pointerup),
    // чтобы фантомный клик после закрытия не попал в кнопки под шторкой.
    handle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dragged) { dragged = false; return; }
        closeAnimated();
    });

    // Подстраховка: если окно закрыли/скрыли посреди жеста — состояние не «залипает»
    window.addEventListener('blur', () => finish({ pointerId: activeId, type: 'pointercancel' }));
})();

function copyCrashHash() {
    const val = document.getElementById('crashRoundHashInput')?.value;
    if (val) {
        navigator.clipboard.writeText(val);
        if (typeof showMessage === 'function') showMessage('Хеш скопирован в буфер обмена');
    }
}

function copyCrashKey() {
    const val = document.getElementById('crashRoundKeyInput')?.value;
    if (val) {
        navigator.clipboard.writeText(val);
        if (typeof showMessage === 'function') showMessage('Ключ скопирован в буфер обмена');
    }
}

window.openCrashFairnessModal = openCrashFairnessModal;
window.closeCrashFairnessModal = closeCrashFairnessModal;
window.copyCrashHash = copyCrashHash;
window.copyCrashKey = copyCrashKey;
// Создание/обновление профиля идёт через Edge Function ensure-player:
// сервер сам берёт id, ник и аватар из ПОДПИСАННОГО initData, поэтому
// подменить чужой профиль (отправив чужой telegram_id) больше нельзя.
async function ensurePlayerSecure() {
    // Мобильная сеть бывает нестабильной: при сетевой ошибке или битом ответе
    // пробуем ещё до 2 раз с паузой (ошибки сервера вроде INVALID_INIT_DATA не повторяем).
    let last = { data: null, error: 'NETWORK' };
    for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise(r => setTimeout(r, attempt * 900));
        try {
            const res = await fetch(SUPABASE_URL + '/functions/v1/ensure_player', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: 'Bearer ' + SUPABASE_ANON_KEY
                },
                body: JSON.stringify({ init_data: tg?.initData || '' })
            });
            const j = await res.json().catch(() => null);
            if (j && j.ok && j.player) return { data: j.player, error: null };
            last = { data: null, error: j?.error || ('HTTP_' + res.status) };
            if (j && j.error) return last;          // сервер ответил осмысленной ошибкой
        } catch (e) {
            last = { data: null, error: 'NETWORK' };
        }
    }
    return last;
}

// Профиль: только имя, аватар и баланс (сервер берёт данные из ПОДПИСАННОГО initData).
function updateProfileUI(data) {
    const name = data.nickname || data.username || 'Игрок';
    const usernameElem = document.getElementById('username');
    const avatarElem = document.getElementById('avatar');
    if (usernameElem) usernameElem.textContent = name;

    // Аватар строим через DOM (а не innerHTML) и только из https-ссылки
    if (avatarElem && typeof data.photo_url === 'string' && /^https:\/\//i.test(data.photo_url)) {
        const img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.referrerPolicy = 'no-referrer';
        img.src = data.photo_url;
        img.style.cssText = 'width:100%; height:100%; object-fit:cover; border-radius:50%;';
        avatarElem.textContent = '';
        avatarElem.appendChild(img);
    }
    setUIBalance(data.balance);
}

async function loadUserData() {
    if (!tg?.initDataUnsafe?.user) {
        showBlockScreen();
        return false;
    }
    const { data, error } = await ensurePlayerSecure();
    if (error || !data) {
        console.error('ensure_player:', error);
        // Сервер отверг подпись initData — запуск не из разрешённого бота
        if (typeof error === 'string' && /INIT|SIGN|HASH|BOT|FORBID|AUTH/i.test(error)) {
            showBlockScreen('Доступ запрещён', 'Откройте приложение через бота ' + (window.WXS_BOT || '@wxscrash_bot') + '.');
            return false;
        }
        showMessage('Не удалось загрузить профиль. Проверьте соединение и перезапустите приложение. (код: ' + (typeof error === 'string' ? error : 'ERR') + ')');
        return false;
    }
    currentTurnover = Number(data.turnover) || 0;
    currentMaxWin = Number(data.max_win) || 0;
    currentTotalWin = Number(data.total_win) || 0;
    currentBetsCount = Number(data.bets_count) || 0;
    currentWinsCount = Number(data.wins_count) || 0;
    currentDeposits = Number(data.deposits) || 0;
    currentWithdrawals = Number(data.withdrawals) || 0;
    updateProfileUI(data);
    return true;
}

// paintBalance — только рисует баланс; setUIBalance — «своя» операция приложения
// (balanceSync по этому хуку отличает свои изменения от внешних, например из чата).
let balanceTouchHook = null;
function paintBalance(newBalance) {
    // Исправление: раньше NaN/undefined от сервера превращался в 0.00 и «обнулял» баланс на экране
    const n = parseFloat(newBalance);
    if (isFinite(n)) currentBalance = n;
    const el = document.getElementById('topBalance');
    if (el) tweenMoneyText(el, currentBalance, ' $');
}
function setUIBalance(newBalance) {
    if (balanceTouchHook) balanceTouchHook();
    paintBalance(newBalance);
}

function showMessage(text) {
    if (tg?.showAlert) {
        try { tg.showAlert(text); return; } catch (e) {}
    }
    alert(text);
}

// Экранирование/аватары игроков в списке раунда
function iceAvatarHtml(avatar) {
    // Никакого сырого HTML: из чужого поля берём только https-ссылку на картинку или короткий эмодзи.
    let raw = String(avatar || '🧑');
    if (raw.indexOf('<') !== -1) {
        const m = raw.match(/src\s*=\s*"([^"]+)"/i);
        raw = m ? m[1] : '🧑';
    }
    if (/^https:\/\/[^\s"'<>`\\]{4,400}$/i.test(raw) || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/=]{1,200000}$/.test(raw)) {
        return '<img src="' + escapeIceName(raw) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
    }
    return escapeIceName(raw.slice(0, 8));
}

function getMyIceArenaAvatar() {
    const url = tg?.initDataUnsafe?.user?.photo_url;
    if (url) return url;
    const avatarHTML = document.getElementById('avatar')?.innerHTML?.trim();
    if (avatarHTML && avatarHTML.includes('<img')) {
        const match = avatarHTML.match(/src="([^"]+)"/);
        if (match) return match[1];
    }
    return '🧑';
}

function escapeIceName(name) {
    const div = document.createElement('div');
    div.textContent = name == null ? '' : String(name);
    return div.innerHTML;
}

const netBar = (function () {
    let count = 0, showTimer = null, bar = null;
    function el() {
        if (bar) return bar;
        bar = document.createElement('div');
        bar.className = 'net-bar';
        bar.innerHTML = '<i></i>';
        document.body.appendChild(bar);
        return bar;
    }
    function inc() {
        count++;
        if (count === 1) {
            clearTimeout(showTimer);
            // быстрые запросы (<150 мс) полосу не показывают — без мерцания
            showTimer = setTimeout(() => { if (count > 0) el().classList.add('on'); }, 150);
        }
    }
    function dec() {
        count = Math.max(0, count - 1);
        if (count === 0) {
            clearTimeout(showTimer);
            if (bar) bar.classList.remove('on');
        }
    }
    return {
        track(promise) {
            inc();
            const done = () => dec();
            Promise.resolve(promise).then(done, done);
            return promise;
        }
    };
})();

// Анимированная смена чисел баланса (вместо резкой подмены текста)
const _numTweens = new WeakMap();
function tweenMoneyText(el, to, suffix, prefix) {
    prefix = prefix || '';
    const fmt = v => prefix + v.toFixed(2) + suffix;
    const prev = _numTweens.get(el);
    if (prev) cancelAnimationFrame(prev.raf);
    const from = prev ? prev.cur : (parseFloat(String(el.textContent).replace(/[^0-9.\-]/g, '')) || 0);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !isFinite(from) || Math.abs(to - from) < 0.005 || document.hidden) {
        _numTweens.set(el, { cur: to, raf: 0 });
        el.textContent = fmt(to);
        return;
    }
    const t0 = performance.now();
    const dur = Math.min(650, 280 + Math.abs(to - from) * 4);
    const state = { cur: from, raf: 0 };
    _numTweens.set(el, state);
    const step = now => {
        const k = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        state.cur = k >= 1 ? to : from + (to - from) * e;
        el.textContent = fmt(state.cur);
        if (k < 1) state.raf = requestAnimationFrame(step);
    };
    state.raf = requestAnimationFrame(step);
}


/* =========================
   БЕЗОПАСНАЯ РАБОТА С ДЕНЬГАМИ
========================= */

function roundMoney(value) {
    const n = Number(value);
    if (!isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* =========================
   ЕДИНАЯ ЛОГИКА ПОЛЯ СТАВКИ (Мины / Краш)
   Кнопки ½ / x2 / MAX и защита поля от некорректных чисел
   работают одинаково во всех трёх играх.
========================= */

const MIN_BET = 0.10;

// Применяет множитель (½ или x2) к текущему значению поля ставки.
// Пустое/некорректное значение → минимальная ставка.
// Итог всегда зажат в диапазон [MIN_BET; currentBalance] — выше баланса
// сумма никогда не выставляется, даже кнопкой x2.
function applyBetFactor(input, factor) {
    if (!input) return;
    let current = parseFloat(input.value);

    if (isNaN(current) || current < MIN_BET) {
        current = MIN_BET;
    } else {
        current = roundMoney(current * factor);
        if (current < MIN_BET) current = MIN_BET;
    }

    if (current > currentBalance) {
        current = roundMoney(Math.max(0, currentBalance));
    }

    input.value = current.toFixed(2);
}

// Кнопка MAX — ставит в поле весь доступный баланс.
function applyBetMax(input) {
    if (!input) return;
    input.value = roundMoney(Math.max(0, currentBalance)).toFixed(2);
}

// При потере фокуса поля ставки (после ручного ввода с клавиатуры)
// значение проверяется и зажимается тем же диапазоном [MIN_BET; currentBalance],
// чтобы вручную нельзя было вписать сумму выше баланса или отрицательное число.
function clampBetInputOnBlur(e) {
    const input = e.target;
    if (!input || input.value.trim() === '') return;

    let v = parseFloat(input.value);
    if (isNaN(v) || v <= 0) {
        input.value = '';
        return;
    }

    v = roundMoney(v);
    if (v > currentBalance) v = roundMoney(Math.max(0, currentBalance));
    input.value = v.toFixed(2);
}

// Блокирует символы, которые ломают number-поле на некоторых мобильных
// клавиатурах (научная запись "e", повторные "+"/"-").
function blockInvalidBetKeys(e) {
    if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
        e.preventDefault();
    }
}

let isEconomyLocked = false;

function lockEconomy() {
    if (isEconomyLocked) return false;
    isEconomyLocked = true;
    return true;
}

function unlockEconomy() {
    isEconomyLocked = false;
}

function snapshotBalanceState() {
    return {
        balance: currentBalance,
        turnover: currentTurnover,
        maxWin: currentMaxWin,
        totalWin: currentTotalWin,
        betsCount: currentBetsCount,
        winsCount: currentWinsCount,
        deposits: currentDeposits,
        withdrawals: currentWithdrawals
    };
}

function restoreBalanceState(snap) {
    currentBalance = snap.balance;
    currentTurnover = snap.turnover;
    currentMaxWin = snap.maxWin;
    currentTotalWin = snap.totalWin;
    currentBetsCount = snap.betsCount;
    currentWinsCount = snap.winsCount;
    currentDeposits = snap.deposits;
    currentWithdrawals = snap.withdrawals;
    setUIBalance(currentBalance);
}

async function crashRpc(fn, args) {
    try {
        const p = Promise.resolve(supabase.rpc(fn, Object.assign({ p_init: tg?.initData || '' }, args || {})));
        netBar.track(p);
        const { data, error } = await p;
        if (error) return { ok: false, error: error.message || 'Ошибка сервера' };
        return data || { ok: false, error: 'Пустой ответ сервера' };
    } catch (e) {
        return { ok: false, error: 'Нет соединения с сервером' };
    }
}

const CRASH_WAIT_MS = 5000;


const CRASH_ROUNDS_TABLE = 'crash_rounds';
const CRASH_BETS_TABLE = 'crash_bets';
// Очередь ставок на следующий раунд (SQL для таблицы — в crash_queue.sql)
const CRASH_QUEUE_TABLE = 'crash_queue';
const CRASH_QUEUE_MIN_AGE_MS = 2000;   // не переносим ставку в раунд раньше, чем закончилось её списание
const CRASH_HISTORY_MAX = 25;       // сколько прошедших раундов видно в ленте
const CRASH_RESULT_HOLD_MS = 3000;  // пауза с картинкой взрыва перед новым раундом

// КРИВАЯ РОСТА (одна и та же у коэффициента, следа и цифр; сервер считает так же):
//  1) до 1.45x — очень медленно, скорость плавно нарастает (степень POW);
//  2) с 1.45x рост продолжается с ТОЙ ЖЕ скоростью, на которой закончился
//     этап 1 (без скачка), и дальше непрерывно ускоряется до самого краша.
const CRASH_SLOW_START_TARGET = 1.45;
const CRASH_SLOW_START_MS = 7000;          // за сколько мс дорастаем до 1.45x
const CRASH_SLOW_POW = 2.5;                // «мягкость» разгона на этапе 1
// скорость роста (в долях/мс) в точке 1.45x — продолжение скорости этапа 1
const CRASH_GROWTH_PER_MS =
    ((CRASH_SLOW_START_TARGET - 1) * CRASH_SLOW_POW) / (CRASH_SLOW_START_MS * CRASH_SLOW_START_TARGET);
// дальнейшее ускорение: скорость роста удваивается примерно каждые 30 сек
const CRASH_GROWTH_ACCEL = CRASH_GROWTH_PER_MS / 30000;

/* ================================================================
   СИНХРОНИЗАЦИЯ ВРЕМЕНИ (почему раньше «скипались» пауза и взрыв)

   Раньше момент старта полёта, момент краша и конец паузы после
   взрыва считались по Date.now() КАЖДОГО телефона и сравнивались
   с отметками времени, которые записал другой телефон. Если часы
   у кого-то уходят вперёд хотя бы на пару секунд — он видел «пауза
   уже закончилась», сам создавал новый раунд, и у всех взрыв
   обрезался, а пауза пропадала.

   Теперь все считают по ВРЕМЕНИ СЕРВЕРА: при старте и раз в 90 сек
   клиент замеряет разницу между своими часами и серверными.
   Лучший способ — RPC server_now (SQL ниже). Если функции в БД
   нет, берём заголовок Date из ответа Supabase (точность ±0.5 с),
   а если и его нет — работаем по локальным часам, но со
   страховками от «кривых» отметок.

   Один раз выполнить в Supabase → SQL Editor:

   create or replace function public.server_now()
   returns timestamptz language sql as $$ select clock_timestamp() $$;
   grant execute on function public.server_now() to anon, authenticated;
================================================================ */
const CRASH_TIME_TOLERANCE_MS = 1500;   // допуск «отметка из будущего»
const CRASH_STALE_START_MS = 4000;      // старт просрочен дольше — не «задним числом»
const CRASH_TICK_MS = 250;              // страховочный тик (точные переходы — по таймерам)
const CRASH_ADVANCE_RETRY_MS = 500;     // не чаще — повтор записи перехода фазы в БД
// Минимальный интервал между вызовами crash_tick с одного клиента. Раньше
// было 1 с, и КАЖДЫЙ открытый мини-апп бил в базу раз в секунду (см. лог:
// "canceling statement due to statement timeout", "cron job startup timeout").
const CRASH_TICK_CALL_MS = 2000;
const CRASH_FLIGHT_POKE_MS = 250;     // в полёте: сервер сам знает момент краша, клиент лишь торопит его
// При ошибке тик не повторяем вплотную: пауза удваивается до этого потолка.
const CRASH_TICK_BACKOFF_MAX_MS = 30000;
const CRASH_CLOCK_RESYNC_MS = 90000;
const CRASH_EXPLOSION_REPLAY_WINDOW_MS = 1800; // открыл страницу сразу после краша — доигрываем взрыв

let crashClockOffset = 0;   // serverMs - localMs

function crashNow() { return Date.now() + crashClockOffset; }

async function syncCrashClockViaRpc(samples = 4) {
    let best = null;
    for (let i = 0; i < samples; i++) {
        const t0 = Date.now();
        const { data, error } = await supabase.rpc('server_now');
        const t1 = Date.now();
        if (error || !data) return null;
        const serverMs = new Date(data).getTime();
        if (!isFinite(serverMs)) return null;
        const rtt = t1 - t0;
        const off = serverMs + rtt / 2 - t1;
        if (!best || rtt < best.rtt) best = { rtt, off };
    }
    return best;
}

async function syncCrashClockViaHttpDate() {
    try {
        const t0 = Date.now();
        const res = await fetch(SUPABASE_URL + '/rest/v1/', {
            method: 'HEAD',
            headers: { apikey: SUPABASE_ANON_KEY },
            cache: 'no-store'
        });
        const t1 = Date.now();
        const h = res.headers.get('date');
        if (!h) return null;
        const d = new Date(h).getTime();
        if (!isFinite(d)) return null;
        // Date в заголовке — с точностью до секунды, берём середину секунды
        return { rtt: t1 - t0, off: d + 500 - (t0 + t1) / 2 };
    } catch (e) {
        return null;
    }
}

async function syncCrashClock(samples = 4) {
    let best = null;
    try { best = await syncCrashClockViaRpc(samples); } catch (e) { best = null; }
    if (!best) best = await syncCrashClockViaHttpDate();
    if (best) crashClockOffset = best.off;
}

// Математика полёта: за сколько мс коэффициент дорастает до crashPoint.
// Обратная функция к computeCrashMultAt() — по ней момент краша известен
// ЗАРАНЕЕ и одинаков у всех: старт полёта + эта длительность.
function computeCrashDurationMs(crashPoint) {
    const cp = Number(crashPoint) || 1;
    if (cp <= 1) return 0;
    if (cp <= CRASH_SLOW_START_TARGET) {
        const x = (cp - 1) / (CRASH_SLOW_START_TARGET - 1);
        return CRASH_SLOW_START_MS * Math.pow(x, 1 / CRASH_SLOW_POW);
    }
    // ln(m/1.45) = k*s + a*s^2/2  →  s = (-k + sqrt(k^2 + 2*a*L)) / a
    const L = Math.log(cp / CRASH_SLOW_START_TARGET);
    const k = CRASH_GROWTH_PER_MS, a = CRASH_GROWTH_ACCEL;
    const s = (-k + Math.sqrt(k * k + 2 * a * L)) / a;
    return CRASH_SLOW_START_MS + s;
}

// Сервер ограничивает точку краша 1000x, значит полёт физически не может длиться
// дольше этого. Если «летим» дольше — раунд уже взорвался на сервере, а мы просто
// ещё не получили новость (именно отсюда брались Infinity× и 1029838...× при перезаходе).
const CRASH_MAX_FLIGHT_MS = computeCrashDurationMs(1000);

function crashParseTime(iso) {
    const t = iso ? new Date(iso).getTime() : NaN;
    return isFinite(t) ? t : null;
}

// Отметки времени раунда неизменны, поэтому считаем их ОДИН раз при первом
// взгляде на раунд — так «кривая» отметка не может раз за разом сдвигать фазы.
const crashTimeCache = Object.create(null);

function crashStableTime(round, kind) {
    const key = round.id + ':' + kind;
    if (key in crashTimeCache) return crashTimeCache[key];

    const now = crashNow();
    let ms;
    if (kind === 'waitEnds') {
        ms = crashParseTime(round.waiting_ends_at);
        if (ms == null) {
            const c = crashParseTime(round.created_at);
            ms = (c != null ? c : now) + CRASH_WAIT_MS;
        }
        // создатель раунда с «убежавшими» часами — не ждём лишнего
        if (ms - now > CRASH_WAIT_MS + CRASH_TIME_TOLERANCE_MS) ms = now + CRASH_WAIT_MS;
    } else if (kind === 'plan') {
        // полёт стартует ровно в момент, когда отсчёт дошёл до нуля
        const ends = crashStableTime(round, 'waitEnds');
        ms = (now - ends > CRASH_STALE_START_MS) ? now : ends;
    } else { // 'start'
        ms = crashParseTime(round.starts_at);
        if (ms == null || ms - now > CRASH_TIME_TOLERANCE_MS) ms = now;
    }

    crashTimeCache[key] = ms;
    const keys = Object.keys(crashTimeCache);
    if (keys.length > 16) delete crashTimeCache[keys[0]];
    return ms;
}

/* ================================================================
   СОСТОЯНИЕ
================================================================ */
let crashGame = {
    phase: 'pending',   // 'pending' — раунд ещё не показан, 'waiting' — приём ставок, 'flying' — полёт, 'crashed' — пауза с итогом
    roundId: null,
    crashPoint: 0,
    currentMult: 1.00,
    bet: 0,
    betPlaced: false,
    cashedOut: false,
    cashoutMult: null,   // локально запомненный кэшаут (чтобы список игроков не «откатывался»)
    cashoutWin: null,
    cashoutRoundId: null,
    liveBetId: null,     // id строки в live_bets (общая лента всех игр)
    liveBetResolved: false,
    myBetRowId: null,    // id своей строки в crash_bets (для апдейта при кэшауте)
    queued: null,        // моя ставка в очереди на следующий раунд: {id, amount}
    queuedGraceUntil: 0, // пока не прошло это время — не сбрасываем queued, даже если опрос ещё не увидел строку
    queuedLive: null,    // запись в общей ленте для ставки из очереди: {id, amount, fromRoundId}
    startTime: 0,        // момент старта полёта (время сервера, общий для всех)
    waitEndsAt: 0,       // конец обратного отсчёта
    phaseEndsAt: 0,
    crashAt: 0,          // момент краша = startTime + длительность полёта до crashPoint
    explosionPlayed: false,
    isProcessing: false
};

// Общее состояние синхронизированного лобби краша — аналог iceArena.
let crashLobby = {
    round: null,        // последняя известная строка раунда из БД
    bets: [],           // мапленные ставки текущего раунда (для списка игроков)
    queue: [],          // ставки, ждущие следующий раунд
    queueMissing: false,// таблицы crash_queue ещё нет в БД
    promoting: false,
    channel: null,
    pollInterval: null,
    clockInterval: null,
    phaseTimer: null,   // точный таймер на ближайшую смену фазы
    countdownTimer: null,
    reloadTimer: null,
    advancing: false,
    lastAdvanceTry: 0,
    tickBackoffMs: 0,       // текущая пауза после ошибки crash_tick
    tickBackoffUntil: 0,    // до какого момента (crashNow) сервер не трогаем
    fetchSeq: 0,        // нумерация запросов — устаревший ответ не перетирает свежий
    appliedSeq: 0,
    lastCountdownDigit: null,
    lastPlayersHtml: null,
    sqlWarned: false
};

const CRASH_STATUS_RANK = { waiting: 0, flying: 1, crashed: 2 };
const CRASH_PHASE_ORDER = { pending: -1, waiting: 0, flying: 1, crashed: 2 };

let crashAnimHandle = null;
let crashLoopStarted = false;
let crashHistory = [];      // последние коэффициенты, самый новый — первый
let crashHistoryIds = new Set();
let lastCrashPoint = null;  // коэффициент прошлого раунда (для отображения в паузе)
let crashTrailPoints = [];  // точки следа ракеты за текущий полёт
let crashTrailTimers = [];
let crashRocketAnim = null; // экземпляр Lottie-анимации ракеты
let crashExplosionAnim = null; // экземпляр Lottie-анимации взрыва
let crashExplosionTotalFrames = 0; // общее число кадров анимации взрыва (берётся из её JSON)
let crashExplosionHideTimeout = null; // таймер плавного скрытия взрыва после проигрывания нужной части

// "Тяжёлые" визуальные обновления (SVG-след со стековыми drop-shadow,
// текст с text-shadow) обновляем не чаще ~30 раз/сек вместо 60 — глазом
// разница незаметна, а нагрузка на рендер падает почти вдвое. Ракета и
// тряска экрана (дешёвые transform) продолжают обновляться каждый кадр.
let crashLastHeavyUpdate = 0;
const CRASH_HEAVY_UPDATE_INTERVAL_MS = 50;   // след/текст ~20 раз/сек — на глаз то же, а нагрузка ниже

// Доля анимации взрыва, которая реально проигрывается при краше — по ТЗ
// нужна только самая первая часть (меньше половины), дальше идёт "хвост"
// анимации, который не нужен. Меняйте это число, чтобы точнее подогнать
// момент остановки под нужный кадр.
const EXPLOSION_PLAY_FRACTION = 0.34;
// Длительность плавного исчезновения взрыва после того, как проигранная
// часть анимации закончилась (совпадает с transition opacity в HTML).
const EXPLOSION_FADE_MS = 300;

// Кэш DOM-элементов для исключения лишних поисков при каждом кадре (60 FPS)
let crashDomCache = null;

function getCrashDom() {
    if (!crashDomCache) {
        crashDomCache = {
            statusEl: document.getElementById('crashStatus'),
            multEl: document.getElementById('crashMultiplier'),
            rocketEl: document.getElementById('crashRocket'),
            actionBtn: document.getElementById('crashActionBtn'),
            betInput: document.getElementById('crashBetInput'),
            stageEl: document.getElementById('crashStage'),
            countdownEl: document.getElementById('crashCountdown'),
            centerInfoEl: document.getElementById('crashCenterInfo'),
            explosionEl: document.getElementById('crashExplosion'),
            trailLine: document.getElementById('crashTrailLine'),
            trailDot: document.getElementById('crashTrailDot'),
            trailGlow: document.getElementById('crashTrailGlow'),
            trailHead: document.getElementById('crashTrailHead'),
            trailDotGlow: document.getElementById('crashTrailDotGlow'),
            topLeftMult: document.getElementById('crashMultTopLeft'),
            historyList: document.getElementById('crashHistoryList'),
            playersList: document.getElementById('crashPlayersList'),
            playersCount: document.getElementById('crashPlayersCount')
        };
    }
    return crashDomCache;
}

// ---- Хелперы следа: линия+свечение и точка+свечение всегда меняются вместе ----
function setTrailD(dom, d) {
    if (dom.trailLine) dom.trailLine.setAttribute('d', d);
    if (dom.trailGlow) dom.trailGlow.setAttribute('d', d);
}
function setTrailOpacity(dom, v) {
    if (dom.trailLine) dom.trailLine.style.opacity = v;
    if (dom.trailGlow) dom.trailGlow.style.opacity = v;
}
function setTrailCrashed(dom, on) {
    if (dom.trailLine) dom.trailLine.classList.toggle('crash-trail-crashed', on);
    if (dom.trailGlow) dom.trailGlow.classList.toggle('crash-trail-crashed', on);
}
function setDotOpacity(dom, v) {
    if (dom.trailDot) dom.trailDot.style.opacity = v;
    if (dom.trailDotGlow) dom.trailDotGlow.style.opacity = v;
}
function setDotCrashed(dom, on) {
    if (dom.trailDot) dom.trailDot.classList.toggle('crash-trail-crashed', on);
    if (dom.trailDotGlow) dom.trailDotGlow.classList.toggle('crash-trail-crashed', on);
}
function setDotLive(dom, on) {
    if (dom.trailDot) dom.trailDot.classList.toggle('crash-dot-live', on);
}

function isCrashPageVisible() {
    const page = document.getElementById('crashPage');
    return !!(page && !page.classList.contains('hidden'));
}

// Загружает анимацию ракеты
function initCrashRocketAnim() {
    const dom = getCrashDom();
    if (!dom.rocketEl || crashRocketAnim) return;

    const animationData = getLottieData('ROCKET');

    if (typeof lottie === 'undefined' || !animationData) {
        dom.rocketEl.innerHTML = '<span class="tge-spinner crash-anim-spinner"></span>';
        return;
    }

    crashRocketAnim = lottie.loadAnimation({
        container: dom.rocketEl,
        renderer: 'canvas',
        loop: true,
        autoplay: true,
        animationData: animationData,
        rendererSettings: {
            clearCanvas: true,
            progressiveLoad: true,
            preserveAspectRatio: 'xMidYMid meet'
        }
    });
}

// Загружает анимацию взрыва (проигрывается один раз в момент краша, без цикла)
function initCrashExplosionAnim() {
    const dom = getCrashDom();
    if (!dom.explosionEl || crashExplosionAnim) return;

    const animationData = getLottieData('EXPLOSION');

    if (typeof lottie === 'undefined' || !animationData) {
        dom.explosionEl.innerHTML = '<span class="tge-spinner crash-anim-spinner"></span>';
        return;
    }

    crashExplosionAnim = lottie.loadAnimation({
        container: dom.explosionEl,
        renderer: 'canvas',
        loop: false,
        autoplay: false,
        animationData: animationData,
        rendererSettings: {
            clearCanvas: true,
            progressiveLoad: true,
            preserveAspectRatio: 'xMidYMid meet'
        }
    });
    crashExplosionTotalFrames = animationData.op || 0;

    // Как только проигранный отрезок (0 → EXPLOSION_PLAY_FRACTION) доигрывает
    // до конца, сразу плавно прячем взрыв — а не держим его "замороженным"
    // на последнем кадре до самого начала следующего раунда.
    crashExplosionAnim.addEventListener('complete', hideExplosionSmoothly);
}

function hideExplosionSmoothly() {
    const dom = getCrashDom();
    if (!dom.explosionEl) return;

    clearTimeout(crashExplosionHideTimeout);
    dom.explosionEl.style.opacity = '0';
    crashExplosionHideTimeout = setTimeout(() => {
        if (dom.explosionEl) dom.explosionEl.style.display = 'none';
    }, EXPLOSION_FADE_MS);
}

// Кэш размеров сцены — чтения clientWidth/clientHeight на каждом кадре
// requestAnimationFrame вызывают принудительный синхронный reflow, что и было
// основной причиной лагов/фризов даже на мощных телефонах. Меряем размеры
// только когда они реально могут измениться (открытие страницы, начало
// раунда, поворот экрана/ресайз), а не 60 раз в секунду.
let crashStageW = 300;
let crashStageH = 340;

function syncCrashStageDims() {
    const dom = getCrashDom();
    if (!dom.stageEl) return;
    crashStageW = dom.stageEl.clientWidth || crashStageW;
    crashStageH = dom.stageEl.clientHeight || crashStageH;
}

window.addEventListener('resize', syncCrashStageDims);
window.addEventListener('orientationchange', syncCrashStageDims);

// Центр сцены, где стоит ракета (и где рисуется взрыв)
function crashRocketCenter() {
    return {
        x: (crashStageW - 200) / 2 - 16,
        y: 16 - (crashStageH - 200) / 2
    };
}

function initCrashPage() {
    initCrashRocketAnim();
    initCrashExplosionAnim();
    syncCrashStageDims();
    renderCrashHistory();
    renderCrashPlayersList();
    // Страница могла быть закрыта в момент краша/старта — подтягиваем
    // картинку под текущую фазу (и доигрываем взрыв, если пауза ещё идёт).
    resumeCrashVisualsOnOpen();
    // Подстраховка: сразу после открытия страницы её CSS-переход может ещё
    // не завершиться, поэтому один раз перемеряем на следующем кадре.
    requestAnimationFrame(syncCrashStageDims);
}

// Чистая математика роста коэффициента от прошедшего времени — вынесена
// отдельно, чтобы использовать и в tickCrash() (анимация), и при кэшауте.
function computeCrashMultAt(elapsedMs, crashPointCap) {
    const elapsed = Math.max(0, elapsedMs);
    let rawMult;
    if (elapsed < CRASH_SLOW_START_MS) {
        const p = elapsed / CRASH_SLOW_START_MS;
        const eased = Math.pow(p, CRASH_SLOW_POW);
        rawMult = 1 + (CRASH_SLOW_START_TARGET - 1) * eased;
    } else {
        const s = elapsed - CRASH_SLOW_START_MS;
        rawMult = CRASH_SLOW_START_TARGET *
            Math.exp(CRASH_GROWTH_PER_MS * s + 0.5 * CRASH_GROWTH_ACCEL * s * s);
    }
    if (!isFinite(rawMult) || rawMult > 1000) rawMult = 1000;
    const floored = Math.floor(rawMult * 100) / 100;
    return crashPointCap != null ? Math.min(crashPointCap, floored) : floored;
}

/* =========================
   СИНХРОНИЗАЦИЯ ОБЩЕГО РАУНДА (Supabase)
========================= */

// Запускается один раз при старте приложения (см. DOMContentLoaded ниже) —
// раунды крутятся всё время, пока хотя бы у одного игрока открыто
// приложение, независимо от того, на какой странице он сейчас находится
// (ровно как уже сделано для Айс Арены).
function makePagePoller(pageId, fn, offEvery) {
    let n = 0;
    return function () {
        if (document.hidden) return;
        const pg = document.getElementById(pageId);
        if (pg && pg.classList.contains('hidden')) {
            n = (n + 1) % offEvery;
            if (n !== 0) return;
        }
        fn();
    };
}

async function startCrashEngine() {
    if (crashLoopStarted) return;
    crashLoopStarted = true;

    // Часы — ПЕРВЫМ делом (но не дольше 2.5 сек, чтобы не тормозить запуск)
    // Один быстрый замер — и сразу в бой; точные замеры (4 шт.) добиваем в фоне.
    await Promise.race([syncCrashClock(1), new Promise(r => setTimeout(r, 1200))]);
    syncCrashClock().catch(() => {});
    setInterval(() => syncCrashClock(), CRASH_CLOCK_RESYNC_MS);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        // вернулись из фона — таймеры могли «проспать», сверяем всё заново
        syncCrashClock().finally(() => { advanceLocalPhase(); });
        crashColdChecked = false;   // из фона вернулись — раунд мог уйти вперёд, сверяем с сервером
        refreshCrashState();
    });

    loadCrashHistoryFromServer().then(renderCrashHistory).catch(() => {});
    await loadCrashFreebets().catch(() => {});
    await refreshCrashState();
    startCrashClock();

    if (!crashLobby.pollInterval) {
        crashLobby.pollInterval = setInterval(makePagePoller('crashPage', refreshCrashState, 3), 1500);
    }
    if (crashLobby.channel) return;
    try {
        crashLobby.channel = supabase
            .channel('crash_global')
            // Только раунды. Подписку на crash_bets убрали: каждую ставку и
            // каждый кэшаут база рассылала всем клиентам, и каждый клиент на
            // это событие делал ещё 2-3 запроса. Список игроков и так
            // обновляется опросом раз в 1.5 с — разница незаметна, а нагрузка
            // падает в разы.
            .on('postgres_changes', { event: '*', schema: 'public', table: CRASH_ROUNDS_TABLE }, (payload) => {
                const row = payload && payload.new;
                if (row && row.id && payload.eventType !== 'DELETE') {
                    const same = crashLobby.round && crashLobby.round.id === row.id;
                    try { applyCrashRound(row, same ? lastCrashBetsRaw : []); } catch (e) { console.error(e); }
                }
                scheduleCrashReload();   // и добираем ставки/очередь полным запросом
            })
            .subscribe();
    } catch (e) {
        console.error('Crash realtime:', e);
    }
    // Очередь — отдельным каналом: если таблицы ещё нет, это не ломает основной канал краша
    try {
        supabase
            .channel('crash_queue_global')
            .on('postgres_changes', { event: '*', schema: 'public', table: CRASH_QUEUE_TABLE }, () => scheduleCrashReload())
            .subscribe();
    } catch (e) {
        console.error('Crash queue realtime:', e);
    }
}

function scheduleCrashReload() {
    if (crashLobby.reloadTimer) clearTimeout(crashLobby.reloadTimer);
    crashLobby.reloadTimer = setTimeout(() => {
        crashLobby.reloadTimer = null;
        refreshCrashState();
    }, 150);
}

// Страховочный тик. Основные переходы (старт полёта, краш, конец паузы)
// происходят по ТОЧНЫМ таймерам (scheduleCrashPhaseTimer) и не зависят от
// ответа сервера — тик лишь подстраховывает, если таймер «проспал» в фоне
// или запись перехода в БД не прошла с первого раза.
function startCrashClock() {
    if (crashLobby.clockInterval) return;
    crashLobby.clockInterval = setInterval(crashClockTick, CRASH_TICK_MS);
}

function crashClockTick() {
    advanceLocalPhase();
    maybeAdvanceCrash();
}

function scheduleCrashPhaseTimer() {
    clearTimeout(crashLobby.phaseTimer);
    let at;
    if (crashGame.phase === 'waiting') at = crashGame.waitEndsAt;
    else if (crashGame.phase === 'flying') at = crashGame.crashAt;
    else if (crashGame.phase === 'crashed') at = crashGame.crashAt + CRASH_RESULT_HOLD_MS;
    else return;
    if (!isFinite(at)) return;
    crashLobby.phaseTimer = setTimeout(crashClockTick, Math.max(0, at - crashNow()) + 2);
}

function myCrashTelegramId() {
    return tg?.initDataUnsafe?.user?.id ?? null;
}

function mapCrashQueue(rows) {
    const myId = myCrashTelegramId();
    return (rows || []).map(q => ({
        id: q.id,
        telegramId: Number(q.telegram_id),
        name: q.name,
        avatar: q.avatar,
        amount: Number(q.amount),
        createdMs: crashParseTime(q.created_at),
        isUser: myId != null && Number(q.telegram_id) === Number(myId)
    }));
}

// Своя ставка в очереди определяется по БД; короткая «льгота» после нажатия
// нужна, чтобы опрос, пришедший раньше записи, не сбросил состояние.
function syncMyCrashQueue() {
    const mine = crashLobby.queue.find(q => q.isUser);
    if (mine) crashGame.queued = { id: mine.id, amount: mine.amount };
    else if (Date.now() >= crashGame.queuedGraceUntil) crashGame.queued = null;
}

// Когда начался новый раунд (ожидание ставок) — переносим все ставки из очереди в него.
// Делает КАЖДЫЙ открытый клиент: вставка идемпотентна (unique round_id+telegram_id,
// дубликаты игнорируются), поэтому гонка между клиентами безвредна.
async function promoteCrashQueue() {
    const round = crashLobby.round;
    if (crashLobby.promoting || crashLobby.queueMissing || !crashLobby.queue.length) return;
    if (!round || round.id !== crashGame.roundId || round.status !== 'waiting' || crashGame.phase !== 'waiting') return;
    if (crashNow() >= crashGame.waitEndsAt - 300) return;   // поздно — ставка уйдёт в следующий раунд

    const now = crashNow();
    const ready = crashLobby.queue.filter(q => q.createdMs == null || now - q.createdMs >= CRASH_QUEUE_MIN_AGE_MS);
    if (!ready.length) return;

    crashLobby.promoting = true;
    try {
        const res = await supabase.rpc('crash_promote');
        if (res.error) console.error('Crash queue promote:', res.error);
    } catch (e) {
        console.error('Crash queue promote:', e);
    } finally {
        crashLobby.promoting = false;
    }
    scheduleCrashReload();
}

// Можно ли сейчас поставить «на следующий раунд» (идёт полёт или пауза после краша).
function crashCanQueue() {
    if (crashGame.queued) return false;
    if (crashGame.phase === 'crashed') return true;
    if (crashGame.phase === 'flying') return !crashGame.betPlaced || crashGame.cashedOut;
    return false;
}

function crashCanEditBet() {
    if (crashGame.queued) return false;
    if (crashGame.phase === 'waiting') return !crashGame.betPlaced;
    return crashCanQueue();
}

async function queueCrashBet() {
    advanceLocalPhase();
    if (!crashCanQueue() || crashGame.isProcessing) return;
    if (crashFreebetOn) { showMessage('Фрибет можно поставить только в фазе ожидания раунда.'); return; }
    if (crashLobby.queueMissing) {
        showMessage('Ставки на следующий раунд: таблица crash_queue ещё не создана в базе.');
        return;
    }
    const myId = myCrashTelegramId();
    if (myId == null) return;
    if (!lockEconomy()) return;

    const dom = getCrashDom();
    const bet = roundMoney(parseFloat(dom.betInput?.value));
    if (!bet || isNaN(bet) || bet < 0.10) {
        showMessage("Минимальная ставка — 0.10 $!");
        unlockEconomy();
        return;
    }
    if (bet > currentBalance) {
        showMessage("Недостаточно средств!");
        unlockEconomy();
        return;
    }

    crashGame.isProcessing = true;
    const myName = document.getElementById('username')?.textContent?.trim() || 'Игрок';
    const myAvatar = getMyIceArenaAvatar();

    // Сервер сам ставит в очередь и списывает ставку одной транзакцией
    const snapshot = snapshotBalanceState();
    currentTurnover = roundMoney(currentTurnover + bet);
    currentBetsCount++;
    setUIBalance(roundMoney(currentBalance - bet));

    const srv = await crashRpc('crash_queue_bet', { p_amount: bet, p_name: myName, p_avatar: myAvatar });
    if (!srv.ok) {
        restoreBalanceState(snapshot);
        showMessage(srv.error || 'Не удалось поставить на следующий раунд. Попробуйте ещё раз.');
        crashGame.isProcessing = false;
        unlockEconomy();
        scheduleCrashReload();
        return;
    }
    const row = { id: srv.id, created_at: srv.created_at };
    setUIBalance(srv.balance);

    crashGame.queued = { id: row.id, amount: bet };
    crashGame.queuedGraceUntil = Date.now() + 5000;
    // сразу показываем себя в «Ожидании», не дожидаясь опроса
    crashLobby.queue = crashLobby.queue.filter(q => !q.isUser).concat([{
        id: row.id, telegramId: Number(myId), name: myName, avatar: myAvatar,
        amount: bet, createdMs: crashParseTime(row.created_at), isUser: true
    }]);
    renderCrashPlayersList();
    renderCrashUI();

    crashGame.isProcessing = false;
    unlockEconomy();
    renderCrashUI();
    scheduleCrashReload();
}

function mapCrashBetsToPlayers(bets) {
    const myId = myCrashTelegramId();
    return (bets || []).map(b => {
        const isUser = myId != null && Number(b.telegram_id) === Number(myId);
        let status = b.status || 'active';   // active | cashed_out | lost
        let cashoutMult = b.cashout_mult != null ? Number(b.cashout_mult) : null;
        let winAmount = b.win_amount != null ? Number(b.win_amount) : null;

        // Свой кэшаут показываем сразу, не дожидаясь, пока он долетит до БД
        if (isUser && crashGame.cashedOut && crashGame.cashoutRoundId === b.round_id && status !== 'cashed_out') {
            status = 'cashed_out';
            cashoutMult = crashGame.cashoutMult;
            winAmount = crashGame.cashoutWin;
        }

        return {
            id: b.id,
            telegramId: Number(b.telegram_id),
            name: b.name,
            avatar: b.avatar,
            amount: Number(b.amount),
            status,
            cashoutMult,
            winAmount,
            isUser
        };
    });
}

let lastCrashBetsRaw = [];

// Первый показ раунда (открытие приложения / возврат из фона): строка в БД могла
// «застрять» — пока приложение было закрыто, раунд никто не двигал. Поэтому один раз
// просим сервер довести раунд до актуального состояния и только потом рисуем.
let crashColdChecked = false;

function crashRoundMaybeStale(round) {
    if (!round) return false;
    const now = crashNow();
    if (round.status === 'flying') return true;   // точка скрыта — только сервер знает, не взорвался ли
    if (round.status === 'waiting') {
        const ends = crashParseTime(round.waiting_ends_at);
        return ends != null && now >= ends;
    }
    if (round.status === 'crashed') {
        const t = crashParseTime(round.crashed_at);
        return t != null && now >= t + CRASH_RESULT_HOLD_MS;
    }
    return false;
}

async function crashFreshenRound(round) {
    if (!crashRoundMaybeStale(round) || crashTickMissing) return round;
    try {
        let r = crashTickSafeMissing ? null : await supabase.rpc('crash_tick_safe');
        if (!r || (r.error && isMissingRpcError(r.error))) {
            if (r) crashTickSafeMissing = true;
            r = await supabase.rpc('crash_tick');
            if (r.error && isMissingRpcError(r.error)) { crashTickMissing = true; return round; }
        }
        const { data: a } = await supabase.from(CRASH_ROUNDS_TABLE).select('*')
            .in('status', ['waiting', 'flying']).order('created_at', { ascending: true }).limit(1);
        if (a && a[0]) return a[0];
        const { data: l } = await supabase.from(CRASH_ROUNDS_TABLE).select('*')
            .order('created_at', { ascending: false }).limit(1);
        return (l && l[0]) || round;
    } catch (e) {
        return round;
    }
}

async function refreshCrashState() {
    const seq = ++crashLobby.fetchSeq;
    try {
        // 1. Сначала ищем АКТИВНЫЙ раунд (waiting/flying), а не просто самый свежий
        let round = null;
        const { data: active, error } = await supabase
            .from(CRASH_ROUNDS_TABLE)
            .select('*')
            .in('status', ['waiting', 'flying'])
            .order('created_at', { ascending: true })
            .limit(1);

        if (error) {
            console.error('Crash rounds:', error);
            if (String(error.message || '').includes('does not exist') || error.code === '42P01' || error.code === 'PGRST205') {
                if (!crashLobby.sqlWarned) {
                    crashLobby.sqlWarned = true;
                    showMessage('Краш временно недоступен: на сервере не найдены таблицы раунда.');
                }
            }
            return;
        }
        round = active && active[0];

        // 2. Активного нет — берём последний завершённый (для паузы после краша)
        if (!round) {
            const { data: last } = await supabase
                .from(CRASH_ROUNDS_TABLE)
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1);
            round = last && last[0];
        }

        // 3. Раундов вообще нет — создаём первый
        if (!round) {
            round = await getOrCreateCrashRound();
            if (!round) return;
        }

        if (!crashColdChecked) {
            crashColdChecked = true;
            round = await crashFreshenRound(round);
        }

        // 4. Ставки: если запрос упал, игра всё равно идёт со старым списком
        let bets = lastCrashBetsRaw;
        const { data: betsData, error: betsErr } = await supabase
            .from(CRASH_BETS_TABLE)
            .select('*')
            .eq('round_id', round.id)
            .order('created_at', { ascending: true });

        if (betsErr) {
            console.error('Crash bets:', betsErr);
        } else {
            bets = betsData || [];
            lastCrashBetsRaw = bets;
        }

        // 5. Очередь ставок на следующий раунд (если таблицы нет — просто пропускаем)
        let queueRaw = null;
        if (!crashLobby.queueMissing) {
            const { data: qd, error: qe } = await supabase
                .from(CRASH_QUEUE_TABLE)
                .select('*')
                .order('created_at', { ascending: true });
            if (qe) {
                const missing = qe.code === '42P01' || qe.code === 'PGRST205' ||
                    /does not exist|could not find the table/i.test(qe.message || '');
                if (missing) {
                    crashLobby.queueMissing = true;
                    console.warn('crash_queue не найдена в БД — выполни crash_queue.sql');
                } else console.error('Crash queue:', qe);
            } else {
                queueRaw = qd || [];
            }
        }

        // Ответ устарел — пока он летел, уже применился более свежий запрос
        if (seq < crashLobby.appliedSeq) return;
        crashLobby.appliedSeq = seq;

        if (queueRaw) {
            crashLobby.queue = mapCrashQueue(queueRaw);
            syncMyCrashQueue();
        }
        applyCrashRound(round, bets);
        maybeAdvanceCrash();
        promoteCrashQueue();
    } catch (e) {
        console.error('Crash state:', e);
    }
}

async function getOrCreateCrashRound() {
    const { data: active } = await supabase
        .from(CRASH_ROUNDS_TABLE)
        .select('*')
        .in('status', ['waiting', 'flying'])
        .order('created_at', { ascending: false })
        .limit(1);

    if (active && active[0]) return active[0];

    // Новый раунд создаёт только сервер (crash_tick_safe), клиент в таблицу не пишет
    await supabase.rpc('crash_tick_safe');
    const { data: retry } = await supabase
        .from(CRASH_ROUNDS_TABLE)
        .select('*')
        .in('status', ['waiting', 'flying'])
        .order('created_at', { ascending: false })
        .limit(1);

    return retry && retry[0] ? retry[0] : null;
}

// Раскладывает отметки времени раунда по локальному состоянию.
function setCrashRoundTimes(round) {
    if (round.status === 'waiting') {
        crashGame.waitEndsAt = crashStableTime(round, 'waitEnds');
        crashGame.phaseEndsAt = crashGame.waitEndsAt;
        crashGame.startTime = crashStableTime(round, 'plan');
    } else {
        crashGame.startTime = crashStableTime(round, 'start');
    }
    // Раунд закрашен, а starts_at в БД нет (ручная запись) — не ждём «полёта»
    const noStamp = round.status === 'crashed' && !round.starts_at;
    // момент краша известен только после краша; до него — «бесконечность»
    crashGame.crashAt = crashGame.crashPoint == null
        ? Infinity
        : crashGame.startTime + (noStamp ? 0 : computeCrashDurationMs(crashGame.crashPoint));
}

// Применяет строку раунда из БД к локальному состоянию экрана — вызывается
// у КАЖДОГО открытого клиента при каждом опросе/realtime-событии. БД даёт
// только «опорные точки» (кто выиграл/проиграл, когда стартовал полёт), а
// сами фазы и их визуал идут по локальному таймлайну — поэтому взрыв и
// конец паузы не зависят от того, как быстро долетел ответ сервера.
function applyCrashRound(round, bets) {
    const cur = crashLobby.round;
    const sameRound = !!(cur && cur.id === round.id);

    // Устаревший снимок того же раунда (например, опрос с «flying» пришёл
    // позже, чем realtime-событие «crashed») — статус назад не откатываем.
    if (sameRound && (CRASH_STATUS_RANK[round.status] ?? 0) < (CRASH_STATUS_RANK[cur.status] ?? 0)) {
        crashLobby.bets = mapCrashBetsToPlayers(bets);
        renderCrashPlayersList();
        return;
    }
    // Ответ про раунд старее того, что уже на экране — игнорируем
    if (cur && !sameRound && round.created_at && cur.created_at &&
        new Date(round.created_at).getTime() < new Date(cur.created_at).getTime()) {
        return;
    }

    // ЗАЩИТА ПАУЗЫ: новый раунд мог быть создан в БД раньше времени (чьи-то
    // «убежавшие» часы, гонка клиентов). Пока у НАС идёт пауза после краша
    // предыдущего раунда — не переключаемся, а применяем новый раунд ровно
    // в конце паузы. Так пауза со взрывом не пропадает ни у кого.
    // Опираемся на ЛОКАЛЬНУЮ фазу, а не на статус из БД: при медленной сети
    // клиент может так и не получить 'flying'/'crashed', хотя по времени
    // раунд уже взорвался (в этом случае cur.status застревает на 'waiting').
    if (cur && !sameRound && crashGame.roundId === cur.id &&
        (crashGame.phase === 'flying' || crashGame.phase === 'crashed')) {
        const holdEnd = crashGame.crashAt + CRASH_RESULT_HOLD_MS;
        const wait = Math.min(holdEnd - crashNow(), 120000);
        if (isFinite(holdEnd) && wait > 0) {
            crashLobby.deferredRound = { round, bets };
            clearTimeout(crashLobby.deferTimer);
            crashLobby.deferTimer = setTimeout(() => {
                const d = crashLobby.deferredRound;
                crashLobby.deferredRound = null;
                if (d) applyCrashRound(d.round, d.bets);
            }, wait + 5);
            return;
        }
    }
    crashLobby.deferredRound = null;

    crashLobby.round = round;

    if (!sameRound) {
        if (crashGame.roundId) {
            // Начался НОВЫЙ раунд — сбрасываем локальный след своей ставки.
            crashGame.bet = 0;
            crashGame.betPlaced = false;
            crashGame.cashedOut = false;
            crashGame.cashoutMult = null;
            crashGame.cashoutWin = null;
            crashGame.cashoutRoundId = null;
            crashGame.liveBetId = null;
            crashGame.liveBetResolved = false;
            crashGame.myBetRowId = null;
            crashFbBetId = null;
            loadCrashFreebets();
        }
        crashGame.roundId = round.id;
        crashGame.phase = 'pending';
        crashGame.currentMult = 1.00;
        crashGame.explosionPlayed = false;
    }
    // До краша сервер точку НЕ отдаёт (crash_point = null) — клиент крутит множитель,
    // пока сервер не пришлёт status='crashed' вместе с раскрытой точкой и ключом.
    crashGame.crashPoint = round.crash_point != null ? (Number(round.crash_point) || 1) : null;
    setCrashRoundTimes(round);

    crashLobby.bets = mapCrashBetsToPlayers(bets);

    // Блок "доказуемой честности" — хеш виден всегда, ключ (salt) только
    // после краша этого раунда.
    currentCrashState = {
        salt: round.status === 'crashed' ? (round.salt || '') : '',
        hash: round.hash || '',
        crashPoint: round.crash_point != null ? (Number(round.crash_point) || 1) : 1,
        isFinished: round.status === 'crashed'
    };
    const hashInput = document.getElementById('crashRoundHashInput');
    if (hashInput) hashInput.value = currentCrashState.hash;
    const keyInput = document.getElementById('crashRoundKeyInput');
    if (keyInput) keyInput.value = currentCrashState.salt;

    // Подхватываем свою уже сделанную в этом раунде ставку — например,
    // если игрок перезашёл в приложение посреди ожидания/полёта.
    // ВАЖНО: cashedOut только поднимаем в true и никогда не сбрасываем назад —
    // иначе опрос, пришедший раньше, чем кэшаут записался в БД, на секунду
    // возвращал кнопку «Забрать» (и можно было нажать второй раз).
    updateCrashTopbar();
    const mine = crashLobby.bets.find(b => b.isUser);
    if (mine) {
        crashGame.bet = mine.amount;
        crashGame.betPlaced = true;
        if (mine.status === 'cashed_out') crashGame.cashedOut = true;
        crashGame.myBetRowId = mine.id;
        if (!crashFbBetId) {
            const f = crashFreebets.find(x => x.status === 'active' && String(x.bet_id) === String(mine.id));
            if (f) crashFbBetId = f.id;
        }
        // ставка переехала из очереди в этот раунд — подхватываем её запись в ленте
        const ql = crashGame.queuedLive;
        if (ql && round.id !== ql.fromRoundId && Math.abs(ql.amount - mine.amount) < 0.005) {
            crashGame.liveBetId = ql.id;
            crashGame.liveBetResolved = false;
            crashGame.queuedLive = null;
        }
    }

    advanceLocalPhase();
    renderCrashUI();
    renderCrashPlayersList();
    scheduleCrashPhaseTimer();
}

// Двигает ЛОКАЛЬНУЮ фазу вперёд: waiting → flying → crashed. Фаза определяется
// и БД (если там статус уже ушёл вперёд), и серверными часами — что раньше.
// Назад фаза никогда не идёт.
function advanceLocalPhase() {
    const round = crashLobby.round;
    if (!round || round.id !== crashGame.roundId) return;

    const now = crashNow();
    const dbRank = CRASH_STATUS_RANK[round.status] ?? 0;

    let want = 'waiting';
    if (dbRank >= 1 || now >= crashGame.startTime) want = 'flying';
    if (dbRank >= 2 || (want === 'flying' && now >= crashGame.crashAt)) want = 'crashed';

    // Точка скрыта, а «полёт» длится дольше физически возможного → раунд уже взорвался
    // на сервере, мы просто ещё не знаем. Никаких цифр, торопим сервер.
    if (want === 'flying' && !isFinite(crashGame.crashAt) && now - crashGame.startTime > CRASH_MAX_FLIGHT_MS + 500) {
        maybeAdvanceCrash();
        return;
    }

    if (CRASH_PHASE_ORDER[want] <= CRASH_PHASE_ORDER[crashGame.phase]) {
        scheduleCrashPhaseTimer();
        return;
    }

    crashGame.phase = want;
    updateCrashTopbar();
    if (want === 'waiting') {
        enterWaitingVisual();
    } else if (want === 'flying') {
        beginFlyingPhaseVisual();
    } else {
        // Взрыв играем всегда, пока идёт пауза после краша (даже если пришли
        // с запозданием); если пауза давно прошла — просто итоговая картинка.
        endCrashRoundVisual(now - crashGame.crashAt < CRASH_RESULT_HOLD_MS);
    }
    renderCrashPlayersList();
    scheduleCrashPhaseTimer();
}

// Записывает переход фазы в БД (чтобы остальные клиенты и новые игроки видели
// то же самое). Вызывается у КАЖДОГО открытого клиента — реально применится
// у того, кто первым успеет с условным UPDATE (условие "eq status" защищает
// от гонки, как и в Айс Арене). Отметки времени пишем ДЕТЕРМИНИРОВАННЫЕ
// (конец отсчёта / расчётный момент краша), а не «когда мы успели» — поэтому
// задержка сети или медленный клиент ничего не сдвигают.
// Серверная версия: переходы фаз делает Postgres-функция crash_tick()
// (см. crash_server.sql) по ВРЕМЕНИ СЕРВЕРА. Клиент лишь «подталкивает» её,
// когда по его расчётам фаза должна смениться, — результат при этом от
// клиента не зависит. Если SQL ещё не установлен — работает прежняя логика.
let crashTickMissing = false;
// Есть ли в БД «безопасная» версия тика (см. sql/fix_crash_timeouts.sql).
// Она берёт advisory-лок и мгновенно выходит, если тик уже выполняет кто-то
// другой, — благодаря этому сотни одновременных вызовов больше не встают
// в очередь за локом строки раунда.
let crashTickSafeMissing = false;

function isMissingRpcError(error) {
    if (!error) return false;
    return error.code === 'PGRST202' || error.code === '42883' ||
        /could not find the function|does not exist/i.test(error.message || '');
}

async function maybeAdvanceCrash() {
    if (crashTickMissing) return;
    const round = crashLobby.round;
    if (!round || crashLobby.advancing) return;
    if (round.id !== crashGame.roundId) return;
    // Свёрнутый мини-апп не должен грузить базу
    if (document.hidden) return;

    const now = crashNow();
    // После ошибки не долбим сервер: пауза удваивается до 30 с
    if (now < crashLobby.tickBackoffUntil) return;
    const flightPoke = round.status === 'flying' && !isFinite(crashGame.crashAt);
    if (now - crashLobby.lastAdvanceTry < (flightPoke ? CRASH_FLIGHT_POKE_MS : CRASH_TICK_CALL_MS)) return;

    const holdEnd = crashGame.crashAt + CRASH_RESULT_HOLD_MS;
    const due = flightPoke ||
        (round.status === 'waiting' && now >= crashGame.waitEndsAt) ||
        ((round.status === 'flying' || round.status === 'waiting') && now >= crashGame.crashAt) ||
        // Пауза после краша: ждём, пока сервер создаст следующий раунд.
        // Раньше это условие было истинным ВЕЧНО — и каждый клиент тикал
        // раз в секунду даже когда тикать было нечего, забивая базу.
        (round.status === 'crashed' && now >= holdEnd && now < holdEnd + 5000);
    if (!due) return;

    crashLobby.advancing = true;
    crashLobby.lastAdvanceTry = now;
    let error = null;
    try {
        if (!crashTickSafeMissing) {
            const res = await supabase.rpc('crash_tick_safe');
            error = res.error;
            if (isMissingRpcError(error)) {
                crashTickSafeMissing = true;
                error = null;
            }
        }
        if (!error && crashTickSafeMissing) {
            const res = await supabase.rpc('crash_tick');
            error = res.error;
            if (isMissingRpcError(error)) {
                crashTickMissing = true;
                error = null;
                console.warn('crash_tick не найден в БД — выполни crash_server.sql; пока работает старая логика');
            }
        }
    } catch (e) {
        error = e;
    } finally {
        crashLobby.advancing = false;
    }

    if (error) {
        crashLobby.tickBackoffMs = Math.min(
            crashLobby.tickBackoffMs ? crashLobby.tickBackoffMs * 2 : 2000,
            CRASH_TICK_BACKOFF_MAX_MS
        );
        crashLobby.tickBackoffUntil = crashNow() + crashLobby.tickBackoffMs;
        console.error('crash_tick:', error);
    } else {
        crashLobby.tickBackoffMs = 0;
        crashLobby.tickBackoffUntil = 0;
    }
    scheduleCrashReload();
}

/* =========================
   ИСТОРИЯ ПРОШЕДШИХ РАУНДОВ (общая, из Supabase)
========================= */

async function loadCrashHistoryFromServer() {
    try {
        const { data, error } = await supabase
            .from(CRASH_ROUNDS_TABLE)
            .select('id, crash_point, created_at')
            .eq('status', 'crashed')
            .order('created_at', { ascending: false })
            .limit(CRASH_HISTORY_MAX);

        if (error) {
            console.error('Crash history:', error);
            return;
        }
        crashHistory = (data || []).map(r => Number(r.crash_point));
        crashHistoryIds = new Set((data || []).map(r => r.id));
    } catch (e) {
        console.error('Crash history:', e);
    }
}

function pushCrashHistoryPoint(point) {
    crashHistory.unshift(point);
    if (crashHistory.length > CRASH_HISTORY_MAX) crashHistory.length = CRASH_HISTORY_MAX;
}

/* =========================
   ВИЗУАЛЬНЫЕ ФАЗЫ: ОЖИДАНИЕ / ПОЛЁТ / КРАШ
========================= */

function clearCrashTrailTimers() {
    crashTrailTimers.forEach(clearTimeout);
    crashTrailTimers = [];
}

function resetCrashTrail() {
    const dom = getCrashDom();
    clearCrashTrailTimers();
    crashTrailPoints = [];
    setTrailD(dom, '');
    setTrailCrashed(dom, false);
    setTrailOpacity(dom, '1');
    setDotCrashed(dom, false);
    setDotLive(dom, false);
    setDotOpacity(dom, '0');
}

// Вход в фазу ожидания: ЕДИНОРАЗОВАЯ подготовка сцены (раньше она повторялась
// каждые 250 мс и заодно стирала взрыв и перезапускала ракету).
function enterWaitingVisual() {
    const dom = getCrashDom();
    syncCrashStageDims();
    crashLobby.lastCountdownDigit = null;
    crashGame.currentMult = 1.00;

    clearTimeout(crashExplosionHideTimeout);
    if (dom.explosionEl) dom.explosionEl.style.display = 'none';
    if (crashExplosionAnim) crashExplosionAnim.goToAndStop(0, true);
    if (dom.stageEl) dom.stageEl.style.transform = 'translate3d(0px, 0px, 0px)';

    resetCrashTrail();

    if (dom.topLeftMult) {
        dom.topLeftMult.classList.remove('crashed');
        dom.topLeftMult.style.display = 'none';
    }
    if (dom.multEl) {
        dom.multEl.textContent = '1.00x';
        dom.multEl.style.color = '#fff';
    }
    if (dom.rocketEl) {
        const c = crashRocketCenter();
        dom.rocketEl.style.transform = `translate3d(${c.x}px, ${c.y}px, 0px) rotate(45deg)`;
    }
    if (crashRocketAnim) crashRocketAnim.goToAndPlay(0, true);
    if (dom.betInput) dom.betInput.disabled = crashGame.betPlaced || !!crashGame.queued;

    renderCrashCountdown(true);
    renderCrashUI();
}

// Номер игры для показа: game_number из БД (identity) растёт на КАЖДЫЙ новый раунд,
// в том числе пустой, поэтому показываем его напрямую — без запросов и без прочерка.
function crashDisplayNumber(round) {
    if (!round || !round.game_number) return null;
    return Number(round.game_number) || null;
}

// Верхняя панель краша: БАНК (все ставки раунда), ИГРА (#номер раунда
// с сервера), СТАРТ ЧЕРЕЗ (цифры отсчёта только во время ожидания).
let crashTopbarLastTimer = '';
function updateCrashTopbar() {
    const bankEl = document.getElementById('crashBankValue');
    const numEl = document.getElementById('crashGameNumber');
    const timerEl = document.getElementById('crashTimerValue');
    if (bankEl) {
        const bank = (crashLobby.bets || []).reduce((s, b) => s + (Number(b.amount) || 0), 0);
        bankEl.textContent = bank.toFixed(2) + ' $';
    }
    if (numEl) {
        const n = crashDisplayNumber(crashLobby.round);
        numEl.textContent = n ? '#' + n : '—';
    }
    if (timerEl) {
        let text = '—', cls = '';
        if (crashGame.phase === 'waiting') {
            const sec = Math.ceil((crashGame.waitEndsAt - crashNow()) / 1000);
            if (sec >= 1) {
                text = String(Math.min(sec, 99));
                cls = sec >= 4 ? 'tb-green' : (sec >= 2 ? 'tb-yellow' : 'tb-red');
            }
        }
        if (text !== crashTopbarLastTimer) {
            crashTopbarLastTimer = text;
            timerEl.textContent = text;
            timerEl.className = cls;
            if (cls) { void timerEl.offsetWidth; timerEl.classList.add('tb-pop'); }
        }
    }
}

// Обратный отсчёт: меняем DOM только когда цифра реально сменилась, а
// следующую смену ставим на ТОЧНУЮ границу секунды.
function renderCrashCountdown(force) {
    updateCrashTopbar();
    if (crashGame.phase !== 'waiting') return;
    const dom = getCrashDom();
    const msLeft = crashGame.waitEndsAt - crashNow();
    const secLeft = Math.ceil(msLeft / 1000);

    clearTimeout(crashLobby.countdownTimer);
    if (msLeft > 0) {
        crashLobby.countdownTimer = setTimeout(() => renderCrashCountdown(false), (msLeft % 1000 || 1000) + 3);
    }

    if (secLeft < 1) return;                      // старт полёта — за него отвечает таймер фазы
    if (!force && secLeft === crashLobby.lastCountdownDigit) return;
    crashLobby.lastCountdownDigit = secLeft;

    if (dom.statusEl) {
        dom.statusEl.textContent = lastCrashPoint !== null
            ? `Прошлый раунд: ${lastCrashPoint.toFixed(2)}x · Старт через ${secLeft}с`
            : `Старт через ${secLeft}с`;
    }

    if (secLeft <= 5) {
        if (dom.countdownEl) {
            dom.countdownEl.textContent = String(secLeft);
            dom.countdownEl.className = 'crash-countdown ' + (secLeft === 5 ? 'cc-green' : (secLeft >= 3 ? 'cc-yellow' : 'cc-red'));
            dom.countdownEl.style.display = 'flex';
        }
        if (dom.centerInfoEl) dom.centerInfoEl.style.opacity = '0';
        if (dom.rocketEl) dom.rocketEl.style.opacity = '0';
    } else {
        if (dom.countdownEl) dom.countdownEl.style.display = 'none';
        if (dom.centerInfoEl) dom.centerInfoEl.style.opacity = '1';
        if (dom.rocketEl) dom.rocketEl.style.opacity = '1';
    }
}

// Общая «обвязка» экрана для фазы полёта (используется и при старте, и
// когда игрок открывает страницу посреди полёта).
function showFlyingChrome() {
    const dom = getCrashDom();
    if (dom.countdownEl) dom.countdownEl.style.display = 'none';
    if (dom.centerInfoEl) dom.centerInfoEl.style.opacity = '0';
    if (dom.rocketEl) dom.rocketEl.style.opacity = '1';
    if (dom.explosionEl) dom.explosionEl.style.display = 'none';
    if (dom.topLeftMult) {
        dom.topLeftMult.classList.remove('crashed');
        dom.topLeftMult.style.display = 'block';
    }
    setTrailCrashed(dom, false);
    setTrailOpacity(dom, '1');
    setDotCrashed(dom, false);
    if (dom.betInput) dom.betInput.disabled = !!crashGame.queued || (crashGame.betPlaced && !crashGame.cashedOut);
}

function startCrashRaf() {
    if (crashAnimHandle || !isCrashPageVisible()) return;
    crashAnimHandle = requestAnimationFrame(tickCrash);
}

function beginFlyingPhaseVisual() {
    crashLastHeavyUpdate = 0;
    crashGame.liveBetResolved = false;

    syncCrashStageDims();
    resetCrashTrail();
    showFlyingChrome();

    crashGame.currentMult = computeCrashMultAt(crashNow() - crashGame.startTime, crashGame.crashPoint);
    if (crashRocketAnim) crashRocketAnim.play();

    renderCrashUI();
    cancelAnimationFrame(crashAnimHandle);
    crashAnimHandle = null;
    startCrashRaf();
}

// Резкая тряска экрана с затуханием на GPU
function explosionShake(el, duration = 500, magnitude = 20) {
    if (!el) return;
    const start = performance.now();
    function frame(now) {
        const t = now - start;
        if (t >= duration) {
            el.style.transform = 'translate3d(0px, 0px, 0px)';
            return;
        }
        const decay = 1 - t / duration;
        const dx = (Math.random() - 0.5) * magnitude * decay;
        const dy = (Math.random() - 0.5) * magnitude * decay;
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0px)`;
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

function tickCrash() {
    crashAnimHandle = null;
    if (crashGame.phase !== 'flying') return;
    if (!isCrashPageVisible()) return;   // страницу открыли/закрыли — цикл перезапустится в initCrashPage()

    const now = crashNow();

    // Время краша пришло — взрыв стартует МГНОВЕННО, по локальному таймлайну,
    // не дожидаясь ответа сервера (раньше ждали realtime/опрос и иногда
    // терялись). Запись в БД делает maybeAdvanceCrash() параллельно.
    if (now >= crashGame.crashAt) {
        advanceLocalPhase();
        maybeAdvanceCrash();
        return;
    }

    if (!isFinite(crashGame.crashAt) && now - crashGame.startTime > CRASH_MAX_FLIGHT_MS + 500) {
        // Дольше возможного: замираем на последнем значении и ждём ответ сервера
        maybeAdvanceCrash();
        crashAnimHandle = requestAnimationFrame(tickCrash);
        return;
    }

    crashGame.currentMult = computeCrashMultAt(now - crashGame.startTime, crashGame.crashPoint);

    const perf = performance.now();
    let heavy;
    if (perf - crashLastHeavyUpdate >= CRASH_HEAVY_UPDATE_INTERVAL_MS) {
        crashLastHeavyUpdate = perf;
        heavy = true;
    } else {
        heavy = false;
    }

    renderCrashUI(heavy);
    crashAnimHandle = requestAnimationFrame(tickCrash);
}

// Точка краша для показа: если сервер ещё не раскрыл её — последняя известная или 1.00
function crashShownPoint() {
    const p = Number(crashGame.crashPoint);
    if (isFinite(p) && p > 0) return p;
    return lastCrashPoint !== null ? lastCrashPoint : 1.00;
}

// Итоговая «статичная» картинка краша (без анимаций): ракеты нет, множитель
// красным, кнопка заблокирована.
function showCrashedStatic() {
    const dom = getCrashDom();
    const crashPoint = crashShownPoint();

    if (crashRocketAnim) crashRocketAnim.pause();
    if (dom.rocketEl) dom.rocketEl.style.opacity = '0';
    if (dom.countdownEl) dom.countdownEl.style.display = 'none';
    if (dom.centerInfoEl) dom.centerInfoEl.style.opacity = '0';
    if (dom.multEl) dom.multEl.style.color = '#e74c3c';
    if (dom.topLeftMult) {
        dom.topLeftMult.textContent = crashPoint.toFixed(2) + 'x';
        dom.topLeftMult.classList.add('crashed');
        dom.topLeftMult.style.display = 'block';
    }
    if (dom.actionBtn) {
        dom.actionBtn.textContent = crashGame.cashedOut ? 'Выигрыш забран ✓' : 'Раунд завершён';
        dom.actionBtn.disabled = true;
    }
    if (dom.betInput) dom.betInput.disabled = false;
}

function playCrashExplosion() {
    const dom = getCrashDom();
    if (!dom.explosionEl) return;

    syncCrashStageDims();
    const c = crashRocketCenter();
    dom.explosionEl.style.transform = `translate3d(${c.x}px, ${c.y}px, 0px)`;

    clearTimeout(crashExplosionHideTimeout);
    dom.explosionEl.style.opacity = '1';
    dom.explosionEl.style.display = 'block';

    if (!crashExplosionAnim) {
        // нет Lottie — показываем запасной спиннер и сами убираем
        crashExplosionHideTimeout = setTimeout(hideExplosionSmoothly, 900);
        return;
    }

    // Страховка: если событие 'complete' у Lottie не придёт — всё равно уберём
    // взрыв до конца паузы.
    crashExplosionHideTimeout = setTimeout(hideExplosionSmoothly, Math.max(600, CRASH_RESULT_HOLD_MS - 300));

    // Контейнер только что стал видимым — resize() читает layout (синхронный
    // reflow), поэтому анимацию можно запускать СРАЗУ, без ожидания кадра.
    crashExplosionAnim.resize();
    if (crashExplosionTotalFrames > 0) {
        const endFrame = Math.max(1, Math.round(crashExplosionTotalFrames * EXPLOSION_PLAY_FRACTION));
        crashExplosionAnim.playSegments([0, endFrame], true);
    } else {
        crashExplosionAnim.goToAndPlay(0, true);
    }
    requestAnimationFrame(() => { if (crashExplosionAnim) crashExplosionAnim.resize(); });
}

// animate = true  → полный краш: след, взрыв, тряска, вибрация
// animate = false → пауза уже прошла (поздний вход): только итоговая картинка
function endCrashRoundVisual(animate) {
    const dom = getCrashDom();
    const crashPoint = crashShownPoint();

    cancelAnimationFrame(crashAnimHandle);
    crashAnimHandle = null;
    crashGame.currentMult = crashPoint;

    lastCrashPoint = crashPoint;
    if (crashGame.roundId && !crashHistoryIds.has(crashGame.roundId)) {
        crashHistoryIds.add(crashGame.roundId);
        pushCrashHistoryPoint(crashPoint);
    }
    renderCrashHistory();

    const visible = isCrashPageVisible();

    // Вибрация краха — только если игрок прямо сейчас находится в игре
    // «Ракетка» (страница краша открыта). В других разделах — без вибрации.
    if (animate && visible && window.tg?.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred((crashGame.betPlaced && crashGame.cashedOut) ? "success" : "error");
    }

    showCrashedStatic();
    clearCrashTrailTimers();

    if (animate) {
        drawCrashTrail(crashPoint);
        setTrailCrashed(dom, true);
        setTrailOpacity(dom, '1');
        setDotLive(dom, false);
        setDotCrashed(dom, true);
        setDotOpacity(dom, '1');
        crashTrailTimers.push(setTimeout(() => {
            setTrailOpacity(dom, '0');
            setDotOpacity(dom, '0');
        }, 1200));
        crashTrailTimers.push(setTimeout(() => {
            setTrailD(dom, '');
            crashTrailPoints = [];
        }, 2200));
    } else {
        setTrailD(dom, '');
        setTrailOpacity(dom, '0');
        setDotOpacity(dom, '0');
    }

    crashGame.explosionPlayed = !!(animate && visible);
    if (crashGame.explosionPlayed) {
        playCrashExplosion();
        explosionShake(dom.stageEl, 500, 20);
    }

    renderCrashUI();
}

// Игрок открыл страницу краша — подтягиваем картинку под текущую фазу.
function resumeCrashVisualsOnOpen() {
    advanceLocalPhase();

    if (crashGame.phase === 'waiting') {
        enterWaitingVisual();
    } else if (crashGame.phase === 'flying') {
        showFlyingChrome();
        crashGame.currentMult = computeCrashMultAt(crashNow() - crashGame.startTime, crashGame.crashPoint);
        startCrashRaf();
    } else if (crashGame.phase === 'crashed') {
        showCrashedStatic();
        // Краш произошёл, пока страница была закрыта, а пауза ещё идёт —
        // доигрываем взрыв, чтобы игрок его всё-таки увидел.
        const ago = crashNow() - crashGame.crashAt;
        if (!crashGame.explosionPlayed && ago < CRASH_EXPLOSION_REPLAY_WINDOW_MS) {
            crashGame.explosionPlayed = true;
            playCrashExplosion();
            explosionShake(getCrashDom().stageEl, 500, 20);
        }
    }
    renderCrashUI();
}

/* =========================
   СТАВКА / КЭШАУТ
========================= */


/* =========================
   ФРИБЕТ (КРАШ)
========================= */
let crashFreebets = [];        // [{ id, amount, status: 'new'|'active', bet_id }]
let crashFreebetOn = false;    // игрок включил режим «ставлю фрибетом»
let crashFbBetId = null;       // id фрибета, которым сделана текущая ставка
let crashFbStartParamUsed = false;

function crashFbNew() {
    return crashFreebets.filter(f => f.status === 'new');
}

async function loadCrashFreebets() {
    const myId = myCrashTelegramId();
    if (myId == null) return;
    try {
        const { data, error } = await supabase
            .from('crash_freebets')
            .select('id, amount, status, bet_id')
            .eq('telegram_id', Number(myId))
            .in('status', ['new', 'active'])
            .order('created_at', { ascending: true });
        if (error || !Array.isArray(data)) return;
        crashFreebets = data.map(f => ({ id: f.id, amount: roundMoney(f.amount), status: f.status, bet_id: f.bet_id }));
    } catch (e) { return; }

    // перезашли в приложение с уже поставленным фрибетом — находим его, чтобы кэшаут шёл как фрибет
    if (!crashFbBetId && crashGame.betPlaced && crashGame.myBetRowId != null) {
        const f = crashFreebets.find(x => x.status === 'active' && String(x.bet_id) === String(crashGame.myBetRowId));
        if (f) crashFbBetId = f.id;
    }
    // открыли по ссылке из сообщения о фрибете — сразу включаем режим фрибета
    if (!crashFbStartParamUsed) {
        crashFbStartParamUsed = true;
        if (tg?.initDataUnsafe?.start_param === 'freebet' && crashFbNew().length) crashFreebetOn = true;
    }
    if (!crashFbNew().length) crashFreebetOn = false;
    renderCrashFreebet();
    renderCrashUI();
}

function toggleCrashFreebet() {
    if (!crashFbNew().length) return;
    if (crashGame.phase !== 'waiting' || crashGame.betPlaced || crashGame.queued || crashGame.isProcessing) {
        showMessage('Фрибет можно поставить только в фазе ожидания раунда.');
        return;
    }
    crashFreebetOn = !crashFreebetOn;
    renderCrashFreebet();
    renderCrashUI();
}

function renderCrashFreebet() {
    const btn = document.getElementById('crashFreebetBtn');
    const txt = document.getElementById('crashFreebetText');
    const input = document.getElementById('crashBetInput');
    const label = document.getElementById('crashBetLabel');
    const list = crashFbNew();
    const canUse = list.length > 0 && crashGame.phase === 'waiting' && !crashGame.betPlaced && !crashGame.queued;

    if (!canUse) crashFreebetOn = false;
    if (btn) {
        btn.classList.toggle('hidden', !canUse);
        btn.classList.toggle('on', crashFreebetOn);
    }
    if (canUse && txt) {
        const fb = list[0];
        txt.textContent = (crashFreebetOn ? 'Фрибет ' : 'Использовать фрибет ') + fb.amount.toFixed(2) + ' $' +
            (list.length > 1 ? ' (ещё ' + (list.length - 1) + ')' : '');
    }
    if (label) label.textContent = crashFreebetOn ? 'ФРИБЕТ' : 'СУММА СТАВКИ';
    if (input && crashFreebetOn && list[0]) input.value = list[0].amount.toFixed(2);
}

async function placeCrashFreebet() {
    const round = crashLobby.round;
    if (!round || round.id !== crashGame.roundId || crashGame.phase !== 'waiting' || crashGame.betPlaced || crashGame.queued) return;
    if (crashGame.isProcessing) return;
    const fb = crashFbNew()[0];
    if (!fb) { crashFreebetOn = false; renderCrashFreebet(); return; }
    if (!lockEconomy()) return;

    crashGame.isProcessing = true;
    const myName = document.getElementById('username')?.textContent?.trim() || 'Игрок';
    const srv = await crashRpc('crash_freebet_bet', { p_fb_id: fb.id, p_name: myName, p_avatar: getMyIceArenaAvatar() });
    if (!srv.ok) {
        showMessage(srv.error || 'Не удалось поставить фрибет. Попробуйте ещё раз.');
        crashGame.isProcessing = false;
        unlockEconomy();
        loadCrashFreebets();
        scheduleCrashReload();
        return;
    }
    // баланс не меняется: фрибет — не деньги игрока
    if (srv.balance != null) setUIBalance(srv.balance);

    crashGame.bet = fb.amount;
    crashGame.betPlaced = true;
    crashGame.cashedOut = false;
    crashGame.liveBetResolved = false;
    crashGame.myBetRowId = srv.bet_id ?? null;
    crashFbBetId = fb.id;
    fb.status = 'active';
    fb.bet_id = srv.bet_id ?? null;
    crashFreebetOn = false;

    crashGame.isProcessing = false;
    unlockEconomy();
    renderCrashFreebet();
    renderCrashUI();
    scheduleCrashReload();
}

async function placeCrashBet() {
    const round = crashLobby.round;
    if (!round || round.id !== crashGame.roundId || crashGame.phase !== 'waiting' || crashGame.betPlaced || crashGame.queued) return;
    if (crashGame.isProcessing) return;
    if (!lockEconomy()) return;

    const dom = getCrashDom();
    const bet = roundMoney(parseFloat(dom.betInput?.value));

    if (!bet || isNaN(bet) || bet < 0.10) {
        showMessage("Минимальная ставка — 0.10 $!");
        unlockEconomy();
        return;
    }
    if (bet > currentBalance) {
        showMessage("Недостаточно средств!");
        unlockEconomy();
        return;
    }

    crashGame.isProcessing = true;
    const snapshot = snapshotBalanceState();

    currentTurnover = roundMoney(currentTurnover + bet);
    currentBetsCount++;
    setUIBalance(roundMoney(currentBalance - bet));

    const myName = document.getElementById('username')?.textContent?.trim() || 'Игрок';
    const srv = await crashRpc('crash_bet', { p_amount: bet, p_name: myName, p_avatar: getMyIceArenaAvatar() });
    if (!srv.ok) {
        restoreBalanceState(snapshot);
        showMessage(srv.error || "Не удалось сделать ставку. Проверьте соединение и попробуйте снова.");
        crashGame.isProcessing = false;
        unlockEconomy();
        scheduleCrashReload();
        return;
    }
    setUIBalance(srv.balance);

    crashGame.bet = bet;
    crashGame.betPlaced = true;
    crashGame.cashedOut = false;
    crashGame.liveBetResolved = false;
    crashGame.myBetRowId = srv.bet_id ?? null;

    crashGame.isProcessing = false;
    unlockEconomy();
    renderCrashUI();
    scheduleCrashReload();
}

async function cashOutCrash() {
    advanceLocalPhase();
    if (crashGame.phase !== 'flying' || !crashGame.betPlaced || crashGame.cashedOut) return;
    if (crashGame.isProcessing) return;
    if (!lockEconomy()) return;

    crashGame.isProcessing = true;
    const snapshot = snapshotBalanceState();

    // Сервер сам находит ставку, считает множитель по своему времени и платит.
    // Клиент шлёт лишь «на каком иксе нажал» — сервер возьмёт минимум из него и своего.
    const seenMult = computeCrashMultAt(crashNow() - crashGame.startTime, crashGame.crashPoint);
    const srv = crashFbBetId
        ? await crashRpc('crash_freebet_cashout', { p_fb_id: crashFbBetId, p_mult: seenMult })
        : await crashRpc('crash_cashout', { p_mult: seenMult });
    if (!srv.ok) {
        restoreBalanceState(snapshot);
        showMessage(srv.error || "Не удалось забрать выигрыш. Проверьте соединение.");
        crashGame.isProcessing = false;
        unlockEconomy();
        scheduleCrashReload();
        return;
    }
    const mult = isFinite(Number(srv.mult)) ? Number(srv.mult) : seenMult;
    const winAmount = roundMoney(srv.win);

    currentTotalWin = roundMoney(currentTotalWin + winAmount);
    currentWinsCount++;
    if (mult > currentMaxWin) currentMaxWin = mult;
    setUIBalance(srv.balance);

    if (crashFbBetId) {
        crashFreebets = crashFreebets.filter(f => f.id !== crashFbBetId);
        crashFbBetId = null;
    }
    crashGame.cashedOut = true;
    crashGame.cashoutMult = mult;
    crashGame.cashoutWin = winAmount;
    crashGame.cashoutRoundId = crashGame.roundId;
    crashGame.liveBetResolved = true;
    crashGame.isProcessing = false;

    if (window.tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
    window.showWinPopup?.(winAmount, mult);

    // Сразу показываем свой кэшаут в списке игроков
    crashLobby.bets = crashLobby.bets.map(b => b.isUser
        ? { ...b, status: 'cashed_out', cashoutMult: mult, winAmount }
        : b);
    renderCrashPlayersList();
    renderCrashUI();
    unlockEconomy();
}

function handleCrashAction() {
    if (crashGame.isProcessing) return;
    advanceLocalPhase();

    if (crashGame.phase === 'waiting' && !crashGame.betPlaced && !crashGame.queued) {
        if (crashFreebetOn) placeCrashFreebet(); else placeCrashBet();
    } else if (crashGame.phase === 'flying' && crashGame.betPlaced && !crashGame.cashedOut) {
        cashOutCrash();
    } else if (crashCanQueue()) {
        queueCrashBet();   // полёт / пауза после краша — ставка уйдёт в следующий раунд
    }
}

function adjustCrashBet(factor) {
    if (!crashCanEditBet()) return;
    applyBetFactor(getCrashDom().betInput, factor);
}

function setCrashMaxBet() {
    if (!crashCanEditBet()) return;
    applyBetMax(getCrashDom().betInput);
}

/* =========================
   ОТРИСОВКА
========================= */

// Цвет коэффициента в истории по диапазонам
function crashMultColor(m) {
    if (m <= 1.25) return '#ff3b3b';   // 1.00–1.25  красный
    if (m <= 1.85) return '#ffd21f';   // 1.26–1.85  жёлтый
    if (m <= 3.00) return '#2ecc71';   // 1.86–3.00  зелёный
    if (m <= 5.00) return '#3da5ff';   // 3.01–5.00  синий
    return '#ffc400';                  // 5.01+      ярко-золотой
}

function renderCrashHistory() {
    const dom = getCrashDom();
    if (!dom.historyList) return;

    dom.historyList.innerHTML = crashHistory.map(point => {
        const color = crashMultColor(point);
        const gold = point > 5.00;
        const extra = gold ? ' text-shadow:0 0 8px rgba(255,196,0,0.85); border-color:rgba(255,196,0,0.6); background:rgba(255,196,0,0.12);' : '';
        return `<span style="display:inline-block; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:4px 8px; font-size:11px; font-weight:800; color:${color};${extra}">${point.toFixed(2)}x</span>`;
    }).join('');
}

// Эффективный статус игрока: после краша все, кто не забрал, — проиграли
// (показываем сразу, не дожидаясь, пока это запишется в БД).
function crashEffectiveStatus(p) {
    // «Проиграл» — только после краша НА ЭТОМ экране: сервер/БД может пометить ставку
    // lost раньше, чем у нас сыграл взрыв, — до этого момента показываем «В игре».
    if (p.status === 'lost') return crashGame.phase === 'crashed' ? 'lost' : 'active';
    if (p.status === 'active' && crashGame.phase === 'crashed') return 'lost';
    return p.status;
}

function renderCrashPlayersList() {
    updateCrashTopbar();
    const dom = getCrashDom();
    if (!dom.playersList) return;

    if (dom.playersCount) dom.playersCount.textContent = String(crashLobby.bets.length);

    const rowHtml = (p, statusHtml) => (
        '<div class="crash-player-row' + (p.isUser ? ' crash-player-row-user' : '') + '">' +
            '<div class="crash-player-row-avatar">' + iceAvatarHtml(p.avatar) + '</div>' +
            '<div class="crash-player-row-info">' +
                '<div class="crash-player-row-name">' + escapeIceName(p.name) + '</div>' +
                '<div class="crash-player-row-bet">' + p.amount.toFixed(2) + '$</div>' +
            '</div>' +
            statusHtml +
        '</div>'
    );

    let html;
    if (!crashLobby.bets.length) {
        html = '<div class="crash-players-empty">Пока никто не поставил в этом раунде</div>';
    } else {
        // Сортировка: сначала те, кто ещё летит, потом забравшие, потом
        // проигравшие; внутри группы — по размеру ставки.
        const rank = { active: 0, cashed_out: 1, lost: 2 };
        const sorted = [...crashLobby.bets].sort((a, b) => {
            return (rank[crashEffectiveStatus(a)] ?? 3) - (rank[crashEffectiveStatus(b)] ?? 3) || b.amount - a.amount;
        });

        html = sorted.map(p => {
            const st = crashEffectiveStatus(p);
            let statusHtml;
            if (st === 'cashed_out') {
                const multTxt = p.cashoutMult != null ? p.cashoutMult.toFixed(2) + 'x' : '';
                statusHtml =
                    '<div class="crash-player-status crash-player-status-win">' +
                        '<span class="crash-status-main">✓ ' + multTxt + '</span>' +
                        '<span class="crash-status-sub">+' + (p.winAmount ?? 0).toFixed(2) + '$</span>' +
                    '</div>';
            } else if (st === 'lost') {
                statusHtml =
                    '<div class="crash-player-status crash-player-status-lost">' +
                        '<span class="crash-status-main">Проиграл</span>' +
                        '<span class="crash-status-sub">−' + p.amount.toFixed(2) + '$</span>' +
                    '</div>';
            } else {
                statusHtml =
                    '<div class="crash-player-status crash-player-status-live">' +
                        '<span class="crash-status-main"><i class="crash-live-dot"></i>В игре</span>' +
                    '</div>';
            }

            return rowHtml(p, statusHtml);
        }).join('');
    }

    // Ставки, ждущие следующий раунд: подпись слева и тонкая линия под активными игроками
    if (crashLobby.queue.length) {
        const waitStatus =
            '<div class="crash-player-status crash-player-status-wait">' +
                '<span class="crash-status-main"><i class="crash-wait-dot"></i>Ждёт</span>' +
            '</div>';
        html += '<div class="crash-queue-divider"><span>Ожидание</span></div>' +
            crashLobby.queue.map(q => rowHtml(q, waitStatus)).join('');
    }

    // Не трогаем DOM, если ничего не изменилось — список не мигает
    if (html === crashLobby.lastPlayersHtml) return;
    crashLobby.lastPlayersHtml = html;
    dom.playersList.innerHTML = html;
}

// Путь следа + точка на его конце для коэффициента m (без смены классов/прозрачности)
// Прогресс следа 0..1. Раньше пик достигался на 3.00x; теперь след идёт
// на 10% медленнее — пик на ~3.22x.
const CRASH_TRAIL_SPEED = 0.9;
function crashTrailProgress(m) {
    return Math.min(1, Math.max(0, CRASH_TRAIL_SPEED * (m - 1) / 2));
}

function drawCrashTrail(m) {
    const dom = getCrashDom();
    const stageW = crashStageW;
    const stageH = crashStageH;

    const trailProgress = crashTrailProgress(m);

    const trailStartX = stageW * 0.05;
    const trailStartY = stageH * 0.95;
    const trailEndX = stageW * 0.95;
    const trailEndY = stageH * 0.05;

    // След — это начало ФИКСИРОВАННОЙ кривой (квадратичная Безье от старта
    // к верхнему углу с изгибом). Голова ползёт по этой кривой, а сам след —
    // её кусочек от старта до головы (алгоритм де Кастельжо). Форма не
    // «плывёт», а именно вытягивается — как график, который дорисовывают.
    const fullDx = trailEndX - trailStartX;
    const fullDy = trailEndY - trailStartY;
    const fullLen = Math.hypot(fullDx, fullDy) || 1;
    const bow = 0.22 * fullLen;
    const ctrlX = (trailStartX + trailEndX) / 2 + (-fullDy / fullLen) * bow;
    const ctrlY = (trailStartY + trailEndY) / 2 + (fullDx / fullLen) * bow;

    const t = trailProgress;
    const u1 = 1 - t;
    const headX = u1 * u1 * trailStartX + 2 * u1 * t * ctrlX + t * t * trailEndX;
    const headY = u1 * u1 * trailStartY + 2 * u1 * t * ctrlY + t * t * trailEndY;

    if (dom.trailLine) {
        const subCx = trailStartX + t * (ctrlX - trailStartX);
        const subCy = trailStartY + t * (ctrlY - trailStartY);
        const r1 = v => Math.round(v * 10) / 10;
        setTrailD(dom, `M ${r1(trailStartX)},${r1(trailStartY)} Q ${r1(subCx)},${r1(subCy)} ${r1(headX)},${r1(headY)}`);
    }

    {
        const tr = `translate(${Math.round(headX * 10) / 10},${Math.round(headY * 10) / 10})`;
        if (dom.trailHead) dom.trailHead.setAttribute('transform', tr);
        if (dom.trailDotGlow) dom.trailDotGlow.setAttribute('transform', tr);
    }
}

function renderCrashUI(heavy = true) {
    const dom = getCrashDom();
    if (!dom.statusEl || !dom.multEl || !dom.actionBtn) return;

    if (crashGame.phase === 'pending') return;

    if (crashGame.phase === 'crashed') {
        dom.statusEl.textContent = `Крах на ${crashShownPoint().toFixed(2)}x · Следующий раунд скоро`;
        dom.multEl.textContent = crashShownPoint().toFixed(2) + 'x';
        dom.multEl.style.color = '#e74c3c';
        renderCrashFreebet();
        if (dom.betInput) dom.betInput.disabled = !!crashGame.queued;
        dom.actionBtn.textContent = crashGame.queued ? 'Ставка в очереди ✓' : 'Поставить на след. раунд';
        dom.actionBtn.disabled = !!crashGame.queued;
        return;
    }

    if (crashGame.phase === 'waiting') {
        // Тяжёлая подготовка сцены — в enterWaitingVisual() (один раз),
        // цифры отсчёта — в renderCrashCountdown(). Здесь только кнопка.
        const hold = crashGame.betPlaced || !!crashGame.queued;
        renderCrashFreebet();
        if (dom.betInput) dom.betInput.disabled = hold || crashFreebetOn;
        dom.actionBtn.textContent = crashGame.betPlaced ? 'Ставка принята' : (crashGame.queued ? 'Ставка в очереди ✓' : (crashFreebetOn && crashFbNew()[0] ? 'Поставить фрибет ' + crashFbNew()[0].amount.toFixed(2) + ' $' : 'Сделать ставку'));
        dom.actionBtn.disabled = hold;
        return;
    }

    // phase === 'flying'
    // Расчёт позиции ракеты и точки следа — дешёвая математика, считаем
    // каждый кадр, чтобы ракета двигалась идеально плавно.
    const currentM = crashGame.currentMult;

    const trailProgress = crashTrailProgress(currentM);

    // Поворот ракеты адаптирован под траекторию до 3.00x
    const angle = 45 - (90 * trailProgress);

    if (dom.rocketEl) {
        const c = crashRocketCenter();
        dom.rocketEl.style.transform = `translate3d(${c.x}px, ${c.y}px, 0px) rotate(${angle}deg)`;
    }

    // "Тяжёлые" обновления — текст с text-shadow и SVG-след с несколькими
    // drop-shadow — троттлим до ~30 раз/сек (см. CRASH_HEAVY_UPDATE_INTERVAL_MS
    // в tickCrash), чтобы не грузить рендер на каждый из 60 кадров.
    if (heavy) {
        if (dom.topLeftMult) {
            dom.topLeftMult.textContent = currentM.toFixed(2) + 'x';
        }

        drawCrashTrail(currentM);
        if (crashFreebetOn || !document.getElementById('crashFreebetBtn')?.classList.contains('hidden')) renderCrashFreebet();
        setDotOpacity(dom, '1');
        setDotLive(dom, true);

        if (crashGame.betPlaced && !crashGame.cashedOut) {
            const potential = (crashFbBetId ? crashGame.bet * (currentM - 1) : crashGame.bet * currentM).toFixed(2);
            dom.actionBtn.textContent = `Забрать ${potential}$`;
            dom.actionBtn.disabled = false;
        } else if (crashGame.queued) {
            dom.actionBtn.textContent = 'Ставка в очереди ✓';
            dom.actionBtn.disabled = true;
        } else {
            dom.actionBtn.textContent = 'Поставить на след. раунд';
            dom.actionBtn.disabled = false;
        }
        if (dom.betInput) dom.betInput.disabled = !!crashGame.queued || (crashGame.betPlaced && !crashGame.cashedOut);
    }

    // Тряска экрана — дешёвый compositor-only transform, оставляем на каждый
    // кадр ради плавности вибрации.
    if (dom.stageEl) {
        const shakeStrength = Math.min(8, (crashGame.currentMult - 1) * 1.2);
        const dx = (Math.random() - 0.5) * shakeStrength;
        const dy = (Math.random() - 0.5) * shakeStrength;
        dom.stageEl.style.transform = `translate3d(${dx}px, ${dy}px, 0px)`;
    }
}


/* Поп-ап выигрыша: текст + случайный .tgs-стикер из animations/stickers (win1..win5) */
(function () {
    const SHOW_MS = 4000;
    const STICKERS = [1, 2, 3, 4, 5].map(i => 'animations/stickers/win' + i + '.tgs');
    const FALLBACK_ICON = '🎉';
    const dataCache = {};   // src -> Promise<объект Lottie> (качаем и распаковываем один раз)
    let root = null, iconEl = null, textEl = null, barEl = null, hideTimer = null;
    let anim = null, showToken = 0, lastIdx = -1;

    // .tgs = gzip-архив с Lottie JSON
    async function gunzip(buf) {
        if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
        const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(stream).text();
    }
    function loadSticker(src) {
        if (!dataCache[src]) {
            dataCache[src] = fetch(src)
                .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
                .then(buf => {
                    const u8 = new Uint8Array(buf);
                    // иногда .tgs отдают уже распакованным JSON — тоже поддержим
                    if (u8[0] === 0x1f && u8[1] === 0x8b) return gunzip(buf);
                    return new TextDecoder().decode(u8);
                })
                .then(txt => JSON.parse(txt))
                .catch(err => { delete dataCache[src]; throw err; });
        }
        return dataCache[src];
    }
    function pickSticker() {
        let i;
        do { i = Math.floor(Math.random() * STICKERS.length); } while (STICKERS.length > 1 && i === lastIdx);
        lastIdx = i;
        return STICKERS[i];
    }
    function destroyAnim() {
        if (anim) { try { anim.destroy(); } catch (e) {} anim = null; }
    }
    function setIconEmoji() {
        destroyAnim();
        iconEl.textContent = FALLBACK_ICON;
    }
    function playSticker(token) {
        const src = pickSticker();
        loadSticker(src).then(data => {
            if (token !== showToken || typeof lottie === 'undefined') return;   // за это время поп-ап уже обновили/скрыли
            destroyAnim();
            iconEl.textContent = '';
            anim = lottie.loadAnimation({
                container: iconEl,
                renderer: 'canvas',
                loop: true,
                autoplay: true,
                animationData: JSON.parse(JSON.stringify(data)),   // lottie мутирует данные — даём копию
                rendererSettings: { clearCanvas: true, progressiveLoad: false, preserveAspectRatio: 'xMidYMid meet' }
            });
        }).catch(() => {
            if (token === showToken) setIconEmoji();
        });
    }
    function build() {
        if (root) return;
        root = document.createElement('div');
        root.className = 'win-popup';
        root.innerHTML = '<div class="win-popup-icon"></div><div class="win-popup-text"></div><div class="win-popup-bar"><i></i></div>';
        document.body.appendChild(root);
        iconEl = root.querySelector('.win-popup-icon');
        textEl = root.querySelector('.win-popup-text');
        barEl = root.querySelector('.win-popup-bar i');
    }
    window.showWinPopup = function (amount, mult) {
        const win = Number(amount);
        if (!(win > 0)) return;
        build();
        let text = 'Выигрыш +' + win.toFixed(2).replace('.', ',') + '$';
        const m = Number(mult);
        if (isFinite(m) && m > 0) text += ' (x' + String(parseFloat(m.toFixed(2))) + ')';
        textEl.textContent = text;
        clearTimeout(hideTimer);
        root.classList.remove('show');
        barEl.style.animation = 'none';
        void root.offsetWidth;
        barEl.style.animation = 'winPopupBar ' + SHOW_MS + 'ms linear forwards';
        root.classList.add('show');

        const token = ++showToken;
        setIconEmoji();          // пока стикер грузится (в первый раз) — эмодзи
        playSticker(token);

        hideTimer = setTimeout(() => {
            root.classList.remove('show');
            setTimeout(() => { if (token === showToken) destroyAnim(); }, 400);
        }, SHOW_MS);
    };
    // подгружаем стикеры заранее, чтобы первый выигрыш не мигал эмодзи
    setTimeout(() => STICKERS.forEach(src => loadSticker(src).catch(() => {})), 3000);
})();

document.addEventListener('visibilitychange', function () {
    document.documentElement.classList.toggle('app-paused', document.hidden);
});

const PRELOAD_IMAGES = [
    'images/ui/copy.png',
    'images/ui/lock.png',
    'images/ui/key.png'
];
const PRELOAD_TASK_TIMEOUT_MS = 8000;
let appLoadProgress = 0;
window.__preloadedImages = [];

function preloadImage(src) {
    return new Promise(resolve => {
        const img = new Image();
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        img.onload = () => { if (img.decode) img.decode().then(finish, finish); else finish(); };
        img.onerror = finish;
        img.src = src;
        window.__preloadedImages.push(img);
        setTimeout(finish, PRELOAD_TASK_TIMEOUT_MS);
    });
}

// Lottie-данные ракеты/взрыва склеиваются из кусков и парсятся ОДИН раз —
// это самая тяжёлая операция, поэтому делаем её на экране загрузки.
function getLottieData(kind) {   // kind: 'ROCKET' | 'EXPLOSION'
    const cacheKey = '__LOTTIE_' + kind;
    if (window[cacheKey] !== undefined) return window[cacheKey];
    let data = null;
    const chunks = window[kind + '_DATA_CHUNKS'];
    if (chunks && chunks.length) {
        try { data = JSON.parse(chunks.join('')); } catch (e) { data = null; }
    }
    window[cacheKey] = data;
    return data;
}

// extraTasks — доп. промисы (например, первый запрос состояния краша).
function preloadAppAssets(extraTasks = []) {
    const tasks = [
        ...PRELOAD_IMAGES.map(preloadImage),
        (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).catch(() => {}),
        new Promise(resolve => setTimeout(() => {
            getLottieData('ROCKET');
            getLottieData('EXPLOSION');
            resolve();
        }, 0)),
        ...extraTasks.map(p => Promise.race([
            Promise.resolve(p).catch(() => {}),
            new Promise(r => setTimeout(r, 6000))
        ]))
    ];

    let done = 0;
    const total = tasks.length;
    appLoadProgress = 0;
    return Promise.all(tasks.map(t => t.then(() => {
        done++;
        appLoadProgress = done / total;
    })));
}

function hideAppLoader(assetsReady) {
    const loader = document.getElementById('appLoader');
    const fill = document.getElementById('appLoaderProgressFill');
    if (!loader) return;

    const minVisibleMs = 900;
    const maxVisibleMs = 15000;   // страховка: не держим экран загрузки вечно
    const startedAt = Date.now();

    // Полоса теперь показывает РЕАЛЬНЫЙ прогресс предзагрузки (плавно догоняет)
    let shown = 6;
    const progressTimer = setInterval(() => {
        const target = 6 + 90 * appLoadProgress;
        shown += (target - shown) * 0.25;
        if (fill) fill.style.width = shown + '%';
    }, 80);

    const windowLoaded = document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise(r => window.addEventListener('load', r, { once: true }));

    const everythingReady = Promise.all([windowLoaded, assetsReady || Promise.resolve()]);
    const safetyTimeout = new Promise(r => setTimeout(r, maxVisibleMs));

    Promise.race([everythingReady, safetyTimeout]).then(() => {
        const remaining = Math.max(0, minVisibleMs - (Date.now() - startedAt));
        setTimeout(() => {
            clearInterval(progressTimer);
            if (fill) fill.style.width = '100%';
            setTimeout(() => {
                loader.classList.add('app-loader-hidden');
                setTimeout(() => loader.remove(), 560);
            }, 120);
        }, remaining);
    });
}

(function balanceSync() {
    const POLL_MS = 3000;       // как часто сверяемся
    const IDLE_MS = 12000;      // сколько без своих операций, чтобы принудительно выровнять
    const cents = (n) => Math.round(Number(n) * 100) / 100;

    let base = null;            // баланс в базе при прошлой сверке
    let baseSeq = -1;           // номер «своей» операции на тот момент
    let seq = 0;                // растёт при каждом изменении баланса самой аппкой
    let lastSetAt = Date.now();
    let busy = false;

    const origSetUIBalance = paintBalance;   // рисует без учёта «своей операции»
    // все свои изменения баланса идут через setUIBalance → хук
    balanceTouchHook = function () {
        seq++;
        lastSetAt = Date.now();
    };

    async function pull() {
        const tgUser = tg?.initDataUnsafe?.user;
        if (!tgUser || busy || document.visibilityState === 'hidden') return;
        busy = true;
        const startSeq = seq;
        try {
            const { data, error } = await supabase
                .from('wxs_game')
                .select('balance')
                .eq('telegram_id', tgUser.id)
                .limit(1);
            if (error || !data || !data.length) return;
            const srv = cents(data[0].balance);
            if (!isFinite(srv)) return;

            // пока шла проверка, аппка сама меняла баланс (или идёт ставка) —
            // этот ответ мог устареть, просто запомним ориентир и выйдем
            if (startSeq !== seq || isEconomyLocked) { base = null; return; }

            if (base !== null && baseSeq !== startSeq) base = null;

            const ui = cents(currentBalance);
            if (srv === ui) { base = srv; baseSeq = startSeq; return; }

            if (base !== null && srv !== base) {
                // база изменилась, а своих операций не было → изменение снаружи (чат и т.п)
                origSetUIBalance(cents(ui + (srv - base)));
                base = srv; baseSeq = startSeq;
                return;
            }

            base = srv; baseSeq = startSeq;
            // экран расходится с базой и давно ничего не происходит → выравниваем
            if (Date.now() - lastSetAt > IDLE_MS) origSetUIBalance(srv);
        } catch (e) {
            console.warn('[balanceSync]', e);
        } finally {
            busy = false;
        }
    }

    setInterval(pull, POLL_MS);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') pull();
    });
    window.addEventListener('focus', pull);
    window.refreshBalance = pull;
})();


window.adjustCrashBet = adjustCrashBet;
window.setCrashMaxBet = setCrashMaxBet;
window.handleCrashAction = handleCrashAction;
window.clampBetInputOnBlur = clampBetInputOnBlur;
window.blockInvalidBetKeys = blockInvalidBetKeys;
window.showMessage = showMessage;

async function startApp() {
    let resolveCrashReady;
    const crashReady = new Promise(r => { resolveCrashReady = r; });
    const assetsReady = preloadAppAssets([crashReady]);

    const ok = await Promise.race([
        loadUserData().catch(e => { console.error('[init] loadUserData упала:', e); return false; }),
        new Promise(r => setTimeout(() => { console.warn('[init] Supabase не ответил за 8 сек'); r(true); }, 8000))
    ]);
    if (ok === false) {
        // доступ закрыт (не тот бот / нет профиля) — игру не запускаем
        const loader = document.getElementById('appLoader');
        if (loader) loader.remove();
        return;
    }

    initCrashPage();
    startCrashEngine().finally(resolveCrashReady);

    document.addEventListener('gesturestart', (e) => e.preventDefault());
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) e.preventDefault();
        lastTouchEnd = now;
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
        if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });

    // Косметика (не настоящая защита — настоящая на стороне Supabase)
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    hideAppLoader(assetsReady);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startApp);
else startApp();

})();
