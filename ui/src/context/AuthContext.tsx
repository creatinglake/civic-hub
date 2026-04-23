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
   * Permission role derived server-side. "admin" = full admin panel.
   * "author" = authorized to post announcements. null = resident.
   */
  role: AuthRole;
  /**
   * Free-form display label for the author's announcements — "Admin",
   * "Board member", "Planning Committee", etc. Comes from the admin's
   * configured author list for non-admins, always "Admin" for admins,
   * null for residents. The UI uses this only for display hints; the
   * server stamps the authoritative label on each announcement at post
   * time.
   */
  authorLabel: string | null;
  /** Convenience: true when role is "admin". */
  isAdmin: boolean;
  /** Convenience: true when role is "admin" OR "author". */
  canPostAnnouncements: boolean;
  /** Login with a token and user from the verify step */
  login: (
    token: string,
    user: AuthUser,
    role?: AuthRole,
    authorLabel?: string | null,
  ) => void;
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
  const [authorLabel, setAuthorLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Try to restore session from localStorage on mount
  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      getMe(stored)
        .then(({ user: u, role: r, author_label }) => {
          setUser(u);
          setRole(r ?? null);
          setAuthorLabel(author_label ?? null);
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
    (
      newToken: string,
      newUser: AuthUser,
      newRole: AuthRole = null,
      newAuthorLabel: string | null = null,
    ) => {
      storeToken(newToken);
      setToken(newToken);
      setUser(newUser);
      setRole(newRole);
      setAuthorLabel(newAuthorLabel);
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
    setAuthorLabel(null);
  }, [token]);

  const actorId = user?.id ?? null;
  const canParticipate = !!user && user.email_verified && user.is_resident;
  const isAdmin = role === "admin";
  const canPostAnnouncements = role === "admin" || role === "author";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        actorId,
        canParticipate,
        role,
        authorLabel,
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
