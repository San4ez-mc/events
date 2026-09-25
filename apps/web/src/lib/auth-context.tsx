"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { UserRole } from "@kiro/types";
import { api, refreshAccessToken, setAccessToken } from "./api-client";

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
  /** True only during the initial silent-refresh attempt on first load. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (input: { email: string; password: string; name?: string; nickname?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On first load, there's no access token in memory yet (a fresh page
  // load), but the httpOnly refresh cookie may still be valid — try to
  // silently mint a new access token from it before deciding "logged out".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Single-flighted (see api-client.ts) so React StrictMode's dev-only
        // double-effect-invocation can't race two refresh calls against the
        // one-time-use rotating token and trip theft detection.
        const token = await refreshAccessToken();
        if (cancelled || !token) return;
        const me = await api.GET("/api/v1/users/me");
        if (!cancelled && me.data) setUser(me.data as SessionUser);
      } catch {
        // No valid session — stay logged out, no error to surface.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client-Platform": "web" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    if (!res.ok) throw new ApiRequestError(body);
    setAccessToken(body.accessToken);
    setUser(body.user);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const res = await fetch("/api/v1/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client-Platform": "web" },
      credentials: "include",
      body: JSON.stringify({ idToken }),
    });
    const body = await res.json();
    if (!res.ok) throw new ApiRequestError(body);
    setAccessToken(body.accessToken);
    setUser(body.user);
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; name?: string; nickname?: string }) => {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Platform": "web" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new ApiRequestError(body);
      setAccessToken(body.accessToken);
      setUser(body.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      headers: { "X-Client-Platform": "web" },
      credentials: "include",
    }).catch(() => {
      // Best-effort — clear local state regardless of network failure.
    });
    setAccessToken(null);
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

/** Carries the API's {error:{code,message}} contract (§89) through to UI code. */
export class ApiRequestError extends Error {
  code: string;
  details?: Record<string, string[]>;

  constructor(body: { error?: { code?: string; message?: string; details?: Record<string, string[]> } }) {
    super(body.error?.message ?? "Request failed");
    this.code = body.error?.code ?? "INTERNAL_ERROR";
    this.details = body.error?.details;
  }
}
