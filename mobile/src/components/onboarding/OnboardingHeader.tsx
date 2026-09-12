import { Image, Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { BrandColors } from '@/constants/theme';

export function OnboardingHeader({ showBack = true }: { showBack?: boolean }) {
  const router = useRouter();

  return (
    <>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.back}>
          <Text style={styles.chevron}>‹</Text>
        </Pressable>
      ) : null}
      <Image
        accessibilityLabel="Mealzy"
        source={require('../../../assets/images/mealzy-logo-transparent-master.png')}
        resizeMode="contain"
        style={styles.logo}
      />
    </>
  );
}

const styles = StyleSheet.create({
  back: {
    position: 'absolute',
    left: 12,
    top: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  chevron: {
    color: BrandColors.foreground,
    fontSize: 42,
    fontWeight: '300',
    lineHeight: 42,
    transform: [{ translateY: -2 }],
  },
  logo: {
    position: 'absolute',
    alignSelf: 'center',
    top: 17,
    width: 24,
    height: 24,
    tintColor: BrandColors.forest,
  },
});
