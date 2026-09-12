import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { formatMoney } from './format';
import type { BudgetViewModel } from './types';

type BudgetSummaryProps = {
  budget: BudgetViewModel;
};

/** Under-budget renders Green, over-budget Destructive, on-budget Muted. */
export function resolveBudgetStatusColor(remaining: number): string {
  if (remaining > 0) return BrandColors.green;
  if (remaining < 0) return BrandColors.destructive;
  return BrandColors.muted;
}

/**
 * Compact budget readout. Renders the full "estimated / budget / under-over"
 * line when a numeric target is known (currently only the fixture supplies
 * one - see the gap noted on BudgetViewModel.target); otherwise falls back to
 * "estimated" plus the backend's opaque status string, if any.
 */
export function BudgetSummary({ budget }: BudgetSummaryProps) {
  const parts = [`${formatMoney(budget.estimated)} estimated`];
  let statusPart: string | null = null;
  let statusColor: string = BrandColors.muted;

  if (budget.target !== undefined) {
    parts.push(`${formatMoney(budget.target)} budget`);
    const remaining = budget.remaining ?? budget.target - budget.estimated;
    const status = remaining > 0 ? 'under' : remaining < 0 ? 'over' : 'on budget';
    statusPart = status === 'on budget' ? status : `${formatMoney(Math.abs(remaining))} ${status}`;
    statusColor = resolveBudgetStatusColor(remaining);
  } else if (budget.statusLabel) {
    statusPart = budget.statusLabel;
  }

  return (
    <View style={styles.row}>
      {parts.map((part, i) => (
        <Text key={i} style={styles.text}>
          {i > 0 ? '· ' : ''}
          {part}
        </Text>
      ))}
      {statusPart ? (
        <Text style={[styles.text, { color: statusColor }]}>· {statusPart}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  text: { fontSize: 13, color: BrandColors.muted },
});
