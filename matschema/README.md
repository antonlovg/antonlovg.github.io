# Matschema (`/matschema/`)

A meal plan in Swedish: about 2100 kcal and at least 90 g of protein a day, from week 45 (2 November 2026) to the end of week 53 (3 January 2027). Unlisted: nothing links to it, the page is `noindex` and `robots.txt` disallows `/matschema/`.

- **Dag** (`#dag/2026-11-02`): the day's five meals. Tap one for its ingredients and method; check it off when eaten, and the bars show kcal and protein so far. Today's next meal is marked *Nu*. Swipe or use the arrow keys to change day.
- **Vecka** (`#vecka/46`): the week as a table (cards on a phone), the lunchbox flow and the week's range.
- **Handla** (`#handla/46`): the week's shopping list, built from the recipes, grouped by store section. Check items off, hide them, or share or copy what's left.
- **Anpassa** (`#anpassa`): foods you don't eat. Each is swapped in the recipes for something similar (`SWAPS` in `js/foods.js`: chicken → turkey, mushrooms → courgette; dish names follow, `WORDS`), small amounts are left out, and a meal that can't do without it is replaced by the one closest in kcal from the same slot (`POOLS` in `js/plan.js`), avoiding dishes from the last few days. Also: undo manual swaps, delete everything.
- **Byt måltid**, under each meal on the day page: pick any meal for that slot, closest in kcal first. A swapped dinner's leftovers follow it to the next day's lunch; swapping a lunchbox away makes the dinner before a single batch.
- **Offline**: `sw.js` keeps a copy of the page (cache `matschema-v1`, scope `/matschema/`, both listed on /cookies/). With a connection it fetches fresh files but gives up after 3 s, so the page opens quickly in a store with bad coverage.

## Files

| Path | |
| --- | --- |
| `js/foods.js` | Foods: kcal and protein per 100 g, store section, and how they're bought (pieces, packs, dl) |
| `js/recipes.js` | Recipes for one portion: `[food, grams, text]` per ingredient. kcal and protein are calculated from the grams |
| `js/plan.js` | The weeks (five recipe ids a day; `<` = yesterday's dinner as lunch, so that dinner is cooked as a double batch), holidays, and `makePlan(choices)`: the plan with your exclusions and swaps, day totals and shopping lists |
| `js/store.js` | What you check off and choose (foods you don't eat, swapped meals), in local storage (`lovgren-matschema`, listed on /cookies/), written only when you change something |
| `sw.js` | The offline copy. Add new files to `PRECACHE` (a test checks) and bump `CACHE` to clear old copies |
| `js/app.js` | The views |

## Adding weeks

Add a week to `WEEKS` in `js/plan.js` (and any new recipes or foods), then run `node --test tests/matschema.test.mjs`. It checks that every day lands on 2000–2200 kcal and at least 90 g protein, has exactly one Huel, and that leftovers follow a double-batch dinner. If a day misses, swap its snack or evening meal: they range from 130 to 290 kcal.
