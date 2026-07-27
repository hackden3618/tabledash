/**
 * Purpose: Shopping Cart React Context provider for tableDash customer application.
 * Responsibilities: Manages customer cart state (adding, removing, quantity adjustments, clearing cart, total price calculation).
 * Dependencies: React createContext, useContext, useState, useEffect.
 * When to modify: When adding discounts, item notes, or altering cart calculation logic.
 */

import React, { createContext, useContext, useEffect, useState } from "react";

export interface CartItem {
  id: string; // Product ID
  name: string;
  price: number;
  imageUrl: string;
  quantity: number;
  hotelId?: string;
  hotelName?: string;
  available: boolean; // false if item went out of stock while in cart
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: { id: string; name: string; price: number; imageUrl: string; hotelId?: string; hotelName?: string }) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  markItemAvailability: (productId: string, available: boolean) => void;
  totalCount: number;
  totalAmount: number;
  unavailableCount: number;
  closedHotelIds: string[];
  setClosedHotelIds: React.Dispatch<React.SetStateAction<string[]>>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [closedHotelIds, setClosedHotelIds] = useState<string[]>([]);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("tableDash_cart");
      const parsed: CartItem[] = saved ? JSON.parse(saved) : [];
      return parsed.map((item) => ({ ...item, available: item.available ?? true }));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("tableDash_cart", JSON.stringify(cart));
  }, [cart]);

  const addToCart = (product: { id: string; name: string; price: number; imageUrl: string; hotelId?: string; hotelName?: string }) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === product.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        const existing = updated[existingIndex]!;
        updated[existingIndex] = {
          ...existing,
          quantity: existing.quantity + 1,
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
      prev.map((item) => (item.id === productId ? { ...item, quantity } : item))
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const markItemAvailability = (productId: string, available: boolean) => {
    setCart((prev) =>
      prev.map((item) => (item.id === productId ? { ...item, available } : item))
    );
  };

  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const unavailableCount = cart.filter((item) => !item.available).length;

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        markItemAvailability,
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
