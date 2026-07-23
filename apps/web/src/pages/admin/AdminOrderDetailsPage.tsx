/**
 * Purpose: Admin Order Details & Status Updater view.
 * Responsibilities: Renders full customer order breakdown, customer contact button, step-by-step order status changer, and location map modal trigger.
 * Dependencies: React, apiPatch helper.
 * When to modify: When altering status progression choices or order detail fields.
 */

import React, { useState } from "react";
import { apiPatch } from "../../lib/api";

interface AdminOrderDetailsPageProps {
  order: any;
  token: string;
  onBack: () => void;
  onOpenMap: (order: any) => void;
  onOrderUpdated: (updatedOrder: any) => void;
}

export const AdminOrderDetailsPage: React.FC<AdminOrderDetailsPageProps> = ({
  order,
  token,
  onBack,
  onOpenMap,
  onOrderUpdated,
}) => {
  const [currentStatus, setCurrentStatus] = useState(order.status);
  const [updating, setUpdating] = useState(false);

  const statuses = [
    { key: "NEW", label: "New" },
    { key: "ACCEPTED", label: "Accepted" },
    { key: "PREPARING", label: "Preparing" },
    { key: "READY_FOR_DELIVERY", label: "Ready for Delivery" },
    { key: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
    { key: "DELIVERED", label: "Delivered" },
  ];

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true);
    const res = await apiPatch<any>(`/orders/${order.id}/status`, { status: newStatus }, token);
    setUpdating(false);

    if (res.success && res.data) {
      setCurrentStatus(newStatus);
      onOrderUpdated(res.data);
    }
  };

  return (
    <div className="admin-container">
      {/* Header Bar */}
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={onBack}
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
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: "#22C55E",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              fontSize: "1.2rem",
              boxShadow: "0 4px 12px rgba(34, 197, 94, 0.3)",
            }}
          >
            📞
          </a>
        </div>

        {/* Order Items Summary */}
        <div className="card" style={{ marginBottom: "20px" }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#6B7280", marginBottom: "10px" }}>
            Items
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
            {order.orderItems?.map((it: any) => (
              <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.95rem" }}>
                <span>{it.quantity} x {it.name}</span>
                <span style={{ fontWeight: 600 }}>KSh {it.subtotal}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1px solid #E5E7EB",
              paddingTop: "10px",
              fontWeight: 800,
              fontSize: "1.1rem",
            }}
          >
            <span>Total</span>
            <span style={{ color: "#1E4D36" }}>KSh {order.totalAmount}</span>
          </div>
        </div>

        {/* Delivery Location & Map Trigger */}
        <div className="card" style={{ marginBottom: "20px" }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#6B7280", marginBottom: "6px" }}>
            Delivery Location
          </div>
          <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#1F2937", marginBottom: "12px" }}>
            📍 {order.marketSection} — {order.locationDescription}
          </div>
          <button onClick={() => onOpenMap(order)} className="btn btn-secondary" style={{ padding: "8px 16px" }}>
            Open Map Inspector
          </button>
        </div>

        {/* Status Timeline Selector */}
        <div className="card" style={{ opacity: updating ? 0.7 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1F2937" }}>
              Update Order Status
            </div>
            {updating && <span style={{ fontSize: "0.8rem", color: "#1E4D36", fontWeight: 600 }}>Updating...</span>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {statuses.map((st) => {
              const isSelected = currentStatus === st.key;
              return (
                <div
                  key={st.key}
                  onClick={() => !updating && handleStatusChange(st.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px",
                    borderRadius: "10px",
                    background: isSelected ? "#EBF4F0" : "#F9FAFB",
                    border: isSelected ? "2px solid #1E4D36" : "1px solid #E5E7EB",
                    cursor: updating ? "not-allowed" : "pointer",
                    fontWeight: isSelected ? 700 : 500,
                  }}
                >
                  <input
                    type="radio"
                    checked={isSelected}
                    onChange={() => {}}
                    style={{ accentColor: "#1E4D36" }}
                  />
                  <span>{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
