import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { formatMoney } from '@/components/plan/format';
import type { GrocerySummaryViewModel } from './types';

type GrocerySummaryProps = {
  summary: GrocerySummaryViewModel;
  checkedCount: number;
};

/**
 * Compact summary line: checked/total count and, when the backend priced
 * this week, the estimated purchase cost. `~` prefixes a non-certified
 * (best-effort) total; a fully-certified total is shown without it.
 */
export function GrocerySummary({ summary, checkedCount }: GrocerySummaryProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.countLine}>
        {checkedCount} of {summary.totalCount} checked
      </Text>
      {summary.estimatedCost !== undefined ? (
        <>
          <Text style={styles.costLine}>
            {summary.isCertified ? '' : '~'}
            {formatMoney(summary.estimatedCost)}
          </Text>
          <Text style={styles.costLabel}>estimated purchase cost</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: 2,
  },
  countLine: { fontSize: 14, color: BrandColors.muted },
  costLine: { fontSize: 17, fontWeight: '700', color: BrandColors.foreground, marginTop: Spacing.one },
  costLabel: { fontSize: 12, color: BrandColors.muted },
});
