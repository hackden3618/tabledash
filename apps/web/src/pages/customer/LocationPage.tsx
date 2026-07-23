/**
 * Purpose: Delivery Location & Order Submission View for tableDash.
 * Responsibilities: Handles market section selection (via interactive map modal), location text description, customer phone input, and order placement API call.
 * Dependencies: React, useCart context, apiPost helper, MarketMapModal.
 * When to modify: When adding new location fields or changing order submission payload format.
 */

import React, { useState } from "react";
import { useCart } from "../../context/CartContext";
import { apiPost } from "../../lib/api";
import { MarketMapModal } from "./MarketMapModal";

interface LocationPageProps {
  onBackToCart: () => void;
  onOrderPlaced: (orderData: any) => void;
}

export const LocationPage: React.FC<LocationPageProps> = ({ onBackToCart, onOrderPlaced }) => {
  const { cart, totalAmount, clearCart } = useCart();

  const [marketSection, setMarketSection] = useState("Food Section");
  const [locationDescription, setLocationDescription] = useState("Near the butcher");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [showMapModal, setShowMapModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handlePlaceOrder = async () => {
    setErrorMessage("");

    if (!customerName.trim()) {
      setErrorMessage("Please enter your name.");
      return;
    }
    if (!phone.trim() || phone.length < 9) {
      setErrorMessage("Please enter a valid phone number (e.g. 0712345678).");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      customerName: customerName.trim(),
      phone: phone.trim(),
      marketSection: marketSection,
      locationDescription: locationDescription,
      items: cart.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      })),
    };

    const res = await apiPost<any>("/orders", payload);
    setIsSubmitting(false);

    if (res.success && res.data) {
      clearCart();
      onOrderPlaced(res.data);
    } else {
      setErrorMessage(res.error || "Failed to place order. Please try again.");
    }
  };

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={onBackToCart}
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
          <div className="header-title">Delivery Location</div>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ padding: "20px" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1F2937", marginBottom: "16px" }}>
          How would you like to set your location?
        </h2>

        {/* Option 1: Select on Market Map */}
        <div
          onClick={() => setShowMapModal(true)}
          style={{
            border: "1.5px solid #1E4D36",
            borderRadius: "14px",
            padding: "16px",
            background: "#EBF4F0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "1.5rem" }}>📍</span>
            <div>
              <div style={{ fontWeight: 700, color: "#1E4D36" }}>Select on Market Map</div>
              <div style={{ fontSize: "0.85rem", color: "#4B5563" }}>
                {marketSection} — {locationDescription || "Tap to select on map"}
              </div>
            </div>
          </div>
          <span style={{ fontSize: "1.2rem", color: "#1E4D36" }}>›</span>
        </div>

        <div style={{ textAlign: "center", margin: "20px 0", color: "#9CA3AF", fontWeight: 600, fontSize: "0.85rem" }}>
          OR
        </div>

        {/* Option 2: Form Inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
              Your Name
            </label>
            <input
              type="text"
              placeholder="e.g. Mary Wanjiku"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
              Phone Number
            </label>
            <input
              type="tel"
              placeholder="07XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
              Describe your location
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Near Mama Jane's stall, Food section, beside the blue umbrella"
              value={locationDescription}
              onChange={(e) => setLocationDescription(e.target.value)}
              className="input-field"
              style={{ resize: "vertical" }}
            />
          </div>

          {errorMessage && (
            <div
              style={{
                padding: "12px",
                borderRadius: "8px",
                background: "#FEE2E2",
                color: "#DC2626",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* Total & Submit Button */}
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontSize: "0.9rem", color: "#6B7280", marginBottom: "8px" }}>
              Total Order Amount: <strong style={{ color: "#1E4D36" }}>KSh {totalAmount}</strong>
            </div>

            <button
              onClick={handlePlaceOrder}
              disabled={isSubmitting}
              className="btn btn-primary"
            >
              {isSubmitting ? "Placing Order..." : "Place Order"}
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Market Map Modal */}
      {showMapModal && (
        <MarketMapModal
          initialSection={marketSection}
          onConfirm={(section, note) => {
            setMarketSection(section);
            if (note) setLocationDescription(note);
            setShowMapModal(false);
          }}
          onClose={() => setShowMapModal(false)}
        />
      )}
    </div>
  );
};
