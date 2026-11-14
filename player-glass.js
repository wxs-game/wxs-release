// Player glass press: delegated so realtime row replacements need no new listeners.
(function initPlayerGlassPress() {
    const list = document.getElementById('crashPlayersList');
    if (!list) return;
    let pressed = null;
    function release() {
        if (!pressed) return;
        pressed.row.classList.remove('is-glass-pressed');
        pressed.row.style.removeProperty('--player-press-x');
        pressed.row.style.removeProperty('--player-press-y');
        pressed = null;
    }
    list.addEventListener('pointerdown', e => {
        if (!e.isPrimary || e.button !== 0) return;
        release();
        const row = e.target.closest('.crash-player-row');
        if (!row || !list.contains(row)) return;
        const rect = row.getBoundingClientRect();
        row.style.setProperty('--player-press-x', ((e.clientX - rect.left) / rect.width * 100) + '%');
        row.style.setProperty('--player-press-y', ((e.clientY - rect.top) / rect.height * 100) + '%');
        row.classList.add('is-glass-pressed');
        pressed = { row, id: e.pointerId, x: e.clientX, y: e.clientY };
    }, { passive: true });
    document.addEventListener('pointermove', e => {
        if (pressed && e.pointerId === pressed.id &&
            Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > 8) release();
    }, { passive: true });
    function endPointer(e) {
        if (pressed && e.pointerId === pressed.id) release();
    }
    document.addEventListener('pointerup', endPointer, { passive: true });
    document.addEventListener('pointercancel', endPointer, { passive: true });
    list.addEventListener('scroll', release, { passive: true });
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
})();

