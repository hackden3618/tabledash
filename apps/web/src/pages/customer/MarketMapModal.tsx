/**
 * Purpose: Interactive Market Map Location Selector modal for Ladha.
 * Responsibilities: Renders visual market zones (Entrance, Food Section, Clothes Section, Hardware Section, Other Stalls, Exit) and captures user zone pin selection.
 * Dependencies: React useState.
 * When to modify: When changing market section layouts or stall zone maps.
 */

import React, { useState } from "react";

interface MarketMapModalProps {
  initialSection?: string;
  onConfirm: (sectionName: string, detailText: string) => void;
  onClose: () => void;
}

export const MarketMapModal: React.FC<MarketMapModalProps> = ({
  initialSection = "Food Section",
  onConfirm,
  onClose,
}) => {
  const [selectedSection, setSelectedSection] = useState(initialSection);
  const [detailNote, setDetailNote] = useState("Near the butcher");

  const zones = [
    { id: "Food Section", name: "Food Section", color: "#FEF08A" },
    { id: "Clothes Section", name: "Clothes Section", color: "#DBEAFE" },
    { id: "Hardware Section", name: "Hardware Section", color: "#FEF3C7" },
    { id: "Other Stalls", name: "Other Stalls", color: "#E0E7FF" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "440px",
          padding: "20px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#1E4D36" }}>Select Your Location</h2>
          <button
            onClick={onClose}
            style={{ border: "none", background: "none", fontSize: "1.5rem", cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: "0.875rem", color: "#6B7280", marginBottom: "16px" }}>
          Main Market — Tap on the map zone where you are located.
        </p>

        {/* Market Visual Layout */}
        <div
          style={{
            border: "2px solid #E5E7EB",
            borderRadius: "16px",
            padding: "16px",
            background: "#FAFAFA",
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#9CA3AF", marginBottom: "12px" }}>
            ⬆ ENTRANCE
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            {zones.map((zone) => {
              const isSelected = selectedSection === zone.id;
              return (
                <div
                  key={zone.id}
                  onClick={() => setSelectedSection(zone.id)}
                  style={{
                    height: "100px",
                    background: zone.color,
                    borderRadius: "12px",
                    border: isSelected ? "3px solid #1E4D36" : "1px solid #D1D5DB",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    color: "#1F2937",
                    cursor: "pointer",
                    position: "relative",
                    transition: "transform 0.15s ease",
                  }}
                >
                  {zone.name}
                  {isSelected && (
                    <div
                      style={{
                        position: "absolute",
                        top: "8px",
                        right: "8px",
                        background: "#EF4444",
                        color: "white",
                        borderRadius: "50%",
                        width: "22px",
                        height: "22px",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        boxShadow: "0 2px 6px rgba(239,68,68,0.4)",
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

        {/* Selected Location Summary Box */}
        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            borderRadius: "12px",
            background: "#EBF4F0",
            border: "1px solid #1E4D36",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1E4D36", textTransform: "uppercase" }}>
            Selected Location
          </div>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "#1F2937", marginTop: "2px" }}>
            {selectedSection}
          </div>
          <input
            type="text"
            placeholder="Specific detail (e.g. Near the butcher)"
            value={detailNote}
            onChange={(e) => setDetailNote(e.target.value)}
            style={{
              width: "100%",
              marginTop: "8px",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #D1D5DB",
              fontSize: "0.875rem",
            }}
          />
        </div>

        <button
          onClick={() => onConfirm(selectedSection, detailNote)}
          className="btn btn-primary"
          style={{ marginTop: "16px" }}
        >
          Confirm Location
        </button>
      </div>
    </div>
  );
};
