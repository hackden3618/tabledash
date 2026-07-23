/**
 * Purpose: Customer Authentication Context for tableDash.
 * Responsibilities: Manages logged-in customer state, persists session token in localStorage,
 *   and hydrates the profile from /customers/me on app startup.
 * Dependencies: React context, apiGet, apiPost helpers.
 * When to modify: When extending customer profile fields or changing token storage.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import type { CustomerProfileData } from "../../../../shared/types";

const STORAGE_KEY = "tableDash_customer_token";

interface CustomerAuthContextValue {
  customer: CustomerProfileData | null;
  token: string;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (phone: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  register: (firstName: string, phone: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

export const useCustomerAuth = (): CustomerAuthContextValue => {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth must be used inside <CustomerAuthProvider>");
  return ctx;
};

export const CustomerAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [customer, setCustomer] = useState<CustomerProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async (tok: string) => {
    if (!tok) { setIsLoading(false); return; }
    const res = await apiGet<CustomerProfileData>("/customers/me", tok);
    if (res.success && res.data) {
      setCustomer(res.data);
    } else {
      // Token is invalid / expired — clear it
      localStorage.removeItem(STORAGE_KEY);
      setToken("");
      setCustomer(null);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchProfile(token);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshProfile = useCallback(async () => {
    await fetchProfile(token);
  }, [token, fetchProfile]);

  const login = useCallback(async (phone: string, pin: string) => {
    const res = await apiPost<{ token: string; customer: CustomerProfileData }>(
      "/customers/login",
      { phone, pin }
    );
    if (res.success && res.data) {
      const { token: newToken, customer: profile } = res.data;
      localStorage.setItem(STORAGE_KEY, newToken);
      setToken(newToken);
      setCustomer(profile);
      return { success: true };
    }
    return { success: false, error: res.error ?? "Login failed" };
  }, []);

  const register = useCallback(async (firstName: string, phone: string, pin: string) => {
    const res = await apiPost<{ token: string; customer: CustomerProfileData }>(
      "/customers/register",
      { firstName, phone, pin }
    );
    if (res.success && res.data) {
      const { token: newToken, customer: profile } = res.data;
      localStorage.setItem(STORAGE_KEY, newToken);
      setToken(newToken);
      setCustomer(profile);
      return { success: true };
    }
    return { success: false, error: res.error ?? "Registration failed" };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken("");
    setCustomer(null);
  }, []);

  return (
    <CustomerAuthContext.Provider
      value={{ customer, token, isLoggedIn: Boolean(customer), isLoading, login, register, logout, refreshProfile }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
};
