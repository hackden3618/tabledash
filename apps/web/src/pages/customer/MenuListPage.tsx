/**
 * Purpose: Customer Menu View for tableDash ("Wambu's Corner Hotel").
 * Responsibilities: Renders daily menu items with live stock badges, separates out-of-stock items
 *   into a dedicated section, listens for real-time WebSocket menu and hotel status updates,
 *   and displays hotel closed notices.
 * Dependencies: React, useCart context, useCustomerAuth context, useWebSocket hook, apiGet helper.
 * When to modify: When updating menu card design, category filters, or cart bar layout.
 */

import React, { useEffect, useState } from "react";
import { useCart } from "../../context/CartContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { apiGet } from "../../lib/api";
import { useWebSocket } from "../../lib/websocket";
import { ShoppingBag, Utensils, X, UserCircle2, AlertTriangle, Moon } from "lucide-react";

export interface ProductItem {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  price: number;
  available: boolean;
  stockQty: number;
}

interface MenuListPageProps {
  onNavigateToCart: () => void;
  onNavigateToAccount: () => void;
}

export const MenuListPage: React.FC<MenuListPageProps> = ({
  onNavigateToCart,
  onNavigateToAccount,
}) => {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [hotelIsOpen, setHotelIsOpen] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { cart, addToCart, updateQuantity, totalCount, totalAmount } = useCart();
  const { isLoggedIn, customer } = useCustomerAuth();

  const fetchMenuAndSettings = async () => {
    setLoading(true);
    const [menuRes, settingsRes] = await Promise.all([
      apiGet<ProductItem[]>("/menu"),
      apiGet<{ hotelIsOpen?: boolean }>("/settings"),
    ]);

    if (menuRes.success && menuRes.data) {
      setProducts(menuRes.data);
    }
    if (settingsRes.success && settingsRes.data?.hotelIsOpen !== undefined) {
      setHotelIsOpen(settingsRes.data.hotelIsOpen);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMenuAndSettings();
  }, []);

  // Listen for real-time WebSocket menu stock updates & hotel open/closed changes
  useWebSocket("customer", undefined, (event) => {
    if (event.type === "MENU_AVAILABILITY_UPDATED") {
      const updated = event.payload as ProductItem;
      setProducts((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      );
    } else if (event.type === "HOTEL_STATUS_UPDATED") {
      const status = event.payload as { isOpen: boolean };
      setHotelIsOpen(status.isOpen);
    }
  });

  const [persuasionShown, setPersuasionShown] = useState(false);

  const getQuantityInCart = (productId: string) => {
    const item = cart.find((c) => c.id === productId);
    return item ? item.quantity : 0;
  };

  const handleAddToCart = (item: ProductItem) => {
    if (!hotelIsOpen) return;
    addToCart({ id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl });
    if (!isLoggedIn && !persuasionShown) {
      setPersuasionShown(true);
      setShowLoginModal(true);
    }
  };

  const getStockBadge = (item: ProductItem) => {
    if (!item.available || item.stockQty === 0) return null;
    if (item.stockQty <= 2) {
      return { text: `Only ${item.stockQty} left!`, color: "#DC2626", bg: "#FEE2E2" };
    }
    if (item.stockQty <= 5) {
      return { text: `${item.stockQty} left`, color: "#D97706", bg: "#FEF3C7" };
    }
    return { text: `${item.stockQty} left`, color: "#15803D", bg: "#DCFCE7" };
  };

  const availableProducts = products.filter((p) => p.available && p.stockQty > 0);
  const outOfStockProducts = products.filter((p) => !p.available || p.stockQty <= 0);

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Utensils size={22} color="white" />
          <div className="header-title">Wambu's Corner Hotel</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={onNavigateToAccount}
            title={isLoggedIn ? `Hi, ${customer?.firstName}` : "Sign in"}
            style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex", alignItems: "center", position: "relative" }}
          >
            <UserCircle2 size={22} />
            {isLoggedIn && (
              <span style={{ position: "absolute", top: "-3px", right: "-4px", width: "9px", height: "9px", borderRadius: "50%", background: "#22C55E", border: "1.5px solid #1E4D36" }} />
            )}
          </button>

          <button
            onClick={onNavigateToCart}
            style={{ background: "none", border: "none", color: "white", display: "flex", alignItems: "center", position: "relative", cursor: "pointer" }}
          >
            <ShoppingBag size={22} />
            {totalCount > 0 && (
              <span style={{ position: "absolute", top: "-4px", right: "-8px", background: "#22C55E", color: "white", borderRadius: "50%", fontSize: "11px", fontWeight: 700, width: "18px", height: "18px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {totalCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ padding: "20px" }}>
        {/* Hotel Closed Banner */}
        {!hotelIsOpen && (
          <div
            style={{
              background: "#FFF3C4",
              border: "1.5px solid #F59E0B",
              borderRadius: "14px",
              padding: "14px 16px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <Moon size={24} color="#D97706" />
            <div>
              <div style={{ fontWeight: 800, color: "#92400E", fontSize: "0.95rem" }}>
                Wambu's Corner Hotel is Closed
              </div>
              <div style={{ fontSize: "0.8rem", color: "#B45309", marginTop: "2px" }}>
                We are currently closed for new orders. Please check back later!
              </div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1E4D36" }}>Today's Menu</h1>
          <p style={{ fontSize: "0.875rem", color: "#6B7280" }}>
            Freshly prepared meals ready for fast delivery to your stall.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>
            Loading freshly prepared menu...
          </div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>
            No menu items available right now. Please check back shortly!
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Available Items List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {availableProducts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: "#6B7280" }}>
                  All items are currently out of stock for today.
                </div>
              ) : (
                availableProducts.map((item) => {
                  const qty = getQuantityInCart(item.id);
                  const badge = getStockBadge(item);
                  const maxQty = item.stockQty;

                  return (
                    <div
                      key={item.id}
                      className="card"
                      style={{ display: "flex", gap: "14px", alignItems: "center" }}
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        style={{ width: "80px", height: "80px", borderRadius: "12px", objectFit: "cover", flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "#1F2937" }}>{item.name}</h3>
                        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1E4D36", marginTop: "4px" }}>
                          KSh {item.price}
                        </div>

                        {badge && (
                          <div style={{ marginTop: "4px" }}>
                            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: badge.color, background: badge.bg, padding: "2px 8px", borderRadius: "20px" }}>
                              {badge.text}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Quantity controls */}
                      <div style={{ flexShrink: 0 }}>
                        {qty === 0 ? (
                          <button
                            onClick={() => handleAddToCart(item)}
                            disabled={!hotelIsOpen}
                            style={{
                              border: "1px solid #1E4D36",
                              background: hotelIsOpen ? "#EBF4F0" : "#F3F4F6",
                              color: hotelIsOpen ? "#1E4D36" : "#9CA3AF",
                              padding: "8px 14px",
                              borderRadius: "8px",
                              fontWeight: 700,
                              cursor: hotelIsOpen ? "pointer" : "not-allowed",
                            }}
                          >
                            + Add
                          </button>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#EBF4F0", padding: "4px 8px", borderRadius: "8px", border: "1px solid #1E4D36" }}>
                            <button
                              onClick={() => updateQuantity(item.id, qty - 1)}
                              style={{ border: "none", background: "none", fontWeight: 700, fontSize: "1.1rem", color: "#1E4D36", cursor: "pointer", padding: "0 4px" }}
                            >
                              −
                            </button>
                            <span style={{ fontWeight: 700, minWidth: "16px", textAlign: "center" }}>{qty}</span>
                            <button
                              onClick={() => updateQuantity(item.id, Math.min(qty + 1, maxQty))}
                              disabled={qty >= maxQty || !hotelIsOpen}
                              style={{ border: "none", background: "none", fontWeight: 700, fontSize: "1.1rem", color: qty >= maxQty ? "#D1D5DB" : "#1E4D36", cursor: qty >= maxQty ? "not-allowed" : "pointer", padding: "0 4px" }}
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Separate Out-of-Stock / Unavailable Section */}
            {outOfStockProducts.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", borderTop: "1px solid #F3F4F6", paddingTop: "16px" }}>
                  <AlertTriangle size={18} color="#9CA3AF" />
                  <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#6B7280" }}>
                    Currently Out of Stock / Sold Out
                  </h2>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {outOfStockProducts.map((item) => (
                    <div
                      key={item.id}
                      className="card"
                      style={{
                        display: "flex",
                        gap: "14px",
                        alignItems: "center",
                        opacity: 0.55,
                        background: "#FAFAFA",
                        border: "1.5px dashed #D1D5DB",
                      }}
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        style={{ width: "60px", height: "60px", borderRadius: "10px", objectFit: "cover", flexShrink: 0, filter: "grayscale(60%)" }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "#4B5563" }}>{item.name}</h3>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#6B7280", marginTop: "2px" }}>
                          KSh {item.price}
                        </div>
                      </div>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#DC2626", background: "#FEE2E2", padding: "4px 10px", borderRadius: "8px", textTransform: "uppercase" }}>
                        Sold Out
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky Bottom Cart Bar */}
      {totalCount > 0 && (
        <div className="sticky-bottom-bar">
          <button
            onClick={onNavigateToCart}
            disabled={!hotelIsOpen}
            className="btn btn-primary"
            style={{ opacity: hotelIsOpen ? 1 : 0.6 }}
          >
            {hotelIsOpen ? `View Cart ( KSh ${totalAmount} )` : "Hotel Closed"}
          </button>
        </div>
      )}

      {/* Login Persuasion Modal */}
      {showLoginModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: "20px 20px 0 0", padding: "28px 24px", width: "100%", maxWidth: "480px", animation: "slideUp 0.3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "#EBF4F0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <UserCircle2 size={24} color="#1E4D36" />
              </div>
              <button onClick={() => setShowLoginModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}>
                <X size={22} />
              </button>
            </div>

            <h3 style={{ fontWeight: 700, fontSize: "1.1rem", color: "#1F2937", marginBottom: "8px" }}>
              Save your stall location 📍
            </h3>
            <p style={{ fontSize: "0.875rem", color: "#6B7280", lineHeight: 1.6, marginBottom: "20px" }}>
              Sign in so your delivery address is pre-filled every time. Track all your past orders too — it only takes 30 seconds!
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={() => { setShowLoginModal(false); onNavigateToAccount(); }}
                className="btn btn-primary"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                <UserCircle2 size={18} /> Sign In / Create Account
              </button>
              <button
                onClick={() => setShowLoginModal(false)}
                style={{ background: "none", border: "none", color: "#9CA3AF", fontSize: "0.875rem", cursor: "pointer", padding: "8px" }}
              >
                Continue without account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
