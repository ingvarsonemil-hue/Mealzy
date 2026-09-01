import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { apiFetch, resetSessionInvalidated, setUnauthorizedHandler } from './api';
import { clearToken, getToken, setToken } from './session';

export type AuthUser = {
  id: string;
  name?: string;
  email: string;
  pro: boolean;
  email_verified?: boolean;
};

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

/**
 * - connection: server unreachable / 5xx. The stored credential (if any) is
 *   kept; retry() re-attempts.
 * - local: SecureStore itself failed. On a read failure nothing is deleted and
 *   we do NOT claim the user is signed out; retry() re-attempts. On a delete
 *   failure the session is still dropped for safety, with this as an advisory.
 */
type AuthErrorKind = 'connection' | 'local';
type AuthError = { kind: AuthErrorKind; message: string };

type ActionResult = { ok: boolean; message?: string };

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  error: AuthError | null;
  signIn: (email: string, password: string) => Promise<ActionResult>;
  signUp: (name: string, email: string, password: string) => Promise<ActionResult>;
  signOutLocal: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  retry: () => Promise<void>;
};

const OFFLINE_MESSAGE = 'Could not reach Mealzy. Check your connection and try again.';
const LOCAL_READ_MESSAGE = 'Could not read your saved session on this device. Try again.';
const LOCAL_CLEANUP_MESSAGE =
  'Signed out. Your saved session may not have been fully cleared from this device.';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const bootstrapped = useRef(false);

  // GET /api/auth/me and adopt the result.
  const hydrate = useCallback(async (): Promise<void> => {
    const res = await apiFetch<AuthUser>('/api/auth/me');
    if (res.status === 200 && res.data) {
      setUser(res.data);
      setError(null);
      setStatus('authenticated');
      return;
    }
    if (res.status === 401) {
      // apiFetch already invalidated the session and attempted deletion.
      setUser(null);
      setStatus('unauthenticated');
      return;
    }
    // Server reachable but unhappy (5xx / unexpected). Not a credential problem.
    setUser(null);
    setError({ kind: 'connection', message: OFFLINE_MESSAGE });
    setStatus('error');
  }, []);

  const bootstrap = useCallback(async () => {
    setStatus('loading');
    setError(null);

    let token: string | null;
    try {
      token = await getToken();
    } catch {
      // SecureStore read failure: do NOT pretend there is no credential.
      setUser(null);
      setError({ kind: 'local', message: LOCAL_READ_MESSAGE });
      setStatus('error');
      return;
    }

    if (!token) {
      setUser(null);
      setError(null);
      setStatus('unauthenticated');
      return;
    }

    try {
      await hydrate();
    } catch {
      // fetch rejected -> offline. Keep the token; offer retry.
      setUser(null);
      setError({ kind: 'connection', message: OFFLINE_MESSAGE });
      setStatus('error');
    }
  }, [hydrate]);

  useEffect(() => {
    setUnauthorizedHandler((cleanupFailed) => {
      setUser(null);
      setError(cleanupFailed ? { kind: 'local', message: LOCAL_CLEANUP_MESSAGE } : null);
      setStatus('unauthenticated');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void bootstrap();
  }, [bootstrap]);

  const completeSignIn = useCallback(
    async (token: string): Promise<ActionResult> => {
      try {
        await setToken(token);
      } catch {
        return { ok: false, message: LOCAL_READ_MESSAGE };
      }
      resetSessionInvalidated();
      try {
        await hydrate();
      } catch {
        setUser(null);
        setError({ kind: 'connection', message: OFFLINE_MESSAGE });
        setStatus('error');
        return { ok: false, message: OFFLINE_MESSAGE };
      }
      return { ok: true };
    },
    [hydrate],
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<ActionResult> => {
      setError(null);
      let res;
      try {
        res = await apiFetch<{ token?: string; message?: string }>('/api/auth/mobile/signin', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
      } catch {
        return { ok: false, message: OFFLINE_MESSAGE };
      }
      if (res.status === 200 && res.data?.token) return completeSignIn(res.data.token);
      if (res.status >= 500) return { ok: false, message: OFFLINE_MESSAGE };
      return { ok: false, message: res.data?.message || 'Email or password is incorrect.' };
    },
    [completeSignIn],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string): Promise<ActionResult> => {
      setError(null);
      let res;
      try {
        res = await apiFetch<{ token?: string; success?: boolean; message?: string }>(
          '/api/auth/mobile/signup',
          { method: 'POST', body: JSON.stringify({ name, email, password }) },
        );
      } catch {
        return { ok: false, message: OFFLINE_MESSAGE };
      }
      if (res.status === 200 && res.data?.token) return completeSignIn(res.data.token);
      if (res.status === 200 && res.data?.success && !res.data?.token) {
        // Enumeration-safe existing-account response: no token, stay signed out.
        return { ok: false, message: res.data.message };
      }
      if (res.status >= 500) return { ok: false, message: OFFLINE_MESSAGE };
      return { ok: false, message: res.data?.message || 'Could not create your account.' };
    },
    [completeSignIn],
  );

  const signOutLocal = useCallback(async () => {
    let cleanupFailed = false;
    try {
      await clearToken();
    } catch {
      cleanupFailed = true;
    }
    setUser(null);
    setError(cleanupFailed ? { kind: 'local', message: LOCAL_CLEANUP_MESSAGE } : null);
    setStatus('unauthenticated');
  }, []);

  const signOutEverywhere = useCallback(async () => {
    try {
      await apiFetch('/api/auth/signout-all', { method: 'POST' });
    } catch {
      // best effort; the local credential is dropped regardless
    }
    await signOutLocal();
  }, [signOutLocal]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      signIn,
      signUp,
      signOutLocal,
      signOutEverywhere,
      retry: bootstrap,
    }),
    [status, user, error, signIn, signUp, signOutLocal, signOutEverywhere, bootstrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
