import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { currentWeekStart, weekDateRange, type SavedWeekResult, type WeekPlan } from '@/lib/plan';
import { fetchSavedWeek, generateWeek } from '@/lib/plan-api';

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

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

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
        refreshing={refreshing}
        onRefresh={onRefresh}
        onGenerate={onGenerate}
        onCheckForPlan={checkForPlan}
        onRetryLoad={initialLoad}
        onOpenSettings={() => router.navigate('/settings')}
      />
    </View>
  );
}

type BodyColors = { background: string; text: string; textSecondary: string };

function Body({
  state,
  colors,
  refreshing,
  onRefresh,
  onGenerate,
  onCheckForPlan,
  onRetryLoad,
  onOpenSettings,
}: {
  state: ScreenState;
  colors: BodyColors;
  refreshing: boolean;
  onRefresh: () => void;
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

    case 'existing_plan':
      return (
        <WeekView week={state.week} colors={colors} refreshing={refreshing} onRefresh={onRefresh} />
      );
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

function WeekView({
  week,
  colors,
  refreshing,
  onRefresh,
}: {
  week: WeekPlan;
  colors: BodyColors;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = week.weeklyTotals;
  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {week.days.map((day, i) => (
        <View key={`${day.date}-${i}`} style={[styles.day, { borderColor: colors.textSecondary }]}>
          <View style={styles.dayHead}>
            <Text style={[styles.dayName, { color: colors.text }]}>{day.dayName || day.date}</Text>
            <Text style={[styles.daySub, { color: colors.textSecondary }]}>{day.date}</Text>
          </View>
          <Text style={[styles.daySub, { color: colors.textSecondary }]}>
            {Math.round(day.totalCalories)} cal   {money(day.totalCost)}
          </Text>

          {day.meals.map((meal, j) => (
            <View key={`${meal.name}-${j}`} style={styles.meal}>
              <Text style={[styles.mealType, { color: colors.textSecondary }]}>
                {meal.type || 'meal'}
              </Text>
              <Text style={[styles.mealName, { color: colors.text }]}>{meal.name}</Text>
              {meal.description ? (
                <Text style={[styles.mealDesc, { color: colors.textSecondary }]}>
                  {meal.description}
                </Text>
              ) : null}
              <Text style={[styles.mealStats, { color: colors.textSecondary }]}>
                {Math.round(meal.calories)} cal   P {Math.round(meal.protein)}g   C{' '}
                {Math.round(meal.carbs)}g   F {Math.round(meal.fat)}g   {money(meal.cost)}
              </Text>
            </View>
          ))}
        </View>
      ))}

      <View style={[styles.footer, { borderColor: colors.textSecondary }]}>
        <Text style={[styles.footerLine, { color: colors.text }]}>
          Weekly total cost   {money(t.totalCost)}
        </Text>
        <Text style={[styles.footerLine, { color: colors.textSecondary }]}>
          Average calories per day   {Math.round(t.avgCalories)}
        </Text>
        {t.budgetStatus ? (
          <Text style={[styles.footerLine, { color: colors.textSecondary }]}>
            Budget status   {t.budgetStatus}
          </Text>
        ) : null}
      </View>
    </ScrollView>
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

  scroll: { padding: Spacing.four, gap: Spacing.three },
  day: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  dayName: { fontSize: 17, fontWeight: '600' },
  daySub: { fontSize: 13 },

  meal: { gap: 2, paddingTop: Spacing.two },
  mealType: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  mealName: { fontSize: 15, fontWeight: '500' },
  mealDesc: { fontSize: 13, lineHeight: 18 },
  mealStats: { fontSize: 12 },

  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    gap: Spacing.one,
  },
  footerLine: { fontSize: 14 },
});
