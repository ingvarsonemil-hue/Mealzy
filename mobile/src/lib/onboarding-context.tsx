import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

import type { CookingPreferences, DobDraft, OnboardingDraft } from '@/lib/onboarding';

const EMPTY_DOB: DobDraft = { month: null, day: '', year: '', isoDate: null };
const EMPTY_COOKING: CookingPreferences = { timeMinutes: '', skill: null, batch: null };

type OnboardingContextValue = {
  draft: OnboardingDraft;
  setDobDraft: (next: DobDraft) => void;
  setWeeklyBudget: (value: string) => void;
  setDietaryRestrictions: (values: string[], noneSelected: boolean) => void;
  setAllergies: (values: string[], noneSelected: boolean) => void;
  setPreferredCuisine: (value: string) => void;
  setCookingPreferences: (values: CookingPreferences) => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<OnboardingDraft>({
    dob: EMPTY_DOB,
    weeklyBudget: '',
    dietaryRestrictions: [],
    dietaryNone: false,
    allergies: [],
    allergiesNone: false,
    preferredCuisine: '',
    cookingPreferences: EMPTY_COOKING,
  });

  const value = useMemo<OnboardingContextValue>(
    () => ({
      draft,
      setDobDraft: (dob) => setDraft((current) => ({ ...current, dob })),
      setWeeklyBudget: (weeklyBudget) =>
        setDraft((current) => ({ ...current, weeklyBudget })),
      setDietaryRestrictions: (dietaryRestrictions, dietaryNone) =>
        setDraft((current) => ({ ...current, dietaryRestrictions, dietaryNone })),
      setAllergies: (allergies, allergiesNone) =>
        setDraft((current) => ({ ...current, allergies, allergiesNone })),
      setPreferredCuisine: (preferredCuisine) =>
        setDraft((current) => ({ ...current, preferredCuisine })),
      setCookingPreferences: (cookingPreferences) =>
        setDraft((current) => ({ ...current, cookingPreferences })),
    }),
    [draft],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('useOnboarding must be used within OnboardingProvider');
  return value;
}
