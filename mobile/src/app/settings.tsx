import { useCallback } from 'react';
import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { useAuth } from '@/lib/auth-context';
import { SettingsView } from '@/components/settings/SettingsView';
import type { SettingsViewModel } from '@/components/settings/types';

/**
 * Settings main screen. Owns navigation/orchestration and real auth state;
 * SettingsView is presentational only.
 *
 * Phase D audit findings (see the report for the full write-up):
 * - Subscription is the ONLY Planning/Account summary backed by a real,
 *   reliably-typed field: AuthUser.pro (server.js OutputShapes.UserWithProfile
 *   -> `pro: user.pro === 1`, a real boolean, not inferred).
 * - Weekly budget / dietary restrictions / allergies / meal preferences all
 *   live somewhere inside AuthUser.profile, which is explicitly documented
 *   (see auth-context.tsx) as a raw, unshaped passthrough of GET /api/auth/me's
 *   `profile` field - "never normalised or interpreted on the client". There
 *   is no typed contract for it at this endpoint, and the web onboarding
 *   flow's profile fields are known to use an inconsistent dual snake_case/
 *   camelCase convention. Parsing it here would mean guessing at an
 *   undocumented, possibly-inconsistent shape - exactly what this codebase's
 *   own architecture already avoids. These four summaries are omitted, not
 *   fabricated - see the Phase D report for what a real fix looks like.
 * - Profile/Subscription/Budget/Dietary restrictions/Allergies/Meal
 *   preferences/Notifications have no mobile subpages yet. Rather than add
 *   six-plus placeholder routes for a "main screen only" phase, these rows
 *   are isolated no-ops (reported explicitly), matching this codebase's
 *   established pattern for a not-yet-implemented action (e.g. Meal
 *   Detail's Swap button).
 * - Privacy/Terms/Help DO have real, live destinations (the actual
 *   website - server.js's CLEAN_URL_PAGES for /privacy, and the terms/
 *   support pages built alongside it), so those three open the real page in
 *   an in-app browser rather than going nowhere.
 */
export default function SettingsScreen() {
  const { user, signOutLocal, signOutEverywhere, deleteAccount } = useAuth();

  const notImplemented = useCallback(() => {
    // Isolated placeholder - no subpage exists yet for this row. See the
    // file header and the Phase D report for why.
  }, []);

  const openWeb = useCallback((path: string) => {
    void WebBrowser.openBrowserAsync(`https://mealzy.org${path}`);
  }, []);

  const handleLogOut = useCallback(() => {
    Alert.alert('Log out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void signOutLocal() },
    ]);
  }, [signOutLocal]);

  const handleLogOutEverywhere = useCallback(() => {
    Alert.alert("Log out everywhere?", "You'll be signed out of Mealzy on all your devices.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out everywhere', style: 'destructive', onPress: () => void signOutEverywhere() },
    ]);
  }, [signOutEverywhere]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete account',
      'Are you sure you want to delete your account? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const result = await deleteAccount();
              if (!result.ok) {
                Alert.alert('Could not delete account', result.message || 'Please try again.');
              }
              // On success, AuthProvider's status flips to 'unauthenticated'
              // and the root layout redirects to sign-in on its own - same
              // mechanism signOutLocal already relies on elsewhere.
            })();
          },
        },
      ],
    );
  }, [deleteAccount]);

  const viewModel: SettingsViewModel = {
    sections: [
      {
        id: 'account',
        title: 'ACCOUNT',
        rows: [
          { id: 'profile', label: 'Profile', onPress: notImplemented },
          {
            id: 'subscription',
            label: 'Subscription',
            summary: user ? (user.pro ? 'Pro' : 'Free') : undefined,
            onPress: notImplemented,
          },
        ],
      },
      {
        id: 'planning',
        title: 'PLANNING',
        rows: [
          // Weekly budget / dietary restrictions / allergies / meal
          // preferences: no summary - see the file header note on
          // AuthUser.profile.
          { id: 'budget', label: 'Weekly budget', onPress: notImplemented },
          { id: 'dietary', label: 'Dietary restrictions', onPress: notImplemented },
          { id: 'allergies', label: 'Allergies', onPress: notImplemented },
          { id: 'meal-preferences', label: 'Meal preferences', onPress: notImplemented },
        ],
      },
      {
        id: 'app',
        title: 'APP',
        rows: [
          { id: 'notifications', label: 'Notifications', onPress: notImplemented },
          { id: 'help', label: 'Help', onPress: () => openWeb('/contact') },
          { id: 'privacy', label: 'Privacy', onPress: () => openWeb('/privacy') },
          { id: 'terms', label: 'Terms', onPress: () => openWeb('/terms') },
        ],
      },
    ],
    actions: [
      { id: 'logout', label: 'Log out', onPress: handleLogOut },
      { id: 'logout-everywhere', label: 'Log out everywhere', onPress: handleLogOutEverywhere },
      { id: 'delete-account', label: 'Delete account', destructive: true, onPress: handleDeleteAccount },
    ],
  };

  return <SettingsView viewModel={viewModel} />;
}
