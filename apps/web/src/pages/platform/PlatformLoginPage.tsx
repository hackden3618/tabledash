import React, { useState } from "react";
import { apiPost } from "../../lib/api";
import { Lock, Server } from "lucide-react";

interface PlatformLoginPageProps {
  onLoginSuccess: (token: string) => void;
}

export const PlatformLoginPage: React.FC<PlatformLoginPageProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password");
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }

    setLoading(true);
    setError("");

    const res = await apiPost<{ token: string }>("/platform/login", {
      username: username.trim(),
      password: password.trim(),
    });

    setLoading(false);

    if (res.success && res.data?.token) {
      localStorage.setItem("tableDash_platform_token", res.data.token);
      onLoginSuccess(res.data.token);
    } else {
      setError(res.error || "Invalid platform admin credentials");
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }
  };

  return (
    <div className="admin-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
      <div className="card" style={{ width: "100%", maxWidth: "400px", padding: "32px", borderRadius: "16px", background: "#FFFFFF" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ width: "56px", height: "56px", background: "#1E4D36", borderRadius: "14px", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
            <Server size={28} color="white" />
          </div>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#1F2937" }}>TableDash Platform</h1>
          <p style={{ fontSize: "0.85rem", color: "#6B7280", marginTop: "4px" }}>
            Software Administration & Client Oversight
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#374151", marginBottom: "6px" }}>
              Platform Username
            </label>
            <input
              type="text"
              placeholder="platform_admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`input-field ${error && !username.trim() ? "input-error" : ""} ${shake ? "input-shake" : ""}`}
              disabled={loading}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#374151", marginBottom: "6px" }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`input-field ${error && !password.trim() ? "input-error" : ""} ${shake ? "input-shake" : ""}`}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="input-error-msg" style={{ fontSize: "0.85rem", justifyContent: "center" }}>
              ⚠ {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ marginTop: "8px" }}>
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="spinner" /> Authenticating...
              </span>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Lock size={16} /> Access Platform Console
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
