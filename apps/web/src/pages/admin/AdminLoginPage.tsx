/**
 * Purpose: Admin Login Screen for tableDash hotel management team.
 * Responsibilities: Captures admin credentials, calls /api/v1/auth/login API, and stores JWT session token.
 * Dependencies: React, apiPost helper.
 * When to modify: When changing admin login flow or token storage mechanism.
 */

import React, { useState } from "react";
import { apiPost } from "../../lib/api";

interface AdminLoginPageProps {
  onLoginSuccess: (token: string) => void;
  onBackToCustomer: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  onLoginSuccess,
  onBackToCustomer,
}) => {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("adminpass");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await apiPost<any>("/auth/login", { username, password });
    setLoading(false);

    if (res.success && res.data) {
      localStorage.setItem("tableDash_token", res.data.token);
      onLoginSuccess(res.data.token);
    } else {
      setError(res.error || "Invalid username or password");
    }
  };

  return (
    <div className="admin-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ padding: "30px", width: "100%", maxWidth: "400px" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <span style={{ fontSize: "3rem" }}>🔑</span>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1E4D36", marginTop: "8px" }}>
            Mama's Hotel Admin
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#6B7280" }}>Sign in to manage orders & menu</p>
        </div>

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

          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <button type="button" onClick={onBackToCustomer} className="btn btn-secondary">
            Back to Customer View
          </button>
        </form>
      </div>
    </div>
  );
};
