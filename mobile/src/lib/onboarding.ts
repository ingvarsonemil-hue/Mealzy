export type DobDraft = {
  month: number | null;
  day: string;
  year: string;
  isoDate: string | null;
};

export type CookingSkill = 'beginner' | 'intermediate' | 'advanced';

export type CookingPreferences = {
  timeMinutes: string;
  skill: CookingSkill | null;
  batch: boolean | null;
};

export type OnboardingDraft = {
  dob: DobDraft;
  weeklyBudget: string;
  dietaryRestrictions: string[];
  dietaryNone: boolean;
  allergies: string[];
  allergiesNone: boolean;
  preferredCuisine: string;
  cookingPreferences: CookingPreferences;
};

export type DobValidationErrors = Partial<Record<'month' | 'day' | 'year', string>>;

export type DobValidationResult =
  | { ok: true; date: Date; isoDate: string; age: number }
  | { ok: false; errors: DobValidationErrors };

export const DIETARY_OPTIONS = [
  { value: 'vegan', label: 'Vegan' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'gluten-free', label: 'Gluten-free' },
  { value: 'keto', label: 'Keto' },
  { value: 'halal', label: 'Halal' },
  { value: 'dairy-free', label: 'Dairy-free' },
] as const;

export const COOKING_SKILL_OPTIONS: { value: CookingSkill | null; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: null, label: 'No preference' },
];

export const BATCH_OPTIONS: { value: boolean | null; label: string }[] = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
  { value: null, label: 'No preference' },
];

function parseInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function ageOnDate(dateOfBirth: Date, today: Date): number {
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const birthdayHasPassed =
    today.getMonth() > dateOfBirth.getMonth() ||
    (today.getMonth() === dateOfBirth.getMonth() && today.getDate() >= dateOfBirth.getDate());
  if (!birthdayHasPassed) age -= 1;
  return age;
}

export function validateDobParts(
  month: number | null,
  dayText: string,
  yearText: string,
  today = new Date(),
): DobValidationResult {
  const errors: DobValidationErrors = {};
  const day = parseInteger(dayText);
  const year = parseInteger(yearText);

  if (month == null) errors.month = 'Choose a month.';
  if (day == null) errors.day = 'Enter a day.';
  if (year == null) errors.year = 'Enter a year.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  if (month! < 1 || month! > 12) errors.month = 'Choose a valid month.';
  if (day! < 1 || day! > 31) errors.day = 'Enter a valid day.';
  if (year! < 1) errors.year = 'Enter a valid year.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year!, month! - 1, day!);
  const isRealDate =
    date.getFullYear() === year && date.getMonth() === month! - 1 && date.getDate() === day;

  if (!isRealDate) {
    errors.day = 'Enter a real calendar date.';
    return { ok: false, errors };
  }

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (date > todayStart) {
    errors.year = 'Date of birth cannot be in the future.';
    return { ok: false, errors };
  }

  const isoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { ok: true, date, isoDate, age: ageOnDate(date, todayStart) };
}

export function validateWeeklyBudget(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter your weekly grocery budget.';
  if (!/^\d+(?:\.\d{0,2})?$/.test(trimmed)) return 'Enter a valid dollar amount.';
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0) return 'Budget must be greater than $0.';
  return null;
}

export function toggleListValue(current: string[], value: string): string[] {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

export function validateDietaryRestrictions(values: string[], noneSelected: boolean): string | null {
  if (noneSelected || values.length > 0) return null;
  return 'Choose your dietary restrictions, or select no dietary restrictions.';
}

export function parseAllergies(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of value.split(/[,\n]/)) {
    const allergy = part.trim();
    if (!allergy) continue;
    const key = allergy.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(allergy);
  }
  return result;
}

export function validateAllergies(values: string[], noneSelected: boolean): string | null {
  if (noneSelected || values.length > 0) return null;
  return 'Enter your food allergies, or confirm you have none.';
}

export function validateCookingTime(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return 'Enter a valid number of minutes.';
  const minutes = Number(trimmed);
  if (!Number.isInteger(minutes) || minutes <= 0) return 'Enter a valid number of minutes.';
  return null;
}

export function reviewMissingRequired(draft: OnboardingDraft): Array<'budget' | 'diet' | 'allergies'> {
  const missing: Array<'budget' | 'diet' | 'allergies'> = [];
  if (validateWeeklyBudget(draft.weeklyBudget)) missing.push('budget');
  if (validateDietaryRestrictions(draft.dietaryRestrictions, draft.dietaryNone)) missing.push('diet');
  if (validateAllergies(draft.allergies, draft.allergiesNone)) missing.push('allergies');
  return missing;
}

export function dietaryLabel(value: string): string {
  return DIETARY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function cookingSkillLabel(value: CookingSkill | null): string {
  return COOKING_SKILL_OPTIONS.find((option) => option.value === value)?.label ?? 'No preference';
}

export function batchLabel(value: boolean | null): string {
  return BATCH_OPTIONS.find((option) => option.value === value)?.label ?? 'No preference';
}

/**
 * Maps the completed onboarding draft to a PATCH /api/profile/settings body
 * (server.js's validateOnboardingSettingsPatch, ~server.js:1597). Pure and
 * side-effect-free: never mutates `draft`. `weeklyBudget`/`dietaryRestrictions`/
 * `allergies` are always present here because reviewMissingRequired already
 * required them before Review allows continuing to account creation.
 * `allergiesReviewed: true` is always sent - the user has, by this point,
 * either listed allergies or explicitly confirmed none.
 */
export function onboardingDraftToSettingsPatch(draft: OnboardingDraft): Record<string, unknown> {
  const budget = Number(draft.weeklyBudget.trim());
  const cookingTime = draft.cookingPreferences.timeMinutes.trim();
  const cuisine = draft.preferredCuisine.trim();

  return {
    weeklyBudget: Number.isFinite(budget) ? budget : draft.weeklyBudget,
    dietaryRestrictions: draft.dietaryNone ? [] : draft.dietaryRestrictions,
    allergies: draft.allergiesNone ? [] : draft.allergies,
    allergiesReviewed: true,
    cookingSkill: draft.cookingPreferences.skill,
    cookingTimeMinutes: cookingTime ? Number(cookingTime) : null,
    batchCooking: draft.cookingPreferences.batch,
    preferredCuisine: cuisine.length > 0 ? cuisine : null,
  };
}

/**
 * Where the account-creation step routes to next. `emailVerified === false`
 * is the only case that requires the Verify Email screen (server.js's
 * requireVerifiedEmail semantics); undefined/true both proceed straight to
 * Create First Week.
 */
export function postSignupRoute(emailVerified: boolean | undefined): '/verify-email' | '/create-first-week' {
  return emailVerified === false ? '/verify-email' : '/create-first-week';
}
