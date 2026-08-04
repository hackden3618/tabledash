import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { isJwtExpired, getJwtExpiry } from "../lib/jwt";
import { apiGet, apiPost } from "../lib/api";

const STORAGE_KEY = "ladha_token";

interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: string;
  hotelId: string | null;
}

interface AdminHotelSummary {
  id: string;
  name: string;
  role: string;
}

interface AdminAuthContextValue {
  token: string;
  user: AdminUser | null;
  hotels: AdminHotelSummary[];
  isLoggedIn: boolean;
  hydrating: boolean;
  login: (token: string, userData?: AdminUser, hotels?: AdminHotelSummary[]) => void;
  logout: () => void;
  switchHotel: (hotelId: string) => Promise<void>;
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
  const [hotels, setHotels] = useState<AdminHotelSummary[]>([]);
  const [hydrating, setHydrating] = useState(() => Boolean(localStorage.getItem(STORAGE_KEY)));
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    localStorage.clear();
    setToken("");
    setUser(null);
    setHotels([]);
    setHydrating(false);
    if (expiryTimer.current) {
      clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }
    if (window.location.pathname === "/kitchen") {
      window.location.reload();
    }
  }, []);

  const login = useCallback((newToken: string, userData?: AdminUser, hotelList?: AdminHotelSummary[]) => {
    localStorage.setItem(STORAGE_KEY, newToken);
    setToken(newToken);
    if (hotelList) {
      setHotels(hotelList);
    }
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

  const switchHotel = useCallback(async (hotelId: string) => {
    if (!token) return;
    const res = await apiPost<{ token: string; user: AdminUser }>("/auth/switch-hotel", { hotelId }, token);
    if (!res.success || !res.data) {
      throw new Error(res.error || "Unable to switch hotel");
    }
    localStorage.setItem(STORAGE_KEY, res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    window.location.href = "/kitchen/orders";
  }, [token]);

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
    <AdminAuthContext.Provider value={{ token, user, hotels, isLoggedIn: Boolean(token && user), hydrating, login, logout, switchHotel }}>
      {children}
    </AdminAuthContext.Provider>
  );
};
