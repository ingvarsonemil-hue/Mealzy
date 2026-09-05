import { Image, StyleSheet } from 'react-native';

/**
 * TODO(brand): this reuses the app icon (assets/images/icon.png) as a
 * stand-in for a real in-app horizontal brand mark/wordmark. No such asset
 * exists yet. Isolated here so swapping in the real mark later only touches
 * this file, not WeekHeader or any other consumer.
 */
export function BrandMark() {
  return (
    <Image
      source={require('../../../assets/images/icon.png')}
      style={styles.mark}
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  mark: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
});
