import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { UserRole } from "@kiro/types";
import { API_URL, getAccessToken, refreshAccessToken, setAccessToken } from "./api-client";
import { captureEvent, identifyUser } from "./product-analytics";
import { setStoredRefreshToken } from "./token-storage";

export interface SessionUser {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  name: string | null;
  nickname: string | null;
  role: UserRole;
  locale: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (input: { email: string; password: string; name?: string; nickname?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    identifyUser(user?.id ?? null);
  }, [user?.id]);
  const [isLoading, setIsLoading] = useState(true);

  // Same silent-restore idea as web's AuthProvider, just from SecureStore instead of an httpOnly cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await refreshAccessToken();
        if (cancelled || !token) return;
        const res = await fetch(`${API_URL}/api/v1/users/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!cancelled && res.ok) setUser(await res.json());
      } catch {
        // No valid session — stay logged out.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe = true) => {
    const res = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe }),
    });
    const body = await res.json();
    if (!res.ok) throw new ApiRequestError(body);
    setAccessToken(body.accessToken);
    // Without "remember me" the refresh token is not kept on the device: the session ends when the app is closed.
    await setStoredRefreshToken(rememberMe ? body.refreshToken : null);
    setUser(body.user);
    captureEvent("login", { method: "email" });
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const res = await fetch(`${API_URL}/api/v1/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const body = await res.json();
    if (!res.ok) throw new ApiRequestError(body);
    setAccessToken(body.accessToken);
    await setStoredRefreshToken(body.refreshToken);
    setUser(body.user);
    captureEvent("login", { method: "google" });
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; name?: string; nickname?: string }) => {
      const res = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new ApiRequestError(body);
      setAccessToken(body.accessToken);
      await setStoredRefreshToken(body.refreshToken);
      setUser(body.user);
      captureEvent("sign_up", { method: "email" });
    },
    [],
  );

  const logout = useCallback(async () => {
    const token = getAccessToken();
    await fetch(`${API_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).catch(() => {
      // Best-effort — clear local state regardless of network failure.
    });
    setAccessToken(null);
    await setStoredRefreshToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, loginWithGoogle, register, logout }),
    [user, isLoading, login, loginWithGoogle, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export class ApiRequestError extends Error {
  code: string;
  details?: Record<string, string[]>;

  constructor(body: { error?: { code?: string; message?: string; details?: Record<string, string[]> } } | null) {
    // A null body means the server's response wasn't valid JSON (e.g. a proxy's own HTML error
    // page for a request it rejected before the API ever saw it) — never crash on that, since an
    // uncaught error here stops this from being an ApiRequestError at all, hiding a specific error
    // (like FILE_TOO_LARGE) behind a generic "something went wrong".
    super(body?.error?.message ?? "Request failed");
    this.code = body?.error?.code ?? "INTERNAL_ERROR";
    this.details = body?.error?.details;
  }
}
