/**
 * Purpose: Market Map Location Inspector view for Admin & Delivery Runners.
 * Responsibilities: Renders visual market grid with customer pin placement for order delivery.
 * Dependencies: React.
 * When to modify: When changing map grid styles or runner direction helpers.
 */

import React from "react";

interface AdminMapViewPageProps {
  order: any;
  onBack: () => void;
}

export const AdminMapViewPage: React.FC<AdminMapViewPageProps> = ({ order, onBack }) => {
  const selectedZone = order?.marketSection ?? "Food Section";

  const zones = [
    { id: "Food Section", name: "Food Section", color: "#FEF08A" },
    { id: "Clothes Section", name: "Clothes Section", color: "#DBEAFE" },
    { id: "Hardware Section", name: "Hardware Section", color: "#FEF3C7" },
    { id: "Other Stalls", name: "Other Stalls", color: "#E0E7FF" },
  ];

  return (
    <div className="admin-container">
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
          <div className="header-title">Location on Map</div>
        </div>
      </header>

      <div style={{ padding: "20px" }}>
        <div style={{ marginBottom: "16px" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1E4D36" }}>
            Order #{order?.orderNumber} • {order?.customer?.firstName}
          </h2>
          <div style={{ fontSize: "0.875rem", color: "#6B7280" }}>
            Phone: {order?.customer?.phone}
          </div>
        </div>

        {/* Visual Map rendering */}
        <div
          style={{
            border: "2px solid #E5E7EB",
            borderRadius: "16px",
            padding: "20px",
            background: "#FAFAFA",
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#9CA3AF", marginBottom: "16px" }}>
            ⬆ ENTRANCE
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
            {zones.map((zone) => {
              const isTarget = selectedZone === zone.id;
              return (
                <div
                  key={zone.id}
                  style={{
                    height: "120px",
                    background: zone.color,
                    borderRadius: "14px",
                    border: isTarget ? "3.5px solid #EF4444" : "1px solid #D1D5DB",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    color: "#1F2937",
                    position: "relative",
                  }}
                >
                  {zone.name}
                  {isTarget && (
                    <div
                      style={{
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        background: "#EF4444",
                        color: "white",
                        borderRadius: "50%",
                        width: "28px",
                        height: "28px",
                        fontSize: "14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        boxShadow: "0 4px 10px rgba(239,68,68,0.5)",
                      }}
                    >
                      📍
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#9CA3AF" }}>⬇ EXIT</div>
        </div>

        <div
          style={{
            marginTop: "20px",
            padding: "16px",
            borderRadius: "14px",
            background: "#EBF4F0",
            border: "1.5px solid #1E4D36",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1E4D36", textTransform: "uppercase" }}>
            Delivery Location Details
          </div>
          <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "#1F2937", marginTop: "4px" }}>
            📍 {order?.marketSection} — {order?.locationDescription}
          </div>
        </div>

        <button onClick={onBack} className="btn btn-primary" style={{ marginTop: "20px" }}>
          Back to Order
        </button>
      </div>
    </div>
  );
};
