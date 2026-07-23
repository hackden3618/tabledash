/**
 * Purpose: Customer "My Orders" history page for tableDash.
 * Responsibilities: Shows the logged-in customer's recent orders with status badges and totals.
 *   If not logged in, renders a persuasive prompt instead of the order list.
 * Dependencies: React, CustomerAuthContext.
 * When to modify: When adding order detail drill-down or live tracking from history.
 */

import React from "react";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { ClipboardList, LogIn, Package, CheckCircle, Clock, Truck, AlertCircle } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
  NEW:                { label: "Received",     color: "#1D4ED8", bg: "#DBEAFE", Icon: Package },
  ACCEPTED:           { label: "Accepted",     color: "#7C3AED", bg: "#EDE9FE", Icon: CheckCircle },
  PREPARING:          { label: "Preparing",    color: "#D97706", bg: "#FEF3C7", Icon: Clock },
  READY_FOR_DELIVERY: { label: "Ready",        color: "#059669", bg: "#D1FAE5", Icon: CheckCircle },
  OUT_FOR_DELIVERY:   { label: "On the way",   color: "#0284C7", bg: "#E0F2FE", Icon: Truck },
  DELIVERED:          { label: "Delivered",    color: "#15803D", bg: "#DCFCE7", Icon: CheckCircle },
  CANCELLED:          { label: "Cancelled",    color: "#DC2626", bg: "#FEE2E2", Icon: AlertCircle },
};

interface MyOrdersPageProps {
  onGoToAuth: () => void;
  onTrackOrder: (orderId: string) => void;
}

export const MyOrdersPage: React.FC<MyOrdersPageProps> = ({ onGoToAuth, onTrackOrder }) => {
  const { customer, isLoggedIn, isLoading, logout } = useCustomerAuth();

  // ─── Loading state ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="app-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <p style={{ color: "#9CA3AF" }}>Loading…</p>
      </div>
    );
  }

  // ─── Logged-out state: persuasion prompt ──────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className="app-container">
        <header className="header-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ClipboardList size={20} color="white" />
            <div className="header-title">My Orders</div>
          </div>
        </header>

        <div style={{ padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", textAlign: "center" }}>
          <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "#EBF4F0", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ClipboardList size={36} color="#1E4D36" />
          </div>

          <div>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#1F2937", marginBottom: "8px" }}>Track your orders</h2>
            <p style={{ fontSize: "0.9rem", color: "#6B7280", lineHeight: 1.6, maxWidth: "300px" }}>
              Sign in or create a free account to see your order history and have your delivery location saved for next time.
            </p>
          </div>

          <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: "14px", padding: "16px", width: "100%", maxWidth: "340px" }}>
            <p style={{ fontSize: "0.85rem", color: "#15803D", fontWeight: 600, marginBottom: "8px" }}>✓ Why create an account?</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
              {[
                "Your location & stall saved for faster checkout",
                "See all past orders at a glance",
                "Track active orders from this tab",
              ].map((point) => (
                <li key={point} style={{ fontSize: "0.85rem", color: "#374151", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <span style={{ color: "#22C55E", flexShrink: 0 }}>•</span> {point}
                </li>
              ))}
            </ul>
          </div>

          <button onClick={onGoToAuth} className="btn btn-primary" style={{ width: "100%", maxWidth: "340px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <LogIn size={18} /> Sign In / Create Account
          </button>
        </div>
      </div>
    );
  }

  // ─── Logged-in state: order history ──────────────────────────────────────────
  const orders = customer?.recentOrders ?? [];

  return (
    <div className="app-container">
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <ClipboardList size={20} color="white" />
          <div className="header-title">My Orders</div>
        </div>
        <button
          onClick={logout}
          style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "white", borderRadius: "8px", padding: "6px 12px", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}
        >
          Sign Out
        </button>
      </header>

      <div style={{ padding: "20px" }}>
        {/* Welcome strip */}
        <div style={{ background: "#EBF4F0", borderRadius: "12px", padding: "14px 16px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#1E4D36", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "1rem", flexShrink: 0 }}>
            {customer?.firstName?.[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: "#1F2937" }}>Hi, {customer?.firstName}!</div>
            <div style={{ fontSize: "0.8rem", color: "#6B7280" }}>{customer?.phone}</div>
          </div>
        </div>

        {orders.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9CA3AF" }}>
            <Package size={40} style={{ marginBottom: "12px", opacity: 0.4 }} />
            <p style={{ fontWeight: 600 }}>No orders yet</p>
            <p style={{ fontSize: "0.85rem" }}>Your order history will appear here.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#1E4D36", marginBottom: "4px" }}>
              Recent Orders
            </h2>
            {orders.map((order: any) => {
              const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG["NEW"];
              const StatusIcon = cfg.Icon;
              const isActive = !["DELIVERED", "CANCELLED"].includes(order.status);
              return (
                <div
                  key={order.id}
                  className="card"
                  style={{ cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s" }}
                  onClick={() => onTrackOrder(order.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#1F2937" }}>Order #{order.orderNumber}</div>
                      <div style={{ fontSize: "0.8rem", color: "#9CA3AF", marginTop: "2px" }}>
                        {new Date(order.orderedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: "8px", padding: "4px 10px", fontWeight: 700, fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "5px" }}>
                      <StatusIcon size={13} /> {cfg.label}
                    </span>
                  </div>

                  <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "0.85rem", color: "#6B7280" }}>
                      {order.orderItems?.length ?? 0} item(s)
                    </div>
                    <div style={{ fontWeight: 700, color: "#1E4D36" }}>KSh {order.totalAmount}</div>
                  </div>

                  <div style={{ marginTop: "8px", fontSize: "0.8rem", color: "#1E4D36", fontWeight: 600 }}>
                    {isActive ? "Tap to track live order →" : "View order details →"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
