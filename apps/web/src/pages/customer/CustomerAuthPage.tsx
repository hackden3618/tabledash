import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { Lock, LogIn, Phone, User, UserPlus, KeyRound, CheckCircle2 } from "lucide-react";
import { Header } from "../../components/ui/Header";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { PageTransition } from "../../components/ui/PageTransition";
import { SecureCodeInput } from "../../components/ui/SecureCodeInput";

const formatPhone = (raw: string): string => {
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("0") && cleaned.length === 10) return `254${cleaned.slice(1)}`;
  if ((cleaned.startsWith("7") || cleaned.startsWith("1")) && cleaned.length === 9) return `254${cleaned}`;
  if (cleaned.startsWith("254") && cleaned.length === 12) return cleaned;
  return cleaned;
};
const isValidPhone = (v: string): boolean => /^254\d{9}$/.test(v);

type AuthTab = "login" | "register";
type ForgotStep = "phone" | "otp" | "newPin" | "done";

interface CustomerAuthPageProps {
  onBack: () => void;
  onSuccess: () => void;
}

export const CustomerAuthPage: React.FC<CustomerAuthPageProps> = ({ onBack, onSuccess }) => {
  const { login, register, forgotPin, resetPin } = useCustomerAuth();
  const [activeTab, setActiveTab] = useState<AuthTab>("login");

  const [loginPhone, setLoginPhone] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [regFirstName, setRegFirstName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPin, setRegPin] = useState("");
  const [regPinConfirm, setRegPinConfirm] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotStep>("phone");
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPin, setForgotNewPin] = useState("");
  const [forgotNewPinConfirm, setForgotNewPinConfirm] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState("");

  const handleLogin = async (e?: React.FormEvent, pinOverride = loginPin) => {
    e?.preventDefault();
    setLoginError("");
    if (!isValidPhone(loginPhone)) { setLoginError("Enter a valid Kenyan phone number (e.g. 0712345678)."); return; }
    if (pinOverride.length < 4) { setLoginError("Please enter your full 4-digit PIN."); return; }
    setLoginLoading(true);
    const res = await login(loginPhone, pinOverride);
    setLoginLoading(false);
    if (res.success) { onSuccess(); }
    else { setLoginError(res.error ?? "Sign in failed"); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");
    if (!regFirstName) { setRegError("Please enter your first name."); return; }
    if (!isValidPhone(regPhone)) { setRegError("Enter a valid Kenyan phone number (e.g. 0712345678)."); return; }
    if (regPin.length < 4) { setRegError("Please choose a 4-digit PIN."); return; }
    if (regPin !== regPinConfirm) { setRegError("PINs do not match. Please re-enter."); return; }
    setRegLoading(true);
    const res = await register(regFirstName.trim(), regPhone, regPin);
    setRegLoading(false);
    if (res.success) { onSuccess(); }
    else { setRegError(res.error ?? "Registration failed"); }
  };

  const handleForgotSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    if (!isValidPhone(forgotPhone)) { setForgotError("Enter a valid Kenyan phone number."); return; }
    setForgotLoading(true);
    setForgotSuccess("");
    const res = await forgotPin(forgotPhone);
    setForgotLoading(false);
    if (res.success) {
      setForgotStep("otp");
      setForgotSuccess("A reset code has been sent to your phone via SMS.");
    } else {
      setForgotError(res.error ?? "Failed to send reset code");
    }
  };

  const handleForgotVerifyOtp = async (e?: React.FormEvent, codeOverride = forgotOtp) => {
    e?.preventDefault();
    setForgotError("");
    if (codeOverride.length < 4) { setForgotError("Please enter the full 4-digit code."); return; }
    setForgotStep("newPin");
  };

  const handleForgotSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    if (forgotNewPin.length < 4) { setForgotError("Please choose a 4-digit PIN."); return; }
    if (forgotNewPin !== forgotNewPinConfirm) { setForgotError("PINs do not match."); return; }
    setForgotLoading(true);
    const res = await resetPin(forgotPhone, forgotOtp, forgotNewPin);
    setForgotLoading(false);
    if (res.success) {
      setForgotStep("done");
      setForgotSuccess("Your PIN has been reset successfully. You can now sign in.");
    } else {
      setForgotError(res.error ?? "Failed to reset PIN");
    }
  };

  const resetForgotFlow = () => {
    setShowForgot(false);
    setForgotStep("phone");
    setForgotPhone("");
    setForgotOtp("");
    setForgotNewPin("");
    setForgotNewPinConfirm("");
    setForgotError("");
    setForgotSuccess("");
  };

  if (showForgot) {
    return (
      <div className="app-container">
        <Header
          title="Reset PIN"
          onBack={() => { if (forgotStep === "phone") resetForgotFlow(); else setForgotStep("phone"); }}
        />
        <PageTransition>
          <div className="px-4 py-6">

            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {(["phone", "otp", "newPin"] as ForgotStep[]).map((step, i) => (
                <React.Fragment key={step}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    forgotStep === step || (["phone", "otp", "newPin"].indexOf(forgotStep) >= i)
                      ? "bg-[#114B36] text-white"
                      : "bg-[#E5E7EB] text-[#9CA3AF]"
                  }`}>
                    {step === "newPin" ? 3 : i + 1}
                  </div>
                  {i < 2 && <div className="w-8 h-0.5 bg-[#E5E7EB] rounded-full" />}
                </React.Fragment>
              ))}
            </div>

            {forgotStep === "phone" && (
              <motion.form
                key="forgot-phone"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                onSubmit={handleForgotSendOtp}
                className="space-y-4"
              >
                <p className="text-sm text-[#6B7280] text-center">
                  Enter your registered phone number and we'll send you a code to reset your PIN.
                </p>
                <Input
                  label="Phone Number"
                  placeholder="07XXXXXXXX"
                  value={forgotPhone}
                  onChange={(e) => setForgotPhone(formatPhone(e.target.value))}
                  icon={<Phone size={16} />}
                  autoComplete="tel"
                  maxLength={14}
                />
                <AnimatePresence>
                  {forgotError && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      className="bg-[#FEE2E2] text-[#DC2626] rounded-xl px-4 py-3 text-sm font-semibold"
                    >{forgotError}</motion.div>
                  )}
                </AnimatePresence>
                <Button type="submit" disabled={forgotLoading || !isValidPhone(forgotPhone)} loading={forgotLoading} fullWidth>
                  Send Reset Code
                </Button>
              </motion.form>
            )}

            {forgotStep === "otp" && (
              <motion.form
                key="forgot-otp"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                onSubmit={handleForgotVerifyOtp}
                className="space-y-4"
              >
                <p className="text-sm text-[#6B7280] text-center">
                  Enter the 4-digit code sent to <strong>{forgotPhone}</strong>.
                </p>
                <AnimatePresence>
                  {forgotSuccess && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      className="bg-[#DCFCE7] text-[#15803D] rounded-xl px-4 py-3 text-sm font-semibold flex items-center gap-2"
                    ><CheckCircle2 size={16} /> {forgotSuccess}</motion.div>
                  )}
                </AnimatePresence>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-[#374151] mb-1.5">
                    <KeyRound size={14} /> Reset Code
                  </label>
                  <SecureCodeInput value={forgotOtp} onChange={setForgotOtp} onComplete={(code) => void handleForgotVerifyOtp(undefined, code)} masked={false} autoComplete="one-time-code" label="Reset code" />
                </div>
                <AnimatePresence>
                  {forgotError && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      className="bg-[#FEE2E2] text-[#DC2626] rounded-xl px-4 py-3 text-sm font-semibold"
                    >{forgotError}</motion.div>
                  )}
                </AnimatePresence>
                <Button type="submit" disabled={forgotOtp.length < 4} fullWidth>
                  Verify Code
                </Button>
                <div className="text-center">
                  <button type="button" onClick={() => { setForgotStep("phone"); setForgotOtp(""); setForgotError(""); }}
                    className="text-sm text-[#114B36] font-semibold bg-none border-none cursor-pointer hover:underline"
                  >← Back to phone number</button>
                </div>
              </motion.form>
            )}

            {forgotStep === "newPin" && (
              <motion.form
                key="forgot-newpin"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                onSubmit={handleForgotSetPin}
                className="space-y-4"
              >
                <p className="text-sm text-[#6B7280] text-center">
                  Choose a new 4-digit PIN for your account.
                </p>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-[#374151] mb-1.5">
                    <Lock size={14} /> New 4-Digit PIN
                  </label>
                  <SecureCodeInput value={forgotNewPin} onChange={setForgotNewPin} label="New PIN" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-[#374151] mb-1.5">
                    <Lock size={14} /> Confirm New PIN
                  </label>
                  <SecureCodeInput value={forgotNewPinConfirm} onChange={setForgotNewPinConfirm} label="Confirm new PIN" />
                </div>
                <AnimatePresence>
                  {forgotError && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      className="bg-[#FEE2E2] text-[#DC2626] rounded-xl px-4 py-3 text-sm font-semibold"
                    >{forgotError}</motion.div>
                  )}
                </AnimatePresence>
                <Button type="submit" disabled={forgotLoading || forgotNewPin.length < 4 || forgotNewPin !== forgotNewPinConfirm} loading={forgotLoading} fullWidth>
                  Reset PIN
                </Button>
              </motion.form>
            )}

            {forgotStep === "done" && (
              <motion.div
                key="forgot-done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6 space-y-4"
              >
                <div className="w-16 h-16 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto">
                  <CheckCircle2 size={32} className="text-[#15803D]" />
                </div>
                <p className="font-bold text-lg text-[#1F2937]">PIN Reset Successful</p>
                <p className="text-sm text-[#6B7280]">{forgotSuccess}</p>
                <Button onClick={() => { resetForgotFlow(); setActiveTab("login"); }} fullWidth>
                  Sign In
                </Button>
              </motion.div>
            )}

          </div>
        </PageTransition>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header title="My Account" onBack={onBack} />

      <PageTransition>
        <div className="px-4 py-6">
          <div className="flex bg-[#F3F4F6] rounded-xl p-1 mb-7">
            {(["login", "register"] as AuthTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  flex-1 py-2.5 rounded-lg font-bold text-sm transition-all duration-200
                  flex items-center justify-center gap-2 bg-none border-none cursor-pointer
                  ${activeTab === tab
                    ? "bg-[#114B36] text-white shadow-sm"
                    : "text-[#6B7280] hover:text-[#1F2937]"
                  }
                `}
              >
                {tab === "login" ? <LogIn size={15} /> : <UserPlus size={15} />}
                {tab === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          {activeTab === "login" && (
            <motion.form
              key="login"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={handleLogin}
              className="space-y-4"
            >
              <p className="text-sm text-[#6B7280] text-center">
                Sign in to access your saved location and order history.
              </p>

              <Input
                label="Phone Number"
                placeholder="07XXXXXXXX"
                value={loginPhone}
                onChange={(e) => setLoginPhone(formatPhone(e.target.value))}
                icon={<Phone size={16} />}
                autoComplete="tel"
                maxLength={14}
              />

              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-[#374151] mb-1.5">
                  <Lock size={14} /> 4-Digit PIN
                </label>
                <SecureCodeInput value={loginPin} onChange={setLoginPin} onComplete={(pinValue) => void handleLogin(undefined, pinValue)} autoFocus label="Login PIN" />
              </div>

              <div className="text-right">
                <button type="button" onClick={() => { setShowForgot(true); setForgotPhone(loginPhone); }}
                  className="text-xs text-[#6B7280] font-semibold hover:text-[#114B36] transition-colors bg-none border-none cursor-pointer"
                >Forgot PIN?</button>
              </div>

              <AnimatePresence>
                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="bg-[#FEE2E2] text-[#DC2626] rounded-xl px-4 py-3 text-sm font-semibold"
                  >
                    {loginError}
                  </motion.div>
                )}
              </AnimatePresence>

              <Button type="submit" disabled={loginLoading || !isValidPhone(loginPhone)} loading={loginLoading} fullWidth>
                Sign In
              </Button>

              <p className="text-center text-sm text-[#9CA3AF]">
                Don't have an account?{" "}
                <button type="button" onClick={() => setActiveTab("register")} className="text-[#114B36] font-bold bg-none border-none cursor-pointer">
                  Create one →
                </button>
              </p>
            </motion.form>
          )}

          {activeTab === "register" && (
            <motion.form
              key="register"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onSubmit={handleRegister}
              className="space-y-4"
            >
              <p className="text-sm text-[#6B7280] text-center">
                Create a free account so your delivery location is saved for next time.
              </p>

              <Input
                label="First Name"
                placeholder="e.g. Mary"
                value={regFirstName}
                onChange={(e) => setRegFirstName(e.target.value)}
                icon={<User size={16} />}
                autoComplete="given-name"
              />

              <Input
                label="Phone Number"
                placeholder="07XXXXXXXX"
                value={regPhone}
                onChange={(e) => setRegPhone(formatPhone(e.target.value))}
                icon={<Phone size={16} />}
                autoComplete="tel"
                maxLength={14}
              />

              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-[#374151] mb-1.5">
                  <Lock size={14} /> Choose 4-Digit PIN
                </label>
                <SecureCodeInput value={regPin} onChange={setRegPin} label="New PIN" />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-[#374151] mb-1.5">
                  <Lock size={14} /> Confirm PIN
                </label>
                <SecureCodeInput value={regPinConfirm} onChange={setRegPinConfirm} label="Confirm PIN" />
              </div>

              <AnimatePresence>
                {regError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="bg-[#FEE2E2] text-[#DC2626] rounded-xl px-4 py-3 text-sm font-semibold"
                  >
                    {regError}
                  </motion.div>
                )}
              </AnimatePresence>

              <Button type="submit" disabled={regLoading || !isValidPhone(regPhone)} loading={regLoading} fullWidth>
                Create Account
              </Button>

              <p className="text-center text-sm text-[#9CA3AF]">
                Already registered?{" "}
                <button type="button" onClick={() => setActiveTab("login")} className="text-[#114B36] font-bold bg-none border-none cursor-pointer">
                  Sign in →
                </button>
              </p>
            </motion.form>
          )}
        </div>
      </PageTransition>
    </div>
  );
};
