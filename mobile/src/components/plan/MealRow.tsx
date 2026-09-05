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
  const costParts: string[] = [];
  if (meal.durationMinutes !== undefined) costParts.push(`${meal.durationMinutes} min`);
  if (meal.estimatedCost !== undefined) costParts.push(`~${formatMoney(meal.estimatedCost)}`);
  const costLine = costParts.length > 0 ? costParts.join(' · ') : null;

  const nutritionParts: string[] = [];
  if (meal.calories !== undefined) nutritionParts.push(`${meal.calories} cal`);
  if (meal.proteinGrams !== undefined) nutritionParts.push(`${meal.proteinGrams}g protein`);
  const nutritionLine = nutritionParts.length > 0 ? nutritionParts.join(' · ') : null;

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
        {costLine ? <Text style={styles.detail}>{costLine}</Text> : null}
        {nutritionLine ? <Text style={styles.detail}>{nutritionLine}</Text> : null}
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
