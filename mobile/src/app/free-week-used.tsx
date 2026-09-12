import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { BrandColors } from '@/constants/theme';

/**
 * PLACEHOLDER — plain text only, no visual design decisions made here.
 *
 * Per Emil: the real "Free Week Used" screen is already locked/approved but
 * has not been supplied to this session yet (it is not in the
 * Mealzy_Locked_Designs package this session inspected). This exists only so
 * routing works and the ineligible-tap test can pass. Replace the content of
 * this file with the real design once supplied — do not treat this as
 * finished.
 */
export default function FreeWeekUsedScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <OnboardingHeader showBack={false} />
        <View style={styles.content}>
          <Text style={styles.title}>You have used your free week</Text>
          <Text style={styles.body}>
            Mealzy generates one free complete week per account. Upgrading for more weeks is coming soon.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.cream },
  screen: { flex: 1, paddingHorizontal: 20 },
  content: { paddingTop: 84 },
  title: { color: BrandColors.foreground, fontSize: 24, lineHeight: 30, fontWeight: '600' },
  body: { marginTop: 10, color: BrandColors.muted, fontSize: 16, lineHeight: 24 },
});
