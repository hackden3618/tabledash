/**
 * Purpose: Customer Menu View for tableDash ("Mama's Hotel").
 * Responsibilities: Renders daily menu items with live stock badges, handles quantity selection
 *   capped to available stock, shows a login-persuasion modal for non-logged-in customers,
 *   and connects real-time WebSocket menu updates.
 * Dependencies: React, useCart context, useCustomerAuth context, apiGet helper.
 * When to modify: When updating menu card design, category filters, or cart bar layout.
 */

import React, { useEffect, useState } from "react";
import { useCart } from "../../context/CartContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { apiGet } from "../../lib/api";
import { ShoppingBag, Utensils, X, UserCircle2 } from "lucide-react";

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
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { cart, addToCart, updateQuantity, totalCount, totalAmount } = useCart();
  const { isLoggedIn, customer } = useCustomerAuth();

  const fetchMenu = async () => {
    setLoading(true);
    const res = await apiGet<ProductItem[]>("/menu");
    if (res.success && res.data) {
      setProducts(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  // Show login-persuasion modal once per session after first item is added
  const [persuasionShown, setPersuasionShown] = useState(false);

  const getQuantityInCart = (productId: string) => {
    const item = cart.find((c) => c.id === productId);
    return item ? item.quantity : 0;
  };

  const handleAddToCart = (item: ProductItem) => {
    addToCart({ id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl });
    // Show the login persuasion modal once (only to non-logged-in users)
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

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Utensils size={22} color="white" />
          <div className="header-title">Wambu's Corner Hotel</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Account button */}
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

          {/* Cart button */}
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
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {products.map((item) => {
              const qty = getQuantityInCart(item.id);
              const isSoldOut = !item.available || item.stockQty === 0;
              const badge = getStockBadge(item);
              const maxQty = item.stockQty;

              return (
                <div
                  key={item.id}
                  className="card"
                  style={{ display: "flex", gap: "14px", alignItems: "center", opacity: isSoldOut ? 0.6 : 1 }}
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

                    {/* Stock / Sold-Out badge */}
                    <div style={{ marginTop: "4px" }}>
                      {isSoldOut ? (
                        <span style={{ fontSize: "0.75rem", color: "#DC2626", fontWeight: 700, textTransform: "uppercase" }}>
                          Sold Out
                        </span>
                      ) : badge ? (
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: badge.color, background: badge.bg, padding: "2px 8px", borderRadius: "20px" }}>
                          {badge.text}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Quantity controls — only shown when in stock */}
                  {!isSoldOut && (
                    <div style={{ flexShrink: 0 }}>
                      {qty === 0 ? (
                        <button
                          onClick={() => handleAddToCart(item)}
                          style={{ border: "1px solid #1E4D36", background: "#EBF4F0", color: "#1E4D36", padding: "8px 14px", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}
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
                            disabled={qty >= maxQty}
                            style={{ border: "none", background: "none", fontWeight: 700, fontSize: "1.1rem", color: qty >= maxQty ? "#D1D5DB" : "#1E4D36", cursor: qty >= maxQty ? "not-allowed" : "pointer", padding: "0 4px" }}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Bottom Cart Bar */}
      {totalCount > 0 && (
        <div className="sticky-bottom-bar">
          <button onClick={onNavigateToCart} className="btn btn-primary">
            View Cart ( KSh {totalAmount} )
          </button>
        </div>
      )}

      {/* ─── Login Persuasion Modal ─────────────────────────────────────────────── */}
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
