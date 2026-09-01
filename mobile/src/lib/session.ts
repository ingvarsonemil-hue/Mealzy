import * as SecureStore from 'expo-secure-store';

/**
 * The native session credential is a fixed 7-day JWT issued by
 * POST /api/auth/mobile/{signin,signup}. It is stored ONLY here, in the
 * device keychain / keystore via expo-secure-store. Never AsyncStorage,
 * never a plain file, never logged.
 */
const TOKEN_KEY = 'mealzy.session.jwt';

// Device-bound: the entry is readable only after the first unlock and is not
// migrated to a new device via backup/restore.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * Returns the stored JWT, or null when SecureStore reports the key is absent.
 * A genuine SecureStore read failure (keychain/keystore error, decryption
 * failure) is NOT swallowed - it propagates so the caller can tell "no
 * credential" apart from "could not read the credential".
 */
export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY, OPTIONS);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, OPTIONS);
}

/**
 * Deletes the stored JWT. Resolves on success (including when the key was
 * already absent). A genuine deletion failure rejects - callers must handle
 * it explicitly rather than assume the credential is gone.
 */
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY, OPTIONS);
}
