import { useState } from 'react';
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
import {
  BATCH_OPTIONS,
  COOKING_SKILL_OPTIONS,
  type CookingPreferences,
  validateCookingTime,
} from '@/lib/onboarding';
import { useOnboarding } from '@/lib/onboarding-context';

export default function CookingPreferencesScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const isEditing = from === 'review';
  const { draft, setCookingPreferences } = useOnboarding();
  const [value, setValue] = useState<CookingPreferences>(draft.cookingPreferences);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [timeFocused, setTimeFocused] = useState(false);

  function update(next: CookingPreferences) {
    setValue(next);
    if (!isEditing) setCookingPreferences(next);
  }

  function patch(next: Partial<CookingPreferences>) {
    update({ ...value, ...next });
  }

  function submit() {
    const nextError = validateCookingTime(value.timeMinutes);
    setTimeError(nextError);
    if (nextError) return;
    const normalized = { ...value, timeMinutes: value.timeMinutes.trim() };
    setCookingPreferences(normalized);
    if (isEditing) router.back();
    else router.push('/review');
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
            <OnboardingScreenTitle title="How do you like to cook?" body="These preferences are optional." />

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Time per meal</Text>
              <View
                style={[
                  styles.timeRow,
                  timeError ? styles.timeRowError : timeFocused && styles.timeRowFocused,
                ]}>
                <TextInput
                  accessibilityLabel="Time per meal in minutes"
                  keyboardType="number-pad"
                  value={value.timeMinutes}
                  onChangeText={(timeMinutes) => {
                    setTimeError(null);
                    patch({ timeMinutes });
                  }}
                  onFocus={() => setTimeFocused(true)}
                  onBlur={() => setTimeFocused(false)}
                  style={styles.timeInput}
                />
                <Text style={styles.minutes}>minutes</Text>
              </View>
              {timeError ? <Text style={styles.error}>{timeError}</Text> : null}
              <Text style={styles.helper}>Leave blank for no preference.</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Cooking skill</Text>
              <View style={styles.options}>
                {COOKING_SKILL_OPTIONS.map((option) => (
                  <SelectionOption
                    key={option.label}
                    kind="radio"
                    label={option.label}
                    selected={value.skill === option.value}
                    onPress={() => patch({ skill: option.value })}
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Cook extra for later?</Text>
              <Text style={styles.sectionBody}>Tell us whether you'd like meals planned around leftovers.</Text>
              <View style={styles.options}>
                {BATCH_OPTIONS.map((option) => (
                  <SelectionOption
                    key={option.label}
                    kind="radio"
                    label={option.label}
                    selected={value.batch === option.value}
                    onPress={() => patch({ batch: option.value })}
                  />
                ))}
              </View>
            </View>
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
  section: { marginTop: 24 },
  sectionLabel: { color: BrandColors.foreground, fontSize: 14, fontWeight: '600' },
  sectionBody: { marginTop: 5, color: BrandColors.muted, fontSize: 13, lineHeight: 18 },
  timeRow: {
    minHeight: 46,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeRowError: { borderBottomColor: BrandColors.destructive },
  timeRowFocused: { borderBottomColor: BrandColors.forest },
  timeInput: { flex: 1, color: BrandColors.foreground, fontSize: 20, paddingVertical: 8 },
  minutes: { color: BrandColors.muted, fontSize: 13 },
  helper: { marginTop: 6, color: BrandColors.muted, fontSize: 12 },
  error: { marginTop: 6, color: BrandColors.destructive, fontSize: 13 },
  options: { marginTop: 8 },
  footer: { paddingBottom: 12 },
});
