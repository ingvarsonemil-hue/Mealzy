import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { currentWeekStart } from '@/lib/plan';
import { parseYmdLocal } from '@/lib/date-format';
import { fetchSavedWeek } from '@/lib/plan-api';
import { toMealDetailViewModel } from '@/components/meal-detail/meal-detail-adapter';
import { MealDetailView } from '@/components/meal-detail/MealDetailView';
import type { MealDetailViewModel } from '@/components/meal-detail/types';

/**
 * Meal Detail. Static route (no dynamic segment/id) - see the routing
 * limitation note in @/components/meal-detail/meal-detail-adapter.ts. Only
 * `date` and `mealIndex` are passed as params; no recipe content travels
 * through navigation. `date` already tells us which saved week owns the
 * meal - this screen derives that week's Monday with the same
 * `currentWeekStart` helper index.tsx uses for "today" (it takes any Date,
 * not just now), then re-loads it via the same read-only `fetchSavedWeek`
 * (GET /api/plans, no side effects, no quota/entitlement consumption). It
 * is not coupled to whatever week happens to be "current" when this screen
 * is opened. It then locates the meal by date + position and builds the
 * view model locally.
 *
 * Hidden from the tab bar and rendered without the native header or the
 * Plan/Groceries/Settings tab bar - see the `meal-detail` Tabs.Screen entry
 * in src/app/_layout.tsx.
 */
export default function MealDetailScreen() {
  const params = useLocalSearchParams<{ date?: string; mealIndex?: string }>();
  const router = useRouter();

  const [state, setState] = useState<
    { s: 'loading' } | { s: 'error' } | { s: 'not_found' } | { s: 'found'; viewModel: MealDetailViewModel }
  >({ s: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const date = params.date;
    const mealIndex = Number(params.mealIndex);
    const parsedDate = date ? parseYmdLocal(date) : null;

    if (!date || !parsedDate || !Number.isInteger(mealIndex)) {
      // Malformed/missing date or index - the existing honest not-found
      // state, never a silent fall back to the current week.
      setState({ s: 'not_found' });
      return;
    }

    const weekStart = currentWeekStart(parsedDate);

    void (async () => {
      const result = await fetchSavedWeek(weekStart);
      if (cancelled) return;

      if (result.kind !== 'found') {
        setState({ s: 'error' });
        return;
      }
      const day = result.week.days.find((d) => d.date === date);
      const viewModel = day ? toMealDetailViewModel(day, mealIndex) : null;
      setState(viewModel ? { s: 'found', viewModel } : { s: 'not_found' });
    })();

    return () => {
      cancelled = true;
    };
  }, [params.date, params.mealIndex]);

  if (state.s === 'loading') {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
      </View>
    );
  }

  if (state.s !== 'found') {
    // 'error' (the reload failed) and 'not_found' (opened without a valid
    // date/index, or the day/meal no longer exists in the current week) get
    // the same honest empty state - there's nothing to fetch a specific
    // meal by, so there's nothing more specific to retry.
    return (
      <View style={styles.centre}>
        <Text style={styles.centreText}>This meal is no longer available.</Text>
      </View>
    );
  }

  return (
    <MealDetailView
      viewModel={state.viewModel}
      onBack={() => router.back()}
      onSwap={() => {
        // Swap is not implemented yet - no existing safe backend swap flow
        // to connect to without adding new business logic. Isolated
        // placeholder so wiring it up later only touches this handler.
      }}
    />
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    backgroundColor: BrandColors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  centreText: { fontSize: 15, color: BrandColors.inkMuted, textAlign: 'center' },
});
