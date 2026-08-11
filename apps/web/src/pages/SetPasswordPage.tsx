import React, { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { apiPost } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Lock, CheckCircle2, ChevronLeft, XCircle } from "lucide-react";

export const SetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawToken = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    const res = await apiPost<{ message: string }>("/auth/set-password", {
      token: rawToken,
      newPassword: password,
    });
    setLoading(false);
    if (res.success) {
      setDone(true);
    } else {
      setError(res.error || "Unable to set password");
    }
  };

  if (!rawToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF8F0] p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#FEE2E2] flex items-center justify-center mx-auto">
            <XCircle size={32} className="text-[#DC2626]" />
          </div>
          <h1 className="text-2xl font-bold text-[#114B36]">Invalid link</h1>
          <p className="text-sm text-[#6B7280]">
            This link is missing a token. Please open the full link from the SMS message.
          </p>
          <Button onClick={() => navigate("/")} fullWidth>Go to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFF8F0] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#114B36] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[rgba(17,75,54,0.2)]">
            <Lock size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#114B36]">Set Your Password</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            {done ? "Your password has been set" : "Create a password for your Ladha account"}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-4"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#DCFCE7] flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-[#15803D]" />
              </div>
              <p className="text-sm text-[#374151]">
                Your password has been set. You can now sign in with it.
              </p>
              <Button onClick={() => navigate("/")} fullWidth>Go to Home</Button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <Input
                label="New Password"
                type="password"
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock size={16} />}
                autoComplete="new-password"
              />

              <Input
                label="Confirm Password"
                type="password"
                placeholder="Re-enter your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                icon={<Lock size={16} />}
                autoComplete="new-password"
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

              <Button type="submit" disabled={loading || !password || !confirm} loading={loading} fullWidth>
                Set Password
              </Button>

              <button
                type="button"
                onClick={() => navigate("/")}
                className="w-full flex items-center justify-center gap-1 text-sm font-medium text-[#6B7280] hover:text-[#114B36] transition-colors bg-none border-none cursor-pointer py-2"
              >
                <ChevronLeft size={16} /> Back to home
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
