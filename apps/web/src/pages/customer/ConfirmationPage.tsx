/**
 * Purpose: Order Receipt & Confirmation View for tableDash.
 * Responsibilities: Renders order receipt confirmation (#1042, date/time, line items, total amount, delivery section) and provides "Track Order" button.
 * Dependencies: React.
 * When to modify: When altering confirmation layout or receipt details.
 */

import React from "react";

interface ConfirmationPageProps {
  order: any;
  onTrackOrder: (orderId: string) => void;
  onBackToHome: () => void;
}

export const ConfirmationPage: React.FC<ConfirmationPageProps> = ({
  order,
  onTrackOrder,
  onBackToHome,
}) => {
  const formattedDate = order?.orderedAt
    ? new Date(order.orderedAt).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleString();

  return (
    <div className="app-container" style={{ background: "#FAFAFA" }}>
      <div style={{ padding: "24px 20px" }}>
        {/* Success Icon & Heading */}
        <div style={{ textAlign: "center", margin: "20px 0" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              background: "#22C55E",
              color: "white",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2.2rem",
              margin: "0 auto 16px auto",
              boxShadow: "0 8px 20px rgba(34, 197, 94, 0.3)",
            }}
          >
            ✓
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1F2937" }}>Order Received!</h1>
          <p style={{ fontSize: "0.9rem", color: "#6B7280", marginTop: "4px" }}>
            Thank you for your order.
          </p>
        </div>

        {/* Order Details Card */}
        <div className="card" style={{ padding: "20px", marginBottom: "20px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderBottom: "1px solid #E5E7EB",
              paddingBottom: "12px",
              marginBottom: "16px",
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#1E4D36" }}>
                Order #{order?.orderNumber ?? 1042}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#6B7280" }}>{formattedDate}</div>
            </div>
            <span className="badge badge-new">Received</span>
          </div>

          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#6B7280", marginBottom: "8px" }}>
            Items
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
            {order?.orderItems?.map((item: any) => (
              <div
                key={item.id}
                style={{ display: "flex", justifyContent: "space-between", fontSize: "0.95rem" }}
              >
                <span>
                  {item.quantity} x {item.name}
                </span>
                <span style={{ fontWeight: 600 }}>KSh {item.subtotal}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1px solid #E5E7EB",
              paddingTop: "12px",
              fontWeight: 800,
              fontSize: "1.1rem",
              color: "#1F2937",
            }}
          >
            <span>Total</span>
            <span style={{ color: "#1E4D36" }}>KSh {order?.totalAmount}</span>
          </div>

          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              borderRadius: "10px",
              background: "#F3F4F6",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span style={{ fontSize: "1.2rem" }}>📍</span>
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#4B5563" }}>
                Delivery Location
              </div>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1F2937" }}>
                {order?.marketSection} — {order?.locationDescription}
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", color: "#4B5563", fontSize: "0.875rem", marginBottom: "20px" }}>
          We will call you shortly to confirm.
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button onClick={() => onTrackOrder(order?.id)} className="btn btn-primary">
            Track Order
          </button>
          <button onClick={onBackToHome} className="btn btn-secondary">
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
};
