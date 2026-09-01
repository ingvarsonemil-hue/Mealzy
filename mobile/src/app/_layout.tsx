import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

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
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: 'Plan' }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop' }} />
      <Tabs.Screen name="eat" options={{ title: 'Eat' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      <Tabs.Screen
        name="sign-in"
        options={{ href: null, headerShown: false, tabBarStyle: hideTabBar ? { display: 'none' } : undefined }}
      />
      <Tabs.Screen
        name="sign-up"
        options={{ href: null, headerShown: false, tabBarStyle: hideTabBar ? { display: 'none' } : undefined }}
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
