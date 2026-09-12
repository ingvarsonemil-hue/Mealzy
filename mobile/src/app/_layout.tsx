import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { BrandColors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { OnboardingProvider } from '@/lib/onboarding-context';

const AUTH_ROUTES = ['/sign-in', '/sign-up', '/forgot-password'];
const ONBOARDING_ROUTES = [
  '/welcome',
  '/date-of-birth',
  '/under-13-eligibility',
  '/weekly-budget',
  '/dietary-restrictions',
  '/allergies',
  '/cuisine-preferences',
  '/cooking-preferences',
  '/review',
];
// Slice 3 — reached only once a session exists (account creation already
// happened on /sign-up). Unlike AUTH_ROUTES/ONBOARDING_ROUTES, an
// authenticated session on one of these must NOT be bounced to '/' — that
// would skip Verify Email / Create First Week entirely.
const POST_AUTH_ROUTES = ['/verify-email', '/create-first-week', '/free-week-used'];

function RootTabs() {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'loading') return;
    const onAuthRoute = AUTH_ROUTES.includes(pathname);
    const onOnboardingRoute = ONBOARDING_ROUTES.includes(pathname);
    const onPostAuthRoute = POST_AUTH_ROUTES.includes(pathname);

    if (status !== 'authenticated' && !onAuthRoute && !onOnboardingRoute) {
      // A post-auth route (Verify Email / Create First Week / Free Week Used)
      // with no session (e.g. the app was killed mid-flow) still needs to
      // send the user back to restart, same as any other route.
      router.replace('/welcome');
    } else if (status === 'authenticated' && (onAuthRoute || onOnboardingRoute) && !onPostAuthRoute) {
      router.replace('/');
    }
  }, [status, pathname, router]);

  const hideTabBar = status !== 'authenticated';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BrandColors.green,
        tabBarInactiveTintColor: BrandColors.muted,
        tabBarStyle: {
          backgroundColor: BrandColors.cream,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: BrandColors.hairline,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '500' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Plan' }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop' }} />
      <Tabs.Screen name="eat" options={{ title: 'Eat' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      <Tabs.Screen name="meal-detail" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="welcome" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="date-of-birth" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="under-13-eligibility" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="weekly-budget" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="dietary-restrictions" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="allergies" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="cuisine-preferences" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="cooking-preferences" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="review" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="verify-email" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="create-first-week" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="free-week-used" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen
        name="sign-in"
        options={{ href: null, tabBarStyle: hideTabBar ? { display: 'none' } : undefined }}
      />
      <Tabs.Screen
        name="sign-up"
        options={{ href: null, tabBarStyle: hideTabBar ? { display: 'none' } : undefined }}
      />
      <Tabs.Screen
        name="forgot-password"
        options={{ href: null, tabBarStyle: hideTabBar ? { display: 'none' } : undefined }}
      />
    </Tabs>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <OnboardingProvider>
        <RootTabs />
      </OnboardingProvider>
    </AuthProvider>
  );
}
