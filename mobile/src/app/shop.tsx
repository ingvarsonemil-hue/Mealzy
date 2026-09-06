import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { currentWeekStart, type WeekPlan } from '@/lib/plan';
import { fetchGroceryChecks, fetchSavedWeek, setGroceryChecked } from '@/lib/plan-api';
import { GroceriesView } from '@/components/groceries/GroceriesView';
import { toGroceriesViewModel } from '@/components/groceries/groceries-adapter';

type ScreenState =
  | { s: 'loading' }
  | { s: 'no_plan' }
  | { s: 'error' }
  | { s: 'found'; week: WeekPlan };

/**
 * Groceries. Read-only for the plan itself: it never generates one, only
 * reads the same saved week Plan already shows (fetchSavedWeek - GET
 * /api/plans, no side effects).
 *
 * Checked state IS persisted (Phase C backend follow-up:
 * GET/PATCH /api/plans/:planId/grocery-checks, keyed by canonical ingredient
 * id, never array position) - loaded once the week's real planId is known,
 * and every tap writes through immediately with optimistic UI + rollback on
 * failure. The one exception: if a saved plan somehow has no planId at all
 * (should not happen post-fix, but not fabricated as a guarantee either),
 * there is nothing to persist against and checking an item is local-only
 * for that session - see the Phase C report.
 */
export default function GroceriesScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const router = useRouter();
  const { user } = useAuth();

  const weekStart = currentWeekStart();

  const [state, setState] = useState<ScreenState>({ s: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [checksLoadFailed, setChecksLoadFailed] = useState(false);
  const mounted = useRef(true);

  const planId = state.s === 'found' ? state.week.planId : undefined;

  const load = useCallback(async (): Promise<void> => {
    if (!user) return;
    const result = await fetchSavedWeek(weekStart);
    if (!mounted.current) return;
    if (result.kind === 'found') setState({ s: 'found', week: result.week });
    else if (result.kind === 'none') setState({ s: 'no_plan' });
    else setState({ s: 'error' });
  }, [user, weekStart]);

  useEffect(() => {
    mounted.current = true;
    setState({ s: 'loading' });
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  // Loads persisted checked state once the real planId is known. Resets to
  // empty whenever there is no planId (no plan loaded yet, or - rare - a
  // plan with none at all), so stale checks from a previous plan never
  // bleed into a different one.
  useEffect(() => {
    if (!planId) {
      setCheckedIds(new Set());
      setChecksLoadFailed(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await fetchGroceryChecks(planId);
      if (cancelled) return;
      if (result.kind === 'found') {
        setCheckedIds(result.checkedIds);
        setChecksLoadFailed(false);
      } else {
        // Still show the real purchase list - just without claiming any
        // persisted progress. checkedIds stays whatever it already was
        // (empty on first load).
        setChecksLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    const result = await fetchSavedWeek(weekStart);
    if (mounted.current) {
      // Only known-good data replaces what is on screen, matching Plan's
      // own refresh behaviour - a 'none'/'error' on refresh keeps the
      // currently displayed list intact rather than clearing it.
      if (result.kind === 'found') setState({ s: 'found', week: result.week });
      setRefreshing(false);
    }
  }, [weekStart]);

  const onToggleItem = useCallback(
    (canonicalIngredientId: string) => {
      const willBeChecked = !checkedIds.has(canonicalIngredientId);

      // Optimistic UI: flip immediately.
      setCheckedIds((prev) => {
        const next = new Set(prev);
        if (willBeChecked) next.add(canonicalIngredientId);
        else next.delete(canonicalIngredientId);
        return next;
      });

      if (!planId) return; // no stable plan id to persist against this session - local-only

      void (async () => {
        const ok = await setGroceryChecked(planId, canonicalIngredientId, willBeChecked);
        if (!ok && mounted.current) {
          // Roll back - never leave the UI claiming a save that didn't happen.
          setCheckedIds((prev) => {
            const next = new Set(prev);
            if (willBeChecked) next.delete(canonicalIngredientId);
            else next.add(canonicalIngredientId);
            return next;
          });
        }
      })();
    },
    [checkedIds, planId],
  );

  if (state.s === 'found') {
    return (
      <GroceriesView
        viewModel={toGroceriesViewModel(state.week)}
        checkedIds={checkedIds}
        onToggleItem={onToggleItem}
        checksLoadFailed={checksLoadFailed}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <View style={[styles.centre, { backgroundColor: colors.background }]}>
      {state.s === 'loading' ? <ActivityIndicator /> : null}
      {state.s === 'no_plan' ? (
        <Message
          colors={colors}
          text="You do not have a plan for this week yet."
          action={{ label: 'Go to Plan', onPress: () => router.navigate('/') }}
        />
      ) : null}
      {state.s === 'error' ? (
        <Message
          colors={colors}
          text="Could not load your groceries. Check your connection."
          action={{ label: 'Try again', onPress: load }}
        />
      ) : null}
    </View>
  );
}

type BodyColors = { background: string; text: string; textSecondary: string };

function Message({
  colors,
  text,
  action,
}: {
  colors: BodyColors;
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <>
      <Text style={[styles.centreText, { color: colors.textSecondary }]}>{text}</Text>
      {action ? (
        <Pressable style={[styles.button, { borderColor: colors.textSecondary }]} onPress={action.onPress}>
          <Text style={[styles.buttonText, { color: colors.text }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  centreText: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '500' },
});
