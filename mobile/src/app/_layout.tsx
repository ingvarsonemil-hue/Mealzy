import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { BrandColors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth-context';

const AUTH_ROUTES = ['/sign-in', '/sign-up'];

function RootTabs() {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'loading') return;
    const onAuthRoute = AUTH_ROUTES.includes(pathname);
    // 'unauthenticated' and 'error' both belong on the auth screens; only
    // 'authenticated' belongs in the tabs. The guard only fires when the
    // current route is on the wrong side, so it cannot loop.
    if (status !== 'authenticated' && !onAuthRoute) {
      router.replace('/sign-in');
    } else if (status === 'authenticated' && onAuthRoute) {
      router.replace('/');
    }
  }, [status, pathname, router]);

  const hideTabBar = status !== 'authenticated';

  return (
    <Tabs
      screenOptions={{
        // Screens render their own locked-design header; the native one
        // would double up with it.
        headerShown: false,
        tabBarActiveTintColor: BrandColors.green,
        tabBarInactiveTintColor: BrandColors.inkMuted,
        tabBarStyle: {
          backgroundColor: BrandColors.cream,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: BrandColors.separator,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '500' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Plan' }} />
      <Tabs.Screen name="shop" options={{ title: 'Groceries' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      {/* Not part of the locked 3-tab shell (Plan / Groceries / Settings).
          Kept navigable but hidden rather than deleted - unrelated
          functionality, not this task's call to remove. */}
      <Tabs.Screen name="eat" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen
        name="sign-in"
        options={{ href: null, tabBarStyle: hideTabBar ? { display: 'none' } : undefined }}
      />
      <Tabs.Screen
        name="sign-up"
        options={{ href: null, tabBarStyle: hideTabBar ? { display: 'none' } : undefined }}
      />
    </Tabs>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootTabs />
    </AuthProvider>
  );
}
