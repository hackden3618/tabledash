/**
 * Purpose: Customer Menu View for tableDash ("Mama's Hotel").
 * Responsibilities: Renders daily menu items, handles quantity selection, connects real-time WebSocket menu updates, and displays sticky cart bar.
 * Dependencies: React, useCart context, apiGet helper, useWebSocket hook.
 * When to modify: When updating menu card design, category filters, or cart bar layout.
 */

import React, { useEffect, useState } from "react";
import { useCart } from "../../context/CartContext";
import { apiGet } from "../../lib/api";

export interface ProductItem {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  price: number;
  available: boolean;
}

interface MenuListPageProps {
  onNavigateToCart: () => void;
  onNavigateToAdminLogin: () => void;
}

export const MenuListPage: React.FC<MenuListPageProps> = ({
  onNavigateToCart,
  onNavigateToAdminLogin,
}) => {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { cart, addToCart, updateQuantity, totalCount, totalAmount } = useCart();

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

  const getQuantityInCart = (productId: string) => {
    const item = cart.find((c) => c.id === productId);
    return item ? item.quantity : 0;
  };

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "1.4rem" }}>🍲</span>
          <div className="header-title">Mama's Hotel</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={onNavigateToCart}
            style={{
              background: "none",
              border: "none",
              color: "white",
              fontSize: "1.4rem",
              position: "relative",
              cursor: "pointer",
            }}
          >
            🛒
            {totalCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-8px",
                  background: "#22C55E",
                  color: "white",
                  borderRadius: "50%",
                  fontSize: "11px",
                  fontWeight: 700,
                  width: "18px",
                  height: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {totalCount}
              </span>
            )}
          </button>
          <button
            onClick={onNavigateToAdminLogin}
            title="Admin Login"
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "white",
              padding: "6px 10px",
              borderRadius: "6px",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Admin
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
              return (
                <div
                  key={item.id}
                  className="card"
                  style={{
                    display: "flex",
                    gap: "14px",
                    alignItems: "center",
                    opacity: item.available ? 1 : 0.6,
                  }}
                >
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    style={{
                      width: "80px",
                      height: "80px",
                      borderRadius: "12px",
                      objectFit: "cover",
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "#1F2937" }}>
                      {item.name}
                    </h3>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1E4D36", marginTop: "4px" }}>
                      KSh {item.price}
                    </div>

                    {!item.available && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "#EF4444",
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        Sold Out
                      </span>
                    )}
                  </div>

                  {item.available && (
                    <div>
                      {qty === 0 ? (
                        <button
                          onClick={() =>
                            addToCart({
                              id: item.id,
                              name: item.name,
                              price: item.price,
                              imageUrl: item.imageUrl,
                            })
                          }
                          style={{
                            border: "1px solid #1E4D36",
                            background: "#EBF4F0",
                            color: "#1E4D36",
                            padding: "8px 14px",
                            borderRadius: "8px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          + Add
                        </button>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            background: "#EBF4F0",
                            padding: "4px 8px",
                            borderRadius: "8px",
                            border: "1px solid #1E4D36",
                          }}
                        >
                          <button
                            onClick={() => updateQuantity(item.id, qty - 1)}
                            style={{
                              border: "none",
                              background: "none",
                              fontWeight: 700,
                              fontSize: "1.1rem",
                              color: "#1E4D36",
                              cursor: "pointer",
                              padding: "0 4px",
                            }}
                          >
                            -
                          </button>
                          <span style={{ fontWeight: 700, minWidth: "16px", textAlign: "center" }}>
                            {qty}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, qty + 1)}
                            style={{
                              border: "none",
                              background: "none",
                              fontWeight: 700,
                              fontSize: "1.1rem",
                              color: "#1E4D36",
                              cursor: "pointer",
                              padding: "0 4px",
                            }}
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
    </div>
  );
};
