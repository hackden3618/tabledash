/**
 * Purpose: Admin Settings Management Page for tableDash.
 * Responsibilities: Allows admins to configure app settings such as the hotel staff SMS alert phone number,
 *   manual Hotel Open / Closed toggle, and automatic closing schedule.
 * Dependencies: React, apiGet, apiPatch, lucide-react, Modal.
 * When to modify: When adding new administrative settings or feature toggles.
 */

import React, { useEffect, useState } from "react";
import { apiGet, apiPatch } from "../../lib/api";
import { Modal } from "../../components/Modal";
import { ArrowLeft, Save, Phone, Store, Clock } from "lucide-react";

interface AdminSettingsPageProps {
  token: string;
  onBackToOrders: () => void;
}

export const AdminSettingsPage: React.FC<AdminSettingsPageProps> = ({
  token,
  onBackToOrders,
}) => {
  const [staffPhone, setStaffPhone] = useState("");
  const [hotelIsOpen, setHotelIsOpen] = useState(true);
  const [autoCloseTime, setAutoCloseTime] = useState("");
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
    const res = await apiGet<{ staffPhone?: string; hotelIsOpen?: boolean; autoCloseAt?: string | null }>("/settings", token);
    if (res.success && res.data) {
      if (res.data.staffPhone !== undefined) setStaffPhone(res.data.staffPhone);
      if (res.data.hotelIsOpen !== undefined) setHotelIsOpen(res.data.hotelIsOpen);
      if (res.data.autoCloseAt) {
        const d = new Date(res.data.autoCloseAt);
        if (!isNaN(d.getTime())) {
          const hh = String(d.getHours()).padStart(2, "0");
          const mm = String(d.getMinutes()).padStart(2, "0");
          setAutoCloseTime(`${hh}:${mm}`);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    let autoCloseIso: string | null = null;
    if (hotelIsOpen && autoCloseTime) {
      const [hh, mm] = autoCloseTime.split(":").map(Number);
      if (!isNaN(hh) && !isNaN(mm)) {
        const target = new Date();
        target.setHours(hh, mm, 0, 0);
        // If time has passed for today, assume tomorrow
        if (target.getTime() <= Date.now()) {
          target.setDate(target.getDate() + 1);
        }
        autoCloseIso = target.toISOString();
      }
    }

    setSaving(true);
    const res = await apiPatch<any>(
      "/settings",
      {
        staffPhone: staffPhone.trim(),
        hotelIsOpen: hotelIsOpen,
        autoCloseAt: autoCloseIso,
      },
      token
    );
    setSaving(false);

    if (res.success) {
      setModal({
        isOpen: true,
        title: "Settings Saved",
        message: "Hotel configuration and SMS alert settings updated successfully.",
        type: "success",
      });
    } else {
      setModal({
        isOpen: true,
        title: "Save Failed",
        message: res.error || "Failed to update settings.",
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
            <form onSubmit={handleSave} className="card" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Section 1: Store Open/Closed Status */}
              <div>
                <div style={{ borderBottom: "1px solid #F3F4F6", paddingBottom: "10px", marginBottom: "16px" }}>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#1F2937", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                    <Store size={18} color="#1E4D36" /> Hotel Open / Closed Status
                  </h3>
                  <p style={{ fontSize: "0.82rem", color: "#6B7280", marginTop: "4px", margin: 0 }}>
                    Manually toggle order acceptance or set an automatic closing schedule.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                  <button
                    type="button"
                    onClick={() => setHotelIsOpen(true)}
                    style={{
                      flex: 1,
                      padding: "14px",
                      borderRadius: "12px",
                      border: hotelIsOpen ? "2px solid #22C55E" : "1.5px solid #E5E7EB",
                      background: hotelIsOpen ? "#DCFCE7" : "#FFFFFF",
                      color: hotelIsOpen ? "#15803D" : "#6B7280",
                      fontWeight: 800,
                      cursor: "pointer",
                      fontSize: "0.95rem",
                    }}
                  >
                    🟢 OPEN FOR ORDERS
                  </button>
                  <button
                    type="button"
                    onClick={() => setHotelIsOpen(false)}
                    style={{
                      flex: 1,
                      padding: "14px",
                      borderRadius: "12px",
                      border: !hotelIsOpen ? "2px solid #EF4444" : "1.5px solid #E5E7EB",
                      background: !hotelIsOpen ? "#FEE2E2" : "#FFFFFF",
                      color: !hotelIsOpen ? "#B91C1C" : "#6B7280",
                      fontWeight: 800,
                      cursor: "pointer",
                      fontSize: "0.95rem",
                    }}
                  >
                    🔴 CLOSED FOR ORDERS
                  </button>
                </div>

                {hotelIsOpen && (
                  <div style={{ background: "#FAFAFA", borderRadius: "10px", padding: "14px", border: "1px solid #E5E7EB" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                      <Clock size={15} /> Auto-Close Time Today (Optional)
                    </label>
                    <input
                      type="time"
                      className="input-field"
                      value={autoCloseTime}
                      onChange={(e) => setAutoCloseTime(e.target.value)}
                    />
                    <p style={{ fontSize: "0.75rem", color: "#9CA3AF", marginTop: "6px" }}>
                      If set, the hotel will automatically close for new customer orders when this time is reached.
                    </p>
                  </div>
                )}
              </div>

              {/* Section 2: SMS Alerts */}
              <div>
                <div style={{ borderBottom: "1px solid #F3F4F6", paddingBottom: "10px", marginBottom: "16px" }}>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#1F2937", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                    <Phone size={18} color="#1E4D36" /> SMS Alerts Phone
                  </h3>
                </div>

                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                    Kitchen / Staff Phone Number
                  </label>
                  <input
                    type="tel"
                    className="input-field"
                    placeholder="e.g. 0712345678"
                    value={staffPhone}
                    onChange={(e) => setStaffPhone(e.target.value)}
                  />
                  <p style={{ fontSize: "0.78rem", color: "#9CA3AF", marginTop: "6px" }}>
                    New order alert SMS messages will be sent to this phone number automatically.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "8px" }}
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
