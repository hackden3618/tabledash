import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useCart } from "../../context/CartContext";
import { Header } from "../../components/ui/Header";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { PageTransition } from "../../components/ui/PageTransition";
import { SecureCodeInput } from "../../components/ui/SecureCodeInput";
import { User, Phone, Tag, Lock, LogOut, Trash2, ChevronRight, CheckCircle2, ShieldCheck, Smartphone, Bell } from "lucide-react";
import { subscribeToPush, getNotificationPermissionState } from "../../pwa/push";
import { PersistentNotificationCard } from "../../components/PersistentNotificationCard";

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
  const { customer, isLoggedIn, logout, updateProfile, changePhone, verifyPhoneChange, refreshProfile, deleteAccount, forgotPin, resetPin } = useCustomerAuth();
  const { clearCart } = useCart();

  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(customer?.firstName ?? "");
  const [lastName, setLastName] = useState(customer?.lastName ?? "");
  const [knownName, setKnownName] = useState(customer?.knownName ?? "");
  const [editPin, setEditPin] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [showChangePhone, setShowChangePhone] = useState(false);
  const [phoneStep, setPhoneStep] = useState<"pin" | "new" | "otp" | "done">("pin");
  const [phonePin, setPhonePin] = useState("");
  const [phoneNew, setPhoneNew] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [phoneSuccess, setPhoneSuccess] = useState("");

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

  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(() => getNotificationPermissionState());
  const [pushLoading, setPushLoading] = useState(false);

  const handleEnableNotifications = async () => {
    setPushLoading(true);
    const token = localStorage.getItem("ladha_customer_token") || "";
    const res = await subscribeToPush(token);
    setPushLoading(false);
    setPushPermission(getNotificationPermissionState());
    if (res === "subscribed") {
      setSaveSuccess("Notifications enabled! You'll receive real-time order updates.");
    } else if (res === "denied") {
      setSaveError("Notification permission was denied in your browser settings.");
    } else if (res === "unsupported") {
      setSaveError("Push notifications are not supported on this device/browser.");
    }
  };

  const handleSave = async () => {
    setSaveError("");
    setSaveSuccess("");
    if (!firstName.trim()) { setSaveError("First name is required."); return; }
    if (editPin.length < 4) { setSaveError("Enter your 4-digit PIN to save changes."); return; }
    setSaveLoading(true);
    const res = await updateProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      knownName: knownName.trim() || null,
    }, editPin);
    setSaveLoading(false);
    if (res.success) {
      setSaveSuccess("Profile updated successfully.");
      setEditPin("");
      setEditing(false);
    } else {
      setSaveError(res.error ?? "Failed to update profile.");
    }
  };

  const openChangePhone = () => {
    setPhoneStep(customer?.isVerified ? "pin" : "done");
    setPhonePin(""); setPhoneNew(""); setPhoneOtp("");
    setPhoneError(""); setPhoneSuccess(customer?.isVerified ? "" : "Phone changes require a verified account (PIN + OTP). Verify your account to change your number.");
    setShowChangePhone(true);
  };

  const handlePhoneSend = async () => {
    setPhoneError("");
    if (!isValidPhone(phoneNew)) { setPhoneError("Enter a valid Kenyan phone number."); return; }
    if (phoneNew === customer!.phone) { setPhoneError("That's already your current phone number."); return; }
    setPhoneLoading(true);
    const res = await changePhone(phoneNew, phonePin);
    setPhoneLoading(false);
    if (res.success) {
      setPhoneStep("otp");
      setPhoneSuccess("A verification code has been sent to your new number via SMS. Your current number stays active until you verify.");
    } else {
      setPhoneError(res.error ?? "Failed to start phone change.");
    }
  };

  const handlePhoneVerify = async (otpOverride = phoneOtp) => {
    if (otpOverride.length < 4) { setPhoneError("Enter the full code."); return; }
    setPhoneError("");
    setPhoneLoading(true);
    const res = await verifyPhoneChange(otpOverride);
    setPhoneLoading(false);
    if (res.success) {
      setPhoneStep("done");
      setPhoneSuccess("Your phone number has been updated.");
      await refreshProfile();
    } else {
      setPhoneError(res.error ?? "Verification failed.");
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
                <button onClick={() => { setEditing(true); setSaveSuccess(""); setSaveError(""); setEditPin(""); }}
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
                  <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl px-3.5 py-3 flex items-center gap-3">
                    <span className="text-[#6B7280] shrink-0"><Smartphone size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[#9CA3AF]">Phone Number</p>
                      <p className="font-semibold text-sm text-[#1F2937] truncate">{customer.phone}</p>
                    </div>
                    <span className="flex items-center gap-1 text-[0.6rem] font-bold text-[#114B36] bg-[#EBF5F0] rounded-full px-2 py-0.5 shrink-0"><Lock size={10} /> LOCKED</span>
                  </div>
                  <Input label="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} icon={<User size={16} />} />
                  <Input label="Last Name (optional)" value={lastName} onChange={(e) => setLastName(e.target.value)} icon={<User size={16} />} />
                  <Input label="Known Name (public display name)" placeholder="e.g. Mama Jane" value={knownName} onChange={(e) => setKnownName(e.target.value)} icon={<Tag size={16} />} hint="This is the name discoverable users and conversation participants will see." />
                  <Input
                    label="Current PIN *"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={editPin}
                    onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ""))}
                    icon={<Lock size={16} />}
                    hint={customer.hasPin ? "Your PIN is required to save changes." : "You don't have a PIN yet. Verify your account (PIN + OTP) to change your details."}
                  />
                  <p className="text-[0.65rem] text-[#9CA3AF] flex items-center gap-1.5 leading-relaxed">
                    <ShieldCheck size={13} className="text-[#114B36] shrink-0" />
                    Your phone number is locked and can't be edited here. To change it, use "Change Phone Number" below — it needs your PIN and OTP verification of the new number.
                  </p>
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

          {/* Persistent Notifications & Sound / Haptics Card */}
          <PersistentNotificationCard />

          {/* Actions */}
          <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)] overflow-hidden">
            <ActionRow
              icon={<Smartphone size={18} />}
              label="Change Phone Number"
              hint="PIN + OTP verification required"
              onClick={openChangePhone}
            />
            <div className="h-px bg-[#F3F4F6] mx-4" />
            <ActionRow
              icon={<Lock size={18} />}
              label="Change PIN"
              onClick={() => { setShowChangePin(true); setPinStep("phone"); setPinOtp(""); setPinNew(""); setPinConfirm(""); setPinError(""); setPinSuccess(""); }}
            />
            <div className="h-px bg-[#F3F4F6] mx-4" />
            <ActionRow
              icon={<Bell size={18} />}
              label={pushPermission === "granted" ? "Push Notifications Active" : pushLoading ? "Enabling..." : "Allow Push Notifications"}
              hint={pushPermission === "granted" ? "Real-time order tracking alerts enabled" : pushPermission === "denied" ? "Permission denied in browser settings" : "Receive instant alerts when order status changes"}
              onClick={handleEnableNotifications}
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

      {/* Change Phone Number modal */}
      <Modal isOpen={showChangePhone} onClose={() => setShowChangePhone(false)} title={phoneStep === "done" ? "Phone Number Changed" : "Change Phone Number"}>
        {phoneStep === "pin" && (
          <div className="space-y-3">
            <p className="text-sm text-[#6B7280]">Confirm your current PIN to change the phone number on this account.</p>
            <div>
              <label className="block text-sm font-semibold text-[#374151] mb-1">Current PIN</label>
              <SecureCodeInput value={phonePin} onChange={setPhonePin} label="Current PIN" onComplete={(code) => { setPhonePin(code); setPhoneStep("new"); setPhoneError(""); }} />
            </div>
            {phoneError && <p className="text-sm font-semibold text-[#DC2626] bg-[#FEE2E2] rounded-xl px-3 py-2">{phoneError}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setShowChangePhone(false)} fullWidth>Cancel</Button>
              <Button onClick={() => { if (phonePin.length < 4) { setPhoneError("Enter the full PIN."); return; } setPhoneError(""); setPhoneStep("new"); }} fullWidth>Next</Button>
            </div>
          </div>
        )}
        {phoneStep === "new" && (
          <div className="space-y-3">
            <p className="text-sm text-[#6B7280]">Enter the new phone number. We'll send a verification code to it — your current number stays active until you verify.</p>
            <Input
              label="New Phone Number"
              placeholder="07XXXXXXXX"
              value={phoneNew}
              onChange={(e) => setPhoneNew(formatPhone(e.target.value))}
              maxLength={14}
              icon={<Smartphone size={16} />}
            />
            {phoneError && <p className="text-sm font-semibold text-[#DC2626] bg-[#FEE2E2] rounded-xl px-3 py-2">{phoneError}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setPhoneStep("pin")} fullWidth>Back</Button>
              <Button onClick={handlePhoneSend} loading={phoneLoading} disabled={phoneNew.length < 12} fullWidth>Send Code</Button>
            </div>
          </div>
        )}
        {phoneStep === "otp" && (
          <div className="space-y-3">
            <p className="text-sm text-[#6B7280]">Enter the 4-digit code sent to <strong>{phoneNew}</strong>.</p>
            {phoneSuccess && <p className="text-sm font-semibold text-[#15803D] bg-[#DCFCE7] rounded-xl px-3 py-2 flex items-center gap-2"><CheckCircle2 size={14} />{phoneSuccess}</p>}
            <SecureCodeInput value={phoneOtp} onChange={setPhoneOtp} onComplete={(code) => void handlePhoneVerify(code)} masked={false} autoFocus autoComplete="one-time-code" label="Phone verification code" />
            {phoneError && <p className="text-sm font-semibold text-[#DC2626] bg-[#FEE2E2] rounded-xl px-3 py-2">{phoneError}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setPhoneStep("new")} fullWidth>Back</Button>
              <Button onClick={() => void handlePhoneVerify()} loading={phoneLoading} disabled={phoneOtp.length < 4} fullWidth>Verify</Button>
            </div>
          </div>
        )}
        {phoneStep === "done" && (
          <div className="space-y-3 text-center py-2">
            <div className="w-14 h-14 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto">
              <CheckCircle2 size={28} className="text-[#15803D]" />
            </div>
            <p className="text-sm text-[#6B7280]">{phoneSuccess || (customer?.isVerified ? "Your phone number has been updated." : "Your phone number stays locked until your account is verified.")}</p>
            <Button onClick={() => setShowChangePhone(false)} fullWidth>Done</Button>
          </div>
        )}
      </Modal>

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
        primaryAction={{ label: "Sign Out", onClick: () => { clearCart(); logout(); setShowLogoutModal(false); }, variant: "danger" }}
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

function ActionRow({ icon, label, onClick, accent, danger, hint }: { icon: React.ReactNode; label: string; onClick: () => void; accent?: boolean; danger?: boolean; hint?: string }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 bg-none border-none cursor-pointer transition-colors hover:bg-[#F9FAFB]"
    >
      <div className="flex items-center gap-3">
        <span className={danger ? "text-[#EF4444]" : accent ? "text-[#D97706]" : "text-[#6B7280]"}>{icon}</span>
        <span>
          <span className={`block font-semibold text-sm ${danger ? "text-[#EF4444]" : "text-[#1F2937]"}`}>{label}</span>
          {hint && <span className="block text-xs text-[#9CA3AF] mt-0.5">{hint}</span>}
        </span>
      </div>
      <ChevronRight size={16} className="text-[#D1D5DB]" />
    </button>
  );
}
