import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import {
  type AuthUser,
  getStoredToken,
  storeToken,
  clearToken,
  getMe,
  logoutApi,
} from "../services/auth";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  /** The user's actor ID for API calls (e.g., "user_abc123" or null) */
  actorId: string | null;
  /** Whether the user is fully ready to participate (authenticated + resident) */
  canParticipate: boolean;
  /** Login with a token and user from the verify step */
  login: (token: string, user: AuthUser) => void;
  /** Update user after residency affirmation */
  updateUser: (user: AuthUser) => void;
  /** Logout and clear session */
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Try to restore session from localStorage on mount
  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      getMe(stored)
        .then(({ user: u }) => {
          setUser(u);
          setToken(stored);
        })
        .catch(() => {
          // Invalid/expired token — clear it
          clearToken();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    storeToken(newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const updateUser = useCallback((updatedUser: AuthUser) => {
    setUser(updatedUser);
  }, []);

  const logout = useCallback(() => {
    if (token) {
      logoutApi(token).catch(() => {});
    }
    clearToken();
    setToken(null);
    setUser(null);
  }, [token]);

  const actorId = user?.id ?? null;
  const canParticipate = !!user && user.email_verified && user.is_resident;

  return (
    <AuthContext.Provider
      value={{ user, token, loading, actorId, canParticipate, login, updateUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
