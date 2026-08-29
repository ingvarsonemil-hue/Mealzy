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

// Price Coverage v2 — same methodology and geography assumption as v1
// (see PRICE_COVERAGE_V1_METHOD/file header). The manual 5-list /
// 107-observation supermarket audit (tests/fixtures/
// manualSupermarketObservations.js) was used ONLY to rank which unknowns to
// prioritize and to sanity-check these estimates land in the right ballpark
// - never as the source value itself. One shopper's receipt on one occasion
// in one region is evidence a gap exists, not a universal price.
const PRICE_COVERAGE_V2_DATE = '2026-08-25';
const PRICE_COVERAGE_V2_METHOD = 'estimated from general knowledge of typical US supermarket retail pricing, cross-checked for magnitude plausibility and against the manual 107-observation audit for ballpark sanity only; not sourced from a live feed or copied from the single-shopper observation';

// Price Calibration Audit (spinach / greek yogurt / olive oil) — triggered by
// repeated real-world evidence (5+ historical observations plus one
// quantity-matched controlled sample) that these three EXISTING dataset-
// priced rows read as systematically high. Phase A traced the calculation
// path exactly (150g spinach -> $1.80, 200g greek yogurt -> $1.35, 45ml
// olive oil -> $0.68, all reproduced from price_per_unit * amountValue with
// no unit/matcher/aggregation bug involved — see the audit report) and
// classified all three as pure price-row calibration questions, not
// structural bugs. Phase B checked each against real named-retailer US
// prices (web search, 2026-08-26), not just the single shopper's numbers:
//   - spinach: MIXED evidence. A common purchase format for US shoppers, a
//     5oz/142g bagged baby-spinach clamshell, runs ~$0.019/g at Walmart —
//     ABOVE this row's $0.012/g, not below it. Loose bulk spinach runs much
//     lower (~$0.002-0.005/g per typical retail range). With the two most
//     common real purchase formats bracketing this row on both sides,
//     external evidence does not support recalibrating it — left unchanged.
//   - olive oil: NOT supported by external evidence either. A 2L Kirkland
//     (Costco) extra-virgin olive oil runs ~$0.014/ml and mainstream 500-750ml
//     bottles (Bertolli/Pompeian EVOO) run ~$0.016-0.02/ml at Walmart — both
//     at or above this row's $0.015/ml. Left unchanged.
//   - greek yogurt: the first pass proposed $0.0045/g off a SINGLE external
//     anchor (Great Value store brand, $2.94/907g = $0.0032/g) — correctly
//     flagged in a follow-up gate as insufficient for a production average.
//     A second pass added 3 more named-retailer observations spanning the
//     store-brand/branded split: Chobani plain nonfat 32oz $5.97/907g =
//     $0.00658/g (Walmart); FAGE Total whole-milk plain 32oz $6.96/907g =
//     $0.00767/g (Walmart); FAGE Total 2% plain 32oz $7.99/907g = $0.00881/g
//     (Pavilions). Across all 4 observations: min $0.0032/g, max $0.0088/g,
//     mean $0.0066/g, median $0.0071/g — both close to (mean slightly below,
//     median slightly above) the ORIGINAL $0.00675/g rate, not the initially
//     proposed $0.0045/g, which undershoots 3 of the 4 real observations.
//     Recalibrated to $0.0065/g: within a cent of both the computed mean and
//     the original rate, reflecting that the fuller evidence set argues for
//     a much smaller correction than the first pass's single-anchor estimate
//     - not tuned to minimize the historical manual-observation dataset's
//     error, which stays only a sanity check (see
//     tests/fixtures/manualSupermarketObservations.js).
const PRICE_CALIBRATION_AUDIT_DATE = '2026-08-26';
const PRICE_CALIBRATION_AUDIT_METHOD = 'recalibrated only where BOTH the calculation-path trace proved the row itself (not a matcher/unit/aggregation bug) causes the observed gap AND a MULTI-OBSERVATION set of independent named-retailer US retail evidence (never a single shopper sample, never a single external anchor) supported the row being materially off; final rate set from the mean/median of at least 4 named-retailer observations spanning store-brand and branded tiers, never set to match the observed sample directly';

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
  { name: 'olive oil',      category: 'pantry',  unit: 'ml',    price_per_unit: 0.015,   source: 'pre-existing, origin undocumented', checked_at: PRICE_CALIBRATION_AUDIT_DATE, notes: 'kept unchanged; ~$15/L, plausible mid-tier. Re-audited 2026-08-26 (Price Calibration Audit): real Kirkland 2L EVOO (~$0.014/ml) and mainstream Bertolli/Pompeian EVOO (~$0.016-0.02/ml) bracket this rate at or above it - external evidence does not support the "overpriced" hypothesis, left unchanged' },
  { name: 'milk',           category: 'dairy',   unit: 'ml',    price_per_unit: 0.0012,  source: 'pre-existing, origin undocumented', checked_at: '2026-08-04', notes: 'kept unchanged; ~$1.20/L, plausible' },
  { name: 'bread',          category: 'pantry',  unit: 'g',     price_per_unit: 0.0062,  source: 'pre-existing, REPRICED by Price Coverage v1', checked_at: PRICE_COVERAGE_V1_DATE, notes: 'was $0.15/"unit" (ambiguous: 1 loaf or 1 slice? implausible either way). Repriced to $/g (~$3.50 per 567g/20oz loaf), which ALSO matches the unit real Mealzy generations consistently use for bread (see Price Coverage v1 audit finding: 100% of observed bread-family occurrences used grams, never count)' },
  { name: 'banana',         category: 'produce', unit: 'unit',  price_per_unit: 0.25,    source: 'pre-existing, origin undocumented', checked_at: '2026-08-04', notes: 'kept unchanged; ~$0.25/each, plausible. NOT repriced to g: unlike bread, most observed banana occurrences already use count successfully' },
  { name: 'spinach',        category: 'produce', unit: 'g',     price_per_unit: 0.012,   source: 'pre-existing, origin undocumented', checked_at: PRICE_CALIBRATION_AUDIT_DATE, notes: 'kept unchanged; ~$12/kg, plausible for bagged spinach. Re-audited 2026-08-26 (Price Calibration Audit): a real 5oz bagged baby-spinach clamshell (~$0.019/g) prices ABOVE this rate while loose bulk spinach prices well below it - mixed evidence brackets this row from both sides, does not support recalibrating' },
  { name: 'broccoli',       category: 'produce', unit: 'g',     price_per_unit: 0.00735,  source: 'DERIVED (Phase 3A broccoli count->g migration): pre-existing $2.50/head Mealzy pricing assumption / 340 g/head Mealzy compatibility assumption. No new retailer or external source verification.', checked_at: '2026-08-29', notes: 'Repriced from unit:head to unit:g because canonical broccoli baseUnit changed count -> g. $2.50/head = the OLD Mealzy pricing assumption (unchanged, origin still undocumented). 340 g/head = a NEW explicit Mealzy compatibility assumption, not a sourced weight. $/g = $2.50 / 340 g = $0.00735/g, derived purely from those two assumptions. Derived package price = round(0.00735 * 340 * 100) = 250 cents, preserving the $2.50/head economic value exactly.' },
  { name: 'bell peppers',   category: 'produce', unit: 'each',  price_per_unit: 1.2,     source: 'pre-existing, origin undocumented', checked_at: '2026-08-18', notes: 'kept unchanged; ~$1.20/each, plausible' },
  { name: 'salmon fillets', category: 'protein', unit: 'g',     price_per_unit: 0.0198,  source: 'pre-existing, origin undocumented', checked_at: '2026-08-18', notes: 'kept unchanged; fixed from a catastrophic $/lb-as-$/g bug prior to Budget Engine v1; ~$19.80/kg, plausible' },
  { name: 'greek yogurt',   category: 'dairy',   unit: 'g',     price_per_unit: 0.0065,  source: PRICE_CALIBRATION_AUDIT_METHOD, checked_at: PRICE_CALIBRATION_AUDIT_DATE, notes: 'RECALIBRATED 2026-08-26 (Price Calibration Audit, 2nd/final pass) from 0.00675 to 0.0065 - a small downward correction, NOT the first pass\'s 0.0045 (that single-anchor estimate undershot 3 of 4 real named-retailer observations once Chobani/FAGE were added). 4-observation set: Great Value $0.0032/g, Chobani $0.0066/g, FAGE whole $0.0077/g, FAGE 2% $0.0088/g -> mean $0.0066/g, median $0.0071/g. 0.0065/g sits within a cent of both; ~$6.50/kg' },
  { name: 'almond milk',    category: 'dairy',   unit: 'ml',    price_per_unit: 0.0028,  source: 'pre-existing, origin undocumented', checked_at: '2026-08-18', notes: 'kept unchanged; fixed from a catastrophic $/1L-as-$/mL bug prior to Budget Engine v1; ~$2.80/L, plausible mid-premium' },

  // ── New rows — Price Coverage v1, selected from the real 373-occurrence
  // audit sample's top unmatched-by-frequency ingredients (see the audit
  // report). Every row below corresponds to an observed Mealzy generation,
  // not a guessed addition.
  { name: 'canola oil',        category: 'pantry',  unit: 'ml', price_per_unit: 0.0035, source: PRICE_COVERAGE_V1_METHOD, checked_at: PRICE_COVERAGE_V1_DATE, notes: '~$3.50/L, e.g. a 48oz bottle ~$4-6. Phase 3C: row renamed from "vegetable oil" to match canonical `vegetable_oil` whose canonicalName is now "canola oil"; "vegetable oil" retained as an alias below' },
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

  // ── Price Coverage v2 — high-impact batch selected by ranking the real
  // 5-list / 107-observation manual audit (tests/fixtures/
  // manualSupermarketObservations.js) by financial risk (observed real price
  // vs the $0.50 fallback) and recurrence, NOT by row count. That fixture is
  // evidence for prioritization/plausibility only — every price below is
  // independently estimated using the SAME methodology as Price Coverage v1
  // (general knowledge of typical US supermarket retail pricing, magnitude
  // cross-checked; see file header), never copied from the single-shopper
  // observation. Conservative canonicalization: venison stays its own row
  // (never aliased to beef), lean chuck stays separate from ground beef,
  // shrimp stays separate from fish — different products, different prices.
  { name: 'venison',        category: 'protein', unit: 'g', price_per_unit: 0.0397, source: PRICE_COVERAGE_V2_METHOD, checked_at: PRICE_COVERAGE_V2_DATE, notes: '~$18/lb, US retail venison steak/cuts range ~$15-22/lb; substring-matches "venison steak" etc. Deliberately its own row, never aliased to beef - materially different product/price' },
  { name: 'beef chuck',     category: 'meat',    unit: 'g', price_per_unit: 0.0121, source: PRICE_COVERAGE_V2_METHOD, checked_at: PRICE_COVERAGE_V2_DATE, notes: '~$5.50/lb beef chuck roast/steak cuts; kept separate from "ground beef" ($0.013/g) - different cut/prep, not aliased despite similar magnitude. Phase 3C: row renamed from "lean chuck" to match canonical `beef_chuck`; "lean chuck" retained as an alias below' },
  { name: 'shrimp',         category: 'protein', unit: 'g', price_per_unit: 0.0198, source: PRICE_COVERAGE_V2_METHOD, checked_at: PRICE_COVERAGE_V2_DATE, notes: '~$9/lb US average frozen peeled/deveined shrimp; deliberately its own row, never aliased to any fish row - different product' },
  { name: 'hummus',         category: 'pantry',  unit: 'g', price_per_unit: 0.0124, source: PRICE_COVERAGE_V2_METHOD, checked_at: PRICE_COVERAGE_V2_DATE, notes: '~$3.50 per 10oz/283g tub' },
  { name: 'eggplant',       category: 'produce', unit: 'g', price_per_unit: 0.0033, source: PRICE_COVERAGE_V2_METHOD, checked_at: PRICE_COVERAGE_V2_DATE, notes: '~$1.50/lb' },
  { name: 'feta',           category: 'dairy',   unit: 'g', price_per_unit: 0.022,  source: PRICE_COVERAGE_V2_METHOD, checked_at: PRICE_COVERAGE_V2_DATE, notes: '~$5 per 8oz/227g block or crumbled tub' },
  { name: 'cucumber',       category: 'produce', unit: 'g', price_per_unit: 0.0027, source: PRICE_COVERAGE_V2_METHOD, checked_at: PRICE_COVERAGE_V2_DATE, notes: '~$0.80/each at ~300g typical' },
  { name: 'chicken broth',  category: 'pantry',  unit: 'ml', price_per_unit: 0.0028, source: PRICE_COVERAGE_V2_METHOD, checked_at: PRICE_COVERAGE_V2_DATE, notes: '~$2.65 per 32oz/946ml carton. Kept as its own row rather than aliased to "vegetable broth" - not confident enough in cross-type price parity to alias without evidence' },
  { name: 'beef broth',     category: 'pantry',  unit: 'ml', price_per_unit: 0.0030, source: PRICE_COVERAGE_V2_METHOD, checked_at: PRICE_COVERAGE_V2_DATE, notes: '~$2.85 per 32oz/946ml carton, same reasoning as chicken broth - own row, not aliased' },
  { name: 'rice',           category: 'pantry',  unit: 'g', price_per_unit: 0.0022, source: PRICE_COVERAGE_V2_METHOD, checked_at: PRICE_COVERAGE_V2_DATE, notes: 'generic dry rice when the generated name does not specify a variety (bare "rice" previously fell to UNKNOWN because it substring-matched BOTH "white rice" and "brown rice" ambiguously - see pricing.js candidate-ambiguity rule). Priced near white rice; exact-match resolution means this never overrides a variety-specific name' },
  { name: 'rosemary',       category: 'pantry',  unit: 'g', price_per_unit: 0.02,   source: PRICE_COVERAGE_V2_METHOD, checked_at: PRICE_COVERAGE_V2_DATE, notes: 'bulk/amortized dried-herb estimate, same basis as cumin/paprika' },

  // ── Salt/pepper structural fix (see report: Salt Root-Cause Investigation).
  // Proven root cause: bare "salt" had no row of its own, so pricing.js's
  // conservative substring fallback matched it to "salt and pepper" - a row
  // deliberately priced as a BLENDED seasoning-pinch estimate for a two-
  // ingredient combo dish, not a per-gram price for pure salt. That row's
  // $0.01/g is ~7x real per-gram table salt, and once grocery aggregation
  // correctly sums salt across a week of meals (~150g, itself correct
  // behavior, not a bug), the error compounds into the observed ~$1.50
  // anomaly (150g x $0.01/g = $1.50 - reproduced exactly in
  // tests/groceryPricingV2.test.js). Fix is additive only: give "salt" (and
  // "pepper") their own exact-match rows so the exact-match step in
  // pricing.js's resolution order (checked BEFORE the substring fallback)
  // always wins - "salt and pepper" stays untouched and still prices actual
  // salt-and-pepper-labeled dishes correctly.
  { name: 'salt',           category: 'pantry',  unit: 'g', price_per_unit: 0.0015, source: PRICE_COVERAGE_V2_METHOD, checked_at: PRICE_COVERAGE_V2_DATE, notes: '~$1.10/lb plain table/kosher salt. Exact-match row added specifically to stop "salt" from falling through to the blended "salt and pepper" row - see Salt Root-Cause Investigation' },
  { name: 'pepper',         category: 'pantry',  unit: 'g', price_per_unit: 0.045,  source: PRICE_COVERAGE_V2_METHOD, checked_at: PRICE_COVERAGE_V2_DATE, notes: 'bulk/amortized ground black pepper estimate (~$4 per 3oz/85g tin) - genuinely much pricier per gram than salt, which is exactly why blending them into one flat rate for pure salt was wrong. Also fixes bare "pepper" previously being ambiguous between "salt and pepper" and "bell peppers" substrings' },
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
  { alias: 'aubergine',  canonical: 'eggplant', notes: 'British/Commonwealth term for the same product (Price Coverage v2)' },
  { alias: 'sea salt',   canonical: 'salt', notes: 'a variety of the same product as plain salt, not a materially different price point (Price Coverage v2)' },
  { alias: 'black pepper', canonical: 'pepper', notes: 'same product as the "pepper" spice row, just the common full name (Price Coverage v2)' },
  { alias: 'vegetable oil', canonical: 'canola oil', notes: 'Phase 3C: the "vegetable oil" PRICES row was renamed to "canola oil" (canonical `vegetable_oil` now models canola). Legacy/free-text "vegetable oil" keeps pricing VERIFIED via this alias — same product/price' },
  { alias: 'lean chuck', canonical: 'beef chuck', notes: 'Phase 3C: the "lean chuck" PRICES row was renamed to "beef chuck" (canonical `lean_chuck` -> `beef_chuck`). Legacy/free-text "lean chuck" keeps pricing VERIFIED via this alias - same product/price' },
  { alias: 'lean chuck meat', canonical: 'beef chuck', notes: 'Phase 3C: pre-existing observed free-text string (see tests/fixtures/manualSupermarketObservations.js); before the rename it matched the "lean chuck" row via pricing.js substring fallback - this exact-alias preserves that VERIFIED pricing' },
];

module.exports = { PRICES, ALIASES, PRICE_COVERAGE_V1_DATE, PRICE_COVERAGE_V1_METHOD, PRICE_COVERAGE_V2_DATE, PRICE_COVERAGE_V2_METHOD, PRICE_CALIBRATION_AUDIT_DATE, PRICE_CALIBRATION_AUDIT_METHOD };
