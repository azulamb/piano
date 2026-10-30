'use strict';

(() => {
  const landscape = document.getElementById('landscape');
  const automatic = document.getElementById('orientation-auto');
  const message = document.getElementById('orientation-status');
  const orientation = window.screen?.orientation;
  const storageKey = 'pocket-chip-orientation';
  let ownsFullscreen = false;
  let busy = false;

  function save(value) {
    try { localStorage.setItem(storageKey, value); } catch { /* Private storage may be unavailable. */ }
  }
  function show(locked, text) {
    landscape.setAttribute('aria-pressed', String(locked));
    automatic.setAttribute('aria-pressed', String(!locked));
    message.textContent = text;
  }
  function setBusy(value) {
    busy = value;
    landscape.disabled = value;
    automatic.disabled = value;
  }
  async function lock(userInitiated) {
    if (busy) return;
    if (typeof orientation?.lock !== 'function') {
      show(false, 'この端末では横画面の固定に対応していません。端末の回転ロックを解除し、端末を横に向けてください。');
      return;
    }
    setBusy(true);
    try {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
      if (userInitiated && !standalone && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        ownsFullscreen = true;
      }
      await orientation.lock('landscape');
      save('landscape');
      show(true, '横画面に固定しています。次回起動時もこの設定を適用します。');
    } catch {
      if (ownsFullscreen && document.fullscreenElement) {
        ownsFullscreen = false;
        try { await document.exitFullscreen(); } catch { /* Keep the original failure message. */ }
      }
      show(false, userInitiated
        ? '横画面に固定できませんでした。端末の回転ロックを解除して横に向けるか、ホーム画面に追加したアプリからお試しください。'
        : '横画面の設定を保存しています。「横画面に固定」を押して適用してください。');
    } finally { setBusy(false); }
  }
  landscape.addEventListener('click', () => lock(true));
  automatic.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try {
      orientation?.unlock?.();
      save('auto');
      show(false, '端末の向きに合わせます。端末側の回転ロックが有効な場合は解除してください。');
      if (ownsFullscreen && document.fullscreenElement) {
        ownsFullscreen = false;
        await document.exitFullscreen();
      }
    } catch {
      message.textContent = '自動回転への切り替えを完了できませんでした。全画面表示を終了して、もう一度お試しください。';
    } finally { setBusy(false); }
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && ownsFullscreen) {
      ownsFullscreen = false;
      show(false, '全画面表示を終了しました。横画面に固定するには、もう一度「横画面に固定」を押してください。');
    }
  });
  try { if (localStorage.getItem(storageKey) === 'landscape') lock(false); } catch { /* Use automatic orientation by default. */ }
})();
