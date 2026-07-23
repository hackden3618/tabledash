/**
 * Purpose: Admin Settings Management Page for tableDash.
 * Responsibilities: Allows admins to configure app settings such as the hotel open/closed status,
 *   auto-close scheduler, and multiple staff users who receive real-time SMS alerts on new orders.
 * Dependencies: React, apiGet, apiPatch, apiPost, apiDelete, lucide-react, Modal.
 * When to modify: When adding new settings fields, changing layout structure, or adding staff fields.
 */

import React, { useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, apiDelete } from "../../lib/api";
import { Modal } from "../../components/Modal";
import { ArrowLeft, Save, Phone, Store, Clock, Users, UserPlus, Trash2, MessageSquare } from "lucide-react";

const cleanPhone = (raw: string): string => raw.replace(/[^\d+]/g, "");
const isValidPhone = (v: string): boolean => /^\+?\d{10,13}$/.test(v);

interface StaffUser {
  id: string;
  name: string;
  phone: string;
  receiveSms: boolean;
}

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

  // Multiple staff user states
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPhone, setNewStaffPhone] = useState("");
  const [newStaffReceiveSms, setNewStaffReceiveSms] = useState(true);
  const [addingStaff, setAddingStaff] = useState(false);

  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "danger" }>({
    isOpen: false,
    title: "",
    message: "",
    type: "success",
  });

  const fetchSettingsAndStaff = async () => {
    setLoading(true);
    const [settingsRes, staffRes] = await Promise.all([
      apiGet<{ staffPhone?: string; hotelIsOpen?: boolean; autoCloseAt?: string | null }>("/settings", token),
      apiGet<StaffUser[]>("/settings/staff", token),
    ]);

    if (settingsRes.success && settingsRes.data) {
      if (settingsRes.data.staffPhone !== undefined) setStaffPhone(settingsRes.data.staffPhone);
      if (settingsRes.data.hotelIsOpen !== undefined) setHotelIsOpen(settingsRes.data.hotelIsOpen);
      if (settingsRes.data.autoCloseAt) {
        const d = new Date(settingsRes.data.autoCloseAt);
        if (!isNaN(d.getTime())) {
          const hh = String(d.getHours()).padStart(2, "0");
          const mm = String(d.getMinutes()).padStart(2, "0");
          setAutoCloseTime(`${hh}:${mm}`);
        }
      }
    }

    if (staffRes.success && staffRes.data) {
      setStaffUsers(staffRes.data);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchSettingsAndStaff();
  }, []);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();

    let autoCloseIso: string | null = null;
    if (hotelIsOpen && autoCloseTime) {
      const [hh = 0, mm = 0] = autoCloseTime.split(":").map(Number);
      if (!isNaN(hh) && !isNaN(mm)) {
        const target = new Date();
        target.setHours(hh, mm, 0, 0);
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
        message: "Hotel status configuration successfully updated.",
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

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = cleanPhone(newStaffPhone.trim());
    if (!newStaffName.trim() || !cleanNum) return;

    if (!isValidPhone(cleanNum)) {
      setModal({
        isOpen: true,
        title: "Invalid Phone Number",
        message: "Please enter a valid phone number (10 to 13 digits).",
        type: "danger",
      });
      return;
    }

    setAddingStaff(true);
    const res = await apiPost<StaffUser>(
      "/settings/staff",
      {
        name: newStaffName.trim(),
        phone: cleanNum,
        receiveSms: newStaffReceiveSms,
      },
      token
    );
    setAddingStaff(false);

    if (res.success && res.data) {
      setStaffUsers((prev) => [res.data!, ...prev]);
      setNewStaffName("");
      setNewStaffPhone("");
      setNewStaffReceiveSms(true);
    } else {
      setModal({
        isOpen: true,
        title: "Failed to Add Staff",
        message: res.error || "Could not register staff member.",
        type: "danger",
      });
    }
  };

  const handleToggleSms = async (id: string, currentVal: boolean) => {
    // Optimistic state change
    setStaffUsers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, receiveSms: !currentVal } : s))
    );

    const res = await apiPatch<StaffUser>(
      `/settings/staff/${id}`,
      { receiveSms: !currentVal },
      token
    );

    if (!res.success) {
      // Revert if API request fails
      setStaffUsers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, receiveSms: currentVal } : s))
      );
      setModal({
        isOpen: true,
        title: "Update Failed",
        message: res.error || "Failed to toggle SMS alerts.",
        type: "danger",
      });
    }
  };

  const handleDeleteStaff = async (id: string) => {
    const res = await apiDelete<any>(`/settings/staff/${id}`, token);
    if (res.success) {
      setStaffUsers((prev) => prev.filter((s) => s.id !== id));
    } else {
      setModal({
        isOpen: true,
        title: "Deletion Failed",
        message: res.error || "Could not remove staff member.",
        type: "danger",
      });
    }
  };

  return (
    <div className="admin-container">
      {/* Header Bar */}
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

      {/* Main Content Layout */}
      <div style={{ padding: "24px 20px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>
            Loading system settings...
          </div>
        ) : (
          <div style={{ maxWidth: "800px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "24px" }}>
            {/* Column 1: Store Open/Closed Toggle & Legacy Fallback settings */}
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <form onSubmit={handleSaveGeneral} className="card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <div style={{ borderBottom: "1px solid #F3F4F6", paddingBottom: "10px", marginBottom: "16px" }}>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#1F2937", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                      <Store size={18} color="#1E4D36" /> Hotel Status
                    </h3>
                  </div>

                  <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                    <button
                      type="button"
                      onClick={() => setHotelIsOpen(true)}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: "10px",
                        border: hotelIsOpen ? "2px solid #22C55E" : "1.5px solid #E5E7EB",
                        background: hotelIsOpen ? "#DCFCE7" : "#FFFFFF",
                        color: hotelIsOpen ? "#15803D" : "#6B7280",
                        fontWeight: 800,
                        cursor: "pointer",
                        fontSize: "0.88rem",
                        transition: "all 0.15s ease",
                      }}
                    >
                      🟢 OPEN
                    </button>
                    <button
                      type="button"
                      onClick={() => setHotelIsOpen(false)}
                      style={{
                        flex: 1,
                        padding: "12px",
                        borderRadius: "10px",
                        border: !hotelIsOpen ? "2px solid #EF4444" : "1.5px solid #E5E7EB",
                        background: !hotelIsOpen ? "#FEE2E2" : "#FFFFFF",
                        color: !hotelIsOpen ? "#B91C1C" : "#6B7280",
                        fontWeight: 800,
                        cursor: "pointer",
                        fontSize: "0.88rem",
                        transition: "all 0.15s ease",
                      }}
                    >
                      🔴 CLOSED
                    </button>
                  </div>

                  {hotelIsOpen && (
                    <div style={{ background: "#FAFAFA", borderRadius: "10px", padding: "14px", border: "1px solid #E5E7EB" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", fontWeight: 700, color: "#4B5563", marginBottom: "6px" }}>
                        <Clock size={14} /> Auto-Close Time (Optional)
                      </label>
                      <input
                        type="time"
                        className="input-field"
                        value={autoCloseTime}
                        onChange={(e) => setAutoCloseTime(e.target.value)}
                      />
                      <p style={{ fontSize: "0.75rem", color: "#9CA3AF", marginTop: "6px", margin: 0 }}>
                        The hotel status will automatically switch to closed when this time is reached today.
                      </p>
                    </div>
                  )}
                </div>

                {/* Legacy Fallback settings */}
                <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: "16px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: 700, color: "#4B5563", marginBottom: "6px" }}>
                    <Phone size={14} /> Fallback Phone Number (Legacy)
                  </label>
                  <input
                    type="tel"
                    className="input-field"
                    placeholder="e.g. 0712345678"
                    value={staffPhone}
                    onChange={(e) => setStaffPhone(cleanPhone(e.target.value))}
                    maxLength={14}
                  />
                  <p style={{ fontSize: "0.75rem", color: "#9CA3AF", marginTop: "4px", margin: 0 }}>
                    Used only if no specific staff members are registered below.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={saving || (staffPhone.trim().length > 0 && !isValidPhone(staffPhone.trim()))}
                  className="btn btn-primary"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%" }}
                >
                  <Save size={16} />
                  {saving ? "Saving General..." : "Save Hotel Settings"}
                </button>
              </form>
            </div>

            {/* Column 2: Multiple Hotel Staff SMS dispatch list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div className="card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <div style={{ borderBottom: "1px solid #F3F4F6", paddingBottom: "10px", marginBottom: "16px" }}>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#1F2937", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                      <Users size={18} color="#1E4D36" /> Hotel Staff SMS Receivers
                    </h3>
                    <p style={{ fontSize: "0.8rem", color: "#6B7280", marginTop: "4px", margin: 0 }}>
                      Manage staff members and toggle who receives SMS notifications for new orders.
                    </p>
                  </div>

                  {/* Add Staff form */}
                  <form onSubmit={handleAddStaff} style={{ display: "flex", flexDirection: "column", gap: "12px", background: "#FAFAFA", borderRadius: "10px", padding: "14px", border: "1px solid #E5E7EB", marginBottom: "16px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        placeholder="Staff Name"
                        className="input-field"
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                        required
                        style={{ flex: 1, padding: "8px 12px" }}
                      />
                      <input
                        type="tel"
                        placeholder="Phone: e.g. 0712345678"
                        className="input-field"
                        value={newStaffPhone}
                        onChange={(e) => setNewStaffPhone(e.target.value)}
                        required
                        style={{ flex: 1.2, padding: "8px 12px" }}
                      />
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", fontWeight: 600, color: "#4B5563", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={newStaffReceiveSms}
                          onChange={(e) => setNewStaffReceiveSms(e.target.checked)}
                          style={{ width: "16px", height: "16px", accentColor: "#1E4D36" }}
                        />
                        Receive SMS Alerts immediately
                      </label>
                      <button
                        type="submit"
                        disabled={addingStaff || !newStaffName.trim() || !newStaffPhone.trim()}
                        className="btn btn-primary"
                        style={{ padding: "6px 12px", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "4px" }}
                      >
                        <UserPlus size={14} /> Add Staff
                      </button>
                    </div>
                  </form>

                  {/* Staff List */}
                  {staffUsers.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "#9CA3AF", border: "1.5px dashed #E5E7EB", borderRadius: "10px" }}>
                      <Users size={28} style={{ opacity: 0.4, marginBottom: "6px" }} />
                      <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}>No specific staff added yet</p>
                      <p style={{ margin: "2px 0 0 0", fontSize: "0.75rem" }}>Alerts will be sent to the legacy fallback number.</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "300px", overflowY: "auto", paddingRight: "4px" }}>
                      {staffUsers.map((staff) => (
                        <div
                          key={staff.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: "1px solid #E5E7EB",
                            background: staff.receiveSms ? "#FFFFFF" : "#F9FAFB",
                            transition: "background-color 0.15s ease",
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: staff.receiveSms ? "#1F2937" : "#6B7280" }}>
                              {staff.name}
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "#9CA3AF", marginTop: "1px" }}>
                              {staff.phone}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                            {/* Toggle Button */}
                            <button
                              type="button"
                              onClick={() => handleToggleSms(staff.id, staff.receiveSms)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "4px 8px",
                                borderRadius: "15px",
                                border: staff.receiveSms ? "1px solid #BBF7D0" : "1px solid #E5E7EB",
                                background: staff.receiveSms ? "#HN15803D" : "#FFFFFF", // fallback HSL-tailored tone
                                backgroundColor: staff.receiveSms ? "#ECFDF5" : "#F3F4F6",
                                color: staff.receiveSms ? "#15803D" : "#9CA3AF",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <MessageSquare size={10} />
                              {staff.receiveSms ? "SMS ON" : "SMS OFF"}
                            </button>

                            {/* Delete button */}
                            <button
                              type="button"
                              onClick={() => handleDeleteStaff(staff.id)}
                              style={{
                                border: "none",
                                background: "none",
                                color: "#9CA3AF",
                                cursor: "pointer",
                                padding: "4px",
                                borderRadius: "4px",
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.backgroundColor = "#FEE2E2"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "#9CA3AF"; e.currentTarget.style.backgroundColor = "transparent"; }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
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
