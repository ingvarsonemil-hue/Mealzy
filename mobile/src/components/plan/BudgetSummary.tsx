import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { formatMoney } from './format';
import type { BudgetViewModel } from './types';

type BudgetSummaryProps = {
  budget: BudgetViewModel;
};

/**
 * Compact budget readout. Renders the full "estimated / budget / under-over"
 * line when a numeric target is known (currently only the fixture supplies
 * one - see the gap noted on BudgetViewModel.target); otherwise falls back to
 * "estimated" plus the backend's opaque status string, if any.
 */
export function BudgetSummary({ budget }: BudgetSummaryProps) {
  const parts = [`${formatMoney(budget.estimated)} estimated`];

  if (budget.target !== undefined) {
    parts.push(`${formatMoney(budget.target)} budget`);
    const remaining = budget.remaining ?? budget.target - budget.estimated;
    const status = remaining > 0 ? 'under' : remaining < 0 ? 'over' : 'on budget';
    parts.push(status === 'on budget' ? status : `${formatMoney(Math.abs(remaining))} ${status}`);
  } else if (budget.statusLabel) {
    parts.push(budget.statusLabel);
  }

  return (
    <View style={styles.row}>
      {parts.map((part, i) => (
        <Text key={i} style={styles.text}>
          {i > 0 ? '· ' : ''}
          {part}
        </Text>
      ))}
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
  text: { fontSize: 13, color: BrandColors.inkMuted },
});
