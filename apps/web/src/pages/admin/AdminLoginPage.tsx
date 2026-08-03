import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiPost } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Lock, ChevronLeft, Phone, KeyRound, CheckCircle2 } from "lucide-react";

const formatPhone = (raw: string): string => {
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("0") && cleaned.length === 10) return `254${cleaned.slice(1)}`;
  if ((cleaned.startsWith("7") || cleaned.startsWith("1")) && cleaned.length === 9) return `254${cleaned}`;
  if (cleaned.startsWith("254") && cleaned.length === 12) return cleaned;
  return cleaned;
};

interface AdminLoginPageProps {
  onLoginSuccess: (token: string, user: { id: string; username: string; name: string; role: string; hotelId: string | null }) => void;
}

type LoginView = "login" | "forgot" | "reset" | "done";

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ onLoginSuccess }) => {
  const [view, setView] = useState<LoginView>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [resetPhone, setResetPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetMsg, setResetMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await apiPost<any>("/auth/login", { username: username.trim(), password: password.trim() });
    setLoading(false);

    if (res.success && res.data) {
      localStorage.setItem("ladha_token", res.data.token);
      onLoginSuccess(res.data.token, res.data.user);
    } else {
      setError(res.error || "Invalid username or password");
    }
  };

  const handleSendOtp = async () => {
    setError("");
    setLoading(true);
    const res = await apiPost<{ message: string }>("/auth/forgot-password", { phone: formatPhone(resetPhone) });
    setLoading(false);
    if (res.success) {
      setResetMsg("Reset code sent to your phone");
      setView("reset");
    } else {
      setError(res.error || "Failed to send reset code");
    }
  };

  const handleResetPassword = async () => {
    setError("");
    setLoading(true);
    const res = await apiPost<{ message: string }>("/auth/reset-password", {
      phone: formatPhone(resetPhone),
      otp,
      newPassword,
    });
    setLoading(false);
    if (res.success) {
      setResetMsg("Password reset successfully. Sign in with your new password.");
      setView("done");
    } else {
      setError(res.error || "Failed to reset password");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF8F0] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#114B36] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[rgba(17,75,54,0.2)]">
            <Lock size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#114B36]">Ladha Admin</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            {view === "login" && "Sign in to manage orders & menu"}
            {view === "forgot" && "Enter your registered phone number"}
            {view === "reset" && "Enter the reset code and new password"}
            {view === "done" && "Password reset successful"}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {view === "login" && (
            <motion.form
              key="login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <Input
                label="Username"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />

              <Input
                label="Password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="bg-[#FEE2E2] text-[#DC2626] rounded-xl px-4 py-3 text-sm font-semibold"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <Button type="submit" disabled={loading || !username.trim() || !password.trim()} loading={loading} fullWidth>
                Sign In
              </Button>

              <button
                type="button"
                onClick={() => { setView("forgot"); setError(""); setResetMsg(""); setResetPhone(""); }}
                className="w-full text-center text-sm font-medium text-[#6B7280] hover:text-[#114B36] transition-colors bg-none border-none cursor-pointer py-2"
              >
                Forgot password?
              </button>
            </motion.form>
          )}

          {view === "forgot" && (
            <motion.div
              key="forgot"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <Input
                label="Phone Number"
                placeholder="07XXXXXXXX"
                value={resetPhone}
                onChange={(e) => setResetPhone(e.target.value)}
                icon={<Phone size={16} />}
              />

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="bg-[#FEE2E2] text-[#DC2626] rounded-xl px-4 py-3 text-sm font-semibold"
                  >
                    {error}
                  </motion.div>
                )}
                {resetMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#DCFCE7] text-[#059669] rounded-xl px-4 py-3 text-sm font-semibold"
                  >
                    {resetMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              <Button onClick={handleSendOtp} disabled={loading || !resetPhone.trim()} loading={loading} fullWidth>
                Send Reset Code
              </Button>

              <button
                onClick={() => { setView("login"); setError(""); }}
                className="w-full flex items-center justify-center gap-1 text-sm font-medium text-[#6B7280] hover:text-[#114B36] transition-colors bg-none border-none cursor-pointer py-2"
              >
                <ChevronLeft size={16} /> Back to sign in
              </button>
            </motion.div>
          )}

          {view === "reset" && (
            <motion.div
              key="reset"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              {resetMsg && (
                <div className="bg-[#DCFCE7] text-[#059669] rounded-xl px-4 py-3 text-sm font-semibold">
                  {resetMsg}
                </div>
              )}

              <Input
                label="Reset Code"
                placeholder="6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                icon={<KeyRound size={16} />}
                maxLength={6}
              />

              <Input
                label="New Password"
                type="password"
                placeholder="Min 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                icon={<Lock size={16} />}
              />

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="bg-[#FEE2E2] text-[#DC2626] rounded-xl px-4 py-3 text-sm font-semibold"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

            <Button onClick={handleResetPassword} disabled={loading || otp.length !== 6 || newPassword.length < 8} loading={loading} fullWidth>
                Reset Password
              </Button>

              <button
                onClick={() => { setView("forgot"); setError(""); setOtp(""); setNewPassword(""); }}
                className="w-full flex items-center justify-center gap-1 text-sm font-medium text-[#6B7280] hover:text-[#114B36] transition-colors bg-none border-none cursor-pointer py-2"
              >
                <ChevronLeft size={16} /> Send code again
              </button>
            </motion.div>
          )}

          {view === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-4"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#DCFCE7] flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-[#15803D]" />
              </div>
              {resetMsg && (
                <div className="bg-[#DCFCE7] text-[#059669] rounded-xl px-4 py-3 text-sm font-semibold">
                  {resetMsg}
                </div>
              )}
              <Button onClick={() => { setView("login"); setError(""); setPassword(""); }} fullWidth>
                Sign In
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
