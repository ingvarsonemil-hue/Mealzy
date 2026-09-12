import { Platform, StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { BrandMark } from './BrandMark';

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

type WeekHeaderProps = {
  rangeLabel: string;
};

/** Header: small brand mark, "This week", and the date range. */
export function WeekHeader({ rangeLabel }: WeekHeaderProps) {
  return (
    <View style={styles.row}>
      <BrandMark />
      <View style={styles.text}>
        <Text style={styles.title}>This week</Text>
        <Text style={styles.range}>{rangeLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  text: { gap: 2 },
  title: { fontSize: 22, fontWeight: '600', color: BrandColors.foreground, fontFamily: serif },
  range: { fontSize: 14, color: BrandColors.muted },
});
