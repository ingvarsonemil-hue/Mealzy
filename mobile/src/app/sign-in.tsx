import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
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
import { useAuth } from '@/lib/auth-context';
import { resolveSignInErrorMessage } from '@/lib/sign-in';

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

function underlineColor(focused: boolean, hasError: boolean): string {
  if (hasError) return BrandColors.destructive;
  if (focused) return BrandColors.forest;
  return BrandColors.border;
}

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, error: authError, retry } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const displayedError = resolveSignInErrorMessage(error, authError);

  async function onSubmit() {
    if (busy) return;
    setError(null);
    setBusy(true);
    const result = await signIn(email.trim(), password);
    setBusy(false);
    if (result.ok) {
      router.replace('/');
    } else {
      setError(result.message ?? 'Something went wrong.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: BrandColors.cream }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.form}>
        <Text style={styles.title}>Sign in</Text>

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
            editable={!busy}
          />
        </View>

        <View style={[styles.fieldWrap, { borderBottomColor: underlineColor(passwordFocused, false) }]}>
          <TextInput
            style={[styles.input, { color: BrandColors.foreground, flex: 1 }]}
            placeholder="Password"
            placeholderTextColor={BrandColors.muted}
            autoCapitalize="none"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            editable={!busy}
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

        <Link href="/forgot-password" style={[styles.link, { color: BrandColors.muted }]}>
          Forgot password?
        </Link>

        {displayedError && <Text style={styles.error}>{displayedError}</Text>}

        {authError && (
          <Pressable onPress={() => retry()} disabled={busy}>
            <Text style={[styles.link, { color: BrandColors.forest }]}>Try again</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.button, { backgroundColor: BrandColors.forest }, busy && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy}>
          {busy ? (
            <ActivityIndicator color={BrandColors.white} />
          ) : (
            <Text style={[styles.buttonText, { color: BrandColors.white }]}>Sign in</Text>
          )}
        </Pressable>

        <Link href="/sign-up" style={[styles.link, { color: BrandColors.muted }]}>
          New here? Create an account
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  form: { paddingHorizontal: Spacing.four, gap: Spacing.three },
  title: { fontFamily: serif, fontSize: 29, color: BrandColors.foreground, marginBottom: Spacing.two },
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
