import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { currentWeekStart, weekDateRange, type SavedWeekResult, type WeekPlan } from '@/lib/plan';
import { fetchSavedWeek, generateWeek, fetchSwapAlternatives, commitMealSwap } from '@/lib/plan-api';
import { parseMealId, type SwapAlternative } from '@/lib/plan-swap';
import { PlanCurrentView } from '@/components/plan/PlanCurrentView';
import { toPlanCurrentViewModel } from '@/components/plan/plan-current-adapter';
import { SwapAlternativesSheet, type SwapSheetState } from '@/components/plan/SwapAlternativesSheet';

type ScreenState =
  | { s: 'loading' }
  | { s: 'profile_required' }
  | { s: 'email_verification_required' }
  | { s: 'no_plan' }
  | { s: 'generating' }
  | { s: 'existing_plan'; week: WeekPlan }
  | { s: 'generation_in_progress' }
  | { s: 'pro_required' }
  // a generation POST failed in a way the server says is safe to retry
  | { s: 'retryable_error'; message: string }
  | { s: 'terminal_error'; message: string }
  // a GET /api/plans lookup failed: we could NOT determine whether a plan
  // exists, so generation must not be offered. `mode` picks the retry path.
  | { s: 'lookup_error'; mode: 'initial' | 'check' };

type LoadResult = SavedWeekResult | { kind: 'blocked' };

export default function PlanScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const router = useRouter();
  const { user } = useAuth();

  const weekStart = currentWeekStart();
  const range = weekDateRange(weekStart);

  const [state, setState] = useState<ScreenState>({ s: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [swapState, setSwapState] = useState<SwapSheetState>({ s: 'closed' });

  const inFlight = useRef(false);
  const swapInFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  // Profile / email gate, then GET /api/plans. Returns the raw lookup result;
  // callers decide how each outcome maps to screen state. Never generates.
  const loadCurrentWeek = useCallback(async (): Promise<LoadResult> => {
    if (!user) return { kind: 'blocked' };
    // Slice 3 integration note: onboarding now writes the normalized
    // settings_data contract (user.settings) via PATCH /api/profile/settings
    // instead of the legacy POST /api/profile (user.profile). Either one
    // being present means onboarding is complete - checking `profile` alone
    // would wrongly show profile_required forever for anyone who onboarded
    // through the mobile app.
    if (user.profile == null && user.settings == null) {
      setState({ s: 'profile_required' });
      return { kind: 'blocked' };
    }
    if (user.email_verified === false) {
      setState({ s: 'email_verification_required' });
      return { kind: 'blocked' };
    }
    return fetchSavedWeek(weekStart);
  }, [user, weekStart]);

  // Initial load / GET-only retry after a lookup failure. `no_plan` is only
  // ever reached from a SUCCESSFUL "there is no plan" result here.
  const initialLoad = useCallback(async (): Promise<void> => {
    setState({ s: 'loading' });
    const r = await loadCurrentWeek();
    if (!mounted.current || r.kind === 'blocked') return;
    if (r.kind === 'found') setState({ s: 'existing_plan', week: r.week });
    else if (r.kind === 'none') setState({ s: 'no_plan' });
    else setState({ s: 'lookup_error', mode: 'initial' });
  }, [loadCurrentWeek]);

  // "Check for plan" from generation_in_progress. A successful "no plan yet"
  // keeps us waiting; it must not fall back to no_plan and offer generation.
  const checkForPlan = useCallback(async (): Promise<void> => {
    const r = await loadCurrentWeek();
    if (!mounted.current || r.kind === 'blocked') return;
    if (r.kind === 'found') setState({ s: 'existing_plan', week: r.week });
    else if (r.kind === 'none') setState({ s: 'generation_in_progress' });
    else setState({ s: 'lookup_error', mode: 'check' });
  }, [loadCurrentWeek]);

  useEffect(() => {
    mounted.current = true;
    void initialLoad();
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, [initialLoad]);

  const onGenerate = useCallback(async (): Promise<void> => {
    if (!user || inFlight.current) return;
    inFlight.current = true;
    abort.current = new AbortController();
    setState({ s: 'generating' });

    // user.profile is only ever populated by the legacy web onboarding POST
    // /api/profile; a mobile-onboarded user's real answers live in
    // settings_data instead (see the loadCurrentWeek note above) and take
    // precedence server-side, but the endpoint still requires a truthy
    // `profile` value in the body - `?? {}` satisfies that without
    // fabricating any field values.
    const result = await generateWeek(user.profile ?? {}, weekStart, { signal: abort.current.signal });
    inFlight.current = false;
    if (!mounted.current) return;

    switch (result.kind) {
      case 'ok':
        setState({ s: 'existing_plan', week: result.week });
        break;
      case 'pro_required':
        setState({ s: 'pro_required' });
        break;
      case 'generation_in_progress':
        setState({ s: 'generation_in_progress' });
        break;
      case 'profile_required':
        setState({ s: 'profile_required' });
        break;
      case 'email_unverified':
        setState({ s: 'email_verification_required' });
        break;
      case 'retryable':
        setState({ s: 'retryable_error', message: result.message });
        break;
      case 'network':
        // The client request failed or was aborted; the server may still have
        // persisted a week. Recover with a GET-first path, never a blind
        // re-POST.
        void initialLoad();
        break;
      case 'terminal':
        setState({ s: 'terminal_error', message: result.message });
        break;
    }
  }, [user, weekStart, initialLoad]);

  const onRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    const r = await loadCurrentWeek();
    if (mounted.current) {
      // Only known-good data replaces what is on screen. A 'none' or 'error'
      // on refresh keeps the currently displayed plan intact.
      if (r.kind === 'found') setState({ s: 'existing_plan', week: r.week });
      setRefreshing(false);
    }
  }, [loadCurrentWeek]);

  // Silent (no pull-spinner) equivalent of onRefresh, used after a 409 tells
  // us another device/tab already committed a swap for this slot - the
  // locally-held plan is stale and must be replaced with the server's own
  // current state, never patched around.
  const refetchWeek = useCallback(async (): Promise<void> => {
    const r = await loadCurrentWeek();
    if (mounted.current && r.kind === 'found') setState({ s: 'existing_plan', week: r.week });
  }, [loadCurrentWeek]);

  // Core of the swap flow's "generate alternatives" step - shared by the
  // affordance tap and the sheet's own "Try again" retry so both paths
  // handle every outcome identically.
  const runSwapAlternatives = useCallback(
    async (planId: string, date: string, slot: string): Promise<void> => {
      if (swapInFlight.current) return;
      swapInFlight.current = true;
      setSwapState({ s: 'loading', date, slot });

      const result = await fetchSwapAlternatives(planId, date, slot, user?.profile ?? {});
      swapInFlight.current = false;
      if (!mounted.current) return;

      switch (result.kind) {
        case 'ok':
          setSwapState({ s: 'choices', date, slot, alternatives: result.alternatives });
          break;
        case 'pro_required':
          setSwapState({ s: 'pro_required', message: result.message });
          break;
        case 'already_swapped':
          // Another device/tab beat us to this slot since the plan loaded -
          // the plan on screen is stale, so replace it wholesale rather than
          // guessing at a patch.
          void refetchWeek();
          setSwapState({ s: 'already_swapped' });
          break;
        case 'busy':
          setSwapState({ s: 'busy', date, slot });
          break;
        case 'error':
        case 'network':
          setSwapState({ s: 'error' });
          break;
      }
    },
    [user, refetchWeek],
  );

  const onSwapMeal = useCallback(
    (mealId: string) => {
      if (state.s !== 'existing_plan' || !state.week.planId) return;
      const parsed = parseMealId(mealId);
      if (!parsed) return;
      const day = state.week.days.find((d) => d.date === parsed.date);
      const meal = day?.meals[parsed.mealIndex];
      if (!day || !meal) return;
      void runSwapAlternatives(state.week.planId, day.date, meal.type);
    },
    [state, runSwapAlternatives],
  );

  const onRetrySwap = useCallback(
    (date: string, slot: string) => {
      if (state.s !== 'existing_plan' || !state.week.planId) return;
      void runSwapAlternatives(state.week.planId, date, slot);
    },
    [state, runSwapAlternatives],
  );

  const onCloseSwap = useCallback(() => setSwapState({ s: 'closed' }), []);

  const onSelectAlternative = useCallback(
    (alt: SwapAlternative) => {
      if (state.s !== 'existing_plan' || !state.week.planId) return;
      if (swapState.s !== 'choices') return;
      const { date, slot } = swapState;
      const planId = state.week.planId;

      setSwapState({ s: 'committing', date, slot });
      void (async () => {
        const result = await commitMealSwap(planId, date, slot, alt.raw);
        if (!mounted.current) return;

        switch (result.kind) {
          case 'ok':
            // Replace this one day with the server's recomputed version -
            // never splice the chosen alternative in ourselves, since only
            // the server recomputed this day's totals. weeklyTotals (and the
            // grocery/purchase total derived from it) is deliberately left
            // untouched: the backend does not recompute those on a swap, so
            // this screen must never imply it did.
            setState((current) => {
              if (current.s !== 'existing_plan') return current;
              const dayIndex = current.week.days.findIndex((d) => d.date === date);
              if (dayIndex === -1) return current;
              const days = current.week.days.slice();
              days[dayIndex] = result.day;
              const key = `${date}:${slot}`;
              const swappedSlots = current.week.swappedSlots.includes(key)
                ? current.week.swappedSlots
                : [...current.week.swappedSlots, key];
              return { s: 'existing_plan', week: { ...current.week, days, swappedSlots } };
            });
            setSwapState({ s: 'closed' });
            break;
          case 'already_swapped':
            void refetchWeek();
            setSwapState({ s: 'already_swapped' });
            break;
          case 'pro_required':
            setSwapState({ s: 'pro_required', message: result.message });
            break;
          case 'error':
          case 'network':
            setSwapState({ s: 'error' });
            break;
        }
      })();
    },
    [state, swapState, refetchWeek],
  );

  if (state.s === 'existing_plan') {
    return (
      <>
        <PlanCurrentView
          viewModel={toPlanCurrentViewModel(state.week)}
          onOpenMeal={(mealId) => {
            // mealId is `${date}-${mealIndex}` from plan-current-adapter.ts;
            // date itself contains dashes, so split on the last one. Meal
            // Detail re-loads the week itself from just these two values -
            // no recipe content travels through navigation.
            const lastDash = mealId.lastIndexOf('-');
            const date = mealId.slice(0, lastDash);
            const mealIndex = mealId.slice(lastDash + 1);
            router.push({ pathname: '/meal-detail', params: { date, mealIndex } });
          }}
          onOpenGroceries={() => router.navigate('/shop')}
          onGenerateNextWeek={() => {
            // "Next week" generation does not exist yet - the app only
            // supports generating the current week (onGenerate above).
            // Isolated placeholder so wiring it up later only touches this
            // handler, never PlanCurrentView.
          }}
          onSwapMeal={state.week.planId ? onSwapMeal : undefined}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
        <SwapAlternativesSheet
          state={swapState}
          onSelect={onSelectAlternative}
          onRetry={onRetrySwap}
          onClose={onCloseSwap}
        />
      </>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.h1, { color: colors.text }]}>This week</Text>
        <Text style={[styles.range, { color: colors.textSecondary }]}>
          {range.startLabel} to {range.endLabel}
        </Text>
      </View>

      <Body
        state={state}
        colors={colors}
        onGenerate={onGenerate}
        onCheckForPlan={checkForPlan}
        onRetryLoad={initialLoad}
        onOpenSettings={() => router.navigate('/settings')}
      />
    </View>
  );
}

type BodyColors = { background: string; text: string; textSecondary: string };

/** Every ScreenState except 'existing_plan', which PlanScreen renders directly via PlanCurrentView above. */
type NonPlanState = Exclude<ScreenState, { s: 'existing_plan' }>;

function Body({
  state,
  colors,
  onGenerate,
  onCheckForPlan,
  onRetryLoad,
  onOpenSettings,
}: {
  state: NonPlanState;
  colors: BodyColors;
  onGenerate: () => void;
  onCheckForPlan: () => void;
  onRetryLoad: () => void;
  onOpenSettings: () => void;
}) {
  switch (state.s) {
    case 'loading':
      return (
        <View style={styles.centre}>
          <ActivityIndicator />
        </View>
      );

    case 'profile_required':
      return (
        <Message
          colors={colors}
          text="Add your goals and preferences before Mealzy can build a week for you."
          action={{ label: 'Open Settings', onPress: onOpenSettings }}
        />
      );

    case 'email_verification_required':
      return (
        <Message
          colors={colors}
          text="Verify your email to generate plans. Check your inbox for the link Mealzy sent when you signed up."
        />
      );

    case 'no_plan':
      return (
        <Message
          colors={colors}
          text="You do not have a plan for this week yet."
          action={{ label: "Generate this week's plan", onPress: onGenerate }}
        />
      );

    case 'generating':
      return (
        <View style={styles.centre}>
          <ActivityIndicator />
          <Text style={[styles.centreText, { color: colors.textSecondary }]}>
            Building your week. This can take a minute.
          </Text>
        </View>
      );

    case 'generation_in_progress':
      return (
        <Message
          colors={colors}
          text="A plan for this week is already being built. It keeps going even if you leave this screen."
          action={{ label: 'Check for plan', onPress: onCheckForPlan }}
        />
      );

    case 'pro_required':
      return (
        <Message
          colors={colors}
          text="You have used your free weekly plan. A future update will let you upgrade for more weeks."
        />
      );

    case 'retryable_error':
      return (
        <Message
          colors={colors}
          text={state.message}
          action={{ label: 'Try again', onPress: onGenerate }}
        />
      );

    case 'lookup_error':
      return (
        <Message
          colors={colors}
          text="Could not check whether you have a plan for this week. Check your connection."
          action={{
            label: 'Check again',
            onPress: state.mode === 'check' ? onCheckForPlan : onRetryLoad,
          }}
        />
      );

    case 'terminal_error':
      return <Message colors={colors} text={state.message} />;
  }
}

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
    <View style={styles.centre}>
      <Text style={[styles.centreText, { color: colors.textSecondary }]}>{text}</Text>
      {action ? (
        <Pressable
          style={[styles.button, { borderColor: colors.textSecondary }]}
          onPress={action.onPress}>
          <Text style={[styles.buttonText, { color: colors.text }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.one,
  },
  h1: { fontSize: 22, fontWeight: '600' },
  range: { fontSize: 14 },

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
