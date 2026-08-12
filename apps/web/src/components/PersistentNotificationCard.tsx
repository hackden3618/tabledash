import React, { useState, useEffect } from "react";
import { Bell, Volume2, VolumeX, ShieldCheck, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { subscribeToPush, getNotificationPermissionState } from "../pwa/push";
import { triggerNotificationAlert } from "../lib/NotificationSound";

interface PersistentNotificationCardProps {
  /** Customer or kitchen token for server registration */
  token?: string;
  /** Visual variant: "card" (for settings pages) or "banner" (top prompt) */
  variant?: "card" | "banner";
  onStatusChange?: (permission: NotificationPermission | "unsupported") => void;
}

export const PersistentNotificationCard: React.FC<PersistentNotificationCardProps> = ({
  token,
  variant = "card",
  onStatusChange,
}) => {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    getNotificationPermissionState()
  );
  const [loading, setLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("ladha_sound_enabled") !== "false");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const current = getNotificationPermissionState();
    setPermission(current);
    onStatusChange?.(current);
  }, []);

  const handleEnablePush = async () => {
    setLoading(true);
    setMessage(null);
    const effectiveToken = token || localStorage.getItem("ladha_customer_token") || localStorage.getItem("ladha_admin_token") || "";
    const res = await subscribeToPush(effectiveToken);
    setLoading(false);
    const updated = getNotificationPermissionState();
    setPermission(updated);
    onStatusChange?.(updated);

    if (res === "subscribed") {
      setMessage({ type: "success", text: "Background alerts active! You'll get order tracking updates even when app is closed." });
      triggerNotificationAlert();
    } else if (res === "denied") {
      setMessage({ type: "error", text: "Notification permission was blocked in browser settings." });
    } else if (res === "unsupported") {
      setMessage({ type: "error", text: "Push notifications are not supported on this browser/device." });
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("ladha_sound_enabled", String(next));
    if (next) {
      triggerNotificationAlert();
    }
  };

  const handleTestAlert = () => {
    triggerNotificationAlert();
    setMessage({ type: "success", text: "Chime & vibration preview triggered!" });
    setTimeout(() => setMessage(null), 3000);
  };

  if (variant === "banner") {
    if (permission === "granted") return null;
    return (
      <div className="mx-4 my-3 bg-[#EBF5F0] border border-[#C2E3D4] rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[#114B36] text-white flex items-center justify-center shrink-0">
            <Bell size={20} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-xs text-[#1F2937] truncate">Never miss an order update</p>
            <p className="text-[0.72rem] text-[#4B5563] leading-snug truncate">Get sound alerts & live tracking when closed</p>
          </div>
        </div>
        <button
          onClick={handleEnablePush}
          disabled={loading}
          className="bg-[#114B36] text-white text-xs font-bold px-3.5 py-2 rounded-xl border-none cursor-pointer shrink-0 hover:bg-[#0D3D2B] transition-colors disabled:opacity-50"
        >
          {loading ? "Enabling..." : "Allow"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)] overflow-hidden">
      <div className="px-4 py-3.5 border-b border-[#F3F4F6] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-[#114B36]" />
          <h2 className="font-bold text-sm text-[#1F2937]">Persistent Notifications</h2>
        </div>
        <span
          className={`text-[0.62rem] font-bold px-2 py-0.5 rounded-full ${
            permission === "granted"
              ? "bg-[#DCFCE7] text-[#15803D]"
              : permission === "denied"
              ? "bg-[#FEE2E2] text-[#DC2626]"
              : "bg-[#FEF3C7] text-[#D97706]"
          }`}
        >
          {permission === "granted" ? "ACTIVE" : permission === "denied" ? "BLOCKED" : "NOT SET"}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {message && (
          <div
            className={`rounded-xl px-3.5 py-2.5 text-xs font-semibold flex items-center gap-2 leading-relaxed ${
              message.type === "success" ? "bg-[#DCFCE7] text-[#15803D]" : "bg-[#FEE2E2] text-[#DC2626]"
            }`}
          >
            {message.type === "success" ? <CheckCircle2 size={15} className="shrink-0" /> : <AlertCircle size={15} className="shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="flex items-start gap-3 bg-[#F9FAFB] p-3 rounded-xl border border-[#E5E7EB]">
          <ShieldCheck size={20} className="text-[#114B36] shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-[#1F2937]">Stay Updated When App Is Closed</p>
            <p className="text-[#6B7280] leading-relaxed">
              Order status changes and wallet credits are sent directly to your phone's notification bar with sound chimes and vibration alerts.
            </p>
          </div>
        </div>

        {/* Enable Push Button */}
        <div className="space-y-2">
          <button
            onClick={handleEnablePush}
            disabled={loading || permission === "granted"}
            className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border-none cursor-pointer transition-all ${
              permission === "granted"
                ? "bg-[#EBF5F0] text-[#114B36] cursor-default"
                : "bg-[#114B36] text-white hover:bg-[#0D3D2B] shadow-md"
            }`}
          >
            {permission === "granted" ? (
              <>
                <CheckCircle2 size={16} /> Background Push Active (Forever)
              </>
            ) : loading ? (
              "Requesting Device Permission..."
            ) : (
              <>
                <Bell size={16} /> Enable Background Alerts
              </>
            )}
          </button>
        </div>

        {/* Sound & Haptic Controls */}
        <div className="pt-2 border-t border-[#F3F4F6] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {soundEnabled ? <Volume2 size={18} className="text-[#114B36]" /> : <VolumeX size={18} className="text-[#9CA3AF]" />}
            <div>
              <p className="font-semibold text-xs text-[#1F2937]">Sound & Haptic Vibration</p>
              <p className="text-[0.68rem] text-[#6B7280]">Play chime and vibrate device on order alerts</p>
            </div>
          </div>
          <button
            onClick={toggleSound}
            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer border-none p-0.5 ${
              soundEnabled ? "bg-[#114B36]" : "bg-[#D1D5DB]"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                soundEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Test Alert Button */}
        <button
          onClick={handleTestAlert}
          className="w-full py-2 px-3 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#4B5563] font-bold text-[0.75rem] rounded-xl border-none cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
        >
          <Sparkles size={14} className="text-[#114B36]" /> Test Sound & Vibration Preview
        </button>
      </div>
    </div>
  );
};
