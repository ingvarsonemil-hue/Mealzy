import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { BrandColors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import {
  createFirstWeekReducer,
  initialCreateFirstWeekState,
  type CreateFirstWeekPhase,
} from '@/lib/create-first-week';
import { dietaryLabel } from '@/lib/onboarding';
import { currentWeekStart } from '@/lib/plan';
import { fetchSavedWeek, generateWeek } from '@/lib/plan-api';

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

/**
 * Create First Week -> Generating First Week -> Generation Recovery (Slice 3,
 * locked designs #17-19), all in one route/component so the duplicate-POST
 * and GET-only-recovery invariants live in one place (createFirstWeekReducer)
 * rather than being re-derived across separate route files.
 *
 * Entering this screen never generates. The POST only ever happens from
 * onTapCreate, guarded by state.phase === 'confirm' (mirrors the same guard
 * createFirstWeekReducer enforces - see its tests).
 */
type SettingsSummary = {
  weeklyBudget?: string;
  preferredCuisine?: string;
  dietaryRestrictions: string;
  allergies: string;
};

function readSettingsSummary(settings: unknown): SettingsSummary {
  const out: SettingsSummary = { dietaryRestrictions: 'No dietary restrictions', allergies: 'No food allergies' };
  if (!settings || typeof settings !== 'object') return out;
  const s = settings as Record<string, unknown>;
  if (typeof s.weeklyBudget === 'number') out.weeklyBudget = `USD ${s.weeklyBudget} / week`;
  if (typeof s.preferredCuisine === 'string' && s.preferredCuisine.length > 0) {
    out.preferredCuisine = s.preferredCuisine;
  }
  if (Array.isArray(s.dietaryRestrictions) && s.dietaryRestrictions.length > 0) {
    const labels = s.dietaryRestrictions.filter((v): v is string => typeof v === 'string').map(dietaryLabel);
    if (labels.length > 0) out.dietaryRestrictions = labels.join(', ');
  }
  if (Array.isArray(s.allergies) && s.allergies.length > 0) {
    const labels = s.allergies.filter((v): v is string => typeof v === 'string');
    if (labels.length > 0) out.allergies = labels.join(', ');
  }
  return out;
}

export default function CreateFirstWeekScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [state, setState] = useState<CreateFirstWeekPhase>(initialCreateFirstWeekState);
  const weekStart = currentWeekStart();
  const summary = readSettingsSummary(user?.settings);

  const postInFlight = useRef(false);
  const getInFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (state.phase === 'success') {
      router.replace('/');
    } else if (state.phase === 'free_week_used') {
      router.replace('/free-week-used');
    }
  }, [state.phase, router]);

  function onTapCreate() {
    // createFirstWeekReducer only allows a POST from 'confirm' - this is the
    // exact guard create-first-week.test.mjs verifies. postInFlight is a
    // belt-and-braces guard against a second tap landing between renders.
    if (postInFlight.current) return;
    const transition = createFirstWeekReducer(state, { type: 'tap_create' });
    if (!transition.shouldPost) return;
    postInFlight.current = true;
    setState(transition.next);
    abort.current = new AbortController();
    void generateWeek(user?.profile ?? {}, weekStart, { signal: abort.current.signal }).then((result) => {
      postInFlight.current = false;
      if (!mounted.current) return;
      setState((prev) => createFirstWeekReducer(prev, { type: 'generate_result', result }).next);
    });
  }

  function onTapCheckForPlan() {
    if (getInFlight.current) return;
    const transition = createFirstWeekReducer(state, { type: 'tap_check_for_plan' });
    if (!transition.shouldGet) return;
    getInFlight.current = true;
    void fetchSavedWeek(weekStart).then((result) => {
      getInFlight.current = false;
      if (!mounted.current) return;
      setState((prev) => createFirstWeekReducer(prev, { type: 'check_result', result }).next);
    });
  }

  function onTapRetry() {
    // 'error' only fires from a terminal generation failure or from
    // profile_required/email_unverified arriving unexpectedly this late in
    // the flow (see createFirstWeekReducer's onGenerateResult comment) -
    // neither case leaves anything for this screen to resume, so retrying
    // means starting over from 'confirm' rather than re-issuing a POST here.
    setState(initialCreateFirstWeekState);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <OnboardingHeader showBack={false} />
        <View style={styles.content}>
          <Body state={state} summary={summary} onCheckForPlan={onTapCheckForPlan} onRetry={onTapRetry} />
        </View>
        {state.phase === 'confirm' ? (
          <View style={styles.footer}>
            <OnboardingButton label="Create first week" onPress={onTapCreate} />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function Body({
  state,
  summary,
  onCheckForPlan,
  onRetry,
}: {
  state: CreateFirstWeekPhase;
  summary: SettingsSummary;
  onCheckForPlan: () => void;
  onRetry: () => void;
}) {
  switch (state.phase) {
    case 'confirm':
      return (
        <>
          <Text style={styles.title}>Ready for your first week</Text>
          <Text style={styles.body}>Mealzy will build one complete week using what you told us.</Text>
          <View style={styles.rows}>
            {summary.weeklyBudget ? <SummaryRow label="Weekly budget" value={summary.weeklyBudget} /> : null}
            <SummaryRow label="Dietary restrictions" value={summary.dietaryRestrictions} />
            <SummaryRow label="Food allergies" value={summary.allergies} />
            {summary.preferredCuisine ? (
              <SummaryRow label="Preferred cuisine" value={summary.preferredCuisine} />
            ) : null}
          </View>
        </>
      );

    case 'generating':
      return (
        <View style={styles.centre}>
          <ActivityIndicator color={BrandColors.forest} />
          <Text style={styles.centreText}>Building your first week. This can take a minute.</Text>
        </View>
      );

    case 'recovery':
      return (
        <View style={styles.centre}>
          <Text style={styles.centreText}>
            Mealzy is still working on your first week, or we could not confirm what happened. It keeps going even
            if you leave this screen.
          </Text>
          <OnboardingButton label="Check for plan" onPress={onCheckForPlan} />
        </View>
      );

    case 'error':
      return (
        <View style={styles.centre}>
          <Text style={styles.centreText}>{state.message}</Text>
          <OnboardingButton label="Try again" onPress={onRetry} />
        </View>
      );

    // 'success' and 'free_week_used' navigate away in the effect above; this
    // screen renders nothing further for either.
    case 'success':
    case 'free_week_used':
      return null;
  }
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.cream },
  screen: { flex: 1, paddingHorizontal: 20 },
  content: { paddingTop: 84, flex: 1 },
  title: { fontFamily: serif, color: BrandColors.foreground, fontSize: 29, lineHeight: 36 },
  body: { marginTop: 10, color: BrandColors.muted, fontSize: 16, lineHeight: 24 },
  rows: { marginTop: 22, gap: 16 },
  rowLabel: {
    color: BrandColors.muted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 5,
  },
  rowValue: { color: BrandColors.foreground, fontSize: 15, lineHeight: 21 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  centreText: { color: BrandColors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  footer: { paddingBottom: 12 },
});
