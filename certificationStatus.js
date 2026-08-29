'use strict';

/**
 * Phase 3E0-D — shared status vocabularies for certificationAssessment.js.
 * Pure constants, no logic. Split out to keep the assessment module focused
 * (and under the 500-line limit).
 */

const CANONICAL_STATUS = Object.freeze({
  RESOLVED: 'resolved',                                   // name resolved; proposed id (if any) agrees
  UNRESOLVED: 'unresolved',                               // frozen resolver could not resolve the name
  INVALID_PROPOSED_ID: 'invalid_proposed_canonical_id',   // proposed id absent / malformed
  PROPOSED_ID_MISMATCH: 'proposed_canonical_id_mismatch', // proposed id valid but != resolver's answer
});

const QUANTITY_STATUS = Object.freeze({
  OK: 'ok',
  INVALID_QUANTITY: 'invalid_quantity',    // non-finite, <= 0
  INCOMPATIBLE_UNIT: 'incompatible_unit',  // not g|ml|count, or != canonical baseUnit
  NOT_ASSESSED: 'not_assessed',            // no canonical identity to check against
});

const NUTRITION_STATUS = Object.freeze({
  COVERED: 'covered',
  MISSING_RECORD: 'missing_nutrition_record',
  INELIGIBLE_RECORD: 'ineligible_nutrition_record',
  NOT_ASSESSED: 'not_assessed',            // blocked upstream (identity / quantity)
});

const PURCHASE_STATUS = Object.freeze({
  COVERED: 'covered',                              // certifiable purchase profile exists
  MISSING_PROFILE: 'missing_purchase_profile',     // resolved, but no curated profile
  NOT_CERTIFIABLE: 'purchase_not_certifiable',     // profile exists but confidence not certification-grade
  NOT_ASSESSED: 'not_assessed',
});

// Diagnostic only — consumption pricing is NOT budget authority.
const PRICING_STATUS = Object.freeze({
  VERIFIED: 'verified',
  LEGACY_ESTIMATE: 'legacy_estimate',
  UNKNOWN_INGREDIENT: 'unknown_ingredient',
  UNSUPPORTED_UNIT: 'unsupported_unit',
  NOT_ASSESSED: 'not_assessed',
});

// Every failure reason the assessment layer can emit (flat enum, per 3E0-D).
const FAILURE = Object.freeze({
  UNRESOLVED_CANONICAL_INGREDIENT: 'unresolved_canonical_ingredient',
  INVALID_PROPOSED_CANONICAL_ID: 'invalid_proposed_canonical_id',
  PROPOSED_CANONICAL_ID_MISMATCH: 'proposed_canonical_id_mismatch',
  INVALID_QUANTITY: 'invalid_quantity',
  INCOMPATIBLE_UNIT: 'incompatible_unit',
  MISSING_NUTRITION_RECORD: 'missing_nutrition_record',
  INELIGIBLE_NUTRITION_RECORD: 'ineligible_nutrition_record',
  MISSING_PURCHASE_PROFILE: 'missing_purchase_profile',
  PURCHASE_NOT_CERTIFIABLE: 'purchase_not_certifiable',
  STRUCTURE_INVALID: 'structure_invalid',
});

const CERTIFICATION_VERSION = 1;

module.exports = {
  CANONICAL_STATUS, QUANTITY_STATUS, NUTRITION_STATUS, PURCHASE_STATUS,
  PRICING_STATUS, FAILURE, CERTIFICATION_VERSION,
};
