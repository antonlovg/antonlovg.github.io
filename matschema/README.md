# Matschema (`/matschema/`)

A meal plan in Swedish, from week 45 (2 November 2026) to the end of week 53 (3 January 2027), fitted every day to daily goals for energy, protein, carbs and fat, with caps for sugar and saturated fat (default 2228 kcal, 167 g protein, 201 g carbs, 84 g fat, at most 56 g sugar and 25 g saturated fat; editable under Anpassa). Unlisted: nothing links to it, the page is `noindex` and `robots.txt` disallows `/matschema/`.

- **Dag** (`#dag/2026-11-02`): the day's five meals. Tap one for its ingredients and method; check it off when eaten, and the bars show kcal and protein so far. Today's next meal is marked *Nu*. Swipe or use the arrow keys to change day.
- **Vecka** (`#vecka/46`): the week as a table (cards on a phone), the lunchbox flow and the week's range.
- **Handla** (`#handla/46`): the week's shopping list, built from the recipes, grouped by store section. Check items off, hide them, or share or copy what's left.
- **Anpassa** (`#anpassa`): foods you don't eat. Each is swapped in the recipes for something similar (`SWAPS` in `js/foods.js`: chicken → turkey, mushrooms → courgette; dish names follow, `WORDS`), small amounts are left out, and a meal that can't do without it is replaced by the one closest in kcal from the same slot (`POOLS` in `js/plan.js`), avoiding dishes from the last few days. Also: undo manual swaps, delete everything.
- **Vegan** (a checkbox under Anpassa): adds everything in `ANIMAL` (`js/foods.js`: meat, fish, eggs, dairy, honey, egg noodles, lussekatter, pesto, whey) to the foods you don't eat. Dairy has vegan swaps last in its `SWAPS` lists (milk → soy drink, kvarg → soy yoghurt, cheese → vegan cheese, crème fraiche → oat fraiche), so oats, porridge and snacks stay; meals with meat, fish or eggs are replaced from the vegan recipes in `POOLS` (tofu, tempeh, soy mince, beans, lentils), a storkok preferably by a vegan storkok. The shake uses vegan protein powder. Changes that only come from being vegan are tagged *Vegansk* and are not counted as your swaps.
- **Goals** (`GOALS` and `fitDay` in `js/plan.js`): every food has kcal, protein, carbs, sugar, fat and saturated fat (`MACROS` in `js/foods.js`). Each day, every meal except Huel gets a portion size (70–140 % of the recipe, in 5 % steps), plus a protein shake (Star Nutrition Whey Banana, 0–80 g in 5 g steps) and extra olive oil at dinner (0–6 tsk), chosen by a bounded least-squares fit to the goals (energy and protein weigh most; going over a cap costs more, aiming at 95 % of it). It runs coordinate descent, rounds to the steps and polishes one step at a time. The recipes as written (`fit: false`) are 2000–2200 kcal days; the tests check both. The day page shows eaten vs planned vs goal for all six, and says when the plan misses a goal by more than 5 % or goes over a cap.
- **Storkok**: recipes with `storkok: 4` are cooked once for up to four portions. A lunchbox (`<`) takes from a storkok cooked in the last three days that has portions left (the oldest first), otherwise from yesterday's dinner (a double batch). Each dinner is cooked, and shopped for, as many portions as are eaten of it; the day page shows the whole batch's amounts. A storkok on Sunday is shopped for in Sunday's week.
- **Färgtema** (under Anpassa): Skog, Hav, Bär or Grafit, light, dark or following the device. `js/theme.js` is a plain script in `<head>` that sets `data-palette` and `data-mode` on `<html>` before the page is drawn, so it never flashes the wrong colours.
- **Byt måltid**, under each meal on the day page: pick any meal for that slot, closest in kcal first. A swapped dinner's leftovers follow it to the next day's lunch; swapping a lunchbox away makes the dinner before a single batch.
- **Offline**: `sw.js` keeps a copy of the page (cache `matschema-v4`, scope `/matschema/`, both listed on /cookies/). With a connection it fetches fresh files but gives up after 3 s, so the page opens quickly in a store with bad coverage.

## Files

| Path | |
| --- | --- |
| `js/foods.js` | Foods: kcal and protein per 100 g, store section, and how they're bought (pieces, packs, dl) |
| `js/recipes.js` | Recipes for one portion: `[food, grams, text]` per ingredient. kcal and protein are calculated from the grams |
| `js/plan.js` | The weeks (five recipe ids a day; `<` = yesterday's dinner as lunch, so that dinner is cooked as a double batch), holidays, and `makePlan(choices)`: the plan with your exclusions and swaps, day totals and shopping lists |
| `js/store.js` | What you check off and choose (foods you don't eat, swapped meals), in local storage (`lovgren-matschema`, listed on /cookies/), written only when you change something |
| `js/theme.js` | The colour theme, applied before the page is drawn |
| `sw.js` | The offline copy. Add new files to `PRECACHE` (a test checks) and bump `CACHE` to clear old copies |
| `js/app.js` | The views |

## Adding weeks

Add a week to `WEEKS` in `js/plan.js` (and any new recipes or foods), then run `node --test tests/matschema.test.mjs`. It checks that every day lands on 2000–2200 kcal and at least 90 g protein, has exactly one Huel, and that leftovers follow a double-batch dinner. If a day misses, swap its snack or evening meal: they range from 130 to 290 kcal.
