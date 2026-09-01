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
  useColorScheme,
} from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function SignInScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const router = useRouter();
  const { signIn, error: authError, retry } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.form}>
        <Text style={[styles.title, { color: colors.text }]}>Sign in</Text>

        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.textSecondary }]}
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!busy}
        />
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.textSecondary }]}
          placeholder="Password"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!busy}
        />

        {(error || authError) && (
          <Text style={styles.error}>{error ?? authError?.message}</Text>
        )}

        {authError && (
          <Pressable onPress={() => retry()} disabled={busy}>
            <Text style={[styles.link, { color: colors.textSecondary }]}>Try again</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.button, { backgroundColor: colors.text }, busy && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.background }]}>Sign in</Text>
          )}
        </Pressable>

        <Link href="/sign-up" style={[styles.link, { color: colors.textSecondary }]}>
          New here? Create an account
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  form: { paddingHorizontal: Spacing.four, gap: Spacing.three },
  title: { fontSize: 24, fontWeight: '600', marginBottom: Spacing.two },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  error: { color: '#c0392b', fontSize: 14 },
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
