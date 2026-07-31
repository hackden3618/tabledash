/**
 * Purpose: Customer Authentication Context for Ladha.
 * Responsibilities: Manages logged-in customer state, persists session token in localStorage,
 *   and hydrates the profile from /customers/me on app startup.
 * Dependencies: React context, apiGet, apiPost helpers.
 * When to modify: When extending customer profile fields or changing token storage.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../lib/api";
import type { CustomerProfileData } from "../../../../shared/types";

const STORAGE_KEY = "ladha_customer_token";

interface CustomerAuthContextValue {
  customer: CustomerProfileData | null;
  token: string;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (phone: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  sendRegistrationOtp: (phone: string) => Promise<{ success: boolean; error?: string }>;
  register: (firstName: string, phone: string, pin: string, otp: string, lastName?: string, knownName?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: { firstName?: string; lastName?: string; phone?: string; knownName?: string | null }, pin?: string) => Promise<{ success: boolean; error?: string }>;
  changePhone: (newPhone: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  verifyPhoneChange: (otp: string) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  forgotPin: (phone: string) => Promise<{ success: boolean; error?: string }>;
  resetPin: (phone: string, otp: string, newPin: string) => Promise<{ success: boolean; error?: string }>;
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

  const sendRegistrationOtp = useCallback(async (phone: string) => {
    const res = await apiPost<{ message: string }>("/customers/send-registration-otp", { phone });
    if (res.success) return { success: true };
    return { success: false, error: res.error ?? "Failed to send verification code" };
  }, []);

  const register = useCallback(async (firstName: string, phone: string, pin: string, otp: string, lastName?: string, knownName?: string) => {
    const res = await apiPost<{ token: string; customer: CustomerProfileData }>(
      "/customers/register",
      { firstName, lastName, knownName, phone, pin, otp }
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
    localStorage.removeItem("ladha_cart");
    setToken("");
    setCustomer(null);
  }, []);

  const updateProfile = useCallback(async (data: { firstName?: string; lastName?: string; phone?: string; knownName?: string | null }, pin?: string) => {
    const res = await apiPatch<CustomerProfileData>("/customers/me", { ...data, pin }, token);
    if (res.success && res.data) {
      setCustomer(res.data);
      return { success: true };
    }
    return { success: false, error: res.error ?? "Failed to update profile" };
  }, [token]);

  const changePhone = useCallback(async (newPhone: string, pin: string) => {
    const res = await apiPost<{ message: string }>("/customers/me/change-phone", { newPhone, pin }, token);
    if (res.success) return { success: true };
    return { success: false, error: res.error ?? "Failed to start phone change" };
  }, [token]);

  const verifyPhoneChange = useCallback(async (otp: string) => {
    const res = await apiPost<{ message: string }>("/customers/me/change-phone/verify", { otp }, token);
    if (res.success) return { success: true };
    return { success: false, error: res.error ?? "Phone verification failed" };
  }, [token]);

  const deleteAccount = useCallback(async () => {
    const res = await apiDelete("/customers/me", token);
    if (res.success) {
      logout();
      return { success: true };
    }
    return { success: false, error: res.error ?? "Failed to delete account" };
  }, [token, logout]);

  const forgotPin = useCallback(async (phone: string) => {
    const res = await apiPost<{ message: string }>("/customers/forgot-pin", { phone });
    if (res.success) {
      return { success: true };
    }
    return { success: false, error: res.error ?? "Failed to send reset code" };
  }, []);

  const resetPin = useCallback(async (phone: string, otp: string, newPin: string) => {
    const res = await apiPost<{ message: string }>("/customers/reset-pin", { phone, otp, newPin });
    if (res.success) {
      return { success: true };
    }
    return { success: false, error: res.error ?? "Failed to reset PIN" };
  }, []);

  return (
    <CustomerAuthContext.Provider
      value={{
        customer, token, isLoggedIn: Boolean(customer), isLoading,
        login, register, sendRegistrationOtp, logout, refreshProfile,
        updateProfile, changePhone, verifyPhoneChange, deleteAccount, forgotPin, resetPin,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
};
