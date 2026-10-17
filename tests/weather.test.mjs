// Stockholm weather: parsing Open-Meteo, freshness, day/night, seasons and the homepage text.
import test from 'node:test';
import assert from 'node:assert/strict';
import weather from '../assets/weather.js';
import i18nApi from '../assets/i18n.js';
import { uiEntries } from '../i18n/index.mjs';

const { fromOpenMeteo, isFresh, phase, season, mood, describe, condition, CODES } = weather;

// What Open-Meteo returns with timezone=GMT (sunrise and sunset in UTC, no offset).
function sample({ code = 61, temperature = 4.66, wind = 3.04, sunrise = ['2026-10-17T05:30', '2026-10-18T05:32'], sunset = ['2026-10-17T15:35', '2026-10-18T15:32'] } = {}) {
  return { current: { temperature_2m: temperature, weather_code: code, wind_speed_10m: wind }, daily: { sunrise, sunset } };
}
const NOW = new Date('2026-10-18T10:00:00Z');
const data = (options, now = NOW) => fromOpenMeteo(sample(options), now);

test('Open-Meteo answers become a small, validated weather.json', () => {
  const result = data();
  assert.deepEqual(result, {
    schemaVersion: 1,
    fetchedAt: NOW.toISOString(),
    place: 'Stockholm',
    temperature: 4.7,
    code: 61,
    wind: 3,
    sun: [{ rise: '2026-10-17T05:30:00Z', set: '2026-10-17T15:35:00Z' }, { rise: '2026-10-18T05:32:00Z', set: '2026-10-18T15:32:00Z' }]
  });
  assert.throws(() => fromOpenMeteo({}), /No current weather/);
  assert.throws(() => fromOpenMeteo({ current: { temperature_2m: 'warm', weather_code: 1 }, daily: sample().daily }), /No current weather/);
  assert.throws(() => fromOpenMeteo(sample({ sunrise: ['<script>'], sunset: ['x'] })), /No sunrise/);
});

test('every weather code has a kind, an intensity and a translated label', () => {
  const dictionaries = Object.fromEntries(['sv', 'nb'].map(code => [code, Object.fromEntries(uiEntries(code))]));
  for (const code of Object.keys(CODES)) {
    const { kind, intensity, label } = condition(Number(code));
    assert.ok(weather.KINDS.includes(kind), `${code}: ${kind}`);
    assert.ok(intensity >= 0 && intensity <= 1, `${code}: ${intensity}`);
    for (const dictionary of Object.values(dictionaries)) assert.ok(dictionary[label], `${code}: “${label}” is not translated`);
  }
  // Unknown codes fall back to overcast rather than failing.
  assert.equal(condition(1234).kind, 'clouds');
});

test('old or broken data is ignored', () => {
  assert.ok(isFresh(data(), NOW));
  assert.ok(isFresh(data(), new Date(NOW.getTime() + 5 * 3600e3)));
  assert.ok(!isFresh(data(), new Date(NOW.getTime() + 7 * 3600e3)));
  assert.ok(!isFresh({ ...data(), temperature: null }, NOW));
  assert.ok(!isFresh(null, NOW));
  assert.equal(mood(data(), new Date(NOW.getTime() + 24 * 3600e3)), null);
});

test('day, twilight and night follow sunrise and sunset in Stockholm', () => {
  const at = iso => phase(data(), new Date(iso));
  assert.equal(at('2026-10-18T10:00:00Z'), 'day');
  assert.equal(at('2026-10-18T05:45:00Z'), 'twilight');
  assert.equal(at('2026-10-18T15:50:00Z'), 'twilight');
  assert.equal(at('2026-10-18T21:00:00Z'), 'night');
  assert.equal(at('2026-10-18T02:00:00Z'), 'night');
});

test('the dark winter weeks and white midsummer nights are seasons of their own', () => {
  const december = data({ sunrise: ['2026-12-21T07:43'], sunset: ['2026-12-21T13:48'] }, new Date('2026-12-21T10:00:00Z'));
  const midsummer = data({ code: 0, sunrise: ['2026-06-21T01:31', '2026-06-22T01:31'], sunset: ['2026-06-21T20:08', '2026-06-22T20:08'] }, new Date('2026-06-21T22:00:00Z'));
  assert.equal(season(december, new Date('2026-12-21T10:00:00Z')), 'dark');
  assert.equal(season(data(), NOW), '');
  assert.equal(season(midsummer, new Date('2026-06-21T22:00:00Z')), 'bright');
  // A midsummer night never gets fully dark.
  assert.equal(mood(midsummer, new Date('2026-06-21T23:00:00Z')).phase, 'twilight');
});

test('mood combines the weather and the time of day, and previews replace the weather', () => {
  assert.deepEqual(mood(data(), NOW), { kind: 'rain', intensity: 0.45, phase: 'day', season: '', wind: 3 });
  assert.equal(mood(data({ code: 75 }), NOW).kind, 'snow');
  assert.deepEqual(mood(data(), NOW, { kind: 'snow', phase: 'night' }), { kind: 'snow', intensity: 0.75, phase: 'night', season: '', wind: 3 });
  assert.equal(mood(data(), NOW, { kind: 'rain' }).intensity, 0.6);
  assert.equal(mood(data(), NOW, { kind: 'lava' }).kind, 'rain');
  // A preview works without any data, for trying the effects locally.
  assert.equal(mood(null, NOW, { kind: 'thunder' }).kind, 'thunder');
  assert.equal(mood(null, NOW, {}), null);
});

test('the homepage text is short, localized and notes the extreme seasons', () => {
  const t = (code) => i18nApi.create(code, Object.fromEntries(uiEntries(code))).t;
  assert.equal(describe(data(), NOW), '5°C, light rain');
  assert.equal(describe(data({ temperature: -0.4, code: 0 }), NOW), '0°C, clear sky');
  assert.equal(describe(data(), NOW, { t: t('sv'), locale: 'sv-SE' }), '5 °C, lätt regn');
  assert.equal(describe(data({ code: 73 }), NOW, { t: t('nb'), locale: 'nb-NO' }), '5 °C, snø');
  const december = data({ code: 3, sunrise: ['2026-12-21T07:43'], sunset: ['2026-12-21T13:48'] }, new Date('2026-12-21T10:00:00Z'));
  assert.equal(describe(december, new Date('2026-12-21T10:00:00Z')), '5°C, overcast · sunset at 14:48');
  const midsummer = data({ code: 0, sunrise: ['2026-06-21T01:31'], sunset: ['2026-06-21T20:08'] }, new Date('2026-06-21T21:00:00Z'));
  assert.equal(describe(midsummer, new Date('2026-06-21T21:00:00Z')), '5°C, clear sky · the sun barely sets');
  assert.equal(describe(data(), new Date(NOW.getTime() + 24 * 3600e3)), '');
});
