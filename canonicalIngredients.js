'use strict';

/**
 * Canonical Ingredient Identity v1 — deterministic resolver.
 *
 * Turns a raw generated ingredient name into a canonical identity from
 * canonicalIngredientData.js, or an explicit "unresolved" result. Nothing in
 * here guesses.
 *
 * RESOLUTION ORDER (first hit wins, all exact after normalization):
 *   1. normalize the raw name
 *   2. exact match against a canonical name
 *   3. exact match against a curated alias
 *   4. otherwise -> unresolved
 *
 * DELIBERATELY NOT DONE:
 *   - No fuzzy / edit-distance / phonetic matching.
 *   - No substring or "contains" matching — "chicken" must never resolve to
 *     "chicken breast", "chicken breast" must never resolve to "chicken
 *     thighs". Only whole-string equality after normalization counts.
 *   - No AI. No network. No DB. Pure and synchronous.
 *   - No raw/cooked or preparation-state inference — that's a nutrition-phase
 *     concern, not an identity one.
 *
 * DETERMINISM: the same input string always produces the same result. The
 * lookup maps are built once at module load and frozen; a data problem
 * (duplicate id, duplicate normalized canonical name, an alias colliding with
 * another canonical ingredient) throws at load rather than resolving
 * ambiguously at runtime.
 */

const { CANONICAL_INGREDIENTS, VALID_BASE_UNITS, VALID_CATEGORIES } = require('./canonicalIngredientData');

/**
 * The one normalization function. Casing and any amount of surrounding or
 * internal whitespace collapse away; nothing else is touched (no
 * de-pluralization, no punctuation stripping, no synonym folding — those
 * would be guesses, and alias curation covers the safe cases explicitly).
 *
 * @param {*} raw
 * @returns {string|null} normalized string, or null if the input can't be a name
 */
function normalizeName(raw) {
  if (typeof raw !== 'string') return null;
  const normalized = raw.toLowerCase().trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

const _BASE_UNITS = new Set(VALID_BASE_UNITS);
const _CATEGORIES = new Set(VALID_CATEGORIES);

// ── Build + validate lookup structures once ────────────────────────────────
const _byId = new Map();
const _byCanonicalName = new Map();
const _byAlias = new Map();

for (const record of CANONICAL_INGREDIENTS) {
  if (!record || typeof record !== 'object') {
    throw new Error('canonicalIngredientData: non-object record encountered');
  }
  const { id, canonicalName, aliases, category, baseUnit } = record;

  if (typeof id !== 'string' || !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(id)) {
    throw new Error(`canonicalIngredientData: invalid id ${JSON.stringify(id)}`);
  }
  if (_byId.has(id)) {
    throw new Error(`canonicalIngredientData: duplicate id "${id}"`);
  }

  const normCanonical = normalizeName(canonicalName);
  if (!normCanonical || normCanonical !== canonicalName) {
    throw new Error(`canonicalIngredientData: canonicalName ${JSON.stringify(canonicalName)} must be non-empty and already normalized (lowercase, single-spaced, trimmed)`);
  }
  if (_byCanonicalName.has(normCanonical)) {
    throw new Error(`canonicalIngredientData: duplicate canonicalName "${normCanonical}"`);
  }
  if (_byAlias.has(normCanonical)) {
    throw new Error(`canonicalIngredientData: canonicalName "${normCanonical}" collides with an alias of another ingredient`);
  }

  if (!_CATEGORIES.has(category)) {
    throw new Error(`canonicalIngredientData: ingredient "${id}" has invalid category ${JSON.stringify(category)}`);
  }
  if (!_BASE_UNITS.has(baseUnit)) {
    throw new Error(`canonicalIngredientData: ingredient "${id}" has invalid baseUnit ${JSON.stringify(baseUnit)}`);
  }
  if (!Array.isArray(aliases)) {
    throw new Error(`canonicalIngredientData: ingredient "${id}" aliases must be an array`);
  }

  const frozen = Object.freeze({
    id,
    canonicalName: normCanonical,
    aliases: Object.freeze([...aliases]),
    category,
    baseUnit,
  });

  _byId.set(id, frozen);
  _byCanonicalName.set(normCanonical, frozen);

  for (const alias of aliases) {
    const normAlias = normalizeName(alias);
    if (!normAlias) {
      throw new Error(`canonicalIngredientData: ingredient "${id}" has an empty/invalid alias ${JSON.stringify(alias)}`);
    }
    if (_byCanonicalName.has(normAlias)) {
      throw new Error(`canonicalIngredientData: alias "${normAlias}" (on "${id}") collides with a canonical name`);
    }
    const existing = _byAlias.get(normAlias);
    if (existing && existing.id !== id) {
      throw new Error(`canonicalIngredientData: alias "${normAlias}" maps to both "${existing.id}" and "${id}"`);
    }
    _byAlias.set(normAlias, frozen);
  }
}

const MATCH = Object.freeze({
  CANONICAL_NAME: 'canonical-name',
  ALIAS: 'alias',
  UNRESOLVED: 'unresolved',
});

function _unresolved(normalized) {
  return Object.freeze({
    resolved: false,
    ingredient: null,
    matchedVia: MATCH.UNRESOLVED,
    normalized: normalized ?? null,
  });
}

function _resolved(ingredient, matchedVia, normalized) {
  return Object.freeze({
    resolved: true,
    ingredient,
    matchedVia,
    normalized,
  });
}

/**
 * Resolve a raw ingredient name to a canonical identity.
 *
 * @param {*} rawName
 * @returns {Readonly<{resolved: boolean, ingredient: (Readonly<object>|null), matchedVia: string, normalized: (string|null)}>}
 *   `resolved: true`  -> `ingredient` is the frozen canonical record.
 *   `resolved: false` -> `ingredient` is null; `normalized` is the cleaned
 *                        string (or null if the input wasn't a usable string).
 *   Never throws for bad input.
 */
function resolveIngredient(rawName) {
  const normalized = normalizeName(rawName);
  if (normalized === null) return _unresolved(null);

  const byName = _byCanonicalName.get(normalized);
  if (byName) return _resolved(byName, MATCH.CANONICAL_NAME, normalized);

  const byAlias = _byAlias.get(normalized);
  if (byAlias) return _resolved(byAlias, MATCH.ALIAS, normalized);

  return _unresolved(normalized);
}

/** Convenience: the canonical record for an id, or null. */
function getById(id) {
  return _byId.get(id) || null;
}

/** All canonical records (frozen), in data-file order. */
function allCanonicalIngredients() {
  return [..._byId.values()];
}

module.exports = {
  normalizeName,
  resolveIngredient,
  getById,
  allCanonicalIngredients,
  MATCH,
};
