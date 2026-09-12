import { Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { BrandColors } from '@/constants/theme';

/**
 * PLACEHOLDER — plain text only, no functional form, no visual design
 * decisions made here.
 *
 * The real Forgot Password / Reset Password flow is separate, tracked work
 * and has not been built yet. This exists only so Sign In's "Forgot
 * password?" link has somewhere to go. Replace the content of this file with
 * the real design once that work happens — do not treat this as finished.
 * Same placeholder approach as free-week-used.tsx (Slice 3).
 */
export default function ForgotPasswordScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <OnboardingHeader />
        <View style={styles.content}>
          <Text style={styles.title}>Forgot password?</Text>
          <Text style={styles.body}>Coming soon.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.cream },
  screen: { flex: 1, paddingHorizontal: 20 },
  content: { paddingTop: 84 },
  title: { color: BrandColors.foreground, fontFamily: serif, fontSize: 29, lineHeight: 36 },
  body: { marginTop: 10, color: BrandColors.muted, fontSize: 16, lineHeight: 24 },
});
