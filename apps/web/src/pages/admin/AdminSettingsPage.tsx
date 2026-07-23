/**
 * Purpose: Admin Settings Management Page for tableDash.
 * Responsibilities: Allows admins to configure app settings such as the hotel staff SMS alert phone number.
 * Dependencies: React, apiGet, apiPatch, lucide-react, Modal.
 * When to modify: When adding new administrative settings or feature toggles.
 */

import React, { useEffect, useState } from "react";
import { apiGet, apiPatch } from "../../lib/api";
import { Modal } from "../../components/Modal";
import { ArrowLeft, Save, Phone } from "lucide-react";

interface AdminSettingsPageProps {
  token: string;
  onBackToOrders: () => void;
}

export const AdminSettingsPage: React.FC<AdminSettingsPageProps> = ({
  token,
  onBackToOrders,
}) => {
  const [staffPhone, setStaffPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "danger" }>({
    isOpen: false,
    title: "",
    message: "",
    type: "success",
  });

  const fetchSettings = async () => {
    setLoading(true);
    const res = await apiGet<{ key: string; value: string }[]>("/settings", token);
    if (res.success && res.data) {
      const phoneSetting = res.data.find((s) => s.key === "staff_phone");
      if (phoneSetting) setStaffPhone(phoneSetting.value);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffPhone.trim()) {
      setModal({
        isOpen: true,
        title: "Validation Error",
        message: "Staff phone number cannot be empty.",
        type: "danger",
      });
      return;
    }

    setSaving(true);
    const res = await apiPatch<any>("/settings/staff_phone", { value: staffPhone.trim() }, token);
    setSaving(false);

    if (res.success) {
      setModal({
        isOpen: true,
        title: "Settings Saved",
        message: "Staff SMS alert phone number has been updated successfully.",
        type: "success",
      });
    } else {
      setModal({
        isOpen: true,
        title: "Save Failed",
        message: res.error || "Failed to update setting.",
        type: "danger",
      });
    }
  };

  return (
    <div className="admin-container">
      {/* Header */}
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={onBackToOrders}
            style={{
              background: "none",
              border: "none",
              color: "white",
              fontSize: "1.2rem",
              cursor: "pointer",
              display: "flex",
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div className="header-title">System Settings</div>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ padding: "24px 20px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>
            Loading system settings...
          </div>
        ) : (
          <div style={{ maxWidth: "540px", margin: "0 auto" }}>
            <form onSubmit={handleSave} className="card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ borderBottom: "1px solid #F3F4F6", paddingBottom: "12px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1F2937", margin: 0 }}>
                  📱 SMS Alerts & Notifications
                </h3>
                <p style={{ fontSize: "0.85rem", color: "#6B7280", marginTop: "4px", margin: 0 }}>
                  Configure staff notifications for new customer orders.
                </p>
              </div>

              <div>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                  <Phone size={16} /> Kitchen / Staff Phone Number
                </label>
                <input
                  type="tel"
                  className="input-field"
                  placeholder="e.g. 0712345678 or +254712345678"
                  value={staffPhone}
                  onChange={(e) => setStaffPhone(e.target.value)}
                />
                <p style={{ fontSize: "0.78rem", color: "#9CA3AF", marginTop: "6px" }}>
                  When a customer places an order, an SMS alert will be dispatched to this phone number automatically.
                </p>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
              >
                <Save size={18} />
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Alert Modal */}
      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={() => setModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
