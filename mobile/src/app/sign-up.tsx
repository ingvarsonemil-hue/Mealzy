import { Link, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { useAuth, type AuthUser } from '@/lib/auth-context';
import { onboardingDraftToSettingsPatch, postSignupRoute } from '@/lib/onboarding';
import { useOnboarding } from '@/lib/onboarding-context';

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

function underlineColor(focused: boolean, hasError: boolean): string {
  if (hasError) return BrandColors.destructive;
  if (focused) return BrandColors.forest;
  return BrandColors.border;
}

const SETTINGS_SAVE_FAILED_MESSAGE =
  'Your account was created, but Mealzy could not save your preferences. Try again.';

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, user, error: authError } = useAuth();
  const { draft } = useOnboarding();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // true once the account exists but saving onboarding settings failed - the
  // primary action becomes "Try again" (re-save), never a second signUp().
  const [settingsSaveFailed, setSettingsSaveFailed] = useState(false);

  // Account creation only sets the session; it never generates a plan. Once
  // signUp() resolves ok, this effect waits for the hydrated `user` (from
  // GET /api/auth/me) to persist the completed onboarding draft and route
  // onward - it never fires from a stale closure value.
  const awaitingUser = useRef(false);
  const savingSettings = useRef(false);

  useEffect(() => {
    if (!awaitingUser.current || !user || savingSettings.current) return;
    savingSettings.current = true;
    awaitingUser.current = false;
    void persistDraftAndContinue(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function persistDraftAndContinue(currentUser: AuthUser) {
    setBusy(true);
    setError(null);
    const patch = onboardingDraftToSettingsPatch(draft);
    let res;
    try {
      res = await apiFetch('/api/profile/settings', { method: 'PATCH', body: JSON.stringify(patch) });
    } catch {
      setBusy(false);
      savingSettings.current = false;
      setSettingsSaveFailed(true);
      setError(SETTINGS_SAVE_FAILED_MESSAGE);
      return;
    }
    setBusy(false);
    if (res.status !== 200) {
      savingSettings.current = false;
      setSettingsSaveFailed(true);
      setError(SETTINGS_SAVE_FAILED_MESSAGE);
      return;
    }
    router.replace(postSignupRoute(currentUser.email_verified));
  }

  async function onSubmit() {
    if (busy) return;
    // The account already exists; retry the settings save only, never a
    // second signUp() call (which would either fail or, worse, attempt to
    // create a duplicate account).
    if (settingsSaveFailed) {
      if (!user) return;
      savingSettings.current = true;
      void persistDraftAndContinue(user);
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await signUp(name.trim(), email.trim(), password);
    if (result.ok) {
      // Keep `busy` true and wait for the effect above - it flips busy off
      // once settings are saved (or a failure needs the retry button back).
      awaitingUser.current = true;
      return;
    }
    setBusy(false);
    if (result.message) {
      // Includes the enumeration-safe existing-account message.
      setNotice(result.message);
    } else {
      setError('Something went wrong.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: BrandColors.cream }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.form}>
        <Text style={[styles.title, { color: BrandColors.foreground }]}>Create your account</Text>

        <View style={[styles.fieldWrap, { borderBottomColor: underlineColor(nameFocused, false) }]}>
          <TextInput
            style={[styles.input, { color: BrandColors.foreground }]}
            placeholder="Name"
            placeholderTextColor={BrandColors.muted}
            autoComplete="name"
            value={name}
            onChangeText={setName}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            editable={!busy && !settingsSaveFailed}
          />
        </View>

        <View style={[styles.fieldWrap, { borderBottomColor: underlineColor(emailFocused, false) }]}>
          <TextInput
            style={[styles.input, { color: BrandColors.foreground }]}
            placeholder="Email"
            placeholderTextColor={BrandColors.muted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            editable={!busy && !settingsSaveFailed}
          />
        </View>

        <View style={[styles.fieldWrap, { borderBottomColor: underlineColor(passwordFocused, false) }]}>
          <TextInput
            style={[styles.input, { color: BrandColors.foreground, flex: 1 }]}
            placeholder="Password (at least 12 characters)"
            placeholderTextColor={BrandColors.muted}
            autoCapitalize="none"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            editable={!busy && !settingsSaveFailed}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            hitSlop={8}
            onPress={() => setShowPassword((prev) => !prev)}
            style={styles.toggle}>
            <Text style={styles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </Pressable>
        </View>

        {notice && <Text style={[styles.notice, { color: BrandColors.muted }]}>{notice}</Text>}
        {(error || authError) && (
          <Text style={styles.error}>{error ?? authError?.message}</Text>
        )}

        <Pressable
          style={[styles.button, { backgroundColor: BrandColors.forest }, busy && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy}>
          {busy ? (
            <ActivityIndicator color={BrandColors.white} />
          ) : (
            <Text style={[styles.buttonText, { color: BrandColors.white }]}>
              {settingsSaveFailed ? 'Try again' : 'Create account'}
            </Text>
          )}
        </Pressable>

        <Link href="/sign-in" style={[styles.link, { color: BrandColors.muted }]}>
          Already have an account? Sign in
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  form: { paddingHorizontal: Spacing.four, gap: Spacing.three },
  title: { fontFamily: serif, fontSize: 24, fontWeight: '600', marginBottom: Spacing.two },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  input: { paddingHorizontal: 0, paddingVertical: 0, fontSize: 16 },
  toggle: { paddingLeft: Spacing.two, paddingVertical: Spacing.one },
  toggleText: { color: BrandColors.muted, fontSize: 13, fontWeight: '600' },
  notice: { fontSize: 14 },
  error: { color: BrandColors.destructive, fontSize: 14 },
  button: {
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  link: { fontSize: 14, textAlign: 'center' },
});
