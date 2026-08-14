import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { isJwtExpired, getJwtExpiry } from "../lib/jwt";

const STORAGE_KEY = "ladha_platform_token";

interface PlatformMe {
  id: string;
  username: string;
  name: string;
  role: string;
}

interface PlatformAdminAuthContextValue {
  token: string;
  user: PlatformMe | null;
  isLoggedIn: boolean;
  login: (token: string, user: PlatformMe) => void;
  logout: () => void;
}

const PlatformAdminAuthContext = createContext<PlatformAdminAuthContextValue | null>(null);

export const usePlatformAdminAuth = (): PlatformAdminAuthContextValue => {
  const ctx = useContext(PlatformAdminAuthContext);
  if (!ctx) throw new Error("usePlatformAdminAuth must be used inside <PlatformAdminAuthProvider>");
  return ctx;
};

export const PlatformAdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [user, setUser] = useState<PlatformMe | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken("");
    setUser(null);
    if (expiryTimer.current) {
      clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }
    if (window.location.pathname === "/platform") {
      window.location.reload();
    }
  }, []);

  const login = useCallback((newToken: string, me: PlatformMe) => {
    localStorage.setItem(STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(me);
  }, []);

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
    <PlatformAdminAuthContext.Provider value={{ token, user, isLoggedIn: Boolean(token && user), login, logout }}>
      {children}
    </PlatformAdminAuthContext.Provider>
  );
};
