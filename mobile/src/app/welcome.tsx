import { Image, Pressable, SafeAreaView, StyleSheet, Text, View, Platform } from 'react-native';
import { useRouter } from 'expo-router';

import { BrandColors } from '@/constants/theme';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.heroWrap}>
        <Image
          source={require('../../assets/images/onboarding-welcome-hero.png')}
          resizeMode="cover"
          style={styles.hero}
        />
        <Image
          accessibilityLabel="Mealzy"
          source={require('../../assets/images/mealzy-logo-transparent-master.png')}
          resizeMode="contain"
          style={styles.logo}
        />
      </View>

      <View style={styles.content}>
        <View>
          <Text style={styles.title}>Dinner,{`\n`}decided.</Text>
          <Text style={styles.body}>Your week, planned around your{`\n`}tastes and grocery budget.</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/date-of-birth')}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryLabel}>Get started</Text>
          </Pressable>
          <View style={styles.signInRow}>
            <Text style={styles.signInText}>Already have an account? </Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/sign-in')} hitSlop={8}>
              <Text style={styles.signInLink}>Sign in</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.cream },
  heroWrap: { height: '56%', minHeight: 380, position: 'relative', overflow: 'hidden' },
  hero: { width: '100%', height: '100%' },
  logo: {
    position: 'absolute',
    left: 22,
    top: 18,
    width: 28,
    height: 28,
    tintColor: BrandColors.forest,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 34,
    paddingBottom: 14,
    justifyContent: 'space-between',
  },
  title: {
    color: BrandColors.foreground,
    fontFamily: serif,
    fontSize: 38,
    lineHeight: 39,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  body: {
    marginTop: 12,
    color: BrandColors.muted,
    fontSize: 17,
    lineHeight: 25,
  },
  actions: { gap: 14 },
  primaryButton: {
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: BrandColors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.88 },
  primaryLabel: { color: BrandColors.white, fontSize: 17, fontWeight: '700' },
  signInRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  signInText: { color: BrandColors.muted, fontSize: 14 },
  signInLink: { color: BrandColors.foreground, fontSize: 14, textDecorationLine: 'underline', fontWeight: '600' },
});
