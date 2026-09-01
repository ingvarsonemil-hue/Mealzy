import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function SettingsScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const { user, signOutLocal, signOutEverywhere } = useAuth();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Signed in as</Text>
        <Text style={[styles.value, { color: colors.text }]}>{user?.email ?? 'Unknown'}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, { borderColor: colors.textSecondary }, busy && styles.disabled]}
          onPress={() => run(signOutLocal)}
          disabled={busy}>
          <Text style={[styles.buttonText, { color: colors.text }]}>Log out</Text>
        </Pressable>

        <Pressable
          style={[styles.button, { borderColor: colors.textSecondary }, busy && styles.disabled]}
          onPress={() => run(signOutEverywhere)}
          disabled={busy}>
          <Text style={[styles.buttonText, { color: colors.text }]}>Log out on all devices</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  section: { gap: Spacing.one },
  label: { fontSize: 13 },
  value: { fontSize: 16, fontWeight: '500' },
  actions: { gap: Spacing.three },
  button: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '500' },
  disabled: { opacity: 0.6 },
});
