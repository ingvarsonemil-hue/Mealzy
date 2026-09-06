import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { BrandMark } from '@/components/plan/BrandMark';
import { PlanScreenContainer } from '@/components/plan/PlanScreenContainer';
import { SettingsSection } from './SettingsSection';
import type { SettingsViewModel } from './types';

type SettingsViewProps = {
  viewModel: SettingsViewModel;
};

/**
 * Locked Settings main screen, presentational only. No API calls, no auth
 * mutation, no entitlement decisions - every row's `onPress` is supplied by
 * settings.tsx, which owns real auth/profile state and all navigation.
 *
 * Bottom navigation is the real Expo Router tab bar (src/app/_layout.tsx) -
 * this component renders no navigation of its own.
 */
export function SettingsView({ viewModel }: SettingsViewProps) {
  return (
    <PlanScreenContainer>
      <View style={styles.header}>
        <BrandMark />
        <Text style={styles.title}>Settings</Text>
      </View>

      {viewModel.sections.map((section) => (
        <SettingsSection key={section.id} section={section} />
      ))}

      <View style={styles.actions}>
        <Text style={styles.heading}>ACCOUNT ACTIONS</Text>
        {viewModel.actions.map((action) => (
          <Pressable
            key={action.id}
            onPress={action.onPress}
            style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={action.label}>
            <Text style={[styles.actionLabel, action.destructive && styles.actionLabelDestructive]}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </PlanScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  title: { fontSize: 28, fontWeight: '700', color: BrandColors.ink },
  actions: { paddingTop: Spacing.four, paddingBottom: Spacing.four * 2 },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: BrandColors.inkMuted,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.one,
  },
  actionRow: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BrandColors.separator,
  },
  pressed: { opacity: 0.6 },
  actionLabel: { fontSize: 16, color: BrandColors.ink },
  actionLabelDestructive: { color: BrandColors.danger },
});
