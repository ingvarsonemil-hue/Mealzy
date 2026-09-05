import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';

type InstructionListProps = {
  steps: string[];
};

/** Numbered instruction steps (01, 02, ...), large readable text, subtle separators. */
export function InstructionList({ steps }: InstructionListProps) {
  if (steps.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Instructions</Text>
      {steps.map((step, i) => (
        <View key={i} style={[styles.row, i === 0 && styles.rowFirst]}>
          <Text style={styles.number}>{String(i + 1).padStart(2, '0')}</Text>
          <Text style={styles.step}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: Spacing.four * 1.5 },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: BrandColors.ink,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BrandColors.separator,
  },
  rowFirst: { borderTopWidth: 0 },
  number: { fontSize: 15, fontWeight: '700', color: BrandColors.green, minWidth: 26 },
  step: { fontSize: 16, lineHeight: 24, color: BrandColors.ink, flex: 1 },
});
