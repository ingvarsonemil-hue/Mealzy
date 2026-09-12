import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors } from '@/constants/theme';

export function SelectionOption({
  label,
  selected,
  onPress,
  kind = 'checkbox',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  kind?: 'checkbox' | 'radio';
}) {
  const isRadio = kind === 'radio';

  return (
    <Pressable
      accessibilityRole={isRadio ? 'radio' : 'checkbox'}
      accessibilityState={isRadio ? { selected } : { checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.indicator, isRadio && styles.radio, selected && styles.indicatorSelected]}>
        {selected ? (
          isRadio ? <View style={styles.radioDot} /> : <Text style={styles.check}>✓</Text>
        ) : null}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 54,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BrandColors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pressed: { opacity: 0.72 },
  indicator: {
    width: 21,
    height: 21,
    borderRadius: 4,
    borderWidth: 1.25,
    borderColor: BrandColors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: { borderRadius: 11 },
  indicatorSelected: { borderColor: BrandColors.green, backgroundColor: BrandColors.green },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BrandColors.white },
  check: { color: BrandColors.white, fontSize: 14, lineHeight: 17, fontWeight: '700' },
  label: { color: BrandColors.foreground, fontSize: 15, lineHeight: 21 },
});
