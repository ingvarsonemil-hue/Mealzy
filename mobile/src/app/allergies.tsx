import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { OnboardingScreenTitle } from '@/components/onboarding/OnboardingScreenTitle';
import { SelectionOption } from '@/components/onboarding/SelectionOption';
import { BrandColors } from '@/constants/theme';
import { parseAllergies, validateAllergies } from '@/lib/onboarding';
import { useOnboarding } from '@/lib/onboarding-context';

export default function AllergiesScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const isEditing = from === 'review';
  const { draft, setAllergies } = useOnboarding();
  const initialText = useMemo(() => draft.allergies.join(', '), [draft.allergies]);
  const [value, setValue] = useState(initialText);
  const [noneSelected, setNoneSelected] = useState(draft.allergiesNone);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  function persist(text: string, none: boolean) {
    if (!isEditing) setAllergies(none ? [] : parseAllergies(text), none);
  }

  function changeText(next: string) {
    setValue(next);
    setNoneSelected(false);
    setError(null);
    persist(next, false);
  }

  function toggleNone() {
    const nextNone = !noneSelected;
    const nextValue = nextNone ? '' : value;
    setNoneSelected(nextNone);
    if (nextNone) setValue('');
    setError(null);
    persist(nextValue, nextNone);
  }

  function submit() {
    const allergies = noneSelected ? [] : parseAllergies(value);
    const nextError = validateAllergies(allergies, noneSelected);
    setError(nextError);
    if (nextError) return;
    setAllergies(allergies, noneSelected);
    if (isEditing) router.back();
    else router.push('/cuisine-preferences');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.screen}>
          <OnboardingHeader />
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <OnboardingScreenTitle
              title="Any food allergies?"
              body="List your food allergies, separated by commas."
            />

            <Text style={styles.label}>Food allergies</Text>
            <TextInput
              accessibilityLabel="Food allergies"
              multiline
              value={value}
              onChangeText={changeText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="For example, peanuts, sesame"
              placeholderTextColor={BrandColors.muted}
              style={[
                styles.input,
                error && !noneSelected ? styles.inputError : focused && styles.inputFocused,
              ]}
              textAlignVertical="top"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.noneWrap}>
              <SelectionOption
                label="I have no food allergies"
                selected={noneSelected}
                onPress={toggleNone}
              />
            </View>

            <Text style={styles.helper}>
              Always check ingredients and food labels. Mealzy cannot guarantee allergen-free meals.
            </Text>
          </ScrollView>
          <View style={styles.footer}>
            <OnboardingButton label={isEditing ? 'Save changes' : 'Continue'} onPress={submit} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: BrandColors.cream },
  screen: { flex: 1, paddingHorizontal: 20 },
  content: { paddingTop: 84, paddingBottom: 24 },
  label: {
    marginTop: 22,
    color: BrandColors.muted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.border,
    paddingHorizontal: 0,
    paddingTop: 10,
    paddingBottom: 8,
    color: BrandColors.foreground,
    fontSize: 16,
    lineHeight: 22,
  },
  inputError: { borderBottomColor: BrandColors.destructive },
  inputFocused: { borderBottomColor: BrandColors.forest },
  error: { marginTop: 7, color: BrandColors.destructive, fontSize: 13, lineHeight: 18 },
  noneWrap: { marginTop: 10 },
  helper: { marginTop: 20, color: BrandColors.muted, fontSize: 12, lineHeight: 18 },
  footer: { paddingBottom: 12 },
});
