import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { UserRole } from "@kiro/types";
import { API_URL, getAccessToken, refreshAccessToken, setAccessToken } from "./api-client";
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
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name?: string; nickname?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
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

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    if (!res.ok) throw new ApiRequestError(body);
    setAccessToken(body.accessToken);
    await setStoredRefreshToken(body.refreshToken);
    setUser(body.user);
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

  const value = useMemo(() => ({ user, isLoading, login, register, logout }), [user, isLoading, login, register, logout]);

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

  constructor(body: { error?: { code?: string; message?: string; details?: Record<string, string[]> } }) {
    super(body.error?.message ?? "Request failed");
    this.code = body.error?.code ?? "INTERNAL_ERROR";
    this.details = body.error?.details;
  }
}
