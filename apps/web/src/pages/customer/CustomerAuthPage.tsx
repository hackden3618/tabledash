/**
 * Purpose: Optional Customer Login / Register page for tableDash.
 * Responsibilities: Renders a two-tab (Sign In / Create Account) phone+PIN form.
 *   The PIN entry uses 4 individual digit boxes with auto-advance for intuitive mobile UX.
 * Dependencies: React, CustomerAuthContext.
 * When to modify: When changing the auth flow, adding OTP, or redesigning the auth UI.
 */

import React, { useRef, useState } from "react";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { ChevronLeft, Lock, LogIn, Phone, User, UserPlus } from "lucide-react";

const cleanPhone = (raw: string): string => raw.replace(/[^\d+]/g, "");
const isValidPhone = (v: string): boolean => /^\+?\d{10,13}$/.test(v);

type AuthTab = "login" | "register";

interface CustomerAuthPageProps {
  onBack: () => void;
  onSuccess: () => void;
}

// ─── PIN Box component ─────────────────────────────────────────────────────────
// Defined OUTSIDE CustomerAuthPage so React never unmounts/remounts it during
// parent re-renders (which would steal focus after every keystroke).
interface PinBoxesProps {
  value: string;
  onChange: (v: string) => void;
}

const PinBoxes: React.FC<PinBoxesProps> = ({ value, onChange }) => {
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const digits = value.padEnd(4, "").split("").slice(0, 4);

  const handleChange = (idx: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const arr = digits.map((d) => d.trim());
    arr[idx] = digit;
    const next = arr.join("").slice(0, 4);
    onChange(next);
    // Auto-advance to next box if filled
    if (digit && idx < 3) {
      refs[idx + 1]!.current?.focus();
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[idx]?.trim()) {
        const arr = digits.map((d) => d.trim());
        arr[idx] = "";
        onChange(arr.join(""));
      } else if (idx > 0) {
        const arr = digits.map((d) => d.trim());
        arr[idx - 1] = "";
        onChange(arr.join(""));
        refs[idx - 1]!.current?.focus();
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && idx > 0) {
      refs[idx - 1]!.current?.focus();
    } else if (e.key === "ArrowRight" && idx < 3) {
      refs[idx + 1]!.current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    onChange(pasted);
    const lastFilled = Math.min(pasted.length, 3);
    refs[lastFilled]!.current?.focus();
  };

  const boxStyle = (idx: number): React.CSSProperties => {
    const isFilled = Boolean(digits[idx]?.trim());
    return {
      width: "56px",
      height: "64px",
      border: isFilled ? "2px solid #1E4D36" : "1.5px solid #D1D5DB",
      borderRadius: "12px",
      fontSize: "1.6rem",
      fontWeight: 700,
      textAlign: "center",
      color: "#1F2937",
      background: isFilled ? "#EBF4F0" : "#FFFFFF",
      outline: "none",
      transition: "border-color 0.15s, background 0.15s",
      cursor: "text",
    };
  };

  return (
    <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "4px" }}>
      {[0, 1, 2, 3].map((idx) => (
        <input
          key={idx}
          ref={refs[idx]}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digits[idx]?.trim() || ""}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          style={boxStyle(idx)}
          autoComplete="off"
        />
      ))}
    </div>
  );
};

// ─── Main Page Component ───────────────────────────────────────────────────────
export const CustomerAuthPage: React.FC<CustomerAuthPageProps> = ({ onBack, onSuccess }) => {
  const { login, register } = useCustomerAuth();
  const [activeTab, setActiveTab] = useState<AuthTab>("login");

  // Login state
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Register state
  const [regFirstName, setRegFirstName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPin, setRegPin] = useState("");
  const [regPinConfirm, setRegPinConfirm] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    if (!isValidPhone(loginPhone)) { setLoginError("Enter a valid phone (10-13 digits, e.g. 0712345678)."); return; }
    if (loginPin.length < 4) { setLoginError("Please enter your full 4-digit PIN."); return; }
    setLoginLoading(true);
    const res = await login(loginPhone.trim(), loginPin);
    setLoginLoading(false);
    if (res.success) { onSuccess(); }
    else { setLoginError(res.error ?? "Sign in failed"); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");
    if (!regFirstName) { setRegError("Please enter your first name."); return; }
    if (!isValidPhone(regPhone)) { setRegError("Enter a valid phone (10-13 digits, e.g. 0712345678)."); return; }
    if (regPin.length < 4) { setRegError("Please choose a 4-digit PIN."); return; }
    if (regPin !== regPinConfirm) { setRegError("PINs do not match. Please re-enter."); return; }
    setRegLoading(true);
    const res = await register(regFirstName.trim(), regPhone.trim(), regPin);
    setRegLoading(false);
    if (res.success) { onSuccess(); }
    else { setRegError(res.error ?? "Registration failed"); }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex" }}>
            <ChevronLeft size={22} />
          </button>
          <div className="header-title">My Account</div>
        </div>
      </header>

      <div style={{ padding: "24px 20px" }}>
        {/* Tab switcher */}
        <div style={{ display: "flex", background: "#F3F4F6", borderRadius: "12px", padding: "4px", marginBottom: "28px" }}>
          {(["login", "register"] as AuthTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: "10px", borderRadius: "10px", border: "none",
                fontWeight: 700, fontSize: "0.9rem", cursor: "pointer",
                transition: "all 0.2s",
                background: activeTab === tab ? "#1E4D36" : "transparent",
                color: activeTab === tab ? "white" : "#6B7280",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              }}
            >
              {tab === "login" ? <LogIn size={16} /> : <UserPlus size={16} />}
              {tab === "login" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        {/* ─── Sign In Form ─────────────────────────────────── */}
        {activeTab === "login" && (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ fontSize: "0.9rem", color: "#6B7280", textAlign: "center" }}>
              Sign in with your phone number and PIN to access your saved location and order history.
            </p>

            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                <Phone size={15} /> Phone Number
              </label>
              <input
                type="tel"
                placeholder="07XXXXXXXX"
                value={loginPhone}
                onChange={(e) => setLoginPhone(cleanPhone(e.target.value))}
                className="input-field"
                autoComplete="tel"
                maxLength={14}
              />
            </div>

            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                <Lock size={15} /> 4-Digit PIN
              </label>
              <PinBoxes value={loginPin} onChange={setLoginPin} />
            </div>

            {loginError && (
              <div style={{ background: "#FEE2E2", color: "#DC2626", borderRadius: "8px", padding: "10px", fontSize: "0.875rem", fontWeight: 600 }}>
                {loginError}
              </div>
            )}

            <button type="submit" disabled={loginLoading || !isValidPhone(loginPhone)} className="btn btn-primary">
              {loginLoading ? "Signing in…" : "Sign In"}
            </button>

            <p style={{ textAlign: "center", fontSize: "0.85rem", color: "#9CA3AF" }}>
              Don't have an account?{" "}
              <button type="button" onClick={() => setActiveTab("register")} style={{ background: "none", border: "none", color: "#1E4D36", fontWeight: 700, cursor: "pointer" }}>
                Create one →
              </button>
            </p>
          </form>
        )}

        {/* ─── Register Form ────────────────────────────────── */}
        {activeTab === "register" && (
          <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ fontSize: "0.9rem", color: "#6B7280", textAlign: "center" }}>
              Create a free account so your delivery location is saved for next time.
            </p>

            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                <User size={15} /> First Name
              </label>
              <input
                type="text"
                placeholder="e.g. Mary"
                value={regFirstName}
                onChange={(e) => setRegFirstName(e.target.value)}
                className="input-field"
                autoComplete="given-name"
              />
            </div>

            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                <Phone size={15} /> Phone Number
              </label>
              <input
                type="tel"
                placeholder="07XXXXXXXX"
                value={regPhone}
                onChange={(e) => setRegPhone(cleanPhone(e.target.value))}
                className="input-field"
                autoComplete="tel"
                maxLength={14}
              />
            </div>

            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                <Lock size={15} /> Choose 4-Digit PIN
              </label>
              <PinBoxes value={regPin} onChange={setRegPin} />
            </div>

            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                <Lock size={15} /> Confirm PIN
              </label>
              <PinBoxes value={regPinConfirm} onChange={setRegPinConfirm} />
            </div>

            {regError && (
              <div style={{ background: "#FEE2E2", color: "#DC2626", borderRadius: "8px", padding: "10px", fontSize: "0.875rem", fontWeight: 600 }}>
                {regError}
              </div>
            )}

            <button type="submit" disabled={regLoading || !isValidPhone(regPhone)} className="btn btn-primary">
              {regLoading ? "Creating account…" : "Create Account"}
            </button>

            <p style={{ textAlign: "center", fontSize: "0.85rem", color: "#9CA3AF" }}>
              Already registered?{" "}
              <button type="button" onClick={() => setActiveTab("login")} style={{ background: "none", border: "none", color: "#1E4D36", fontWeight: 700, cursor: "pointer" }}>
                Sign in →
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
