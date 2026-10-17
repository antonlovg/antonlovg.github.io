// Stockholm weather as the site's mood, shared by the browser and the build (scripts/fetch-weather.mjs).
// The build fetches the current weather from Open-Meteo into /weather.json once per deploy (hourly),
// so visitors never contact a weather service. In the browser, site.js loads this file and calls
// mount(): the page gets a tint (data-weather-* on <html>) and a decorative canvas with rain, snow,
// clouds, fog or stars. Still for reduced motion, paused in hidden tabs, off with "Weather effects".
// Preview any weather with ?weather=rain|snow|sleet|thunder|fog|clouds|clear (&phase=night|twilight|day).
(function attachWeather(root, createApi) {
  const api = createApi(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteWeather = api;
})(globalThis, root => {
  const N_ = text => text;
  const PLACE = Object.freeze({ name: 'Stockholm', latitude: 59.3293, longitude: 18.0686 });
  const KINDS = ['clear', 'clouds', 'fog', 'rain', 'sleet', 'snow', 'thunder'];
  const PHASES = ['day', 'twilight', 'night'];
  const MAX_AGE = 6 * 3600e3; // older data means the pipeline has stopped; show nothing rather than stale weather
  const TWILIGHT = 40 * 60e3;

  // WMO weather codes (what Open-Meteo reports) → [kind, intensity 0–1, label].
  const CODES = {
    0: ['clear', 0, N_('clear sky')],
    1: ['clear', 0.2, N_('mostly clear')],
    2: ['clouds', 0.45, N_('partly cloudy')],
    3: ['clouds', 1, N_('overcast')],
    45: ['fog', 0.8, N_('fog')],
    48: ['fog', 1, N_('freezing fog')],
    51: ['rain', 0.15, N_('light drizzle')],
    53: ['rain', 0.25, N_('drizzle')],
    55: ['rain', 0.35, N_('heavy drizzle')],
    56: ['sleet', 0.25, N_('freezing drizzle')],
    57: ['sleet', 0.4, N_('freezing drizzle')],
    61: ['rain', 0.45, N_('light rain')],
    63: ['rain', 0.7, N_('rain')],
    65: ['rain', 1, N_('heavy rain')],
    66: ['sleet', 0.5, N_('freezing rain')],
    67: ['sleet', 0.8, N_('freezing rain')],
    71: ['snow', 0.35, N_('light snow')],
    73: ['snow', 0.6, N_('snow')],
    75: ['snow', 1, N_('heavy snow')],
    77: ['snow', 0.25, N_('snow grains')],
    80: ['rain', 0.5, N_('rain showers')],
    81: ['rain', 0.75, N_('rain showers')],
    82: ['rain', 1, N_('heavy showers')],
    85: ['snow', 0.6, N_('snow showers')],
    86: ['snow', 1, N_('heavy snow showers')],
    95: ['thunder', 0.8, N_('thunderstorm')],
    96: ['thunder', 1, N_('thunderstorm with hail')],
    99: ['thunder', 1, N_('thunderstorm with hail')]
  };

  function condition(code) {
    const [kind, intensity, label] = CODES[code] || CODES[3];
    return { kind, intensity, label };
  }

  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const isoTime = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));

  // Open-Meteo's answer (timezone=GMT) → the small, validated /weather.json. Throws on anything odd.
  function fromOpenMeteo(raw, now = new Date()) {
    const current = raw?.current;
    const daily = raw?.daily;
    if (!current || !finite(current.temperature_2m) || !Number.isInteger(current.weather_code)) throw new Error('No current weather');
    if (!Array.isArray(daily?.sunrise) || !Array.isArray(daily?.sunset)) throw new Error('No sunrise and sunset');
    const utc = value => (typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value) ? `${value}:00Z` : null);
    const sun = daily.sunrise.map((rise, index) => ({ rise: utc(rise), set: utc(daily.sunset[index]) }))
      .filter(day => day.rise && day.set && Date.parse(day.set) > Date.parse(day.rise));
    if (!sun.length) throw new Error('No sunrise and sunset');
    return {
      schemaVersion: 1,
      fetchedAt: now.toISOString(),
      place: PLACE.name,
      temperature: Math.round(current.temperature_2m * 10) / 10,
      code: current.weather_code,
      wind: finite(current.wind_speed_10m) ? Math.round(current.wind_speed_10m * 10) / 10 : 0,
      sun
    };
  }

  function isValid(data) {
    return Boolean(data && data.schemaVersion === 1 && isoTime(data.fetchedAt) && finite(data.temperature) && Number.isInteger(data.code)
      && finite(data.wind) && Array.isArray(data.sun) && data.sun.length && data.sun.every(day => isoTime(day?.rise) && isoTime(day?.set)));
  }

  function isFresh(data, now = new Date()) {
    if (!isValid(data)) return false;
    const age = now - Date.parse(data.fetchedAt);
    return age > -3600e3 && age < MAX_AGE;
  }

  // The day whose sunrise/sunset is closest to now, so it works shortly before midnight and after.
  function dayOf(data, now) {
    const time = now.getTime();
    const middle = day => (Date.parse(day.rise) + Date.parse(day.set)) / 2;
    return data.sun.reduce((best, day) => (Math.abs(middle(day) - time) < Math.abs(middle(best) - time) ? day : best));
  }

  // 'day', 'twilight' (around sunrise and sunset) or 'night'.
  function phase(data, now = new Date()) {
    const time = now.getTime();
    for (const day of data.sun) {
      const rise = Date.parse(day.rise);
      const set = Date.parse(day.set);
      if (time >= rise + TWILIGHT && time <= set - TWILIGHT) return 'day';
      if (time >= rise - TWILIGHT && time <= set + TWILIGHT) return 'twilight';
    }
    return 'night';
  }

  // Stockholm swings from about 6 hours of daylight in December to 18½ at midsummer.
  function season(data, now = new Date()) {
    const day = dayOf(data, now);
    const hours = (Date.parse(day.set) - Date.parse(day.rise)) / 3600e3;
    if (hours < 7.5) return 'dark';
    if (hours > 17.5) return 'bright';
    return '';
  }

  // Everything the effects need. `preview` (from ?weather=…) replaces the real weather visually.
  function mood(data, now = new Date(), preview = {}) {
    const real = isFresh(data, now);
    if (!real && !preview.kind) return null;
    const base = real ? condition(data.code) : { kind: 'clear', intensity: 0 };
    let kind = base.kind;
    let intensity = base.intensity;
    if (KINDS.includes(preview.kind)) {
      kind = preview.kind;
      intensity = kind === 'clear' ? 0 : kind === base.kind ? Math.max(base.intensity, 0.6) : 0.75;
    }
    let when = PHASES.includes(preview.phase) ? preview.phase : real ? phase(data, now) : 'day';
    const time = real ? season(data, now) : '';
    // Midsummer nights never get properly dark: show them as twilight.
    if (time === 'bright' && when === 'night') when = 'twilight';
    return { kind, intensity, phase: when, season: time, wind: real ? data.wind : 3 };
  }

  // "5 °C, clear sky" plus a note in the darkest and brightest weeks.
  function describe(data, now, { t = (text, vars = {}) => text.replace(/\{(\w+)\}/g, (match, name) => vars[name] ?? match), locale = 'en-GB' } = {}) {
    if (!isFresh(data, now)) return '';
    const temperature = new Intl.NumberFormat(locale, { style: 'unit', unit: 'celsius', maximumFractionDigits: 0 }).format(Math.round(data.temperature) || 0);
    const parts = [`${temperature}, ${t(condition(data.code).label)}`];
    const when = season(data, now);
    const day = dayOf(data, now);
    if (when === 'dark' && phase(data, now) !== 'night' && now < Date.parse(day.set)) {
      const time = new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(day.set));
      parts.push(t('sunset at {time}', { time }));
    } else if (when === 'bright' && phase(data, now) !== 'day') {
      parts.push(t('the sun barely sets'));
    }
    return parts.join(' · ');
  }

  function previewFrom(search) {
    const params = new URLSearchParams(search);
    return { kind: params.get('weather') || '', phase: params.get('phase') || '' };
  }

  const shared = { PLACE, KINDS, CODES, condition, fromOpenMeteo, isValid, isFresh, phase, season, mood, describe, previewFrom };
  if (typeof document === 'undefined' || !root.document) return Object.freeze(shared);

  // ---------- Effects (browser only) ----------

  const html = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let state = null; // { mood, canvas, ctx, particles, frame, ... }
  let current = null;

  const random = (min, max) => min + Math.random() * (max - min);

  function palette() {
    const dark = html.dataset.scheme !== 'light';
    return dark
      ? { rain: 'rgb(170 195 240 / 34%)', snow: 'rgb(255 255 255 / 80%)', star: '255 255 255', cloud: '150 160 185', fog: '160 168 182', flash: '220 225 255' }
      : { rain: 'rgb(60 90 150 / 30%)', snow: 'rgb(95 120 170 / 62%)', star: '', cloud: '120 130 150', fog: '150 155 165', flash: '255 255 255' };
  }

  function makeParticles(m, width, height) {
    const area = width * height;
    const count = (density, cap) => Math.min(cap, Math.round(area / density));
    const items = [];
    const add = (n, make) => { for (let index = 0; index < n; index += 1) items.push(make()); };
    const rainy = m.kind === 'rain' || m.kind === 'thunder' || m.kind === 'sleet';
    if (rainy) {
      const n = count(9000, 240) * Math.max(0.25, m.intensity) * (m.kind === 'sleet' ? 0.6 : 1);
      add(Math.round(n), () => ({ type: 'drop', x: random(0, width), y: random(-height, height), length: random(10, 22), speed: random(620, 900), depth: random(0.5, 1) }));
    }
    if (m.kind === 'snow' || m.kind === 'sleet') {
      const n = count(11000, 170) * Math.max(0.3, m.intensity) * (m.kind === 'sleet' ? 0.5 : 1);
      add(Math.round(n), () => ({ type: 'flake', x: random(0, width), y: random(-height, height), radius: random(1.2, 3.2), speed: random(30, 75), sway: random(0, Math.PI * 2), depth: random(0.4, 1) }));
    }
    if (m.kind === 'clouds' || m.kind === 'fog' || rainy || m.kind === 'snow') {
      const n = m.kind === 'fog' ? 5 : m.kind === 'clouds' ? Math.round(3 + 4 * m.intensity) : 3;
      add(n, () => ({ type: m.kind === 'fog' ? 'bank' : 'cloud', x: random(-0.2, 1.1) * width, y: random(0.02, m.kind === 'fog' ? 0.75 : 0.35) * height, radius: random(0.25, 0.5) * Math.max(width, 600), speed: random(4, 12) }));
    }
    if ((m.kind === 'clear' || (m.kind === 'clouds' && m.intensity < 0.6)) && m.phase !== 'day' && palette().star) {
      const n = count(m.phase === 'night' ? 5500 : 16000, 180);
      add(n, () => ({ type: 'star', x: random(0, width), y: random(0, height * 0.7), radius: random(0.4, 1.3), twinkle: random(0, Math.PI * 2), rate: random(0.6, 1.8) }));
    }
    return items;
  }

  function draw(dt, time) {
    const { ctx, width, height, mood: m, particles } = state;
    const colors = palette();
    const lean = Math.max(-0.45, Math.min(0.45, m.wind / 25)); // wind slants rain and pushes snow
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      if (p.type === 'cloud' || p.type === 'bank') {
        p.x += p.speed * dt * (1 + m.wind / 10);
        if (p.x - p.radius > width) p.x = -p.radius;
        const alpha = p.type === 'bank' ? 0.16 : 0.05 + 0.07 * m.intensity;
        // A round gradient squashed into a soft ellipse, so it fades out on every side.
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.radius);
        gradient.addColorStop(0, `rgb(${p.type === 'bank' ? colors.fog : colors.cloud} / ${alpha})`);
        gradient.addColorStop(1, `rgb(${p.type === 'bank' ? colors.fog : colors.cloud} / 0)`);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(1, p.type === 'bank' ? 0.35 : 0.55);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.lineCap = 'round';
    for (const p of particles) {
      if (p.type === 'star') {
        const glow = 0.35 + 0.35 * Math.sin(p.twinkle + time * p.rate);
        ctx.fillStyle = `rgb(${colors.star} / ${(m.phase === 'night' ? 0.55 : 0.25) * glow + 0.1})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'drop') {
        const fall = p.speed * p.depth * dt;
        p.y += fall;
        p.x += fall * lean;
        if (p.y > height) { p.y = random(-40, -10); p.x = random(-0.2 * width, width * 1.1); }
        ctx.strokeStyle = colors.rain;
        ctx.lineWidth = p.depth * 1.3;
        ctx.globalAlpha = p.depth;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.length * lean, p.y - p.length);
        ctx.stroke();
      } else if (p.type === 'flake') {
        p.sway += dt * 1.2;
        p.y += p.speed * p.depth * dt;
        p.x += (Math.sin(p.sway) * 18 + m.wind * 4) * p.depth * dt;
        if (p.y > height + 5) { p.y = -5; p.x = random(0, width); }
        if (p.x > width + 5) p.x = -5;
        if (p.x < -5) p.x = width + 5;
        ctx.fillStyle = colors.snow;
        ctx.globalAlpha = p.depth;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * p.depth, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // Thunder: a faint, slow brightening every so often. Never a hard flash, never with reduced motion.
    if (m.kind === 'thunder' && dt > 0) {
      state.flashIn -= dt;
      if (state.flashIn <= 0) { state.flash = 1; state.flashIn = random(8, 20); }
      if (state.flash > 0) {
        ctx.fillStyle = `rgb(${colors.flash} / ${0.07 * state.flash})`;
        ctx.fillRect(0, 0, width, height);
        state.flash = Math.max(0, state.flash - dt * 1.4);
      }
    }
  }

  function resize() {
    if (!state) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    state.width = innerWidth;
    state.height = innerHeight;
    state.canvas.width = Math.round(state.width * ratio);
    state.canvas.height = Math.round(state.height * ratio);
    state.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    state.particles = makeParticles(state.mood, state.width, state.height);
    if (!running()) draw(0, 0);
  }

  const running = () => state && !reducedMotion.matches && !document.hidden;

  function loop(timestamp) {
    if (!state) return;
    state.frame = 0;
    if (!running()) return;
    const dt = state.last ? Math.min(0.05, (timestamp - state.last) / 1000) : 0;
    state.last = timestamp;
    draw(dt, timestamp / 1000);
    state.frame = requestAnimationFrame(loop);
  }

  function play() {
    if (!state || state.frame) return;
    state.last = 0;
    if (running()) state.frame = requestAnimationFrame(loop);
    else draw(0, 0); // reduced motion: one still frame
  }

  function onVisibility() {
    if (running()) play();
  }

  function stop() {
    if (!state) return;
    cancelAnimationFrame(state.frame);
    state.canvas.remove();
    removeEventListener('resize', state.onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    reducedMotion.removeEventListener('change', state.onMotion);
    document.removeEventListener('site:themechange', state.onTheme);
    state = null;
    for (const name of ['weatherKind', 'weatherPhase', 'weatherSeason']) delete html.dataset[name];
  }

  // Starts the effects for this data (or a ?weather= preview). Returns the mood, or null.
  function mount(data, { preview = previewFrom(location.search), effects = true } = {}) {
    stop();
    const m = mood(data, new Date(), preview);
    current = { data, mood: m };
    if (!m) return null;
    html.dataset.weatherKind = m.kind;
    html.dataset.weatherPhase = m.phase;
    if (m.season) html.dataset.weatherSeason = m.season;
    if (!effects || !document.createElement('canvas').getContext) return m;
    const canvas = document.createElement('canvas');
    canvas.className = 'weather-layer';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    let pending = 0;
    state = {
      mood: m, canvas, ctx: canvas.getContext('2d'), particles: [], frame: 0, last: 0, flash: 0, flashIn: random(3, 8),
      onResize: () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(resize); },
      onMotion: () => { cancelAnimationFrame(state.frame); state.frame = 0; play(); },
      onTheme: () => resize()
    };
    resize();
    addEventListener('resize', state.onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener('change', state.onMotion);
    document.addEventListener('site:themechange', state.onTheme);
    play();
    return m;
  }

  return Object.freeze({ ...shared, mount, stop, get current() { return current; } });
});
