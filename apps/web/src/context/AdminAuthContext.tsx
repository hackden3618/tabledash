import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { isJwtExpired, getJwtExpiry } from "../lib/jwt";
import { apiGet } from "../lib/api";

const STORAGE_KEY = "tableDash_token";

interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: string;
  hotelId: string | null;
}

interface AdminAuthContextValue {
  token: string;
  user: AdminUser | null;
  isLoggedIn: boolean;
  hydrating: boolean;
  login: (token: string, userData?: AdminUser) => void;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export const useAdminAuth = (): AdminAuthContextValue => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used inside <AdminAuthProvider>");
  return ctx;
};

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [user, setUser] = useState<AdminUser | null>(null);
  const [hydrating, setHydrating] = useState(() => Boolean(localStorage.getItem(STORAGE_KEY)));
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken("");
    setUser(null);
    setHydrating(false);
    if (expiryTimer.current) {
      clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }
    if (window.location.pathname === "/kitchen") {
      window.location.reload();
    }
  }, []);

  const login = useCallback((newToken: string, userData?: AdminUser) => {
    localStorage.setItem(STORAGE_KEY, newToken);
    setToken(newToken);
    if (userData) {
      setUser(userData);
    } else {
      apiGet<AdminUser>("/auth/me", newToken).then((res) => {
        if (res.success && res.data) {
          setUser(res.data);
        }
      });
    }
  }, []);

  // Hydrate profile on mount — only logout on explicit auth failure, not network errors
  useEffect(() => {
    if (!token) {
      setHydrating(false);
      return;
    }
    setHydrating(true);
    apiGet<AdminUser>("/auth/me", token).then((res) => {
      if (res.success && res.data) {
        setUser(res.data);
      } else if (res.error?.includes("Invalid") || res.error?.includes("expired")) {
        logout();
      }
      setHydrating(false);
    }).catch(() => {
      setHydrating(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check JWT expiry periodically
  useEffect(() => {
    if (!token) return;

    const checkExpiry = () => {
      if (isJwtExpired(token)) {
        logout();
        return;
      }
      const expiryMs = getJwtExpiry(token);
      if (expiryMs) {
        const timeLeft = expiryMs - Date.now();
        if (timeLeft <= 0) {
          logout();
        } else {
          expiryTimer.current = setTimeout(checkExpiry, Math.min(timeLeft, 60000));
        }
      }
    };

    checkExpiry();

    return () => {
      if (expiryTimer.current) {
        clearTimeout(expiryTimer.current);
        expiryTimer.current = null;
      }
    };
  }, [token, logout]);

  return (
    <AdminAuthContext.Provider value={{ token, user, isLoggedIn: Boolean(token && user), hydrating, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
};
