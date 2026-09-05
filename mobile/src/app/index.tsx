import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { currentWeekStart, weekDateRange, type SavedWeekResult, type WeekPlan } from '@/lib/plan';
import { fetchSavedWeek, generateWeek } from '@/lib/plan-api';
import { PlanCurrentView } from '@/components/plan/PlanCurrentView';
import { toPlanCurrentViewModel } from '@/components/plan/plan-current-adapter';

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

  const inFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  // Profile / email gate, then GET /api/plans. Returns the raw lookup result;
  // callers decide how each outcome maps to screen state. Never generates.
  const loadCurrentWeek = useCallback(async (): Promise<LoadResult> => {
    if (!user) return { kind: 'blocked' };
    if (user.profile == null) {
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

    const result = await generateWeek(user.profile, weekStart, { signal: abort.current.signal });
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

  if (state.s === 'existing_plan') {
    return (
      <PlanCurrentView
        viewModel={toPlanCurrentViewModel(state.week)}
        onOpenMeal={() => {
          // Meal Detail does not exist yet. Intentionally a no-op so the row
          // stays tappable at the component level without navigating
          // anywhere unsafe.
        }}
        onOpenGroceries={() => router.navigate('/shop')}
        onGenerateNextWeek={() => {
          // "Next week" generation does not exist yet - the app only
          // supports generating the current week (onGenerate above).
          // Isolated placeholder so wiring it up later only touches this
          // handler, never PlanCurrentView.
        }}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
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
