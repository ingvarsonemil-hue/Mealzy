import { Pressable, StyleSheet, Text } from 'react-native';

import { BrandColors } from '@/constants/theme';

export function OnboardingButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: BrandColors.forest,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pressed: { opacity: 0.88 },
  label: {
    color: BrandColors.white,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
});
