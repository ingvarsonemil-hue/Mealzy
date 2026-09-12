import { Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { BrandColors } from '@/constants/theme';

export default function Under13EligibilityScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <OnboardingHeader />
        <View style={styles.bottomBlock}>
          <Text style={styles.title}>Mealzy is for people 13 and{`\n`}over.</Text>
          <Text style={styles.body}>
            You need to be at least 13 to use Mealzy. If you{`\n`}entered your date of birth incorrectly, you can{`\n`}go back and correct it.
          </Text>
          <View style={styles.buttonWrap}>
            <OnboardingButton label="Back to date of birth" onPress={() => router.back()} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.cream },
  screen: { flex: 1, paddingHorizontal: 20 },
  bottomBlock: { marginTop: 'auto', paddingBottom: 14 },
  title: { color: BrandColors.foreground, fontFamily: serif, fontSize: 29, lineHeight: 38 },
  body: { marginTop: 16, color: BrandColors.muted, fontSize: 16, lineHeight: 28 },
  buttonWrap: { marginTop: 28 },
});
