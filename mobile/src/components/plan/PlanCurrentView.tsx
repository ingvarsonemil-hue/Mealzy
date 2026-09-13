import { Platform, StyleSheet, Text } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { BudgetSummary } from './BudgetSummary';
import { ContinuationBlock } from './ContinuationBlock';
import { DaySelector } from './DaySelector';
import { GroceryHandoff } from './GroceryHandoff';
import { MealRow } from './MealRow';
import { PlanScreenContainer } from './PlanScreenContainer';
import { WeekHeader } from './WeekHeader';
import type { PlanCurrentViewModel } from './types';

type PlanCurrentViewProps = {
  viewModel: PlanCurrentViewModel;
  onOpenMeal: (mealId: string) => void;
  onOpenGroceries: () => void;
  onGenerateNextWeek: () => void;
  /** Omit to hide the swap affordance on every meal row (e.g. no planId yet). */
  onSwapMeal?: (mealId: string) => void;
  /** Pull-to-refresh, forwarded to PlanScreenContainer. Omit to disable it. */
  refreshing?: boolean;
  onRefresh?: () => void;
};

/**
 * Locked Plan Current screen, presentational only.
 *
 * No API calls, no entitlement decisions, no generation logic - it renders
 * exactly what `viewModel` and the handler props give it. The caller (the
 * real `/` Plan route) owns fetching, generation, entitlement and error
 * states; this component only ever renders the "here is a plan" case.
 *
 * Bottom navigation is owned by Expo Router's tab bar (src/app/_layout.tsx),
 * not this component - it does not import router/tab APIs to recreate it.
 */
export function PlanCurrentView({
  viewModel,
  onOpenMeal,
  onOpenGroceries,
  onGenerateNextWeek,
  onSwapMeal,
  refreshing,
  onRefresh,
}: PlanCurrentViewProps) {
  return (
    <PlanScreenContainer refreshing={refreshing} onRefresh={onRefresh}>
      <WeekHeader rangeLabel={viewModel.rangeLabel} />
      <DaySelector days={viewModel.selectorDays} />
      <BudgetSummary budget={viewModel.budget} />

      <Text style={styles.dayHeading}>{viewModel.day.dayName}</Text>

      {viewModel.day.meals.map((meal) => (
        <MealRow
          key={meal.id}
          meal={meal}
          onPress={() => onOpenMeal(meal.id)}
          onSwap={onSwapMeal ? () => onSwapMeal(meal.id) : undefined}
        />
      ))}

      <GroceryHandoff groceries={viewModel.groceries} onPress={onOpenGroceries} />

      <ContinuationBlock
        heading="Next week"
        question="Ready for next week?"
        ctaLabel="Generate my next week"
        onPressCta={onGenerateNextWeek}
      />
    </PlanScreenContainer>
  );
}

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const styles = StyleSheet.create({
  dayHeading: {
    fontSize: 26,
    fontWeight: '700',
    color: BrandColors.foreground,
    fontFamily: serif,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
});
