import { Platform, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { BrandColors } from '@/constants/theme';
import { useOnboarding } from '@/lib/onboarding-context';
import { validateWeeklyBudget } from '@/lib/onboarding';
import { useState } from 'react';

export default function WeeklyBudgetScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { draft, setWeeklyBudget } = useOnboarding();
  const isEditing = from === 'review';
  const [value, setValue] = useState(draft.weeklyBudget);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const nextError = validateWeeklyBudget(value);
    setError(nextError);
    if (nextError) return;
    setWeeklyBudget(value.trim());
    if (isEditing) router.back();
    else router.push('/dietary-restrictions');
  }
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <OnboardingHeader />
        <View style={styles.content}>
          <Text style={styles.title}>Your weekly grocery budget.</Text>
          <Text style={styles.body}>How much would you like to spend on{`\n`}groceries each week?</Text>

          <View style={styles.amountRow}>
            <Text style={styles.currency}>$</Text>
            <TextInput
              accessibilityLabel="Weekly grocery budget"
              keyboardType="decimal-pad"
              value={value}
              onChangeText={(next) => {
                const sanitized = next.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                setValue(sanitized);
                if (!isEditing) setWeeklyBudget(sanitized);
                setError(null);
              }}
              placeholder="0"
              placeholderTextColor={BrandColors.muted}
              style={styles.amountInput}
            />
            <Text style={styles.unit}>USD / week</Text>
          </View>
          <View style={[styles.rule, error && styles.ruleError]} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.footer}>
          <OnboardingButton label={isEditing ? 'Save changes' : 'Continue'} onPress={submit} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.cream },
  screen: { flex: 1, paddingHorizontal: 20 },
  content: { paddingTop: 84 },
  title: { color: BrandColors.foreground, fontFamily: serif, fontSize: 29, lineHeight: 36 },
  body: { marginTop: 10, color: BrandColors.muted, fontSize: 16, lineHeight: 25 },
  amountRow: { marginTop: 22, minHeight: 58, flexDirection: 'row', alignItems: 'center' },
  currency: { color: BrandColors.muted, fontSize: 34, marginRight: 8 },
  amountInput: { flex: 1, color: BrandColors.foreground, fontSize: 40, lineHeight: 46, paddingVertical: 0 },
  unit: { color: BrandColors.muted, fontSize: 15, paddingTop: 8 },
  rule: { height: 1.5, backgroundColor: BrandColors.forest },
  ruleError: { backgroundColor: BrandColors.destructive },
  error: { marginTop: 8, color: BrandColors.destructive, fontSize: 13 },
  footer: { marginTop: 'auto', paddingBottom: 12 },
});
