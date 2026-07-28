import React, { useState } from "react";
import { apiPost } from "../../lib/api";

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

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  onLoginSuccess,
}) => {
  const [view, setView] = useState<LoginView>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Forgot password flow
  const [resetPhone, setResetPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetMsg, setResetMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await apiPost<any>("/auth/login", { username, password });
    setLoading(false);

    if (res.success && res.data) {
      localStorage.setItem("tableDash_token", res.data.token);
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
    <div className="admin-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ padding: "30px", width: "100%", maxWidth: "400px" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <span style={{ fontSize: "3rem" }}>🔑</span>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1E4D36", marginTop: "8px" }}>
            tableDash Admin
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#6B7280" }}>
            {view === "login" && "Sign in to manage orders & menu"}
            {view === "forgot" && "Enter your registered phone number"}
            {view === "reset" && "Enter the reset code and new password"}
            {view === "done" && "Password reset successful"}
          </p>
        </div>

        {view === "login" && (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                required
              />
            </div>

            {error && (
              <div style={{ padding: "10px", borderRadius: "8px", background: "#FEE2E2", color: "#DC2626", fontSize: "0.85rem", fontWeight: 600 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || !username.trim() || !password.trim()} className="btn btn-primary">
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <button
              type="button"
              onClick={() => { setView("forgot"); setError(""); setResetMsg(""); setResetPhone(""); }}
              style={{ background: "none", border: "none", color: "#6B7280", fontSize: "0.85rem", cursor: "pointer", padding: "8px 0", fontWeight: 500 }}
            >
              Forgot password?
            </button>
          </form>
        )}

        {view === "forgot" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <input
              type="tel"
              placeholder="07XXXXXXXX"
              value={resetPhone}
              onChange={(e) => setResetPhone(e.target.value)}
              className="input-field"
            />

            {error && (
              <div style={{ padding: "10px", borderRadius: "8px", background: "#FEE2E2", color: "#DC2626", fontSize: "0.85rem", fontWeight: 600 }}>
                {error}
              </div>
            )}
            {resetMsg && (
              <div style={{ padding: "10px", borderRadius: "8px", background: "#ECFDF5", color: "#059669", fontSize: "0.85rem", fontWeight: 600 }}>
                {resetMsg}
              </div>
            )}

            <button onClick={handleSendOtp} disabled={loading || !resetPhone.trim()} className="btn btn-primary">
              {loading ? "Sending..." : "Send Reset Code"}
            </button>

            <button
              onClick={() => { setView("login"); setError(""); }}
              style={{ background: "none", border: "none", color: "#6B7280", fontSize: "0.85rem", cursor: "pointer", padding: "8px 0", fontWeight: 500 }}
            >
              ← Back to sign in
            </button>
          </div>
        )}

        {view === "reset" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {resetMsg && (
              <div style={{ padding: "10px", borderRadius: "8px", background: "#ECFDF5", color: "#059669", fontSize: "0.85rem", fontWeight: 600 }}>
                {resetMsg}
              </div>
            )}

            <input
              type="text"
              placeholder="6-digit reset code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="input-field"
              maxLength={6}
            />

            <input
              type="password"
              placeholder="New password (min 6 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input-field"
            />

            {error && (
              <div style={{ padding: "10px", borderRadius: "8px", background: "#FEE2E2", color: "#DC2626", fontSize: "0.85rem", fontWeight: 600 }}>
                {error}
              </div>
            )}

            <button onClick={handleResetPassword} disabled={loading || otp.length !== 6 || newPassword.length < 6} className="btn btn-primary">
              {loading ? "Resetting..." : "Reset Password"}
            </button>

            <button
              onClick={() => { setView("forgot"); setError(""); setOtp(""); setNewPassword(""); }}
              style={{ background: "none", border: "none", color: "#6B7280", fontSize: "0.85rem", cursor: "pointer", padding: "8px 0", fontWeight: 500 }}
            >
              ← Send code again
            </button>
          </div>
        )}

        {view === "done" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem" }}>✅</div>
            {resetMsg && (
              <div style={{ padding: "10px", borderRadius: "8px", background: "#ECFDF5", color: "#059669", fontSize: "0.85rem", fontWeight: 600 }}>
                {resetMsg}
              </div>
            )}
            <button onClick={() => { setView("login"); setError(""); setPassword(""); }} className="btn btn-primary">
              Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
