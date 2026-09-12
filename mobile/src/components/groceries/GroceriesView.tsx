import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { BrandMark } from '@/components/plan/BrandMark';
import { PlanScreenContainer } from '@/components/plan/PlanScreenContainer';
import { GrocerySection } from './GrocerySection';
import { GrocerySummary } from './GrocerySummary';
import type { GroceriesViewModel } from './types';

type GroceriesViewProps = {
  viewModel: GroceriesViewModel;
  checkedIds: ReadonlySet<string>;
  onToggleItem: (canonicalIngredientId: string) => void;
  /** Shown as a small restrained notice when loading saved checked state failed - the list itself still renders. */
  checksLoadFailed?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
};

/**
 * Locked Groceries screen, presentational only. No API calls - `checkedIds`/
 * `onToggleItem` are owned by the route (src/app/shop.tsx), which loads
 * checked state from the backend and persists every toggle; this component
 * never claims persistence itself, it just reflects whatever state it's
 * given. Sections/categories come straight from the real purchase-plan
 * rows (see groceries-adapter.ts) - there is no client-side classification.
 *
 * Bottom navigation is the real Expo Router tab bar (src/app/_layout.tsx) -
 * this component renders no navigation of its own.
 */
export function GroceriesView({
  viewModel,
  checkedIds,
  onToggleItem,
  checksLoadFailed,
  refreshing,
  onRefresh,
}: GroceriesViewProps) {
  const totalItems = viewModel.summary.totalCount;
  const checkedCount = viewModel.sections
    .flatMap((s) => s.items)
    .filter((item) => item.canonicalIngredientId !== null && checkedIds.has(item.canonicalIngredientId)).length;

  return (
    <PlanScreenContainer refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.header}>
        <BrandMark />
        <View style={styles.headerText}>
          <Text style={styles.title}>Shop</Text>
          <Text style={styles.context}>This week · {viewModel.rangeLabel}</Text>
        </View>
      </View>

      <GrocerySummary summary={viewModel.summary} checkedCount={checkedCount} />

      {checksLoadFailed ? (
        <Text style={styles.notice}>Could not load your saved progress. Checks made now still save.</Text>
      ) : null}

      {totalItems === 0 ? (
        <Text style={styles.empty}>No grocery items for this week yet.</Text>
      ) : (
        viewModel.sections.map((section) => (
          <GrocerySection key={section.category} section={section} checkedIds={checkedIds} onToggleItem={onToggleItem} />
        ))
      )}
    </PlanScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  headerText: { gap: 2 },
  title: { fontSize: 28, fontWeight: '700', color: BrandColors.foreground },
  context: { fontSize: 14, color: BrandColors.muted },
  notice: {
    fontSize: 12,
    color: BrandColors.muted,
    fontStyle: 'italic',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  empty: {
    fontSize: 14,
    color: BrandColors.muted,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four * 1.5,
  },
});
