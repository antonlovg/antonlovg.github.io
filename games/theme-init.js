// Loaded before the page renders (not deferred), so the saved or device theme applies without a flash.
// "system" follows the device's light/dark setting, like the rest of lovgren.dev.
(() => {
  const THEMES = ['midnight', 'ocean', 'ember', 'light'];
  const RENAMED = { forest: 'midnight' };
  const prefersLight = matchMedia('(prefers-color-scheme: light)');

  function resolve(preference) {
    const theme = RENAMED[preference] || preference;
    if (THEMES.includes(theme)) return theme;
    return prefersLight.matches ? 'light' : 'midnight';
  }

  let preference = 'system';
  try {
    preference = JSON.parse(localStorage.getItem('personal-game-library-preferences-v1') || '{}').theme || 'system';
  } catch {
    // Storage unavailable: follow the device.
  }
  document.documentElement.dataset.theme = resolve(preference);
  globalThis.GameLibraryTheme = { THEMES, RENAMED, resolve, prefersLight };
})();
