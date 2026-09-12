import { Platform, StyleSheet, Text, View } from 'react-native';

import { BrandColors } from '@/constants/theme';

export function OnboardingScreenTitle({ title, body }: { title: string; body?: string }) {
  return (
    <View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const styles = StyleSheet.create({
  title: {
    color: BrandColors.foreground,
    fontFamily: serif,
    fontSize: 29,
    lineHeight: 36,
  },
  body: {
    marginTop: 10,
    color: BrandColors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
});
