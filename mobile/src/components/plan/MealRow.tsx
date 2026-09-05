import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { formatMoney } from './format';
import type { PlanMealViewModel } from './types';

type MealRowProps = {
  meal: PlanMealViewModel;
  onPress: () => void;
};

const FALLBACK_SIZE = 100;

/**
 * One editorial meal row: a branded fallback square on the left, meal detail
 * text on the right. The whole row is tappable; `onPress` may be a safe
 * placeholder until the real Meal Detail route exists.
 */
export function MealRow({ meal, onPress }: MealRowProps) {
  const detail =
    meal.durationMinutes !== undefined
      ? `${meal.durationMinutes} min · ~${formatMoney(meal.estimatedCost)}`
      : `~${formatMoney(meal.estimatedCost)}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${meal.type}: ${meal.name}`}>
      {/* Flat color placeholder, not the finished branded illustration system. */}
      <View style={styles.fallback} />
      <View style={styles.info}>
        <Text style={styles.type}>{meal.type}</Text>
        <Text style={styles.name}>{meal.name}</Text>
        <Text style={styles.detail}>{detail}</Text>
        <Text style={styles.detail}>
          {meal.calories} cal · {meal.proteinGrams}g protein
        </Text>
        {meal.usesIngredientsElsewhere ? (
          <Text style={styles.note}>Uses ingredients elsewhere this week</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BrandColors.separator,
    minHeight: FALLBACK_SIZE + Spacing.three * 2,
  },
  pressed: { opacity: 0.7 },
  fallback: {
    width: FALLBACK_SIZE,
    height: FALLBACK_SIZE,
    backgroundColor: BrandColors.greenMuted,
  },
  info: { flex: 1, justifyContent: 'center', gap: 4 },
  type: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: BrandColors.green,
  },
  name: { fontSize: 17, fontWeight: '600', color: BrandColors.ink },
  detail: { fontSize: 13, color: BrandColors.inkMuted },
  note: { fontSize: 12, color: BrandColors.inkMuted, fontStyle: 'italic', marginTop: 2 },
});
