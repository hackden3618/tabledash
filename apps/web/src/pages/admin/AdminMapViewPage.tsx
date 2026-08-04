/**
 * Purpose: Market Map Location Inspector view for Admin & Delivery Runners.
 * Responsibilities: Renders visual market grid with customer pin placement for order delivery.
 * Dependencies: React.
 * When to modify: When changing map grid styles or runner direction helpers.
 */

import React from "react";
import { ChevronLeft } from "lucide-react";

interface AdminMapViewPageProps {
  order: any;
  onBack: () => void;
}

export const AdminMapViewPage: React.FC<AdminMapViewPageProps> = ({ order, onBack }) => {
  const deliveryArea = order?.marketSection || order?.hotel?.zone?.name || "Delivery area not recorded";

  return (
    <div className="admin-container">
      <header className="bg-[#114B36] text-white px-4 py-3 sticky top-0 z-40 shadow-[0_2px_8px_rgba(17,75,54,0.15)]">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <button
            onClick={onBack}
            className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="font-bold text-lg">Location on Map</h1>
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

        <div
          style={{
            border: "2px solid #E5E7EB",
            borderRadius: "16px",
            padding: "20px",
            background: "#FAFAFA",
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "#9CA3AF", textTransform: "uppercase" }}>
            Map coordinates unavailable
          </div>
          <p style={{ margin: "10px auto 0", maxWidth: "32rem", color: "#6B7280", lineHeight: 1.5 }}>
            This order has a text delivery location. Use the verified area and directions below; no unverified map position is shown.
          </p>
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
            📍 {deliveryArea} — {order?.locationDescription || "No additional directions provided"}
          </div>
        </div>

        <button onClick={onBack} className="btn btn-primary" style={{ marginTop: "20px" }}>
          Back to Order
        </button>
      </div>
    </div>
  );
};
