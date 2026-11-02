// Färgtemat (Skog, Hav, Bär eller Grafit, ljust eller mörkt). Ett vanligt skript i <head> som körs innan
// sidan ritas, så att den aldrig blinkar i fel färger. Valet ligger i "lovgren-matschema" (se store.js);
// "Följ enheten" (inget valt läge) följer telefonens eller datorns mörka läge, även när det ändras.
(() => {
  const KEY = 'lovgren-matschema';
  const PALETTES = ['skog', 'hav', 'bar', 'grafit'];
  const dark = matchMedia('(prefers-color-scheme: dark)');

  function saved() {
    try { return JSON.parse(localStorage.getItem(KEY))?.theme || {}; } catch { return {}; }
  }

  function apply(theme = saved()) {
    const root = document.documentElement;
    root.dataset.palette = PALETTES.includes(theme.palette) ? theme.palette : 'skog';
    root.dataset.mode = theme.mode === 'light' || theme.mode === 'dark' ? theme.mode : dark.matches ? 'dark' : 'light';
    const color = getComputedStyle(root).getPropertyValue('--head').trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }

  apply();
  dark.addEventListener('change', () => apply());
  globalThis.matschemaTheme = { apply, PALETTES };
})();
