/**
 * Purpose: Shopping Cart React Context provider for Ladha customer application.
 * Responsibilities: Manages customer cart state (adding, removing, quantity adjustments, clearing cart, total price calculation).
 * Dependencies: React createContext, useContext, useState, useEffect.
 * When to modify: When adding discounts, item notes, or altering cart calculation logic.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { apiGet, apiPut } from "../lib/api";
import { useCustomerAuth } from "./CustomerAuthContext";

export interface CartItem {
  id: string; // Product ID
  name: string;
  price: number;
  imageUrl: string;
  quantity: number;
  hotelId?: string;
  hotelName?: string;
  stockQty?: number;
  available: boolean; // false if item went out of stock while in cart
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: { id: string; name: string; price: number; imageUrl: string; hotelId?: string; hotelName?: string; stockQty?: number }) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  markItemAvailability: (productId: string, available: boolean) => void;
  updateItemSnapshot: (productId: string, snapshot: { available?: boolean; stockQty?: number; price?: number; name?: string; imageUrl?: string }) => void;
  totalCount: number;
  totalAmount: number;
  unavailableCount: number;
  closedHotelIds: string[];
  setClosedHotelIds: React.Dispatch<React.SetStateAction<string[]>>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isLoggedIn, customer } = useCustomerAuth();
  const [closedHotelIds, setClosedHotelIds] = useState<string[]>([]);
  const [remoteCartReady, setRemoteCartReady] = useState(false);
  const lastCustomerId = useRef<string | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("ladha_cart");
      const parsed: CartItem[] = saved ? JSON.parse(saved) : [];
      return parsed.map((item) => ({ ...item, available: item.available ?? true }));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("ladha_cart", JSON.stringify(cart));
  }, [cart]);

  // On sign-in, merge the device cart into the customer's durable cart. This
  // keeps an item added before login and lets another device resume the same
  // cart. Server product data is authoritative for price and availability.
  useEffect(() => {
    if (!isLoggedIn || !token || !customer?.id) {
      setRemoteCartReady(false);
      lastCustomerId.current = null;
      return;
    }
    if (lastCustomerId.current === customer.id) return;
    lastCustomerId.current = customer.id;
    setRemoteCartReady(false);
    void apiGet<CartItem[]>("/customers/me/cart", token).then(async (result) => {
      const remote = result.success && result.data ? result.data : [];
      setCart((local) => {
        const merged = new Map(remote.map((item) => [item.id, item]));
        for (const item of local) {
          if (!merged.has(item.id)) {
            merged.set(item.id, item);
          }
        }
        return [...merged.values()];
      });
      setRemoteCartReady(true);
    });
  }, [isLoggedIn, token, customer?.id]);

  useEffect(() => {
    if (!isLoggedIn || !token || !remoteCartReady) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      void apiPut("/customers/me/cart", { items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }, token);
    }, 350);
    return () => { if (syncTimer.current) clearTimeout(syncTimer.current); };
  }, [cart, isLoggedIn, token, remoteCartReady]);

  useEffect(() => {
    const handleCustomerLogout = () => setCart([]);
    window.addEventListener("ladha:customer-logout", handleCustomerLogout);
    return () => window.removeEventListener("ladha:customer-logout", handleCustomerLogout);
  }, []);

  const addToCart = (product: { id: string; name: string; price: number; imageUrl: string; hotelId?: string; hotelName?: string; stockQty?: number }) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === product.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        const existing = updated[existingIndex]!;
        updated[existingIndex] = {
          ...existing,
          quantity: Math.min(existing.quantity + 1, product.stockQty ?? Number.MAX_SAFE_INTEGER),
          stockQty: product.stockQty,
        };
        return updated;
      }
      return [...prev, { ...product, quantity: 1, available: true }];
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => item.id === productId
        ? { ...item, quantity: Math.min(Math.max(1, Math.floor(quantity)), item.stockQty ?? Number.MAX_SAFE_INTEGER) }
        : item)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const markItemAvailability = (productId: string, available: boolean) => {
    updateItemSnapshot(productId, { available });
  };

  const updateItemSnapshot = (productId: string, snapshot: { available?: boolean; stockQty?: number; price?: number; name?: string; imageUrl?: string }) => {
    setCart((prev) => prev.map((item) => (item.id === productId ? { ...item, ...snapshot } : item)));
  };

  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cart.reduce((sum, item) => sum + (item.available && !closedHotelIds.includes(item.hotelId ?? "") ? item.price * item.quantity : 0), 0);
  const unavailableCount = cart.filter((item) => !item.available || (item.stockQty !== undefined && item.quantity > item.stockQty)).length;

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        markItemAvailability,
        updateItemSnapshot,
        totalCount,
        totalAmount,
        unavailableCount,
        closedHotelIds,
        setClosedHotelIds,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
