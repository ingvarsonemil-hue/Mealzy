import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors, Spacing } from '@/constants/theme';
import { formatMoney } from '@/components/plan/format';
import { IngredientList } from './IngredientList';
import { InstructionList } from './InstructionList';
import { MealHero } from './MealHero';
import { NutritionRow } from './NutritionRow';
import type { MealDetailViewModel } from './types';

type MealDetailViewProps = {
  viewModel: MealDetailViewModel;
  onBack: () => void;
  onSwap: () => void;
};

/**
 * Locked Meal Detail screen, presentational only. No API calls, no swap
 * transaction logic - `onBack`/`onSwap` are supplied by the route. Does not
 * import router/tab APIs itself.
 */
export function MealDetailView({ viewModel, onBack, onSwap }: MealDetailViewProps) {
  const costParts: string[] = [];
  if (viewModel.durationMinutes !== undefined) costParts.push(`${viewModel.durationMinutes} min`);
  if (viewModel.estimatedCost !== undefined) {
    costParts.push(`~${formatMoney(viewModel.estimatedCost)} estimated`);
  }
  const costLine = costParts.length > 0 ? costParts.join(' · ') : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>

        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>
            {viewModel.type} · {viewModel.dayLabel}
          </Text>
          <Text style={styles.title}>{viewModel.name}</Text>
        </View>

        <MealHero />

        {costLine ? <Text style={styles.costLine}>{costLine}</Text> : null}

        <NutritionRow
          calories={viewModel.calories}
          proteinGrams={viewModel.proteinGrams}
          carbsGrams={viewModel.carbsGrams}
          fatGrams={viewModel.fatGrams}
        />

        <IngredientList ingredients={viewModel.ingredients} />
        <InstructionList steps={viewModel.instructions} />

        <Pressable
          onPress={onSwap}
          style={({ pressed }) => [styles.swapButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Swap this meal">
          <Text style={styles.swapLabel}>Swap this meal</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BrandColors.cream },
  scrollContent: { paddingBottom: Spacing.four * 2 },

  backButton: {
    width: 44,
    height: 44,
    marginLeft: Spacing.two,
    marginTop: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  backArrow: { fontSize: 28, color: BrandColors.ink, fontWeight: '400' },

  titleBlock: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.two },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: BrandColors.green,
  },
  title: { fontSize: 28, fontWeight: '700', color: BrandColors.ink },

  costLine: {
    fontSize: 14,
    color: BrandColors.inkMuted,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },

  swapButton: {
    marginTop: Spacing.four * 1.5,
    marginHorizontal: Spacing.four,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BrandColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapLabel: { fontSize: 16, fontWeight: '600', color: BrandColors.green },
});
