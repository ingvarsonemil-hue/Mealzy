'use strict';

/**
 * Price Coverage v1 — the single, version-controlled canonical ingredient
 * price dataset. This is the ONE place Mealzy's ingredient prices are
 * defined; the live `ingredient_prices` table is a materialized copy of
 * this file (see scripts/applyIngredientPrices.js), not a second source of
 * truth. Before this dataset existed, the live table was the only copy of
 * this data anywhere, with no seed script, no provenance, and no way to
 * rebuild it — that's the gap this file closes.
 *
 * METHODOLOGY (applies to every row added by Price Coverage v1, i.e. every
 * row whose `source` field references this constant): estimated from
 * general knowledge of typical US supermarket retail pricing (recent-year
 * averages), cross-checked for per-kg/L/item magnitude plausibility against
 * real-world ranges (see tests/ingredientPriceData.test.js for the
 * plausibility guards this is checked against). This is NOT sourced from a
 * live retailer feed, a receipt dataset, or any specific priced reference —
 * say so plainly rather than implying more rigor than exists. Spice prices
 * are bulk/amortized-per-recipe-use estimates (a $3 spice jar lasts many
 * meals), not single-jar retail price, since that's what a per-recipe cost
 * estimate actually needs.
 *
 * GEOGRAPHY: US supermarket average, assumed and unverified (matches
 * Budget Engine v1's USD-only scope — this dataset makes no claim for any
 * other region/currency).
 *
 * The 15 pre-existing rows (PRICE_COVERAGE_V1_DATE = null in their
 * `source`) predate this file and have NO real documented origin — that
 * absence is itself the honest record; do not backfill a fake source for
 * them. They were re-verified for plausibility (not accuracy) during the
 * Price Coverage v1 audit and kept unchanged, with one exception: `bread`
 * was repriced from an ambiguous $0.15/"unit" (unclear if that meant one
 * loaf or one slice — implausible either way at real-world magnitudes) to
 * a per-gram price, which also happens to match the unit real Mealzy
 * generations actually use for bread (see PRICE_COVERAGE_V1 methodology
 * note on the `bread` row below).
 */

const PRICE_COVERAGE_V1_DATE = '2026-08-22';
const PRICE_COVERAGE_V1_METHOD = 'estimated from general knowledge of typical US supermarket retail pricing, cross-checked for magnitude plausibility; not sourced from a live feed or specific dataset';

// name, category, unit, price_per_unit, source, checked_at, notes
const PRICES = [
  // ── Pre-existing (Budget Engine v1 baseline) — origin undocumented before
  // this file; re-verified for plausibility only, not accuracy, during the
  // Price Coverage v1 audit (2026-08-22). Values unchanged except `bread`.
  { name: 'chicken breast', category: 'meat',    unit: 'g',     price_per_unit: 0.011,   source: 'pre-existing, origin undocumented', checked_at: '2026-08-04', notes: 'kept unchanged; magnitude re-verified plausible (~$11/kg)' },
  { name: 'ground beef',    category: 'meat',    unit: 'g',     price_per_unit: 0.013,   source: 'pre-existing, origin undocumented', checked_at: '2026-08-04', notes: 'kept unchanged; magnitude re-verified plausible (~$13/kg)' },
  { name: 'eggs',           category: 'dairy',   unit: 'unit',  price_per_unit: 0.25,    source: 'pre-existing, origin undocumented', checked_at: '2026-08-04', notes: 'kept unchanged; ~$3/dozen, plausible' },
  { name: 'white rice',     category: 'pantry',  unit: 'g',     price_per_unit: 0.002,   source: 'pre-existing, origin undocumented', checked_at: '2026-08-04', notes: 'kept unchanged; ~$2/kg, plausible bulk price' },
  { name: 'oats',           category: 'pantry',  unit: 'g',     price_per_unit: 0.003,   source: 'pre-existing, origin undocumented', checked_at: '2026-08-04', notes: 'kept unchanged; ~$3/kg, plausible' },
  { name: 'olive oil',      category: 'pantry',  unit: 'ml',    price_per_unit: 0.015,   source: 'pre-existing, origin undocumented', checked_at: '2026-08-04', notes: 'kept unchanged; ~$15/L, plausible mid-tier' },
  { name: 'milk',           category: 'dairy',   unit: 'ml',    price_per_unit: 0.0012,  source: 'pre-existing, origin undocumented', checked_at: '2026-08-04', notes: 'kept unchanged; ~$1.20/L, plausible' },
  { name: 'bread',          category: 'pantry',  unit: 'g',     price_per_unit: 0.0062,  source: 'pre-existing, REPRICED by Price Coverage v1', checked_at: PRICE_COVERAGE_V1_DATE, notes: 'was $0.15/"unit" (ambiguous: 1 loaf or 1 slice? implausible either way). Repriced to $/g (~$3.50 per 567g/20oz loaf), which ALSO matches the unit real Mealzy generations consistently use for bread (see Price Coverage v1 audit finding: 100% of observed bread-family occurrences used grams, never count)' },
  { name: 'banana',         category: 'produce', unit: 'unit',  price_per_unit: 0.25,    source: 'pre-existing, origin undocumented', checked_at: '2026-08-04', notes: 'kept unchanged; ~$0.25/each, plausible. NOT repriced to g: unlike bread, most observed banana occurrences already use count successfully' },
  { name: 'spinach',        category: 'produce', unit: 'g',     price_per_unit: 0.012,   source: 'pre-existing, origin undocumented', checked_at: '2026-08-04', notes: 'kept unchanged; ~$12/kg, plausible for bagged spinach' },
  { name: 'broccoli',       category: 'produce', unit: 'head',  price_per_unit: 2.5,     source: 'pre-existing, origin undocumented', checked_at: '2026-08-18', notes: 'kept unchanged; ~$2.50/head, plausible' },
  { name: 'bell peppers',   category: 'produce', unit: 'each',  price_per_unit: 1.2,     source: 'pre-existing, origin undocumented', checked_at: '2026-08-18', notes: 'kept unchanged; ~$1.20/each, plausible' },
  { name: 'salmon fillets', category: 'protein', unit: 'g',     price_per_unit: 0.0198,  source: 'pre-existing, origin undocumented', checked_at: '2026-08-18', notes: 'kept unchanged; fixed from a catastrophic $/lb-as-$/g bug prior to Budget Engine v1; ~$19.80/kg, plausible' },
  { name: 'greek yogurt',   category: 'dairy',   unit: 'g',     price_per_unit: 0.00675, source: 'pre-existing, origin undocumented', checked_at: '2026-08-18', notes: 'kept unchanged; fixed from a catastrophic $/800g-tub-as-$/g bug prior to Budget Engine v1; ~$6.75/kg, plausible' },
  { name: 'almond milk',    category: 'dairy',   unit: 'ml',    price_per_unit: 0.0028,  source: 'pre-existing, origin undocumented', checked_at: '2026-08-18', notes: 'kept unchanged; fixed from a catastrophic $/1L-as-$/mL bug prior to Budget Engine v1; ~$2.80/L, plausible mid-premium' },

  // ── New rows — Price Coverage v1, selected from the real 373-occurrence
  // audit sample's top unmatched-by-frequency ingredients (see the audit
  // report). Every row below corresponds to an observed Mealzy generation,
  // not a guessed addition.
  { name: 'vegetable oil',      category: 'pantry',  unit: 'ml', price_per_unit: 0.0035, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$3.50/L, e.g. a 48oz bottle ~$4-6' },
  { name: 'onion',               category: 'produce', unit: 'g', price_per_unit: 0.0025, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$1-1.5/lb yellow onions' },
  { name: 'tomato',               category: 'produce', unit: 'g', price_per_unit: 0.005,  source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$2-3/lb fresh tomatoes' },
  { name: 'canned chickpeas',     category: 'pantry',  unit: 'g', price_per_unit: 0.0028, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$1.20 per 15oz/425g can' },
  { name: 'corn tortillas',       category: 'pantry',  unit: 'count', price_per_unit: 0.10, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$3 per 30-pack' },
  { name: 'plain yogurt',         category: 'dairy',   unit: 'g', price_per_unit: 0.0039, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$3.50 per 32oz/907g tub, cheaper than greek yogurt' },
  { name: 'salt and pepper',      category: 'pantry',  unit: 'g', price_per_unit: 0.01,   source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: 'nominal seasoning-pinch estimate; observed quantities (2-5g) keep this trivially cheap per meal, matching real-world cost' },
  { name: 'butter',               category: 'dairy',   unit: 'g', price_per_unit: 0.0088, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$4/lb (454g)' },
  { name: 'carrots',              category: 'produce', unit: 'g', price_per_unit: 0.0022, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$1/lb; also covers singular "carrot" via substring match' },
  { name: 'potato',               category: 'produce', unit: 'g', price_per_unit: 0.0018, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$0.80/lb; also covers "potatoes" via substring match. Deliberately NOT aliased with sweet potato - different product/price' },
  { name: 'almonds',              category: 'pantry',  unit: 'g', price_per_unit: 0.0154, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$7/lb raw almonds' },
  { name: 'cumin',                category: 'pantry',  unit: 'g', price_per_unit: 0.02,   source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: 'bulk/amortized ground-spice estimate; also covers "cumin seeds" via substring match' },
  { name: 'harissa paste',        category: 'pantry',  unit: 'g', price_per_unit: 0.028,  source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$5-6 per 200g jar, specialty item' },
  { name: 'apple',                category: 'produce', unit: 'g', price_per_unit: 0.0033, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$1.50/lb' },
  { name: 'soy sauce',            category: 'pantry',  unit: 'ml', price_per_unit: 0.01,   source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$3 per 10oz/296ml bottle' },
  { name: 'canned tomatoes',      category: 'pantry',  unit: 'g', price_per_unit: 0.0029, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$1.20 per 14.5oz/411g can; kept separate from fresh "tomato" - different product/price' },
  { name: 'sweet potato',         category: 'produce', unit: 'g', price_per_unit: 0.0026, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$1.20/lb. Deliberately a SEPARATE row from potato - different product/price, never aliased' },
  { name: 'lemon',                category: 'produce', unit: 'g', price_per_unit: 0.006,  source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$0.60/each at ~100g each' },
  { name: 'garlic',                category: 'produce', unit: 'g', price_per_unit: 0.011,  source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$5/lb; also covers "garlic, minced" via substring match' },
  { name: 'peanut butter',        category: 'pantry',  unit: 'g', price_per_unit: 0.0088, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$4 per 16oz/454g jar' },
  { name: 'vegetable broth',      category: 'pantry',  unit: 'ml', price_per_unit: 0.0026, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$2.50 per 32oz/946ml carton' },
  { name: 'lemon juice',          category: 'pantry',  unit: 'ml', price_per_unit: 0.0068, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$3 per 15oz/444ml bottle; kept separate from whole "lemon" - different unit/product' },
  { name: 'black beans canned',   category: 'pantry',  unit: 'g', price_per_unit: 0.0028, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$1.20 per 15oz/425g can' },
  { name: 'lime juice',           category: 'pantry',  unit: 'ml', price_per_unit: 0.0068, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: 'similar bottled-citrus-juice economics to lemon juice' },
  { name: 'red lentils',          category: 'pantry',  unit: 'g', price_per_unit: 0.0055, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$2.50/lb dry' },
  { name: 'cod fillet',           category: 'protein', unit: 'g', price_per_unit: 0.0198, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$9/lb whitefish; kept as its own row, not aliased to salmon' },
  { name: 'chicken thighs',       category: 'meat',    unit: 'g', price_per_unit: 0.0055, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$2.50/lb - deliberately CHEAPER than and never aliased to chicken breast ($0.011/g); different cut, different price' },
  { name: 'brown rice',           category: 'pantry',  unit: 'g', price_per_unit: 0.0026, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$1.20/lb - deliberately a separate row from white rice ($0.002/g), never aliased; different product/price' },
  { name: 'cilantro',              category: 'produce', unit: 'g', price_per_unit: 0.027,  source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$0.80 per ~30g bunch' },
  { name: 'lime',                  category: 'produce', unit: 'g', price_per_unit: 0.006,  source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$0.50/each at ~80g each; priced per gram like lemon for consistency' },
  { name: 'halloumi cheese',      category: 'dairy',   unit: 'g', price_per_unit: 0.032,  source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$8 per 8.8oz/250g, specialty cheese' },
  { name: 'honey',                 category: 'pantry',  unit: 'g', price_per_unit: 0.011,  source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$5 per 16oz/454g' },
  { name: 'paprika',               category: 'pantry',  unit: 'g', price_per_unit: 0.02,   source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: 'bulk/amortized ground-spice estimate, same basis as cumin' },
  { name: 'cinnamon',               category: 'pantry',  unit: 'g', price_per_unit: 0.02,   source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: 'bulk/amortized ground-spice estimate, same basis as cumin' },
  { name: 'couscous',              category: 'pantry',  unit: 'g', price_per_unit: 0.0055, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$2.50/lb' },
];

// Small, curated, exact-name synonym list ONLY — every entry here must name
// two economically-equivalent products, never a different cut/variety/
// product. Resolved as an exact-name lookup before the substring fallback
// in pricing.js, so an alias always takes priority over an ambiguous guess.
// Forbidden by design (see Price Coverage v1 report): chicken thighs->
// chicken breast, brown rice->white rice, plain yogurt->greek yogurt,
// cod->salmon, sweet potato->potato - all economically distinct products
// that must stay separate rows or fall back to UNKNOWN, never be aliased.
const ALIASES = [
  { alias: 'beef mince', canonical: 'ground beef', notes: 'British/Commonwealth term for the same product' },
  { alias: 'capsicum',   canonical: 'bell peppers', notes: 'British/Commonwealth term for the same product' },
];

module.exports = { PRICES, ALIASES, PRICE_COVERAGE_V1_DATE, PRICE_COVERAGE_V1_METHOD };
