// Fetches Livsmedelsverket's food composition database (Livsmedelsdatabasen, CC BY 4.0) and writes the
// values the meal plan uses into matschema/data/livsmedel.json. The file is committed and served with the
// site, so searching for what you ate works offline and never contacts Livsmedelsverket from the browser.
// The database changes a few times a year; run this by hand to update it.
// Usage: node scripts/fetch-livsmedel.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'matschema', 'data', 'livsmedel.json');
const API = 'https://dataportal.livsmedelsverket.se/livsmedel/api/v1';
const PAGE = 500;
const PARALLEL = 4;
// euroFIR codes (and unit, since energy comes in both kJ and kcal under ENERC) for each value we keep.
const WANTED = [['kcal', 'ENERC', 'kcal'], ['protein', 'PROT'], ['carbs', 'CHO'], ['sugar', 'SUGAR'], ['fat', 'FAT'], ['satfat', 'FASAT']];

async function get(url, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'lovgren.dev build' }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt >= tries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function list() {
  const foods = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await get(`${API}/livsmedel?offset=${offset}&limit=${PAGE}&sprak=1`);
    foods.push(...page.livsmedel.map(({ nummer, namn }) => ({ nummer, namn })));
    if (foods.length >= page._meta.totalRecords || !page.livsmedel.length) return foods;
  }
}

function values(rows) {
  return WANTED.map(([, code, unit]) => {
    const row = rows.find(r => r.euroFIRkod === code && (!unit || r.enhet === unit));
    return row ? Math.round(Number(row.varde) * 10) / 10 : 0;
  });
}

const foods = await list();
const rows = [];
let next = 0;
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  while (next < foods.length) {
    const { nummer, namn } = foods[next++];
    rows.push([nummer, namn, ...values(await get(`${API}/livsmedel/${nummer}/naringsvarden?sprak=1`))]);
  }
}));
rows.sort((a, b) => a[0] - b[0]);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({
  source: 'Livsmedelsverkets livsmedelsdatabas, CC BY 4.0',
  fetched: new Date().toISOString().slice(0, 10),
  fields: ['nummer', 'namn', ...WANTED.map(([key]) => key)],
  foods: rows
}).replace(/\],\[/g, '],\n['));
console.log(`Wrote ${rows.length} foods to ${path.relative(root, out)}`);
