import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';

type NutritionRowProps = {
  calories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
};

/**
 * Informational-only nutrition readout. Any metric the backend didn't
 * provide is simply omitted, never estimated. No goals, targets, rings, or
 * judgmental copy - just the numbers.
 */
export function NutritionRow({ calories, proteinGrams, carbsGrams, fatGrams }: NutritionRowProps) {
  const stats: { label: string; value: string }[] = [];
  if (calories !== undefined) stats.push({ label: 'cal', value: String(calories) });
  if (proteinGrams !== undefined) stats.push({ label: 'protein', value: `${proteinGrams}g` });
  if (carbsGrams !== undefined) stats.push({ label: 'carbs', value: `${carbsGrams}g` });
  if (fatGrams !== undefined) stats.push({ label: 'fat', value: `${fatGrams}g` });

  if (stats.length === 0) return null;

  return (
    <View style={styles.row}>
      {stats.map((stat) => (
        <View key={stat.label} style={styles.stat}>
          <Text style={styles.value}>{stat.value}</Text>
          <Text style={styles.label}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  stat: { gap: 2 },
  value: { fontSize: 17, fontWeight: '700', color: BrandColors.ink },
  label: { fontSize: 12, color: BrandColors.inkMuted },
});
