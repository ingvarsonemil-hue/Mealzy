import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { GroceryRow } from './GroceryRow';
import type { GrocerySectionViewModel } from './types';

type GrocerySectionProps = {
  section: GrocerySectionViewModel;
  checkedIds: ReadonlySet<string>;
  onToggleItem: (canonicalIngredientId: string) => void;
};

/** One category section: a restrained heading, then its rows. */
export function GrocerySection({ section, checkedIds, onToggleItem }: GrocerySectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{section.label}</Text>
      {section.items.map((item, i) => (
        <GroceryRow
          key={item.id}
          item={item}
          checked={item.canonicalIngredientId !== null && checkedIds.has(item.canonicalIngredientId)}
          onToggle={() => item.canonicalIngredientId && onToggleItem(item.canonicalIngredientId)}
          isFirst={i === 0}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: Spacing.four },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: BrandColors.inkMuted,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.one,
  },
});
