import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { OnboardingScreenTitle } from '@/components/onboarding/OnboardingScreenTitle';
import { SelectionOption } from '@/components/onboarding/SelectionOption';
import { BrandColors } from '@/constants/theme';
import { DIETARY_OPTIONS, toggleListValue, validateDietaryRestrictions } from '@/lib/onboarding';
import { useOnboarding } from '@/lib/onboarding-context';

export default function DietaryRestrictionsScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const isEditing = from === 'review';
  const { draft, setDietaryRestrictions } = useOnboarding();
  const [selected, setSelected] = useState(draft.dietaryRestrictions);
  const [noneSelected, setNoneSelected] = useState(draft.dietaryNone);
  const [error, setError] = useState<string | null>(null);

  function persist(values: string[], none: boolean) {
    if (!isEditing) setDietaryRestrictions(values, none);
  }

  function choose(value: string) {
    setError(null);
    const base = noneSelected ? [] : selected;
    const next = toggleListValue(base, value);
    setSelected(next);
    setNoneSelected(false);
    persist(next, false);
  }

  function chooseNone() {
    setError(null);
    const nextNone = !noneSelected;
    const nextValues = nextNone ? [] : selected;
    setSelected(nextValues);
    setNoneSelected(nextNone);
    persist(nextValues, nextNone);
  }

  function submit() {
    const nextError = validateDietaryRestrictions(selected, noneSelected);
    setError(nextError);
    if (nextError) return;
    setDietaryRestrictions(noneSelected ? [] : selected, noneSelected);
    if (isEditing) router.back();
    else router.push('/allergies');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <OnboardingHeader />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <OnboardingScreenTitle title="Any dietary restrictions?" body="Select all that apply." />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.options}>
            {DIETARY_OPTIONS.map((option) => (
              <SelectionOption
                key={option.value}
                label={option.label}
                selected={!noneSelected && selected.includes(option.value)}
                onPress={() => choose(option.value)}
              />
            ))}
            <SelectionOption
              label="No dietary restrictions"
              selected={noneSelected}
              onPress={chooseNone}
            />
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <OnboardingButton label={isEditing ? 'Save changes' : 'Continue'} onPress={submit} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.cream },
  screen: { flex: 1, paddingHorizontal: 20 },
  content: { paddingTop: 84, paddingBottom: 20 },
  options: { marginTop: 18 },
  error: { marginTop: 12, color: BrandColors.destructive, fontSize: 13, lineHeight: 18 },
  footer: { paddingBottom: 12 },
});
