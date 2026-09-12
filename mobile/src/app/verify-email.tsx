import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { OnboardingHeader } from '@/components/onboarding/OnboardingHeader';
import { OnboardingButton } from '@/components/onboarding/OnboardingButton';
import { BrandColors } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { resolveVerifyEmailOutcome } from '@/lib/verify-email';

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

/**
 * Verify Email (Slice 3, locked design #16). Reached only from sign-up.tsx
 * when the freshly hydrated user has email_verified === false.
 *
 * No polling: the existing contract offers no push/webhook signal for
 * verification, only GET /api/auth/me (via retry(), the same re-hydrate
 * AuthProvider already uses) and POST /api/auth/resend-verification. Both
 * are explicit, user-initiated taps - never automatic, and neither one ever
 * generates a plan.
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, retry } = useAuth();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkVerified() {
    if (checking) return;
    setChecking(true);
    setError(null);
    setNotice(null);
    let checkSucceeded = true;
    try {
      await retry();
    } catch {
      checkSucceeded = false;
    }
    setChecking(false);
    // `user` here is a snapshot from this render; if retry() just verified
    // the account, the next render carries the update and this screen stays
    // put until the user taps again — that is an explicit re-check, not
    // automatic polling.
    const outcome = resolveVerifyEmailOutcome(checkSucceeded, Boolean(user?.email_verified));
    if (outcome.status === 'verified') {
      router.replace('/create-first-week');
    } else if (outcome.status === 'not-yet-verified') {
      setNotice(outcome.notice);
    } else {
      setError(outcome.error);
    }
  }

  async function resend() {
    if (resending) return;
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ message?: string }>('/api/auth/resend-verification', { method: 'POST' });
      if (res.status === 200) {
        setNotice(res.data?.message || 'Verification email sent — check your inbox.');
      } else {
        setError('Could not resend the email. Try again.');
      }
    } catch {
      setError('Could not reach Mealzy. Check your connection.');
    }
    setResending(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <OnboardingHeader showBack={false} />
        <View style={styles.content}>
          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.body}>
            {user?.email
              ? `We sent a verification link to ${user.email}. Open it, then come back here.`
              : 'We sent you a verification link. Open it, then come back here.'}
          </Text>

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable accessibilityRole="button" onPress={resend} disabled={resending} style={styles.linkButton}>
            {resending ? (
              <ActivityIndicator color={BrandColors.forest} />
            ) : (
              <Text style={styles.link}>Resend verification email</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          {checking ? (
            <View style={styles.checkingRow}>
              <ActivityIndicator color={BrandColors.forest} />
              <Text style={styles.checkingText}>Checking...</Text>
            </View>
          ) : (
            <OnboardingButton label="I've verified" onPress={checkVerified} />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BrandColors.cream },
  screen: { flex: 1, paddingHorizontal: 20 },
  content: { paddingTop: 84, flex: 1 },
  title: { fontFamily: serif, color: BrandColors.foreground, fontSize: 29, lineHeight: 36 },
  body: { marginTop: 10, color: BrandColors.muted, fontSize: 16, lineHeight: 24 },
  notice: { marginTop: 20, color: BrandColors.foreground, fontSize: 14, lineHeight: 20 },
  error: { marginTop: 20, color: BrandColors.destructive, fontSize: 14, lineHeight: 20 },
  linkButton: { marginTop: 24, minHeight: 44, justifyContent: 'center' },
  link: { color: BrandColors.forest, fontSize: 15, fontWeight: '600' },
  footer: { paddingBottom: 12 },
  checkingRow: { minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 8 },
  checkingText: { color: BrandColors.muted, fontSize: 15, lineHeight: 22 },
});
