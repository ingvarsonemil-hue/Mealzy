import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { formatMoney } from './format';
import type { GroceryViewModel } from './types';

type GroceryHandoffProps = {
  groceries: GroceryViewModel;
  onPress: () => void;
};

/** "Your groceries" row handing off to the grocery list. Groceries itself is not implemented yet. */
export function GroceryHandoff({ groceries, onPress }: GroceryHandoffProps) {
  const subtitle =
    groceries.itemCount !== undefined
      ? `${groceries.itemCount} items · ~${formatMoney(groceries.estimatedCost)}`
      : `~${formatMoney(groceries.estimatedCost)}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Your groceries">
      <View style={styles.text}>
        <Text style={styles.title}>Your groceries</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BrandColors.separator,
  },
  pressed: { opacity: 0.7 },
  text: { gap: 2 },
  title: { fontSize: 17, fontWeight: '600', color: BrandColors.ink },
  subtitle: { fontSize: 13, color: BrandColors.inkMuted },
  chevron: { fontSize: 24, color: BrandColors.green, fontWeight: '400' },
});
