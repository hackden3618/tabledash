/**
 * Purpose: Customer Navigation Bar for tableDash web application.
 * Responsibilities: Renders a sticky bottom navigation bar allowing instant switching between
 *   Menu, Cart, Order Tracking, and My Account (4 tabs).
 * Dependencies: React, CartContext, CustomerAuthContext.
 * When to modify: When adding new customer navigation destinations or changing icon badges.
 */

import React from "react";
import { useCart } from "../context/CartContext";
import { useCustomerAuth } from "../context/CustomerAuthContext";
import { MapPin, ShoppingBag, Utensils, UserCircle2 } from "lucide-react";

export type CustomerTab = "menu" | "cart" | "tracking" | "account";

interface BottomNavBarProps {
  activeTab: CustomerTab;
  onSelectTab: (tab: CustomerTab) => void;
  hasActiveOrder: boolean;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onSelectTab,
  hasActiveOrder,
}) => {
  const { totalCount } = useCart();
  const { isLoggedIn } = useCustomerAuth();

  return (
    <nav className="bottom-nav-bar">
      <button
        className={`bottom-nav-item ${activeTab === "menu" ? "active" : ""}`}
        onClick={() => onSelectTab("menu")}
      >
        <Utensils size={20} />
        <span className="bottom-nav-label">Menu</span>
      </button>

      <button
        className={`bottom-nav-item ${activeTab === "cart" ? "active" : ""}`}
        onClick={() => onSelectTab("cart")}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <ShoppingBag size={20} />
          {totalCount > 0 && (
            <span className="bottom-nav-badge">{totalCount}</span>
          )}
        </div>
        <span className="bottom-nav-label">Cart</span>
      </button>

      <button
        className={`bottom-nav-item ${activeTab === "tracking" ? "active" : ""}`}
        onClick={() => onSelectTab("tracking")}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <MapPin size={20} />
          {hasActiveOrder && <span className="bottom-nav-pulse-dot" />}
        </div>
        <span className="bottom-nav-label">Tracker</span>
      </button>

      <button
        className={`bottom-nav-item ${activeTab === "account" ? "active" : ""}`}
        onClick={() => onSelectTab("account")}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <UserCircle2 size={20} />
          {/* Green dot = logged in indicator */}
          {isLoggedIn && (
            <span style={{ position: "absolute", top: "-2px", right: "-4px", width: "8px", height: "8px", borderRadius: "50%", background: "#22C55E", border: "1.5px solid white" }} />
          )}
        </div>
        <span className="bottom-nav-label">{isLoggedIn ? "Account" : "Sign In"}</span>
      </button>
    </nav>
  );
};
