import { Image, StyleSheet } from 'react-native';

import { BrandColors } from '@/constants/theme';

export function BrandMark() {
  return (
    <Image
      source={require('../../../assets/images/mealzy-logo-transparent-master.png')}
      style={styles.mark}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  mark: {
    width: 32,
    height: 32,
    tintColor: BrandColors.forest,
  },
});
