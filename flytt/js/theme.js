// Ljust (standard) eller mörkt, som du valt. Ett vanligt skript i <head> som körs innan sidan ritas, så att den
// aldrig blinkar i fel färger. Valet ligger i "lovgren-flytt" (se store.js).
(() => {
  let dark = false;
  try { dark = JSON.parse(localStorage.getItem('lovgren-flytt'))?.theme === 'dark'; } catch { /* inget sparat */ }
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
