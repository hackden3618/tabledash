/**
 * Purpose: Customer "My Orders" history page for tableDash.
 * Responsibilities: Shows the logged-in customer's recent orders with live real-time status updates
 *   via WebSockets. On ORDER_STATUS_UPDATED, surgically patches the specific order in local state
 *   immediately. Only terminal statuses (DELIVERED, CANCELLED) show a badge — active orders show
 *   a pulsing "In Progress" indicator so stale labels are never shown.
 * Dependencies: React, CustomerAuthContext, useWebSocket hook.
 * When to modify: When adding order detail drill-down or altering order status indicators.
 */

import React, { useEffect, useState } from "react";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useWebSocket } from "../../lib/websocket";
import { ClipboardList, LogIn, Package, RefreshCw } from "lucide-react";

interface MyOrdersPageProps {
  onGoToAuth: () => void;
  onTrackOrder: (orderId: string) => void;
}

/** Only used for terminal states where we are 100% certain of the label. */
const TERMINAL_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DELIVERED: { label: "✓ Delivered", color: "#15803D", bg: "#DCFCE7" },
  CANCELLED: { label: "✕ Cancelled", color: "#DC2626", bg: "#FEE2E2" },
};

export const MyOrdersPage: React.FC<MyOrdersPageProps> = ({ onGoToAuth, onTrackOrder }) => {
  const { customer, isLoggedIn, isLoading, logout, refreshProfile } = useCustomerAuth();

  // Local orders state — seeded from profile, then patched live via WebSocket
  const [orders, setOrders] = useState<any[]>([]);
  const [lastUpdatedId, setLastUpdatedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Seed from customer profile whenever it loads / changes
  useEffect(() => {
    if (customer?.recentOrders) {
      setOrders(customer.recentOrders);
    }
  }, [customer?.recentOrders]);

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshProfile();
    } catch (err) {
      console.error("Failed to manually refresh profile:", err);
    } finally {
      // Short delay for visual spin satisfaction
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  // Live WebSocket patch — surgically update only the affected order in-place
  useWebSocket("customer", undefined, (event) => {
    if (event.type === "ORDER_STATUS_UPDATED") {
      const updated = event.payload as any;
      setOrders((prev) => {
        const exists = prev.some((o) => o.id === updated.id);
        if (exists) {
          return prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o));
        }
        return [updated, ...prev];
      });
      setLastUpdatedId(updated.id);
      setTimeout(() => setLastUpdatedId(null), 3000);
    } else if (event.type === "ORDER_CREATED") {
      const newOrder = event.payload as any;
      setOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });
      setLastUpdatedId(newOrder.id);
      setTimeout(() => setLastUpdatedId(null), 3000);
    }
  });

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="app-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <p style={{ color: "#9CA3AF" }}>Loading…</p>
      </div>
    );
  }

  // ─── Logged-out state ──────────────────────────────────────────────────────
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

  // ─── Logged-in state ───────────────────────────────────────────────────────
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#1E4D36" }}>Recent Orders</h2>
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                title="Tap to manually sync orders"
                style={{
                  background: "#EBF4F0",
                  border: "1px solid #C2E2D3",
                  fontSize: "0.72rem",
                  color: "#16A34A",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  cursor: "pointer",
                  padding: "4px 10px",
                  borderRadius: "20px",
                  outline: "none",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => { if (!isRefreshing) e.currentTarget.style.backgroundColor = "#D5ECE0"; }}
                onMouseLeave={(e) => { if (!isRefreshing) e.currentTarget.style.backgroundColor = "#EBF4F0"; }}
              >
                <RefreshCw
                  size={11}
                  style={{
                    animation: isRefreshing ? "spin 1s linear infinite" : "none",
                    transform: isRefreshing ? undefined : "rotate(0deg)",
                    transition: "transform 0.3s ease",
                  }}
                />
                {isRefreshing ? "Syncing..." : "Live • Tap to Refresh"}
              </button>
            </div>

            {orders.map((order: any) => {
              const isTerminal  = order.status === "DELIVERED" || order.status === "CANCELLED";
              const termCfg     = TERMINAL_CONFIG[order.status]!;
              const justUpdated = lastUpdatedId === order.id;

              return (
                <div
                  key={order.id}
                  className="card"
                  onClick={() => onTrackOrder(order.id)}
                  style={{
                    cursor: "pointer",
                    transition: "transform 0.15s, box-shadow 0.15s, border-color 0.4s",
                    border: justUpdated ? "2px solid #22C55E" : undefined,
                    boxShadow: justUpdated ? "0 0 0 3px rgba(34,197,94,0.12)" : undefined,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#1F2937", display: "flex", alignItems: "center", gap: "8px" }}>
                        Order #{order.orderNumber}
                        {justUpdated && (
                          <span style={{ fontSize: "0.68rem", background: "#DCFCE7", color: "#15803D", padding: "2px 7px", borderRadius: "20px", fontWeight: 700 }}>
                            Just updated!
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#9CA3AF", marginTop: "2px" }}>
                        {new Date(order.orderedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>

                    {/* Only show a badge for terminal statuses. Active orders get a pulsing dot. */}
                    {isTerminal ? (
                      <span style={{
                        background: termCfg.bg, color: termCfg.color,
                        borderRadius: "8px", padding: "4px 10px",
                        fontWeight: 700, fontSize: "0.78rem", flexShrink: 0,
                      }}>
                        {termCfg.label}
                      </span>
                    ) : (
                      <span style={{
                        display: "flex", alignItems: "center", gap: "6px",
                        background: "#FEF3C7", color: "#D97706",
                        borderRadius: "8px", padding: "4px 10px",
                        fontWeight: 700, fontSize: "0.78rem", flexShrink: 0,
                      }}>
                        {/* Pulsing live dot */}
                        <span style={{
                          width: "7px", height: "7px", borderRadius: "50%",
                          background: "#F59E0B", display: "inline-block",
                          animation: "pulse 1.4s ease-in-out infinite",
                        }} />
                        In Progress
                      </span>
                    )}
                  </div>

                  <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "0.85rem", color: "#6B7280" }}>
                      {order.orderItems?.length ?? 0} item(s)
                    </div>
                    <div style={{ fontWeight: 700, color: "#1E4D36" }}>KSh {order.totalAmount}</div>
                  </div>

                  <div style={{ marginTop: "8px", fontSize: "0.8rem", color: "#1E4D36", fontWeight: 600 }}>
                    {!isTerminal ? "Tap to track live →" : "View details →"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.75); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
