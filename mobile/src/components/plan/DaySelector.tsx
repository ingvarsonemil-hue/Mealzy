import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import type { WeekSelectorDayViewModel } from './types';

type DaySelectorProps = {
  days: WeekSelectorDayViewModel[];
};

/**
 * 7-day week strip: a letter above a number, the selected day's number in a
 * filled circle. Read-only for Phase A; day switching is not implemented.
 */
export function DaySelector({ days }: DaySelectorProps) {
  return (
    <View style={styles.row}>
      {days.map((day) => (
        <View key={day.iso} style={styles.day}>
          <Text style={styles.label}>{day.label}</Text>
          <View style={[styles.circle, day.isSelected && styles.circleSelected]}>
            <Text style={[styles.number, day.isSelected && styles.numberSelected]}>
              {day.dayOfMonth}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const CIRCLE_SIZE = 32;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  day: { alignItems: 'center', gap: Spacing.two, minWidth: 36 },
  label: { fontSize: 12, color: BrandColors.muted, fontWeight: '500' },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleSelected: { backgroundColor: BrandColors.green },
  number: { fontSize: 15, color: BrandColors.foreground, fontWeight: '500' },
  numberSelected: { color: BrandColors.white, fontWeight: '600' },
});
