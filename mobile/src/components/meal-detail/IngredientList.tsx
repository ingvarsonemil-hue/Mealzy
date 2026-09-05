import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import type { IngredientViewModel } from './types';

type IngredientListProps = {
  ingredients: IngredientViewModel[];
};

/** Editorial ingredient list: name left, real quantity right, subtle separators. */
export function IngredientList({ ingredients }: IngredientListProps) {
  if (ingredients.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Ingredients</Text>
      {ingredients.map((ingredient, i) => (
        <View key={ingredient.id} style={[styles.row, i === 0 && styles.rowFirst]}>
          <Text style={styles.name}>{ingredient.name}</Text>
          {ingredient.quantity ? <Text style={styles.quantity}>{ingredient.quantity}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: Spacing.four * 1.5 },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: BrandColors.ink,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BrandColors.separator,
  },
  rowFirst: { borderTopWidth: 0 },
  name: { fontSize: 15, color: BrandColors.ink, flexShrink: 1, paddingRight: Spacing.three },
  quantity: { fontSize: 15, color: BrandColors.inkMuted },
});
