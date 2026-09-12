import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { OnboardingScreenTitle } from '@/components/onboarding/OnboardingScreenTitle';
import { BrandColors } from '@/constants/theme';
import { useOnboarding } from '@/lib/onboarding-context';

export default function CuisinePreferencesScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const isEditing = from === 'review';
  const { draft, setPreferredCuisine } = useOnboarding();
  const [value, setValue] = useState(draft.preferredCuisine);
  const [focused, setFocused] = useState(false);

  function changeText(next: string) {
    setValue(next);
    if (!isEditing) setPreferredCuisine(next);
  }

  function submit() {
    const next = value.trim();
    setPreferredCuisine(next);
    if (isEditing) router.back();
    else router.push('/cooking-preferences');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.screen}>
          <OnboardingHeader />
          <View style={styles.content}>
            <OnboardingScreenTitle
              title="Any cuisine you prefer?"
              body="Tell us a favorite, or leave this blank."
            />

            <Text style={styles.label}>Preferred cuisine (optional)</Text>
            <TextInput
              accessibilityLabel="Preferred cuisine"
              autoCapitalize="words"
              value={value}
              onChangeText={changeText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="For example, Italian"
              placeholderTextColor={BrandColors.muted}
              style={[styles.input, { borderBottomColor: focused ? BrandColors.forest : BrandColors.border }]}
            />
          </View>
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
  content: { paddingTop: 84 },
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
    paddingVertical: 9,
    color: BrandColors.foreground,
    fontSize: 16,
  },
  footer: { marginTop: 'auto', paddingBottom: 12 },
});
