/**
 * Purpose: Reusable Modal & Dialog component for Ladha.
 * Responsibilities: Replaces native window.alert and window.confirm popups with a beautiful, mobile-first bottom-sheet/centered modal.
 * Dependencies: React, lucide-react.
 * When to modify: When adding modal animation styles or altering button variants.
 */

import React from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ModalType = "info" | "warning" | "danger" | "success" | "confirm";

export interface ModalProps {
  isOpen: boolean;
  type?: ModalType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  type = "info",
  title,
  message,
  confirmText = "OK",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const isConfirmType = type === "confirm" || type === "danger";

  const getIcon = () => {
    switch (type) {
      case "danger":
      case "warning":
        return <AlertTriangle size={24} color="#DC2626" />;
      case "success":
        return <CheckCircle2 size={24} color="#16A34A" />;
      case "confirm":
      case "info":
      default:
        return <Info size={24} color="#1E4D36" />;
    }
  };

  const getIconBg = () => {
    switch (type) {
      case "danger":
      case "warning":
        return "#FEE2E2";
      case "success":
        return "#DCFCE7";
      case "confirm":
      case "info":
      default:
        return "#EBF4F0";
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(3px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onCancel || onConfirm}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxWidth: "480px",
          padding: "24px",
          boxShadow: "0 -10px 25px rgba(0, 0, 0, 0.15)",
          transform: "translateY(0)",
          transition: "transform 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: getIconBg(),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {getIcon()}
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              style={{
                background: "none",
                border: "none",
                color: "#9CA3AF",
                cursor: "pointer",
                padding: "4px",
              }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#1F2937", marginBottom: "8px" }}>
          {title}
        </h3>
        <p style={{ fontSize: "0.9rem", color: "#4B5563", lineHeight: 1.5, marginBottom: "24px" }}>
          {message}
        </p>

        <div style={{ display: "flex", gap: "12px" }}>
          {isConfirmType && onCancel && (
            <button
              type="button"
              onClick={onCancel}
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
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className="btn"
            style={{
              flex: 1,
              background: type === "danger" ? "#DC2626" : "#1E4D36",
              color: "#FFFFFF",
              border: "none",
              padding: "12px",
              borderRadius: "10px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
