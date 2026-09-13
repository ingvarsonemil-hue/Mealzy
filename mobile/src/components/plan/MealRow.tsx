import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { formatMoney } from './format';
import type { PlanMealViewModel } from './types';

type MealRowProps = {
  meal: PlanMealViewModel;
  onPress: () => void;
  /** Omit to hide the swap affordance entirely (e.g. no planId to swap against). */
  onSwap?: () => void;
};

/**
 * One editorial meal row: text only, no image slot (locked design). The
 * whole row is tappable; `onPress` may be a safe placeholder until the real
 * Meal Detail route exists.
 *
 * The swap affordance is a plain text button, matching this row's
 * text-only, no-icon design rather than introducing an icon glyph the app
 * has nowhere else. Hidden once `meal.swapped` is true - a slot only ever
 * swaps once.
 */
export function MealRow({ meal, onPress, onSwap }: MealRowProps) {
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
      <View style={styles.info}>
        <Text style={styles.type}>{meal.type}</Text>
        <Text style={styles.name}>{meal.name}</Text>
        {costLine ? <Text style={styles.detail}>{costLine}</Text> : null}
        {nutritionLine ? <Text style={styles.detail}>{nutritionLine}</Text> : null}
        {meal.usesIngredientsElsewhere ? (
          <Text style={styles.note}>Uses ingredients elsewhere this week</Text>
        ) : null}
      </View>
      {onSwap && !meal.swapped ? (
        <Pressable
          onPress={onSwap}
          hitSlop={8}
          style={({ pressed }) => [styles.swapButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Swap ${meal.type.toLowerCase()}`}>
          <Text style={styles.swapButtonText}>Swap</Text>
        </Pressable>
      ) : null}
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
    borderTopColor: BrandColors.hairline,
  },
  pressed: { opacity: 0.7 },
  info: { flex: 1, justifyContent: 'center', gap: 4 },
  swapButton: { justifyContent: 'center', paddingHorizontal: Spacing.two, alignSelf: 'center' },
  swapButtonText: { fontSize: 13, fontWeight: '600', color: BrandColors.green },
  type: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: BrandColors.green,
  },
  name: { fontSize: 17, fontWeight: '600', color: BrandColors.foreground },
  detail: { fontSize: 13, color: BrandColors.muted },
  note: { fontSize: 12, color: BrandColors.muted, fontStyle: 'italic', marginTop: 2 },
});
