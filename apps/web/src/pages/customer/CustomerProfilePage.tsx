import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { Header } from "../../components/ui/Header";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { PageTransition } from "../../components/ui/PageTransition";
import { SecureCodeInput } from "../../components/ui/SecureCodeInput";
import { User, Phone, Tag, Lock, LogOut, Trash2, ChevronRight, CheckCircle2 } from "lucide-react";

const formatPhone = (raw: string): string => {
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("0") && cleaned.length === 10) return `254${cleaned.slice(1)}`;
  if ((cleaned.startsWith("7") || cleaned.startsWith("1")) && cleaned.length === 9) return `254${cleaned}`;
  if (cleaned.startsWith("254") && cleaned.length === 12) return cleaned;
  return cleaned;
};
const isValidPhone = (v: string): boolean => /^254\d{9}$/.test(v);

interface CustomerProfilePageProps {
  onBack: () => void;
}

export const CustomerProfilePage: React.FC<CustomerProfilePageProps> = ({ onBack }) => {
  const { customer, isLoggedIn, logout, updateProfile, deleteAccount, forgotPin, resetPin } = useCustomerAuth();

  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(customer?.firstName ?? "");
  const [lastName, setLastName] = useState(customer?.lastName ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [knownName, setKnownName] = useState(customer?.knownName ?? "");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [showChangePin, setShowChangePin] = useState(false);
  const [pinStep, setPinStep] = useState<"phone" | "otp" | "newPin" | "done">("phone");
  const [pinOtp, setPinOtp] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinSuccess, setPinSuccess] = useState("");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleSave = async () => {
    setSaveError("");
    setSaveSuccess("");
    if (!firstName.trim()) { setSaveError("First name is required."); return; }
    if (!isValidPhone(phone)) { setSaveError("Enter a valid Kenyan phone number."); return; }
    setSaveLoading(true);
    const res = await updateProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      phone,
      knownName: knownName.trim() || null,
    });
    setSaveLoading(false);
    if (res.success) {
      setSaveSuccess("Profile updated successfully.");
      setEditing(false);
    } else {
      setSaveError(res.error ?? "Failed to update profile.");
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    setDeleteLoading(true);
    const res = await deleteAccount();
    setDeleteLoading(false);
    if (res.success) {
      setShowDeleteModal(false);
    } else {
      setDeleteError(res.error ?? "Failed to delete account.");
    }
  };

  const handleChangePinStart = async () => {
    setPinError("");
    setPinSuccess("");
    setPinLoading(true);
    const res = await forgotPin(customer!.phone);
    setPinLoading(false);
    if (res.success) {
      setPinStep("otp");
      setPinSuccess("A reset code has been sent to your phone via SMS.");
    } else {
      setPinError(res.error ?? "Failed to send reset code.");
    }
  };

  const handleChangePinVerify = (otpOverride = pinOtp) => {
    if (otpOverride.length < 4) { setPinError("Enter the full code."); return; }
    setPinStep("newPin");
    setPinError("");
  };

  const handleChangePinSet = async (newPinOverride = pinNew, confirmOverride = pinConfirm) => {
    setPinError("");
    if (newPinOverride.length < 4 || newPinOverride !== confirmOverride) { setPinError("PINs must match and be 4 digits."); return; }
    setPinLoading(true);
    const res = await resetPin(customer!.phone, pinOtp, newPinOverride);
    setPinLoading(false);
    if (res.success) {
      setPinStep("done");
      setPinSuccess("Your PIN has been changed successfully.");
    } else {
      setPinError(res.error ?? "Failed to change PIN.");
    }
  };

  if (!isLoggedIn || !customer) return null;

  return (
    <div className="app-container">
      <Header title="Profile" onBack={onBack} />

      <PageTransition>
        <div className="px-4 py-5 space-y-5">

          {/* Avatar + name card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#EBF5F0] rounded-2xl p-5 flex items-center gap-4"
          >
            <div className="w-14 h-14 rounded-full bg-[#114B36] flex items-center justify-center text-white font-bold text-xl shrink-0">
              {customer.firstName?.[0]?.toUpperCase() || "?"}
            </div>
            <div>
              <p className="font-bold text-base text-[#1F2937]">{customer.firstName}{customer.lastName ? ` ${customer.lastName}` : ""}</p>
              <p className="text-sm text-[#6B7280]">{customer.phone}</p>
              {customer.accountId && <p className="text-xs text-[#114B36] font-mono mt-1">{customer.accountId}</p>}
            </div>
          </motion.div>

          {/* Success/Error messages */}
          <AnimatePresence>
            {saveSuccess && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="bg-[#DCFCE7] text-[#15803D] rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-2"
              ><CheckCircle2 size={16} /> {saveSuccess}</motion.div>
            )}
            {saveError && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="bg-[#FEE2E2] text-[#DC2626] rounded-xl px-4 py-3 text-sm font-semibold"
              >{saveError}</motion.div>
            )}
          </AnimatePresence>

          {/* Profile Form */}
          <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)] overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#F3F4F6] flex items-center justify-between">
              <h2 className="font-bold text-sm text-[#1F2937]">Personal Details</h2>
              {!editing ? (
                <button onClick={() => { setEditing(true); setSaveSuccess(""); setSaveError(""); }}
                  className="text-xs font-bold text-[#114B36] bg-none border-none cursor-pointer hover:underline"
                >Edit</button>
              ) : (
                <button onClick={() => setEditing(false)}
                  className="text-xs font-bold text-[#6B7280] bg-none border-none cursor-pointer hover:underline"
                >Cancel</button>
              )}
            </div>
            <div className="p-4 space-y-3">
              {editing ? (
                <>
                  <Input label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} icon={<User size={16} />} />
                  <Input label="Last Name (optional)" value={lastName} onChange={(e) => setLastName(e.target.value)} icon={<User size={16} />} />
                  <Input label="Phone Number" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} icon={<Phone size={16} />} />
                  <Input label="Known Name (public display name)" placeholder="e.g. Mama Jane" value={knownName} onChange={(e) => setKnownName(e.target.value)} icon={<Tag size={16} />} hint="This is the name discoverable users and conversation participants will see." />
                  <Button onClick={handleSave} loading={saveLoading} fullWidth size="sm">Save Changes</Button>
                </>
              ) : (
                <div className="space-y-3">
                  <ProfileRow icon={<User size={16} />} label="First Name" value={customer.firstName} />
                  {customer.lastName && <ProfileRow icon={<User size={16} />} label="Last Name" value={customer.lastName} />}
                  <ProfileRow icon={<Phone size={16} />} label="Phone" value={customer.phone} />
                  <ProfileRow icon={<Tag size={16} />} label="Visible As" value={customer.knownName || `${customer.firstName}${customer.lastName ? ` ${customer.lastName}` : ""}`} />
                </div>
              )}
            </div>
          </div>

          {/* Known Name (optional) */}
          {customer.knownName && !editing && (
            <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
              <div className="px-4 py-3.5 border-b border-[#F3F4F6]">
                <h2 className="font-bold text-sm text-[#1F2937]">Known As</h2>
              </div>
              <div className="p-4">
                <ProfileRow icon={<Tag size={16} />} label="Known Name" value={customer.knownName} />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)] overflow-hidden">
            <ActionRow
              icon={<Lock size={18} />}
              label="Change PIN"
              onClick={() => { setShowChangePin(true); setPinStep("phone"); setPinOtp(""); setPinNew(""); setPinConfirm(""); setPinError(""); setPinSuccess(""); }}
            />
            <div className="h-px bg-[#F3F4F6] mx-4" />
            <ActionRow
              icon={<LogOut size={18} />}
              label="Sign Out"
              onClick={() => setShowLogoutModal(true)}
              accent
            />
            <div className="h-px bg-[#F3F4F6] mx-4" />
            <ActionRow
              icon={<Trash2 size={18} />}
              label="Delete Account"
              onClick={() => { setShowDeleteModal(true); setDeleteError(""); }}
              danger
            />
          </div>

          <p className="text-center text-xs text-[#9CA3AF] pt-2">
            Ladha v1.2.0
          </p>
        </div>
      </PageTransition>

      {/* Change PIN modal */}
      <Modal isOpen={showChangePin} onClose={() => setShowChangePin(false)} title={pinStep === "done" ? "PIN Changed" : "Change PIN"}>
        {pinStep === "phone" && (
          <div className="space-y-3">
            <p className="text-sm text-[#6B7280]">A reset code will be sent to <strong>{customer.phone}</strong>.</p>
            {pinError && <p className="text-sm font-semibold text-[#DC2626] bg-[#FEE2E2] rounded-xl px-3 py-2">{pinError}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setShowChangePin(false)} fullWidth>Cancel</Button>
              <Button onClick={handleChangePinStart} loading={pinLoading} fullWidth>Send Code</Button>
            </div>
          </div>
        )}
        {pinStep === "otp" && (
          <div className="space-y-3">
            <p className="text-sm text-[#6B7280]">Enter the 4-digit code sent to your phone.</p>
            {pinSuccess && <p className="text-sm font-semibold text-[#15803D] bg-[#DCFCE7] rounded-xl px-3 py-2 flex items-center gap-2"><CheckCircle2 size={14} />{pinSuccess}</p>}
            <SecureCodeInput value={pinOtp} onChange={setPinOtp} onComplete={(code) => handleChangePinVerify(code)} masked={false} autoFocus autoComplete="one-time-code" label="PIN reset code" />
            {pinError && <p className="text-sm font-semibold text-[#DC2626] bg-[#FEE2E2] rounded-xl px-3 py-2">{pinError}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setPinStep("phone")} fullWidth>Back</Button>
              <Button onClick={() => handleChangePinVerify()} disabled={pinOtp.length < 4} fullWidth>Verify</Button>
            </div>
          </div>
        )}
        {pinStep === "newPin" && (
          <div className="space-y-3">
            <p className="text-sm text-[#6B7280]">Choose a new 4-digit PIN.</p>
            <div>
              <label className="block text-sm font-semibold text-[#374151] mb-1">New PIN</label>
              <SecureCodeInput value={pinNew} onChange={setPinNew} label="New PIN" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#374151] mb-1">Confirm PIN</label>
              <SecureCodeInput value={pinConfirm} onChange={setPinConfirm} onComplete={(code) => handleChangePinSet(pinNew, code)} label="Confirm PIN" />
            </div>
            {pinError && <p className="text-sm font-semibold text-[#DC2626] bg-[#FEE2E2] rounded-xl px-3 py-2">{pinError}</p>}
            <Button onClick={() => void handleChangePinSet()} loading={pinLoading} disabled={pinNew.length < 4 || pinNew !== pinConfirm} fullWidth>
              Change PIN
            </Button>
          </div>
        )}
        {pinStep === "done" && (
          <div className="space-y-3 text-center py-2">
            <div className="w-14 h-14 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto">
              <CheckCircle2 size={28} className="text-[#15803D]" />
            </div>
            <p className="text-sm text-[#6B7280]">{pinSuccess || "Your PIN has been changed."}</p>
            <Button onClick={() => setShowChangePin(false)} fullWidth>Done</Button>
          </div>
        )}
      </Modal>

      {/* Logout Confirmation */}
      <Modal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        title="Sign Out?"
        message="Are you sure you want to sign out? You'll need your PIN to sign back in."
        type="confirm"
        primaryAction={{ label: "Sign Out", onClick: () => { logout(); setShowLogoutModal(false); }, variant: "danger" }}
        secondaryAction={{ label: "Cancel", onClick: () => setShowLogoutModal(false) }}
      />

      {/* Delete Account Confirmation */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Account?"
        message="This permanently removes your account and order history. This action cannot be undone."
        type="danger"
        primaryAction={{ label: "Delete My Account", onClick: handleDeleteAccount, loading: deleteLoading, variant: "danger" }}
        secondaryAction={{ label: "Cancel", onClick: () => setShowDeleteModal(false) }}
      />
      {deleteError && (
        <p className="fixed bottom-4 left-4 right-4 bg-[#FEE2E2] text-[#DC2626] rounded-xl px-4 py-3 text-sm font-semibold text-center z-50">{deleteError}</p>
      )}
    </div>
  );
};

function ProfileRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-[#6B7280] shrink-0">{icon}</span>
      <div>
        <p className="text-xs text-[#9CA3AF]">{label}</p>
        <p className="font-semibold text-sm text-[#1F2937]">{value}</p>
      </div>
    </div>
  );
}

function ActionRow({ icon, label, onClick, accent, danger }: { icon: React.ReactNode; label: string; onClick: () => void; accent?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 bg-none border-none cursor-pointer transition-colors hover:bg-[#F9FAFB]"
    >
      <div className="flex items-center gap-3">
        <span className={danger ? "text-[#EF4444]" : accent ? "text-[#D97706]" : "text-[#6B7280]"}>{icon}</span>
        <span className={`font-semibold text-sm ${danger ? "text-[#EF4444]" : "text-[#1F2937]"}`}>{label}</span>
      </div>
      <ChevronRight size={16} className="text-[#D1D5DB]" />
    </button>
  );
}
