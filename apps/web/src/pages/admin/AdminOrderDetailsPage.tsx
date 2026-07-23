/**
 * Purpose: Admin Order Details & Status Updater view.
 * Responsibilities: Renders full customer order breakdown, customer contact button, forward-only
 *   order status timeline changer, location map modal trigger, and polite cancellation reason prompt.
 * Dependencies: React, apiPatch helper, lucide-react.
 * When to modify: When altering status progression choices, order detail fields, or adding custom cancellation presets.
 */

import React, { useState } from "react";
import { apiPatch } from "../../lib/api";
import { CheckCircle, Circle, Lock, AlertTriangle, X } from "lucide-react";

interface AdminOrderDetailsPageProps {
  order: any;
  token: string;
  onBack: () => void;
  onOpenMap: (order: any) => void;
  onOrderUpdated: (updatedOrder: any) => void;
}

/**
 * Canonical pipeline steps shown to the admin.
 * CANCELLED is handled separately as a destructive exit action.
 */
const PIPELINE = [
  { key: "NEW",                label: "New",                emoji: "🛎" },
  { key: "ACCEPTED",           label: "Accepted",           emoji: "✅" },
  { key: "PREPARING",          label: "Preparing",          emoji: "🍳" },
  { key: "READY_FOR_DELIVERY", label: "Ready for Delivery", emoji: "📦" },
  { key: "OUT_FOR_DELIVERY",   label: "Out for Delivery",   emoji: "🛵" },
  { key: "DELIVERED",          label: "Delivered",          emoji: "🎉" },
];

const STATUS_RANK: Record<string, number> = {
  NEW: 1, ACCEPTED: 2, PREPARING: 3,
  READY_FOR_DELIVERY: 4, OUT_FOR_DELIVERY: 5, DELIVERED: 6, CANCELLED: 99,
};

const POLITE_REASONS = [
  { key: "sold_out", label: "Ingredients sold out / portion unavailable today" },
  { key: "kitchen_closed", label: "Kitchen closed or closing early for maintenance" },
  { key: "too_busy", label: "Delays due to high order volume at the hotel" },
  { key: "custom", label: "Other custom polite message..." },
];

export const AdminOrderDetailsPage: React.FC<AdminOrderDetailsPageProps> = ({
  order,
  token,
  onBack,
  onOpenMap,
  onOrderUpdated,
}) => {
  const [currentStatus, setCurrentStatus] = useState<string>(order.status);
  const [cancelReason, setCancelReason] = useState<string | null>(order.cancelReason);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cancellation Modal states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasonOption, setCancelReasonOption] = useState("sold_out");
  const [customCancelReason, setCustomCancelReason] = useState("");

  const currentRank = STATUS_RANK[currentStatus] ?? 0;
  const isTerminal  = currentStatus === "DELIVERED" || currentStatus === "CANCELLED";

  const handleStatusChange = async (newStatus: string, reason?: string) => {
    if (updating || isTerminal) return;
    const newRank = STATUS_RANK[newStatus] ?? 0;
    if (newStatus !== "CANCELLED" && newRank <= currentRank) return;

    setError(null);
    setUpdating(true);
    const res = await apiPatch<any>(
      `/orders/${order.id}/status`, 
      { status: newStatus, cancelReason: reason }, 
      token
    );
    setUpdating(false);

    if (res.success && res.data) {
      setCurrentStatus(newStatus);
      if (newStatus === "CANCELLED") {
        setCancelReason(reason || "Staff unavailable to deliver at this time");
      }
      onOrderUpdated(res.data);
    } else {
      setError(res.error ?? "Status update failed. Please try again.");
    }
  };

  const handleConfirmCancel = () => {
    let finalReason = "";
    if (cancelReasonOption === "sold_out") {
      finalReason = "we have unfortunately sold out of the items you ordered for today";
    } else if (cancelReasonOption === "kitchen_closed") {
      finalReason = "the kitchen is closed or closing early for maintenance";
    } else if (cancelReasonOption === "too_busy") {
      finalReason = "we are experiencing an extremely high volume of orders today";
    } else {
      finalReason = customCancelReason.trim() || "we are unfortunately unable to fulfill your order at this time";
    }

    handleStatusChange("CANCELLED", finalReason);
    setShowCancelModal(false);
  };

  return (
    <div className="admin-container">
      {/* Header Bar */}
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={onBack}
            style={{ background: "none", border: "none", color: "white", fontSize: "1.2rem", cursor: "pointer" }}
          >
            ←
          </button>
          <div className="header-title">Order #{order.orderNumber}</div>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ padding: "20px" }}>
        {/* Customer Contact Info Card */}
        <div className="card" style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1F2937" }}>
              {order.customer?.firstName}
            </h2>
            <div style={{ fontSize: "0.9rem", color: "#4B5563", marginTop: "2px" }}>
              {order.customer?.phone}
            </div>
          </div>
          <a
            href={`tel:${order.customer?.phone}`}
            style={{
              width: "44px", height: "44px", borderRadius: "50%",
              background: "#22C55E", color: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              textDecoration: "none", fontSize: "1.2rem",
              boxShadow: "0 4px 12px rgba(34, 197, 94, 0.3)",
            }}
          >
            📞
          </a>
        </div>

        {/* Order Items Summary */}
        <div className="card" style={{ marginBottom: "20px" }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#6B7280", marginBottom: "10px" }}>Items</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
            {order.orderItems?.map((it: any) => (
              <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.95rem" }}>
                <span>{it.quantity} x {it.name}</span>
                <span style={{ fontWeight: 600 }}>KSh {it.subtotal}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #E5E7EB", paddingTop: "10px", fontWeight: 800, fontSize: "1.1rem" }}>
            <span>Total</span>
            <span style={{ color: "#1E4D36" }}>KSh {order.totalAmount}</span>
          </div>
        </div>

        {/* Delivery Location & Map Trigger */}
        <div className="card" style={{ marginBottom: "20px" }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#6B7280", marginBottom: "6px" }}>Delivery Location</div>
          <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#1F2937", marginBottom: "12px" }}>
            📍 {order.marketSection} — {order.locationDescription}
          </div>
          <button onClick={() => onOpenMap(order)} className="btn btn-secondary" style={{ padding: "8px 16px" }}>
            Open Map Inspector
          </button>
        </div>

        {/* Forward-Only Status Timeline */}
        <div className="card" style={{ opacity: updating ? 0.7 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1F2937" }}>Order Progress</div>
            {updating && <span style={{ fontSize: "0.8rem", color: "#1E4D36", fontWeight: 600 }}>Updating...</span>}
          </div>

          {error && (
            <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", fontSize: "0.85rem", color: "#DC2626", fontWeight: 600 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Pipeline step-by-step timeline */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {PIPELINE.map((step, idx) => {
              const stepRank  = STATUS_RANK[step.key] ?? 0;
              const isDone    = stepRank < currentRank;
              const isCurrent = step.key === currentStatus;
              const isNext    = !isTerminal && stepRank === currentRank + 1;
              const isFuture  = !isDone && !isCurrent && !isNext;
              const isLast    = idx === PIPELINE.length - 1;

              return (
                <div key={step.key} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  {/* Connector icon column */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: "32px" }}>
                    <div
                      style={{
                        width: "32px", height: "32px", borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: isDone ? "#22C55E" : isCurrent ? "#1E4D36" : isNext ? "#EBF4F0" : "#F3F4F6",
                        border: isCurrent ? "2.5px solid #1E4D36" : isNext ? "2px dashed #1E4D36" : "2px solid transparent",
                        transition: "all 0.2s",
                        cursor: isNext && !isTerminal ? "pointer" : "default",
                      }}
                      onClick={() => isNext && handleStatusChange(step.key)}
                    >
                      {isDone ? (
                        <CheckCircle size={16} color="white" />
                      ) : isCurrent ? (
                        <span style={{ fontSize: "0.85rem" }}>{step.emoji}</span>
                      ) : isNext ? (
                        <Circle size={16} color="#1E4D36" />
                      ) : (
                        <Circle size={16} color="#D1D5DB" />
                      )}
                    </div>
                    {!isLast && (
                      <div style={{ width: "2px", minHeight: "20px", flex: 1, background: isDone ? "#22C55E" : "#E5E7EB", margin: "2px 0" }} />
                    )}
                  </div>

                  {/* Step content */}
                  <div style={{ paddingBottom: "16px", flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "5px" }}>
                      <span
                        style={{
                          fontWeight: isCurrent || isDone ? 700 : isNext ? 600 : 500,
                          fontSize: "0.9rem",
                          color: isDone ? "#15803D" : isCurrent ? "#1E4D36" : isNext ? "#374151" : "#9CA3AF",
                        }}
                      >
                        {step.label}
                      </span>
                      {isCurrent && !isTerminal && (
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, background: "#EBF4F0", color: "#1E4D36", padding: "2px 8px", borderRadius: "20px" }}>
                          CURRENT
                        </span>
                      )}
                      {isDone && <span style={{ fontSize: "0.7rem", color: "#15803D" }}>✓</span>}
                    </div>
                    {isNext && !isTerminal && (
                      <button
                        onClick={() => handleStatusChange(step.key)}
                        disabled={updating}
                        style={{
                          marginTop: "6px", padding: "6px 16px",
                          background: "#1E4D36", color: "white",
                          border: "none", borderRadius: "8px",
                          fontSize: "0.82rem", fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        Mark as {step.label} →
                      </button>
                    )}
                    {isFuture && (
                      <div style={{ fontSize: "0.72rem", color: "#9CA3AF", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                        <Lock size={10} /> Unlocks after previous step
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Terminal state banner */}
          {isTerminal ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
              <div
                style={{
                  borderRadius: "10px", padding: "12px 16px",
                  display: "flex", alignItems: "center", gap: "8px",
                  fontSize: "0.875rem", fontWeight: 700,
                  background: currentStatus === "DELIVERED" ? "#DCFCE7" : "#FEE2E2",
                  color: currentStatus === "DELIVERED" ? "#15803D" : "#DC2626",
                }}
              >
                <Lock size={16} />
                This order is {currentStatus === "DELIVERED" ? "completed ✓" : "cancelled"} and cannot be updated further.
              </div>
              {currentStatus === "CANCELLED" && cancelReason && (
                <div style={{ background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "10px 14px", fontSize: "0.85rem", color: "#4B5563" }}>
                  <strong>Cancellation Reason:</strong> "{cancelReason}"
                </div>
              )}
            </div>
          ) : (
            /* Cancel button — always available from any active state */
            <div style={{ marginTop: "16px", borderTop: "1px solid #F3F4F6", paddingTop: "16px" }}>
              <button
                onClick={() => setShowCancelModal(true)}
                disabled={updating}
                style={{
                  width: "100%", padding: "10px",
                  background: "none", border: "1.5px solid #FCA5A5",
                  borderRadius: "8px", color: "#DC2626",
                  fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FFF5F5"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                ✕ Cancel This Order
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cancellation Reason Modal */}
      {showCancelModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "white", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "480px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)", animation: "fadeIn 0.2s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#DC2626" }}>
                <AlertTriangle size={22} />
                <h3 style={{ fontWeight: 800, fontSize: "1.1rem", margin: 0 }}>Polite Cancellation Reason</h3>
              </div>
              <button onClick={() => setShowCancelModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "#6B7280", lineHeight: 1.5, marginBottom: "20px" }}>
              Select a reason below. This will be automatically sent to the customer via SMS to explain the cancellation politely.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              {POLITE_REASONS.map((reason) => (
                <label
                  key={reason.key}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "12px",
                    borderRadius: "10px",
                    border: cancelReasonOption === reason.key ? "1.5px solid #FCA5A5" : "1.5px solid #E5E7EB",
                    background: cancelReasonOption === reason.key ? "#FFF5F5" : "#FFFFFF",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <input
                    type="radio"
                    name="cancelReasonOption"
                    value={reason.key}
                    checked={cancelReasonOption === reason.key}
                    onChange={() => setCancelReasonOption(reason.key)}
                    style={{ marginTop: "3px", accentColor: "#DC2626" }}
                  />
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151" }}>{reason.label}</span>
                </label>
              ))}
            </div>

            {cancelReasonOption === "custom" && (
              <div style={{ marginBottom: "20px" }}>
                <textarea
                  className="input-field"
                  placeholder="Type a polite custom cancellation message here..."
                  value={customCancelReason}
                  onChange={(e) => setCustomCancelReason(e.target.value)}
                  rows={3}
                  required
                  style={{ padding: "10px 12px", resize: "none", fontSize: "0.875rem" }}
                />
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowCancelModal(false)}
                className="btn btn-secondary"
                style={{ padding: "10px 18px", fontSize: "0.85rem" }}
              >
                Keep Order
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={cancelReasonOption === "custom" && !customCancelReason.trim()}
                className="btn btn-primary"
                style={{
                  padding: "10px 18px", fontSize: "0.85rem",
                  backgroundColor: "#DC2626", border: "1px solid #DC2626",
                  color: "white",
                  opacity: (cancelReasonOption === "custom" && !customCancelReason.trim()) ? 0.5 : 1,
                  cursor: (cancelReasonOption === "custom" && !customCancelReason.trim()) ? "not-allowed" : "pointer"
                }}
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
