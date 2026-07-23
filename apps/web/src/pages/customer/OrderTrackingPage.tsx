/**
 * Purpose: Real-time Order Tracking View for tableDash customers.
 * Responsibilities: Fetches order status, listens for live WebSocket `ORDER_STATUS_UPDATED` events,
 *   renders step-by-step progress timeline, and triggers live toast feedback when status advances.
 * Dependencies: React, apiGet helper, useWebSocket hook, NotificationsContext, lucide-react.
 * When to modify: When adding new status steps or changing progress timeline design.
 */

import React, { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { useWebSocket } from "../../lib/websocket";
import { useNotifications } from "../../context/NotificationsContext";
import { Truck } from "lucide-react";

interface OrderTrackingPageProps {
  orderId: string;
  onBackToHome: () => void;
}

export const OrderTrackingPage: React.FC<OrderTrackingPageProps> = ({
  orderId,
  onBackToHome,
}) => {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { pushNotification } = useNotifications();

  const fetchOrder = async () => {
    const res = await apiGet<any>(`/orders/${orderId}`);
    if (res.success && res.data) {
      setOrder(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  // Connect WebSocket to receive real-time updates for this specific order
  useWebSocket("customer", orderId, (event) => {
    if (event.type === "ORDER_STATUS_UPDATED" && (event.payload as any)?.id === orderId) {
      const updated = event.payload as any;
      setOrder(updated);

      if (updated.status === "OUT_FOR_DELIVERY") {
        pushNotification(
          "delivery",
          "🚀 Order Out for Delivery!",
          "Your meal is on its way to your market location. An SMS notification has also been sent.",
          { duration: 7000 }
        );
      } else if (updated.status === "DELIVERED") {
        pushNotification(
          "success",
          "🎉 Order Delivered!",
          "Enjoy your meal from Wambu's Corner Hotel!",
          { duration: 7000 }
        );
      } else if (updated.status === "PREPARING") {
        pushNotification(
          "info",
          "👨‍🍳 Meal in Preparation",
          "The kitchen is now preparing your fresh order."
        );
      } else if (updated.status === "CANCELLED") {
        pushNotification(
          "danger",
          "⚠️ Order Cancelled",
          "Your order was cancelled by the kitchen."
        );
      }
    }
  });

  const statuses = [
    { key: "NEW", label: "Order Placed" },
    { key: "ACCEPTED", label: "Accepted by Kitchen" },
    { key: "PREPARING", label: "Preparing Meal" },
    { key: "READY_FOR_DELIVERY", label: "Ready for Delivery" },
    { key: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
    { key: "DELIVERED", label: "Delivered" },
  ];

  const isCancelled = order?.status === "CANCELLED";

  const getStatusIndex = (status: string) => {
    return statuses.findIndex((s) => s.key === status);
  };

  const currentIndex = order ? getStatusIndex(order.status) : 0;

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={onBackToHome}
            style={{
              background: "none",
              border: "none",
              color: "white",
              fontSize: "1.2rem",
              cursor: "pointer",
            }}
          >
            ←
          </button>
          <div className="header-title">Live Order Tracker</div>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ padding: "20px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>
            Connecting live tracker...
          </div>
        ) : !order ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>
            Order not found.
          </div>
        ) : isCancelled ? (
          <div
            style={{
              background: "#FEE2E2",
              border: "2px solid #EF4444",
              borderRadius: "16px",
              padding: "24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>⚠️</div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#DC2626" }}>
              Order Cancelled
            </h2>
            <p style={{ fontSize: "0.9rem", color: "#991B1B", marginTop: "6px" }}>
              This order was cancelled. Please contact Wambu's Corner Hotel directly if you have any questions.
            </p>
            <button onClick={onBackToHome} className="btn btn-secondary" style={{ marginTop: "20px" }}>
              Back to Menu
            </button>
          </div>
        ) : (
          <div>
            {/* Out for Delivery Banner */}
            {order.status === "OUT_FOR_DELIVERY" && (
              <div
                style={{
                  background: "#EFF6FF",
                  border: "1.5px solid #60A5FA",
                  borderRadius: "16px",
                  padding: "16px",
                  marginBottom: "20px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  animation: "pulseGlow 2s infinite",
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "12px",
                    background: "#DBEAFE",
                    color: "#1D4ED8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Truck size={22} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: "#1E40AF", fontSize: "0.95rem" }}>
                    🚀 Out for Delivery!
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#1D4ED8", marginTop: "2px" }}>
                    An SMS update was sent to your phone. Keep your phone handy!
                  </div>
                </div>
              </div>
            )}

            <div
              style={{
                background: "#EBF4F0",
                borderRadius: "16px",
                padding: "20px",
                border: "1.5px solid #1E4D36",
                marginBottom: "24px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1E4D36" }}>
                ORDER #{order.orderNumber}
              </div>
              <div
                style={{
                  fontSize: "1.4rem",
                  fontWeight: 800,
                  color: "#1F2937",
                  marginTop: "4px",
                  marginBottom: "4px",
                }}
              >
                {statuses.find((s) => s.key === order.status)?.label || order.status}
              </div>
              <div style={{ fontSize: "0.85rem", color: "#4B5563" }}>
                Location: {order.marketSection} — {order.locationDescription}
              </div>
            </div>

            {/* Timeline progression vertical list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", paddingLeft: "12px" }}>
              {statuses.map((step, idx) => {
                const isCompleted = idx <= currentIndex;
                const isCurrent = idx === currentIndex;

                return (
                  <div
                    key={step.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        background: isCompleted ? "#1E4D36" : "#E5E7EB",
                        color: isCompleted ? "white" : "#9CA3AF",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "0.9rem",
                        zIndex: 2,
                        boxShadow: isCurrent ? "0 0 0 4px #EBF4F0" : "none",
                      }}
                    >
                      {isCompleted ? "✓" : idx + 1}
                    </div>

                    <div>
                      <div
                        style={{
                          fontWeight: isCurrent ? 800 : isCompleted ? 600 : 400,
                          fontSize: "1rem",
                          color: isCompleted ? "#1F2937" : "#9CA3AF",
                        }}
                      >
                        {step.label}
                      </div>
                      {isCurrent && (
                        <div style={{ fontSize: "0.75rem", color: "#22C55E", fontWeight: 700 }}>
                          ● Current Status
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={onBackToHome}
              className="btn btn-secondary"
              style={{ marginTop: "32px" }}
            >
              Back to Menu
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
