import React, { useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, apiDelete } from "../../lib/api";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { ArrowLeft, Save, Phone, Store, Clock, Users, UserPlus, Trash2, MessageSquare } from "lucide-react";

const formatPhone = (raw: string): string => {
    const cleaned = raw.replace(/\D/g, "");
    if (cleaned.startsWith("0") && cleaned.length === 10) return `254${cleaned.slice(1)}`;
    if ((cleaned.startsWith("7") || cleaned.startsWith("1")) && cleaned.length === 9) return `254${cleaned}`;
    if (cleaned.startsWith("254") && cleaned.length === 12) return cleaned;
    return cleaned;
};
const isValidPhone = (v: string): boolean => /^254\d{9}$/.test(v);

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

export const AdminSettingsPage: React.FC<AdminSettingsPageProps> = ({ token, onBackToOrders }) => {
    const [staffPhone, setStaffPhone] = useState("");
    const [hotelIsOpen, setHotelIsOpen] = useState(true);
    const [autoCloseTime, setAutoCloseTime] = useState("");
    const [hotelImageUrl, setHotelImageUrl] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
    const [newStaffName, setNewStaffName] = useState("");
    const [newStaffPhone, setNewStaffPhone] = useState("");
    const [newStaffReceiveSms, setNewStaffReceiveSms] = useState(true);
    const [addingStaff, setAddingStaff] = useState(false);

    const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "danger" | "info" }>({
        isOpen: false, title: "", message: "", type: "success",
    });

    const fetchSettingsAndStaff = async () => {
        setLoading(true);
        const [settingsRes, staffRes] = await Promise.all([
            apiGet<{ staffPhone?: string; hotelIsOpen?: boolean; autoCloseAt?: string | null; hotelImageUrl?: string | null }>("/settings", token),
            apiGet<StaffUser[]>("/settings/staff", token),
        ]);

        if (settingsRes.success && settingsRes.data) {
            if (settingsRes.data.staffPhone !== undefined) setStaffPhone(settingsRes.data.staffPhone);
            if (settingsRes.data.hotelIsOpen !== undefined) setHotelIsOpen(settingsRes.data.hotelIsOpen);
            if (settingsRes.data.hotelImageUrl !== undefined) setHotelImageUrl(settingsRes.data.hotelImageUrl || "");
            if (settingsRes.data.autoCloseAt) {
                const d = new Date(settingsRes.data.autoCloseAt);
                if (!isNaN(d.getTime())) {
                    setAutoCloseTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
                }
            }
        }

        if (staffRes.success && staffRes.data) {
            setStaffUsers(staffRes.data);
        }
        setLoading(false);
    };

    useEffect(() => { fetchSettingsAndStaff(); }, []);

    const handleSaveGeneral = async (e: React.FormEvent) => {
        e.preventDefault();
        let autoCloseIso: string | null = null;
        if (hotelIsOpen && autoCloseTime) {
            const [hh = 0, mm = 0] = autoCloseTime.split(":").map(Number);
            if (!isNaN(hh) && !isNaN(mm)) {
                const target = new Date();
                target.setHours(hh, mm, 0, 0);
                if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
                autoCloseIso = target.toISOString();
            }
        }
        setSaving(true);
        const body: Record<string, unknown> = { hotelIsOpen, autoCloseAt: autoCloseIso, hotelImageUrl: hotelImageUrl.trim() || null };
        const staffPhoneVal = staffPhone.trim();
        if (staffPhoneVal) body.staffPhone = staffPhoneVal;
        const res = await apiPatch<any>("/settings", body, token);
        setSaving(false);
        if (res.success) {
            setModal({ isOpen: true, title: "Settings Saved", message: "Hotel status configuration successfully updated.", type: "success" });
        } else {
            setModal({ isOpen: true, title: "Save Failed", message: res.error || "Failed to update settings.", type: "danger" });
        }
    };

    const handleAddStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanNum = formatPhone(newStaffPhone.trim());
        if (!newStaffName.trim() || !cleanNum) return;
        if (!isValidPhone(cleanNum)) {
            setModal({ isOpen: true, title: "Invalid Phone Number", message: "Please enter a valid phone number (10 to 13 digits).", type: "danger" });
            return;
        }
        setAddingStaff(true);
        const res = await apiPost<StaffUser>("/settings/staff", { name: newStaffName.trim(), phone: cleanNum, receiveSms: newStaffReceiveSms }, token);
        setAddingStaff(false);
        if (res.success && res.data) {
            setStaffUsers((prev) => [res.data!, ...prev]);
            setNewStaffName(""); setNewStaffPhone(""); setNewStaffReceiveSms(true);
        } else {
            setModal({ isOpen: true, title: "Failed to Add Staff", message: res.error || "Could not register staff member.", type: "danger" });
        }
    };

    const handleToggleSms = async (id: string, currentVal: boolean) => {
        setStaffUsers((prev) => prev.map((s) => (s.id === id ? { ...s, receiveSms: !currentVal } : s)));
        const res = await apiPatch<StaffUser>(`/settings/staff/${id}`, { receiveSms: !currentVal }, token);
        if (!res.success) {
            setStaffUsers((prev) => prev.map((s) => (s.id === id ? { ...s, receiveSms: currentVal } : s)));
            setModal({ isOpen: true, title: "Update Failed", message: res.error || "Failed to toggle SMS alerts.", type: "danger" });
        }
    };

    const handleDeleteStaff = async (id: string) => {
        const res = await apiDelete<any>(`/settings/staff/${id}`, token);
        if (res.success) {
            setStaffUsers((prev) => prev.filter((s) => s.id !== id));
        } else {
            setModal({ isOpen: true, title: "Deletion Failed", message: res.error || "Could not remove staff member.", type: "danger" });
        }
    };

    return (
        <div className="admin-container">
            <header className="bg-[#114B36] text-white px-4 py-3 sticky top-0 z-40 shadow-[0_2px_8px_rgba(17,75,54,0.15)]">
                <div className="flex items-center gap-3 max-w-4xl mx-auto">
                    <button onClick={onBackToOrders} className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="font-bold text-lg">System Settings</h1>
                </div>
            </header>

            <div className="p-4 max-w-4xl mx-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-4 border-[#E5E7EB] border-t-[#114B36] rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Column 1: Hotel Settings */}
                        <div className="space-y-5">
                            <form onSubmit={handleSaveGeneral} className="bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(17,75,54,0.06)] space-y-4">
                                <div>
                                    <h3 className="font-bold text-sm text-[#1F2937] flex items-center gap-2 mb-4 pb-3 border-b border-[#F3F4F6]">
                                        <Store size={16} className="text-[#114B36]" /> Hotel Status
                                    </h3>
                                    <div className="flex gap-3 mb-4">
                                        <button type="button" onClick={() => setHotelIsOpen(true)}
                                            className={`flex-1 py-3 rounded-xl font-extrabold text-sm cursor-pointer transition-all border-none ${
                                                hotelIsOpen ? "bg-[#DCFCE7] text-[#15803D] border-2 border-[#22C55E]" : "bg-white text-[#6B7280] border-2 border-[#E5E7EB] hover:border-[#D1D5DB]"
                                            }`}
                                        >🟢 OPEN</button>
                                        <button type="button" onClick={() => setHotelIsOpen(false)}
                                            className={`flex-1 py-3 rounded-xl font-extrabold text-sm cursor-pointer transition-all border-none ${
                                                !hotelIsOpen ? "bg-[#FEE2E2] text-[#B91C1C] border-2 border-[#EF4444]" : "bg-white text-[#6B7280] border-2 border-[#E5E7EB] hover:border-[#D1D5DB]"
                                            }`}
                                        >🔴 CLOSED</button>
                                    </div>
                                    {hotelIsOpen && (
                                        <div className="bg-[#FAFAFA] rounded-xl p-3.5 border border-[#E5E7EB]">
                                            <label className="flex items-center gap-1.5 text-xs font-bold text-[#4B5563] mb-1">
                                                <Clock size={13} /> Auto-Close Time (Optional)
                                            </label>
                                            <input type="time" value={autoCloseTime} onChange={(e) => setAutoCloseTime(e.target.value)}
                                                className="w-full px-3 py-2 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm bg-white focus:border-[#114B36] focus:ring-3 focus:ring-[rgba(17,75,54,0.1)]"
                                            />
                                            <p className="text-[0.65rem] text-[#9CA3AF] mt-1">Hotel will auto-close at this time today.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-3 border-t border-[#F3F4F6]">
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-[#4B5563] mb-1">
                                        <Store size={13} /> Hotel Image URL
                                    </label>
                                    <input type="text" placeholder="https://example.com/hotel-image.jpg" value={hotelImageUrl} onChange={(e) => setHotelImageUrl(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm focus:border-[#114B36] focus:ring-3 focus:ring-[rgba(17,75,54,0.1)]"
                                    />
                                    <p className="text-[0.65rem] text-[#9CA3AF] mt-1">Image shown to customers on the hotel selection screen.</p>
                                </div>

                                <div className="pt-3 border-t border-[#F3F4F6]">
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-[#4B5563] mb-1">
                                        <Phone size={13} /> Fallback Phone Number (Legacy)
                                    </label>
                                    <input type="tel" placeholder="e.g. 0712345678" value={staffPhone} onChange={(e) => setStaffPhone(formatPhone(e.target.value))} maxLength={14}
                                        className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm focus:border-[#114B36] focus:ring-3 focus:ring-[rgba(17,75,54,0.1)]"
                                    />
                                    <p className="text-[0.65rem] text-[#9CA3AF] mt-1">Used only if no staff members are registered below.</p>
                                </div>

                                <Button type="submit" disabled={saving || (staffPhone.trim().length > 0 && !isValidPhone(staffPhone.trim()))} loading={saving} fullWidth icon={<Save size={15} />}>
                                    Save Hotel Settings
                                </Button>
                            </form>
                        </div>

                        {/* Column 2: Staff Management */}
                        <div className="space-y-5">
                            <div className="bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(17,75,54,0.06)] space-y-4">
                                <div className="pb-3 border-b border-[#F3F4F6]">
                                    <h3 className="font-bold text-sm text-[#1F2937] flex items-center gap-2">
                                        <Users size={16} className="text-[#114B36]" /> Hotel Staff SMS Receivers
                                    </h3>
                                    <p className="text-[0.7rem] text-[#6B7280] mt-1">Manage who receives SMS alerts for new orders.</p>
                                </div>

                                <form onSubmit={handleAddStaff} className="bg-[#FAFAFA] rounded-xl p-3.5 border border-[#E5E7EB] space-y-3">
                                    <div className="flex gap-2">
                                        <input type="text" placeholder="Staff Name" value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} required
                                            className="flex-1 px-3 py-2 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm focus:border-[#114B36] focus:ring-3 focus:ring-[rgba(17,75,54,0.1)]"
                                        />
                                        <input type="tel" placeholder="Phone: 0712345678" value={newStaffPhone} onChange={(e) => setNewStaffPhone(e.target.value)} required
                                            className="flex-[1.2] px-3 py-2 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm focus:border-[#114B36] focus:ring-3 focus:ring-[rgba(17,75,54,0.1)]"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <label className="flex items-center gap-1.5 text-xs font-semibold text-[#4B5563] cursor-pointer">
                                            <input type="checkbox" checked={newStaffReceiveSms} onChange={(e) => setNewStaffReceiveSms(e.target.checked)}
                                                className="w-4 h-4 accent-[#114B36]"
                                            />
                                            Receive SMS Alerts
                                        </label>
                                        <Button type="submit" variant="primary" size="sm" disabled={addingStaff || !newStaffName.trim() || !newStaffPhone.trim()} loading={addingStaff} icon={<UserPlus size={14} />}>
                                            Add Staff
                                        </Button>
                                    </div>
                                </form>

                                {staffUsers.length === 0 ? (
                                    <div className="text-center py-6 text-[#9CA3AF] border-2 border-dashed border-[#E5E7EB] rounded-xl">
                                        <Users size={28} className="mx-auto mb-1 opacity-40" />
                                        <p className="text-sm font-semibold m-0">No staff added yet</p>
                                        <p className="text-[0.7rem] m-0">Alerts go to the legacy fallback number.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {staffUsers.map((staff) => (
                                            <div key={staff.id}
                                                className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                                                    staff.receiveSms ? "bg-white border-[#E5E7EB]" : "bg-[#F9FAFB] border-[#E5E7EB]"
                                                }`}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className={`text-sm font-bold truncate ${staff.receiveSms ? "text-[#1F2937]" : "text-[#6B7280]"}`}>
                                                        {staff.name}
                                                    </p>
                                                    <p className="text-xs text-[#9CA3AF]">{staff.phone}</p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button type="button" onClick={() => handleToggleSms(staff.id, staff.receiveSms)}
                                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.6rem] font-bold border cursor-pointer transition-colors bg-none ${
                                                            staff.receiveSms
                                                                ? "bg-[#ECFDF5] text-[#15803D] border-[#BBF7D0] hover:bg-[#DCFCE7]"
                                                                : "bg-[#F3F4F6] text-[#9CA3AF] border-[#E5E7EB] hover:bg-[#E5E7EB]"
                                                        }`}
                                                    >
                                                        <MessageSquare size={9} />
                                                        {staff.receiveSms ? "SMS ON" : "SMS OFF"}
                                                    </button>
                                                    <button type="button" onClick={() => handleDeleteStaff(staff.id)}
                                                        className="p-1.5 rounded-lg text-[#9CA3AF] border-none cursor-pointer bg-none hover:text-[#EF4444] hover:bg-[#FEE2E2] transition-colors"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <Modal isOpen={modal.isOpen} onClose={() => setModal((prev) => ({ ...prev, isOpen: false }))}
                type={modal.type} title={modal.title} message={modal.message}
                primaryAction={{ label: "OK", onClick: () => setModal((prev) => ({ ...prev, isOpen: false })) }}
            />
        </div>
    );
};
