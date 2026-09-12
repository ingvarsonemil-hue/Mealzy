import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import type { SettingsRowViewModel } from './types';

type SettingsRowProps = {
  row: SettingsRowViewModel;
  isFirst?: boolean;
};

/** One editorial settings row: label left, real summary right (if any), chevron. Whole row is tappable. */
export function SettingsRow({ row, isFirst }: SettingsRowProps) {
  return (
    <Pressable
      onPress={row.onPress}
      style={({ pressed }) => [styles.row, isFirst && styles.rowFirst, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={row.label}>
      <Text style={styles.label}>{row.label}</Text>
      <View style={styles.right}>
        {row.summary ? <Text style={styles.summary}>{row.summary}</Text> : null}
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BrandColors.hairline,
  },
  rowFirst: { borderTopWidth: 0 },
  pressed: { opacity: 0.6 },
  label: { fontSize: 16, color: BrandColors.foreground },
  right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  summary: { fontSize: 15, color: BrandColors.muted },
  chevron: { fontSize: 20, color: BrandColors.muted, fontWeight: '400' },
});
