// Sitewide theme. Loaded in <head> without defer so the right colours apply before the first paint.
// Preference (stored in localStorage as "lovgren-theme"): system | light | dark | ocean | ember.
// Resolved onto <html> as data-theme (light | midnight | ocean | ember) and data-scheme (light | dark).
// A page can pin its scheme with <html data-force-scheme="dark"> (the World Cup poster is always dark).
(() => {
  const KEY = 'lovgren-theme';
  const PREFERENCES = ['system', 'light', 'dark', 'ocean', 'ember'];
  // Older values from the game library's own setting.
  const LEGACY = { forest: 'dark', midnight: 'dark' };
  const prefersLight = matchMedia('(prefers-color-scheme: light)');
  const root = document.documentElement;

  function normalize(value) {
    const preference = LEGACY[value] || value;
    return PREFERENCES.includes(preference) ? preference : 'system';
  }

  function read() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) return normalize(saved);
      // One-time migration from the game library's preferences.
      const legacy = JSON.parse(localStorage.getItem('personal-game-library-preferences-v1') || '{}').theme;
      return legacy ? normalize(legacy) : 'system';
    } catch {
      return 'system';
    }
  }

  function resolve(preference) {
    if (root.dataset.forceScheme === 'dark') return { theme: 'midnight', scheme: 'dark' };
    if (preference === 'light') return { theme: 'light', scheme: 'light' };
    if (preference === 'dark') return { theme: 'midnight', scheme: 'dark' };
    if (preference === 'ocean' || preference === 'ember') return { theme: preference, scheme: 'dark' };
    return prefersLight.matches ? { theme: 'light', scheme: 'light' } : { theme: 'midnight', scheme: 'dark' };
  }

  let current = read();

  function apply() {
    const { theme, scheme } = resolve(current);
    root.dataset.theme = theme;
    root.dataset.scheme = scheme;
    root.style.colorScheme = scheme;
  }

  function set(preference, { persist = true } = {}) {
    current = normalize(preference);
    if (persist) {
      try {
        if (current === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, current);
      } catch {
        // Storage blocked: the choice still applies to this page.
      }
    }
    apply();
    document.dispatchEvent(new CustomEvent('site:themechange', { detail: { preference: current } }));
  }

  apply();
  prefersLight.addEventListener('change', () => { if (current === 'system') set('system', { persist: false }); });
  // Keep other open tabs in sync.
  addEventListener('storage', event => { if (event.key === KEY) set(event.newValue || 'system', { persist: false }); });

  globalThis.SiteTheme = Object.freeze({ PREFERENCES, get preference() { return current; }, set, resolve: preference => resolve(normalize(preference)) });
})();
