'use strict';

(() => {
  const landscape = document.getElementById('landscape');
  const automatic = document.getElementById('orientation-auto');
  const message = document.getElementById('orientation-status');
  const root = document.documentElement;
  // Keep existing saved preferences when upgrading from native orientation locking.
  const storageKey = 'pocket-chip-orientation';
  let enabled = false;
  let previousLayout = '';
  try { enabled = localStorage.getItem(storageKey) === 'landscape'; } catch { /* Storage is optional. */ }

  function render() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const rotated = enabled && height > width;
    const layout = `${width}:${height}:${rotated}`;
    if (layout !== previousLayout) {
      // Release held notes before keys move under a finger.
      window.dispatchEvent(new Event('piano-layout-change'));
      previousLayout = layout;
    }
    root.style.setProperty('--view-width', `${width}px`);
    root.style.setProperty('--view-height', `${height}px`);
    root.classList.toggle('landscape-rotated', rotated);
    landscape.setAttribute('aria-pressed', String(enabled));
    automatic.setAttribute('aria-pressed', String(!enabled));
    message.textContent = enabled
      ? '横向き表示です。縦長の画面では表示を90度回転します。iPhoneは縦向きロックのまま端末を横に持つと安定して使えます。設定は次回も適用されます。'
      : '画面の縦横に合わせて表示します。端末の回転ロックは変更しません。';
  }
  function select(value) {
    enabled = value;
    try { localStorage.setItem(storageKey, value ? 'landscape' : 'auto'); } catch { /* Storage is optional. */ }
    render();
  }
  landscape.addEventListener('click', () => select(true));
  automatic.addEventListener('click', () => select(false));
  window.addEventListener('resize', render);
  render();
})();
