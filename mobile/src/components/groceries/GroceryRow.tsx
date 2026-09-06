import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import type { GroceryItemViewModel } from './types';

type GroceryRowProps = {
  item: GroceryItemViewModel;
  checked: boolean;
  onToggle: () => void;
  isFirst?: boolean;
};

/**
 * One grocery row: checkbox, name, real purchase quantity right-aligned.
 * Checked items stay in their original position (no reordering here) and
 * just get a green check + muted text.
 *
 * `item.canonicalIngredientId === null` means the backend couldn't resolve
 * this ingredient to a stable identity, so there's nothing to persist a
 * checkmark against - the row renders non-interactive (dimmed, empty
 * checkbox outline) rather than offering a checkbox that would silently
 * fail to save.
 */
export function GroceryRow({ item, checked, onToggle, isFirst }: GroceryRowProps) {
  const interactive = item.canonicalIngredientId !== null;

  return (
    <Pressable
      onPress={interactive ? onToggle : undefined}
      disabled={!interactive}
      style={({ pressed }) => [
        styles.row,
        isFirst && styles.rowFirst,
        !interactive && styles.rowDisabled,
        pressed && styles.pressed,
      ]}
      accessibilityRole={interactive ? 'checkbox' : 'text'}
      accessibilityState={interactive ? { checked } : undefined}
      accessibilityLabel={item.name}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Text style={styles.checkmark}>✓</Text> : null}
      </View>
      <Text style={[styles.name, checked && styles.nameChecked]} numberOfLines={2}>
        {item.name}
      </Text>
      {item.quantityLabel ? (
        <Text style={[styles.quantity, checked && styles.nameChecked]}>{item.quantityLabel}</Text>
      ) : null}
    </Pressable>
  );
}

const CHECKBOX_SIZE = 24;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BrandColors.separator,
  },
  pressed: { opacity: 0.6 },
  rowFirst: { borderTopWidth: 0 },
  rowDisabled: { opacity: 0.55 },
  checkbox: {
    width: CHECKBOX_SIZE,
    height: CHECKBOX_SIZE,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: BrandColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: BrandColors.green },
  checkmark: { fontSize: 15, color: BrandColors.cream, fontWeight: '700' },
  name: { flex: 1, fontSize: 15, color: BrandColors.ink },
  nameChecked: { color: BrandColors.inkMuted },
  quantity: { fontSize: 14, color: BrandColors.inkMuted },
});
