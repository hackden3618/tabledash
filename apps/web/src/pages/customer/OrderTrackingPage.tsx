/**
 * Purpose: Real-time Order Tracking View for tableDash customers.
 * Responsibilities: Fetches order status, listens for live WebSocket `ORDER_STATUS_UPDATED` events,
 *   renders step-by-step progress timeline, and triggers live toast feedback when status advances.
 * Dependencies: React, apiGet helper, useWebSocket hook, NotificationsContext, lucide-react.
 * When to modify: When adding new status steps or changing progress timeline design.
 */

import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { useWebSocket } from "../../lib/websocket";
import { useNotifications } from "../../context/NotificationsContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { Truck, XCircle } from "lucide-react";
import { Modal } from "../../components/Modal";

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
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type?: "info" | "warning" | "danger" | "success" | "confirm";
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  const { pushNotification } = useNotifications();
  const { token: customerToken, isLoggedIn } = useCustomerAuth();

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
          "Enjoy your meal!",
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
          updated.cancelReason ? `Reason: ${updated.cancelReason}` : "Your order was cancelled."
        );
      }
    } else if (event.type === "ORDER_PAYMENT_UPDATED" && (event.payload as any)?.id === orderId) {
      const p = event.payload as any;
      pushNotification(
        "success",
        "💰 Payment Updated",
        p.paymentStatus === "PAID"
          ? "Your order has been fully paid! ✅"
          : `Payment status: ${p.paymentStatus} (KSh ${p.amountPaid})`,
        { duration: 5000 }
      );
    } else if (event.type === "NOTIFICATION" && (event.payload as any)?.orderId === orderId) {
      const n = event.payload as any;
      pushNotification(
        n.category === "cancellation" ? "danger" : "info",
        n.title,
        n.message,
        { duration: 6000 }
      );
    }
  });

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) {
      setModalConfig({
        isOpen: true,
        type: "warning",
        title: "Reason Required",
        message: "Please provide a reason for cancellation.",
        onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
      });
      return;
    }
    setIsCancelling(true);
    const res = await apiPost<any>(`/orders/${orderId}/cancel`, { reason: cancelReason.trim() }, customerToken);
    setIsCancelling(false);
    setShowCancelModal(false);
    if (res.success) {
      pushNotification("info", "✅ Order Cancelled", "Your order has been cancelled successfully.");
      setOrder(res.data);
    } else {
      setModalConfig({
        isOpen: true,
        type: "danger",
        title: "Cancellation Failed",
        message: res.error || "Failed to cancel order. Please try again or contact the hotel.",
        onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
      });
    }
  };

  const STATUSES = [
    { key: "NEW", label: "Order Placed" },
    { key: "ACCEPTED", label: "Accepted by Kitchen" },
    { key: "PREPARING", label: "Preparing Meal" },
    { key: "READY_FOR_DELIVERY", label: "Ready for Delivery" },
    { key: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
    { key: "DELIVERED", label: "Delivered" },
  ];

  const isCancelled = order?.status === "CANCELLED";

  const getStatusIndex = (status: string) => {
    return STATUSES.findIndex((s) => s.key === status);
  };

  // When cancelled, use cancelledAtStatus to determine the cutoff point
  const cancelledAtIdx = isCancelled && order?.cancelledAtStatus
    ? getStatusIndex(order.cancelledAtStatus)
    : -1;
  const currentIndex = order && !isCancelled ? getStatusIndex(order.status) : cancelledAtIdx;

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
          <div>
            {/* Cancelled Banner */}
            <div
              style={{
                background: "#FEE2E2",
                border: "2px solid #EF4444",
                borderRadius: "16px",
                padding: "16px 20px",
                marginBottom: "20px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "4px" }}>⚠️</div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#DC2626" }}>
                Order Cancelled
              </h2>
              {order.cancelReason && (
                <p style={{ fontSize: "0.85rem", color: "#991B1B", marginTop: "4px" }}>
                  Reason: {order.cancelReason}
                </p>
              )}
            </div>

            {/* Timeline showing cancelled at the cutoff point */}
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
              <div style={{ fontSize: "0.85rem", color: "#4B5563", marginTop: "4px" }}>
                Location: {order.marketSection} — {order.locationDescription}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px", paddingLeft: "12px" }}>
              {STATUSES.map((step, idx) => {
                const isCompleted = idx <= currentIndex;
                const isCutoff = idx === currentIndex;

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
                        background: isCompleted ? "#DC2626" : "#E5E7EB",
                        color: isCompleted ? "white" : "#9CA3AF",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "0.9rem",
                        zIndex: 2,
                        boxShadow: isCutoff ? "0 0 0 4px #FEE2E2" : "none",
                      }}
                    >
                      {isCompleted ? "✕" : idx + 1}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: isCutoff ? 800 : isCompleted ? 600 : 400,
                          fontSize: "1rem",
                          color: isCompleted ? "#DC2626" : "#9CA3AF",
                          textDecoration: !isCompleted ? "none" : "none",
                        }}
                      >
                        {step.label}
                      </div>
                      {isCutoff && (
                        <div style={{ fontSize: "0.75rem", color: "#DC2626", fontWeight: 700 }}>
                          ✕ Cancelled at this stage
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={onBackToHome} className="btn btn-secondary" style={{ marginTop: "20px", width: "100%" }}>
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
                {STATUSES.find((s) => s.key === order.status)?.label || order.status}
              </div>
              <div style={{ fontSize: "0.85rem", color: "#4B5563" }}>
                Location: {order.marketSection} — {order.locationDescription}
              </div>
            </div>

            {/* Timeline progression vertical list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", paddingLeft: "12px" }}>
              {STATUSES.map((step, idx) => {
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

            {/* Cancel Order Button — only when cancellable */}
            {(order.status === "NEW" || order.status === "ACCEPTED" || order.status === "PREPARING") && isLoggedIn && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="btn"
                style={{
                  marginTop: "24px",
                  width: "100%",
                  background: "#FEE2E2",
                  color: "#DC2626",
                  border: "1.5px solid #FECACA",
                  padding: "14px",
                  borderRadius: "12px",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <XCircle size={20} /> Cancel Order
              </button>
            )}

            <button
              onClick={onBackToHome}
              className="btn btn-secondary"
              style={{ marginTop: "12px" }}
            >
              Back to Menu
            </button>
          </div>
        )}
      </div>

      {/* Cancel Order Modal */}
      {showCancelModal && (
        <div
          style={{
            position: "fixed", inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(3px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={() => setShowCancelModal(false)}
        >
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "20px 20px 0 0",
              width: "100%",
              maxWidth: "480px",
              padding: "24px",
              boxShadow: "0 -10px 25px rgba(0, 0, 0, 0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#DC2626", marginBottom: "12px" }}>
              Cancel Order?
            </h3>
            <p style={{ fontSize: "0.9rem", color: "#4B5563", marginBottom: "16px" }}>
              Please tell us why you'd like to cancel this order so we can improve our service.
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Changed my mind, wrong items, too long wait..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="input-field"
              style={{ resize: "vertical", marginBottom: "16px", width: "100%" }}
            />
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowCancelModal(false)}
                className="btn"
                style={{
                  flex: 1,
                  background: "#F3F4F6",
                  color: "#374151",
                  border: "1px solid #D1D5DB",
                  padding: "12px",
                  borderRadius: "10px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Keep Order
              </button>
              <button
                onClick={handleCancelOrder}
                disabled={isCancelling || !cancelReason.trim()}
                className="btn"
                style={{
                  flex: 1,
                  background: "#DC2626",
                  color: "#FFF",
                  border: "none",
                  padding: "12px",
                  borderRadius: "10px",
                  fontWeight: 700,
                  cursor: isCancelling || !cancelReason.trim() ? "not-allowed" : "pointer",
                  opacity: isCancelling || !cancelReason.trim() ? 0.6 : 1,
                }}
              >
                {isCancelling ? "Cancelling..." : "Yes, Cancel Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Modal Dialog */}
      <Modal
        isOpen={modalConfig.isOpen}
        type={modalConfig.type}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText={modalConfig.confirmText}
        cancelText={modalConfig.cancelText}
        onConfirm={modalConfig.onConfirm}
        onCancel={modalConfig.onCancel}
      />
    </div>
  );
};
