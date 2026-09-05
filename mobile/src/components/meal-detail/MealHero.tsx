import { StyleSheet, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';

/**
 * Wide pale-green branded fallback visual. No photography here - see the
 * Phase B audit note on PlanMeal in @/lib/plan for why the backend's
 * keyword-matched stock photo (`image_url`) is deliberately not used: it
 * isn't a photo of this specific cooked meal, so showing it would risk
 * presenting a generic image as "the meal".
 */
export function MealHero() {
  return <View style={styles.hero} />;
}

const styles = StyleSheet.create({
  hero: {
    height: 220,
    marginTop: Spacing.three,
    backgroundColor: BrandColors.greenMuted,
  },
});
