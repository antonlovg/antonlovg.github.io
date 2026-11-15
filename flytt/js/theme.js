// Utseendet du valt: kritor (ljust, standard), mörkt eller gulligt. Ett vanligt skript i <head> som körs innan
// sidan ritas, så att den aldrig blinkar i fel färger. Valet ligger i "lovgren-flytt" (se store.js).
(() => {
  let theme = 'light';
  try {
    const saved = JSON.parse(localStorage.getItem('lovgren-flytt'))?.theme;
    if (saved === 'dark' || saved === 'cute') theme = saved;
  } catch { /* inget sparat */ }
  document.documentElement.dataset.theme = theme;
})();
