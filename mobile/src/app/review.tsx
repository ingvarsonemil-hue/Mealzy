import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { BrandColors } from '@/constants/theme';
import {
  batchLabel,
  cookingSkillLabel,
  dietaryLabel,
  reviewMissingRequired,
} from '@/lib/onboarding';
import { useOnboarding } from '@/lib/onboarding-context';

type MissingKey = 'budget' | 'diet' | 'allergies';

function ReviewRow({
  label,
  value,
  lines,
  missing,
  onEdit,
}: {
  label: string;
  value?: string;
  lines?: string[];
  missing?: boolean;
  onEdit: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {missing ? <Text style={styles.missing}>Answer needed</Text> : null}
        {!missing && value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {!missing && lines
          ? lines.map((line) => (
              <Text key={line} style={styles.rowValue}>
                {line}
              </Text>
            ))
          : null}
      </View>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onEdit} style={styles.editButton}>
        <Text style={styles.editText}>Edit</Text>
      </Pressable>
    </View>
  );
}

export default function ReviewScreen() {
  const router = useRouter();
  const { draft } = useOnboarding();
  const [missing, setMissing] = useState<MissingKey[]>([]);

  const diet = draft.dietaryNone
    ? 'No dietary restrictions'
    : draft.dietaryRestrictions.map(dietaryLabel).join(', ');
  const allergies = draft.allergiesNone ? 'No food allergies' : draft.allergies.join(', ');
  const cuisine = draft.preferredCuisine || 'No preference';
  const time = draft.cookingPreferences.timeMinutes
    ? `${draft.cookingPreferences.timeMinutes} minutes`
    : 'No preference';
  const cookingLines = [
    `Time per meal: ${time}`,
    `Cooking skill: ${cookingSkillLabel(draft.cookingPreferences.skill)}`,
    `Batch cooking: ${batchLabel(draft.cookingPreferences.batch)}`,
  ];
  const budget = draft.weeklyBudget ? `USD ${draft.weeklyBudget} / week` : '';

  function continueToAccount() {
    const nextMissing = reviewMissingRequired(draft);
    setMissing(nextMissing);
    if (nextMissing.length > 0) return;
    router.push('/sign-up');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <OnboardingHeader />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Review your preferences</Text>
          <Text style={styles.body}>Check your answers before creating your account.</Text>
          {missing.length > 0 ? (
            <Text style={styles.reviewError}>Complete the highlighted answers to continue.</Text>
          ) : null}

          <View style={styles.rows}>
            <ReviewRow
              label="Weekly budget"
              value={budget}
              missing={missing.includes('budget')}
              onEdit={() => router.push({ pathname: '/weekly-budget', params: { from: 'review' } })}
            />
            <ReviewRow
              label="Dietary restrictions"
              value={diet}
              missing={missing.includes('diet')}
              onEdit={() => router.push({ pathname: '/dietary-restrictions', params: { from: 'review' } })}
            />
            <ReviewRow
              label="Food allergies"
              value={allergies}
              missing={missing.includes('allergies')}
              onEdit={() => router.push({ pathname: '/allergies', params: { from: 'review' } })}
            />
            <ReviewRow
              label="Preferred cuisine"
              value={cuisine}
              onEdit={() => router.push({ pathname: '/cuisine-preferences', params: { from: 'review' } })}
            />
            <ReviewRow
              label="Cooking preferences"
              lines={cookingLines}
              onEdit={() => router.push({ pathname: '/cooking-preferences', params: { from: 'review' } })}
            />
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <OnboardingButton label="Continue to account" onPress={continueToAccount} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.cream },
  screen: { flex: 1, paddingHorizontal: 20 },
  content: { paddingTop: 84, paddingBottom: 24 },
  title: { color: BrandColors.foreground, fontFamily: serif, fontSize: 29, lineHeight: 36 },
  body: { marginTop: 10, color: BrandColors.muted, fontSize: 16, lineHeight: 24 },
  reviewError: { marginTop: 14, color: BrandColors.destructive, fontSize: 13, lineHeight: 18 },
  rows: { marginTop: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BrandColors.hairline },
  row: {
    minHeight: 74,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BrandColors.hairline,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  rowText: { flex: 1 },
  rowLabel: {
    color: BrandColors.muted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 5,
  },
  rowValue: { color: BrandColors.foreground, fontSize: 15, lineHeight: 21 },
  missing: { color: BrandColors.destructive, fontSize: 15, lineHeight: 21 },
  editButton: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'flex-start', paddingTop: 1 },
  editText: { color: BrandColors.green, fontSize: 14, fontWeight: '600' },
  footer: { paddingBottom: 12 },
});
