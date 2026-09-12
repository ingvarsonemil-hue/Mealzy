import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ageOnDate,
  batchLabel,
  cookingSkillLabel,
  onboardingDraftToSettingsPatch,
  parseAllergies,
  postSignupRoute,
  reviewMissingRequired,
  toggleListValue,
  validateAllergies,
  validateCookingTime,
  validateDietaryRestrictions,
  validateDobParts,
  validateWeeklyBudget,
} from '../src/lib/onboarding.ts';

test('DOB: empty fields are invalid without changing the enabled-submit contract', () => {
  const result = validateDobParts(null, '', '', new Date(2026, 8, 11));
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, {
    month: 'Choose a month.',
    day: 'Enter a day.',
    year: 'Enter a year.',
  });
});

test('DOB: impossible dates are rejected', () => {
  const result = validateDobParts(2, '30', '2010', new Date(2026, 8, 11));
  assert.equal(result.ok, false);
  assert.equal(result.errors.day, 'Enter a real calendar date.');
});

test('DOB: leap day is accepted in a leap year', () => {
  const result = validateDobParts(2, '29', '2012', new Date(2026, 8, 11));
  assert.equal(result.ok, true);
  assert.equal(result.isoDate, '2012-02-29');
});

test('DOB: leap day is rejected in a non-leap year', () => {
  const result = validateDobParts(2, '29', '2011', new Date(2026, 8, 11));
  assert.equal(result.ok, false);
});

test('DOB: future dates are rejected', () => {
  const result = validateDobParts(9, '12', '2026', new Date(2026, 8, 11));
  assert.equal(result.ok, false);
  assert.equal(result.errors.year, 'Date of birth cannot be in the future.');
});

test('age calculation uses full date, not birth year alone', () => {
  assert.equal(ageOnDate(new Date(2013, 8, 11), new Date(2026, 8, 11)), 13);
  assert.equal(ageOnDate(new Date(2013, 8, 12), new Date(2026, 8, 11)), 12);
});

test('DOB: eligible 13-year-old is classified by full date', () => {
  const eligible = validateDobParts(9, '11', '2013', new Date(2026, 8, 11));
  const under13 = validateDobParts(9, '12', '2013', new Date(2026, 8, 11));
  assert.equal(eligible.ok, true);
  assert.equal(eligible.age, 13);
  assert.equal(under13.ok, true);
  assert.equal(under13.age, 12);
});

test('weekly budget validation rejects empty and non-positive amounts', () => {
  assert.ok(validateWeeklyBudget(''));
  assert.ok(validateWeeklyBudget('0'));
  assert.equal(validateWeeklyBudget('75'), null);
  assert.equal(validateWeeklyBudget('75.50'), null);
});

test('dietary restrictions require a selection or explicit no restrictions', () => {
  assert.ok(validateDietaryRestrictions([], false));
  assert.equal(validateDietaryRestrictions(['vegan'], false), null);
  assert.equal(validateDietaryRestrictions([], true), null);
});

test('selection helper toggles values without duplicates', () => {
  assert.deepEqual(toggleListValue([], 'vegan'), ['vegan']);
  assert.deepEqual(toggleListValue(['vegan'], 'vegan'), []);
  assert.deepEqual(toggleListValue(['vegan'], 'halal'), ['vegan', 'halal']);
});

test('allergy parser trims, splits and deduplicates case-insensitively', () => {
  assert.deepEqual(parseAllergies('Peanuts, shellfish\npeanuts, Milk'), ['Peanuts', 'shellfish', 'Milk']);
});

test('allergies require a value or explicit no allergies', () => {
  assert.ok(validateAllergies([], false));
  assert.equal(validateAllergies(['Peanuts'], false), null);
  assert.equal(validateAllergies([], true), null);
});

test('cooking time is optional but rejects invalid non-empty values', () => {
  assert.equal(validateCookingTime(''), null);
  assert.equal(validateCookingTime('30'), null);
  assert.ok(validateCookingTime('0'));
  assert.ok(validateCookingTime('-5'));
  assert.ok(validateCookingTime('thirty'));
});

test('cooking labels map null preferences to No preference', () => {
  assert.equal(cookingSkillLabel(null), 'No preference');
  assert.equal(cookingSkillLabel('beginner'), 'Beginner');
  assert.equal(batchLabel(null), 'No preference');
  assert.equal(batchLabel(true), 'Yes');
  assert.equal(batchLabel(false), 'No');
});

test('review requires budget, diet and allergy answers but not optional preferences', () => {
  const base = {
    dob: { month: 1, day: '1', year: '2000', isoDate: '2000-01-01' },
    weeklyBudget: '',
    dietaryRestrictions: [],
    dietaryNone: false,
    allergies: [],
    allergiesNone: false,
    preferredCuisine: '',
    cookingPreferences: { timeMinutes: '', skill: null, batch: null },
  };
  assert.deepEqual(reviewMissingRequired(base), ['budget', 'diet', 'allergies']);
  assert.deepEqual(
    reviewMissingRequired({
      ...base,
      weeklyBudget: '85',
      dietaryNone: true,
      allergiesNone: true,
    }),
    [],
  );
});

// ── Slice 3: account-transition helpers ─────────────────────────────────────

const COMPLETE_DRAFT = {
  dob: { month: 1, day: '1', year: '2000', isoDate: '2000-01-01' },
  weeklyBudget: '85',
  dietaryRestrictions: ['vegan'],
  dietaryNone: false,
  allergies: ['Peanuts'],
  allergiesNone: false,
  preferredCuisine: 'Italian',
  cookingPreferences: { timeMinutes: '30', skill: 'beginner', batch: true },
};

test('onboarding draft survives the account transition (patch mapping never mutates the draft)', () => {
  const frozen = Object.freeze(structuredClone(COMPLETE_DRAFT));
  const patch = onboardingDraftToSettingsPatch(frozen);
  assert.deepEqual(frozen, COMPLETE_DRAFT);
  assert.deepEqual(patch, {
    weeklyBudget: 85,
    dietaryRestrictions: ['vegan'],
    allergies: ['Peanuts'],
    allergiesReviewed: true,
    cookingSkill: 'beginner',
    cookingTimeMinutes: 30,
    batchCooking: true,
    preferredCuisine: 'Italian',
  });
});

test('onboarding draft mapping respects "none" selections and optional preferences', () => {
  const patch = onboardingDraftToSettingsPatch({
    ...COMPLETE_DRAFT,
    dietaryNone: true,
    dietaryRestrictions: ['vegan'], // stale selection must be ignored once "none" is set
    allergiesNone: true,
    allergies: ['Peanuts'],
    preferredCuisine: '',
    cookingPreferences: { timeMinutes: '', skill: null, batch: null },
  });
  assert.deepEqual(patch.dietaryRestrictions, []);
  assert.deepEqual(patch.allergies, []);
  assert.equal(patch.allergiesReviewed, true);
  assert.equal(patch.preferredCuisine, null);
  assert.equal(patch.cookingTimeMinutes, null);
  assert.equal(patch.cookingSkill, null);
  assert.equal(patch.batchCooking, null);
});

test('unverified account routes to Verify Email when required', () => {
  assert.equal(postSignupRoute(false), '/verify-email');
});

test('verified (or unknown) accounts route straight to Create First Week', () => {
  assert.equal(postSignupRoute(true), '/create-first-week');
  assert.equal(postSignupRoute(undefined), '/create-first-week');
});
