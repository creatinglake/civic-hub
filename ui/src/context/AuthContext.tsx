import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import {
  type AuthUser,
  type AuthRole,
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
  /**
   * Elevated role derived server-side from CIVIC_ADMIN_EMAILS /
   * CIVIC_BOARD_EMAILS. null for residents without special privileges.
   * Admins can do everything Board members can plus admin-panel access.
   */
  role: AuthRole;
  /** Convenience: true when role is "admin". */
  isAdmin: boolean;
  /** Convenience: true when role is "admin" OR "board". */
  canPostAnnouncements: boolean;
  /** Login with a token and user from the verify step */
  login: (token: string, user: AuthUser, role?: AuthRole) => void;
  /** Update user after residency affirmation */
  updateUser: (user: AuthUser) => void;
  /** Logout and clear session */
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<AuthRole>(null);
  const [loading, setLoading] = useState(true);

  // Try to restore session from localStorage on mount
  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      getMe(stored)
        .then(({ user: u, role: r }) => {
          setUser(u);
          setRole(r ?? null);
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

  const login = useCallback(
    (newToken: string, newUser: AuthUser, newRole: AuthRole = null) => {
      storeToken(newToken);
      setToken(newToken);
      setUser(newUser);
      setRole(newRole);
    },
    [],
  );

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
    setRole(null);
  }, [token]);

  const actorId = user?.id ?? null;
  const canParticipate = !!user && user.email_verified && user.is_resident;
  const isAdmin = role === "admin";
  const canPostAnnouncements = role === "admin" || role === "board";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        actorId,
        canParticipate,
        role,
        isAdmin,
        canPostAnnouncements,
        login,
        updateUser,
        logout,
      }}
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
