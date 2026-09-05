import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';

type PlanScreenContainerProps = {
  children: ReactNode;
  /** Pull-to-refresh, wired through to the ScrollView. Omit to disable it. */
  refreshing?: boolean;
  onRefresh?: () => void;
};

/**
 * Full-screen app container: warm cream background and one vertical scroll
 * for the main content. Bottom navigation is owned by Expo Router's tab bar
 * (see src/app/_layout.tsx), not this component.
 */
export function PlanScreenContainer({ children, refreshing, onRefresh }: PlanScreenContainerProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} /> : undefined
        }>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BrandColors.cream },
  scrollContent: { flexGrow: 1, paddingBottom: 8 },
});
