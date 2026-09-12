import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';

type ContinuationBlockProps = {
  heading: string;
  question: string;
  ctaLabel: string;
  onPressCta: () => void;
};

/**
 * Section heading + continuation prompt with a single CTA. Used here for the
 * "Next week" block; `onPressCta` is a placeholder until generation is wired.
 */
export function ContinuationBlock({ heading, question, ctaLabel, onPressCta }: ContinuationBlockProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.question}>{question}</Text>
      <Pressable
        onPress={onPressCta}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}>
        <Text style={styles.ctaLabel}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four * 1.5,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  heading: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: BrandColors.muted,
  },
  question: { fontSize: 20, fontWeight: '600', color: BrandColors.foreground },
  cta: {
    backgroundColor: BrandColors.forest,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  ctaPressed: { opacity: 0.85 },
  ctaLabel: { fontSize: 16, fontWeight: '600', color: BrandColors.white },
});
