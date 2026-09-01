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

export default function SignUpScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const router = useRouter();
  const { signUp, error: authError } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    const result = await signUp(name.trim(), email.trim(), password);
    setBusy(false);
    if (result.ok) {
      router.replace('/');
    } else if (result.message) {
      // Includes the enumeration-safe existing-account message.
      setNotice(result.message);
    } else {
      setError('Something went wrong.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.form}>
        <Text style={[styles.title, { color: colors.text }]}>Create your account</Text>

        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.textSecondary }]}
          placeholder="Name"
          placeholderTextColor={colors.textSecondary}
          autoComplete="name"
          value={name}
          onChangeText={setName}
          editable={!busy}
        />
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
          placeholder="Password (at least 12 characters)"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!busy}
        />

        {notice && <Text style={[styles.notice, { color: colors.textSecondary }]}>{notice}</Text>}
        {(error || authError) && (
          <Text style={styles.error}>{error ?? authError?.message}</Text>
        )}

        <Pressable
          style={[styles.button, { backgroundColor: colors.text }, busy && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.background }]}>Create account</Text>
          )}
        </Pressable>

        <Link href="/sign-in" style={[styles.link, { color: colors.textSecondary }]}>
          Already have an account? Sign in
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
  notice: { fontSize: 14 },
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
