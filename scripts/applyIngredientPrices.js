'use strict';

/**
 * Price Coverage v1 — applies ingredientPriceData.js (the canonical,
 * version-controlled price dataset) to the live ingredient_prices table.
 *
 * Idempotent: upserts by `name` (the table's UNIQUE key), so re-running this
 * script after editing the dataset is always safe — existing rows are
 * updated in place, new rows are inserted, nothing is deleted. This is the
 * "ability to rebuild the table" Price Coverage v1 requires: the live table
 * is a materialized copy of this file, not a second source of truth.
 *
 * Usage:
 *   node scripts/applyIngredientPrices.js --dry-run   (show what would change, write nothing)
 *   node scripts/applyIngredientPrices.js             (apply for real)
 */

require('dotenv').config();
const db = require('./../db');
const { PRICES } = require('../ingredientPriceData');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await db.initDb();
  const existingRows = await db.getIngredientPrices();
  const existingByName = new Map(existingRows.map(r => [r.name, r]));

  const toInsert = [];
  const toUpdate = [];
  const unchanged = [];

  for (const row of PRICES) {
    const existing = existingByName.get(row.name);
    if (!existing) {
      toInsert.push(row);
    } else if (existing.price_per_unit !== row.price_per_unit || existing.unit !== row.unit || existing.category !== row.category) {
      toUpdate.push({ row, existing });
    } else {
      unchanged.push(row);
    }
  }

  console.log(`Current live rows: ${existingRows.length}`);
  console.log(`Dataset rows: ${PRICES.length}`);
  console.log(`To insert (${toInsert.length}):`, toInsert.map(r => r.name).join(', ') || '(none)');
  console.log(`To update (${toUpdate.length}):`, toUpdate.map(u => `${u.row.name} (${u.existing.price_per_unit}${u.existing.unit} -> ${u.row.price_per_unit}${u.row.unit})`).join(', ') || '(none)');
  console.log(`Unchanged (${unchanged.length})`);

  if (dryRun) {
    console.log('\n--dry-run: no changes written.');
    return;
  }

  for (const row of toInsert) {
    await db.upsertIngredientPrice(row);
  }
  for (const { row } of toUpdate) {
    await db.upsertIngredientPrice(row);
  }

  const after = await db.getIngredientPrices();
  console.log(`\nDone. Live row count: ${existingRows.length} -> ${after.length}`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error('applyIngredientPrices failed:', err);
  process.exit(1);
});
