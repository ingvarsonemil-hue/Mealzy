import { StyleSheet, Text, View } from 'react-native';

import { BrandColors, Spacing } from '@/constants/theme';
import { SettingsRow } from './SettingsRow';
import type { SettingsSectionViewModel } from './types';

type SettingsSectionProps = {
  section: SettingsSectionViewModel;
};

/** One settings section: a restrained heading, then its rows. */
export function SettingsSection({ section }: SettingsSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{section.title}</Text>
      {section.rows.map((row, i) => (
        <SettingsRow key={row.id} row={row} isFirst={i === 0} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: Spacing.four },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: BrandColors.muted,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.one,
  },
});
