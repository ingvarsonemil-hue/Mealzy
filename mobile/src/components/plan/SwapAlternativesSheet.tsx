import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import type { PlanMeal } from '@/lib/plan';
import type { SwapAlternative } from '@/lib/plan-swap';
import { formatMoney } from './format';

/**
 * Orchestration state for the swap flow — owned by the Plan route (`/`),
 * same "presentational component + caller owns state" split as
 * PlanCurrentView. `date`/`slot` ride along on 'loading'/'busy'/'error' so
 * the caller's retry handler always knows what to retry without this
 * component reaching back into its own history.
 */
export type SwapSheetState =
  | { s: 'closed' }
  | { s: 'loading'; date: string; slot: string }
  | { s: 'choices'; date: string; slot: string; alternatives: SwapAlternative[] }
  | { s: 'committing'; date: string; slot: string }
  | { s: 'pro_required'; message: string }
  | { s: 'busy'; date: string; slot: string }
  | { s: 'already_swapped' }
  | { s: 'error' };

type SwapAlternativesSheetProps = {
  state: SwapSheetState;
  onSelect: (alt: SwapAlternative) => void;
  onRetry: (date: string, slot: string) => void;
  onClose: () => void;
};

/**
 * Bottom sheet presenting 2-3 swap alternatives, plus every non-happy-path
 * state the swap-alternatives call can land in (Pro upsell, busy, already
 * swapped by another device, generic error). Never touches weekly/grocery
 * totals — those are not recomputed by a swap (see plan-swap.ts) and this
 * sheet only ever shows per-meal figures from the alternative itself.
 */
export function SwapAlternativesSheet({ state, onSelect, onRetry, onClose }: SwapAlternativesSheetProps) {
  const visible = state.s !== 'closed';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Body state={state} onSelect={onSelect} onRetry={onRetry} onClose={onClose} />
        </View>
      </Pressable>
    </Modal>
  );
}

function Body({
  state,
  onSelect,
  onRetry,
  onClose,
}: {
  state: SwapSheetState;
  onSelect: (alt: SwapAlternative) => void;
  onRetry: (date: string, slot: string) => void;
  onClose: () => void;
}) {
  switch (state.s) {
    case 'closed':
      return null;

    case 'loading':
      return (
        <View style={styles.centre}>
          <ActivityIndicator color={BrandColors.forest} />
          <Text style={styles.centreText}>Finding alternatives…</Text>
        </View>
      );

    case 'committing':
      return (
        <View style={styles.centre}>
          <ActivityIndicator color={BrandColors.forest} />
          <Text style={styles.centreText}>Saving your swap…</Text>
        </View>
      );

    case 'choices':
      return (
        <>
          <Text style={styles.title}>Choose a different {state.slot}</Text>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {state.alternatives.map((alt, i) => (
              <AlternativeCard key={i} meal={alt.display} onSelect={() => onSelect(alt)} />
            ))}
          </ScrollView>
        </>
      );

    case 'pro_required':
      return (
        <View style={styles.centre}>
          <Text style={styles.title}>Swaps are a Pro feature</Text>
          <Text style={styles.centreText}>{state.message}</Text>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </Pressable>
        </View>
      );

    case 'busy':
      return (
        <View style={styles.centre}>
          <Text style={styles.centreText}>Mealzy is busy right now. Try again shortly.</Text>
          <Pressable style={styles.secondaryButton} onPress={() => onRetry(state.date, state.slot)}>
            <Text style={styles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      );

    case 'already_swapped':
      return (
        <View style={styles.centre}>
          <Text style={styles.centreText}>This meal was already updated — showing the latest version.</Text>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Got it</Text>
          </Pressable>
        </View>
      );

    case 'error':
      return (
        <View style={styles.centre}>
          <Text style={styles.centreText}>Something went wrong. Please try again.</Text>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </Pressable>
        </View>
      );
  }
}

/** Compact card scoped to this sheet only — deliberately not MealRow, which has no "select this" affordance. */
function AlternativeCard({ meal, onSelect }: { meal: PlanMeal; onSelect: () => void }) {
  const factParts: string[] = [];
  if (meal.calories !== undefined) factParts.push(`${Math.round(meal.calories)} cal`);
  if (meal.protein !== undefined) factParts.push(`${Math.round(meal.protein)}g protein`);
  if (meal.cookTime > 0) factParts.push(`${meal.cookTime} min`);
  if (meal.cost !== undefined) factParts.push(`~${formatMoney(meal.cost)}`);

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Choose ${meal.name}`}>
      <Text style={styles.cardName}>{meal.name}</Text>
      {meal.description ? (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {meal.description}
        </Text>
      ) : null}
      {factParts.length > 0 ? <Text style={styles.cardFacts}>{factParts.join(' · ')}</Text> : null}
    </Pressable>
  );
}

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(26,26,26,0.4)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '75%',
    minHeight: 200,
    backgroundColor: BrandColors.white,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  title: { fontSize: 20, fontWeight: '700', fontFamily: serif, color: BrandColors.foreground, marginBottom: Spacing.three },
  list: { flexGrow: 0 },
  centre: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingVertical: Spacing.four },
  centreText: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: BrandColors.muted },

  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BrandColors.border,
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    gap: 4,
  },
  cardPressed: { opacity: 0.7 },
  cardName: { fontSize: 16, fontWeight: '600', color: BrandColors.foreground },
  cardDescription: { fontSize: 13, color: BrandColors.muted },
  cardFacts: { fontSize: 12, color: BrandColors.green, fontWeight: '600' },

  secondaryButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BrandColors.border,
    borderRadius: 8,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '600', color: BrandColors.forest },
});
