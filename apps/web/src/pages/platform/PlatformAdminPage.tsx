import React, { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiDelete } from "../../lib/api";
import { useNotifications } from "../../context/NotificationsContext";
import { Modal } from "../../components/Modal";

type PlatformView = "login" | "overview" | "hotels" | "hotel_detail" | "create_hotel" | "admins" | "create_admin" | "audit" | "outbox";

interface PlatformMe {
  id: string; username: string; name: string;
}
interface PlatformDashboard {
  hotelCount: number; activeHotelCount: number; platformAdminCount: number;
  totalOrders: number; failedOutboxCount: number; platformBrand: string;
}
interface Hotel {
  id: string; name: string; slug: string; isOpen: boolean;
  autoCloseAt: string | null; createdAt: string; deletedAt: string | null;
  adminUsers?: { id: string; name: string; username: string; role: string }[];
  _count?: { orders: number };
  events?: any[]; staffUsers?: { id: string; name: string; phone: string }[];
}
interface AdminUser { id: string; name: string; username: string; createdAt: string; }

const T = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  primary: "#4338CA",
  primaryMuted: "#EEF2FF",
  primaryLight: "#E0E7FF",
  text: "#0F172A",
  textMuted: "#64748B",
  textDim: "#94A3B8",
  danger: "#DC2626",
  dangerMuted: "#FEF2F2",
  success: "#059669",
  successMuted: "#ECFDF5",
  warning: "#D97706",
  warningMuted: "#FFFBEB",
  radius: "10px",
  font: "system-ui, -apple-system, sans-serif",
};

function s(num: number) { return `${num * 4}px`; }

export const PlatformAdminPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [view, setView] = useState<PlatformView>(() => {
    const tok = localStorage.getItem("tableDash_platform_token");
    return tok ? "overview" : "login";
  });
  const [token, setToken] = useState(localStorage.getItem("tableDash_platform_token") || "");
  const [me, setMe] = useState<PlatformMe | null>(null);
  const [dashboard, setDashboard] = useState<PlatformDashboard | null>(null);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [outboxRows, setOutboxRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { pushNotification } = useNotifications();

  // ── Login ──
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");

  // ── Create Hotel ──
  const [hotelForm, setHotelForm] = useState({
    name: "", slug: "", adminUsername: "", adminName: "", adminPhone: "", isOpen: true, autoCloseAt: "",
  });
  const [createResult, setCreateResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Create Admin ──
  const [adminForm, setAdminForm] = useState({ username: "", name: "" });
  const [adminResult, setAdminResult] = useState<any>(null);
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  // ── Confirm modals ──
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const fetch = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    const [dashRes, hotelsRes, adminsRes, auditRes, outboxRes] = await Promise.all([
      apiGet<PlatformDashboard>("/platform/dashboard", token),
      apiGet<Hotel[]>("/platform/hotels", token),
      apiGet<AdminUser[]>("/platform/admins", token),
      apiGet<any[]>("/platform/audit", token),
      apiGet<any[]>("/platform/outbox", token),
    ]);
    if (dashRes.success && dashRes.data) setDashboard(dashRes.data);
    if (hotelsRes.success && hotelsRes.data) setHotels(hotelsRes.data);
    if (adminsRes.success && adminsRes.data) setAdmins(adminsRes.data);
    if (auditRes.success && auditRes.data) setAuditRows(auditRes.data);
    if (outboxRes.success && outboxRes.data) setOutboxRows(outboxRes.data);
    setLoading(false);
  }, [token]);

  useEffect(() => { fetch(); }, [fetch]);

  // ── Login ──
  const handleLogin = async () => {
    setLoginError("");
    const res = await apiPost<{ token: string; user: PlatformMe }>("/platform/login", loginForm);
    if (res.success && res.data) {
      localStorage.setItem("tableDash_platform_token", res.data.token);
      setToken(res.data.token);
      setMe(res.data.user);
      setView("overview");
    } else {
      setLoginError(res.error || "Login failed");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("tableDash_platform_token");
    setToken("");
    setMe(null);
    setView("login");
  };

  // ── Create Hotel ──
  const handleCreateHotel = async () => {
    setSubmitting(true);
    const res = await apiPost<any>("/platform/hotels", hotelForm, token);
    setSubmitting(false);
    if (res.success && res.data) {
      setCreateResult(res.data);
    } else {
      pushNotification("danger", "Failed to create hotel", res.error || "Unknown error", { scope: "platform" });
    }
  };

  // ── Toggle Hotel ──
  const handleToggleHotel = async (id: string) => {
    const res = await apiPost<Hotel>(`/platform/hotels/${id}/toggle`, {}, token);
    if (res.success && res.data) {
      pushNotification("info", "Hotel updated", `${res.data.name} is now ${res.data.isOpen ? "open" : "closed"}`, { scope: "platform" });
      await fetch();
    } else {
      pushNotification("danger", "Error", res.error || "Failed to toggle hotel", { scope: "platform" });
    }
    setConfirm(null);
  };

  // ── Create Admin ──
  const handleCreateAdmin = async () => {
    setAdminSubmitting(true);
    const res = await apiPost<AdminUser & { tempPassword: string }>("/platform/admins", adminForm, token);
    setAdminSubmitting(false);
    if (res.success && res.data) {
      setAdminResult(res.data);
    } else {
      pushNotification("danger", "Failed", res.error || "Unknown error", { scope: "platform" });
    }
  };

  // ── Delete Admin ──
  const handleDeleteAdmin = async (id: string) => {
    const res = await apiDelete<{ removed: string }>(`/platform/admins/${id}`, token);
    if (res.success) {
      pushNotification("info", "Admin removed", `${res.data?.removed || "Admin"} was removed`, { scope: "platform" });
      await fetch();
    } else {
      pushNotification("danger", "Error", res.error || "Failed to remove admin", { scope: "platform" });
    }
  };

  // ── Styles ──
  const navItem = (v: PlatformView, label: string) => (
    <button
      onClick={() => setView(v)}
      style={{
        background: view === v ? T.primaryMuted : "transparent",
        color: view === v ? T.primary : T.textMuted,
        border: "none", padding: `${s(3)} ${s(4)}`, borderRadius: T.radius,
        fontWeight: view === v ? 700 : 500, fontSize: "0.9rem", cursor: "pointer",
        textAlign: "left", width: "100%", transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );

  // ── Login View ──
  if (view === "login") {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font, padding: s(4) }}>
        <div style={{ width: "100%", maxWidth: "400px", background: T.surface, borderRadius: "16px", padding: s(8), border: `1px solid ${T.border}` }}>
          <div style={{ textAlign: "center", marginBottom: s(6) }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: T.primary, color: "white", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontWeight: 800, fontSize: "1.2rem" }}>TD</div>
            <h1 style={{ fontSize: "1.3rem", fontWeight: 700, color: T.text, margin: 0 }}>TableDash Platform</h1>
            <p style={{ fontSize: "0.85rem", color: T.textMuted, marginTop: s(2) }}>Sign in to manage tenants and platform access</p>
          </div>
          {loginError && <div style={{ background: T.dangerMuted, color: T.danger, padding: s(3), borderRadius: T.radius, fontSize: "0.85rem", marginBottom: s(4), fontWeight: 600 }}>{loginError}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: s(4) }}>
            <input placeholder="Username" value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
              className="input-field" style={{ fontFamily: T.font }} autoComplete="username" />
            <input type="password" placeholder="Password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              className="input-field" style={{ fontFamily: T.font }} autoComplete="current-password" onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
            <button onClick={handleLogin} disabled={!loginForm.username || !loginForm.password}
              style={{ background: T.primary, color: "white", border: "none", padding: s(4), borderRadius: T.radius, fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", opacity: !loginForm.username || !loginForm.password ? 0.6 : 1 }}>
              Sign In
            </button>
          </div>
          <button onClick={onBack} style={{ display: "block", margin: `${s(4)} auto 0`, background: "none", border: "none", color: T.textMuted, fontSize: "0.85rem", cursor: "pointer", textAlign: "center" }}>← Back to main site</button>
        </div>
      </div>
    );
  }

  const filteredHotels = hotels.filter((h) =>
    !searchQ || h.name.toLowerCase().includes(searchQ.toLowerCase()) || h.slug.toLowerCase().includes(searchQ.toLowerCase())
  );

  // ── Layout ──
  const sidebarWidth = 220;
  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, display: "flex" }}>
      {/* Hamburger toggle — visible when sidebar is collapsed (mobile + desktop) */}
      <button onClick={() => setSidebarOpen(true)}
        style={{
          position: "fixed", top: s(3), left: s(3), zIndex: 60,
          background: T.primary, color: "white", border: "none",
          width: "36px", height: "36px", borderRadius: T.radius,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.2rem", cursor: "pointer",
          opacity: sidebarOpen ? 0 : 1, pointerEvents: sidebarOpen ? "none" : "auto",
          transition: "opacity 0.2s",
        }}
        aria-label="Open sidebar"
      >
        ☰
      </button>

      {/* Overlay backdrop (mobile only) */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 49 }}
          className="platform-sidebar-overlay"
        />
      )}

      {/* Sidebar */}
      <nav style={{
        width: sidebarWidth, background: T.surface, borderRight: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column",
        position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50,
        padding: s(4), gap: s(1),
        transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.2s ease",
      }}
        className="platform-sidebar"
      >
        {/* Sidebar header with collapse toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: s(6) }}>
          <div style={{ display: "flex", alignItems: "center", gap: s(2) }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: T.primary, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.85rem" }}>TD</div>
            <div>
              <div style={{ fontWeight: 700, color: T.text, fontSize: "0.9rem" }}>TableDash</div>
              <div style={{ fontSize: "0.75rem", color: T.textMuted }}>Platform Admin</div>
            </div>
          </div>
          {/* Close/collapse button on the right side */}
          <button onClick={() => setSidebarOpen(false)}
            className="platform-sidebar-close"
            style={{
              background: "none", border: "none", color: T.textMuted, cursor: "pointer",
              width: "28px", height: "28px", borderRadius: "6px", display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: "1rem",
            }}
            aria-label="Close sidebar"
          >
            ◀
          </button>
        </div>

        {navItem("overview", "Overview")}
        {navItem("hotels", "Hotels")}
        {navItem("create_hotel", "＋ Add Hotel")}
        {navItem("admins", "Platform Admins")}
        {navItem("create_admin", "＋ Add Admin")}
        {navItem("audit", "Audit Log")}
        {navItem("outbox", "Outbox")}

        <div style={{ marginTop: "auto", paddingTop: s(4), borderTop: `1px solid ${T.border}` }}>
          {me && <div style={{ fontSize: "0.8rem", color: T.textMuted, marginBottom: s(2) }}>{me.name}</div>}
          <button onClick={handleLogout} style={{ background: "none", border: "none", color: T.textMuted, fontSize: "0.85rem", cursor: "pointer", padding: 0, fontWeight: 500 }}>Sign Out</button>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ marginLeft: sidebarWidth, flex: 1, minHeight: "100vh", padding: s(8), maxWidth: "960px" }}
        className={`platform-main${sidebarOpen ? "" : " collapsed"}`}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "40vh", color: T.textDim }}>Loading…</div>
        ) : view === "overview" ? (
          <>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, marginBottom: s(6) }}>Overview</h1>
            {/* ── Stats grid ── */}
            {dashboard && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: s(4), marginBottom: s(6) }}>
                {[
                  { label: "Total Hotels", value: dashboard.hotelCount, color: T.text },
                  { label: "Active", value: dashboard.activeHotelCount, color: T.success },
                  { label: "Platform Admins", value: dashboard.platformAdminCount, color: T.primary },
                  { label: "Platform Orders", value: dashboard.totalOrders, color: T.text },
                ].map((stat) => (
                  <div key={stat.label} style={{ background: T.surface, borderRadius: "12px", padding: s(5), border: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: "1.8rem", fontWeight: 700, color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: "0.8rem", color: T.textMuted, marginTop: s(1) }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            )}
            {dashboard && dashboard.failedOutboxCount > 0 && (
              <div style={{ background: T.dangerMuted, border: `1px solid #FECACA`, borderRadius: T.radius, padding: s(4), marginBottom: s(6), fontSize: "0.85rem", color: T.danger, fontWeight: 600, cursor: "pointer" }}
                onClick={() => setView("outbox")}>
                ⚠ {dashboard.failedOutboxCount} failed outbox message{dashboard.failedOutboxCount > 1 ? "s" : ""} — review
              </div>
            )}
            <div style={{ display: "flex", gap: s(4) }}>
              <button onClick={() => setView("create_hotel")} style={{ background: T.primary, color: "white", border: "none", padding: `${s(3)} ${s(6)}`, borderRadius: T.radius, fontWeight: 700, fontSize: "0.9rem", cursor: "pointer" }}>＋ Add Hotel</button>
              <button onClick={() => setView("create_admin")} style={{ background: T.surface, color: T.primary, border: `1px solid ${T.primary}`, padding: `${s(3)} ${s(6)}`, borderRadius: T.radius, fontWeight: 600, fontSize: "0.9rem", cursor: "pointer" }}>＋ Add Platform Admin</button>
            </div>
          </>
        ) : view === "hotels" ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: s(6) }}>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, margin: 0 }}>Hotels</h1>
              <button onClick={() => setView("create_hotel")} style={{ background: T.primary, color: "white", border: "none", padding: `${s(2)} ${s(5)}`, borderRadius: T.radius, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>＋ Add Hotel</button>
            </div>
            <input placeholder="Search by name or slug…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
              style={{ width: "100%", padding: s(3), border: `1px solid ${T.border}`, borderRadius: T.radius, fontSize: "0.9rem", marginBottom: s(4), fontFamily: T.font, outline: "none", boxSizing: "border-box" }} />
            {filteredHotels.length === 0 ? (
              <div style={{ textAlign: "center", padding: s(10), color: T.textMuted, fontSize: "0.9rem" }}>No hotels found.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: s(3) }}>
                {filteredHotels.map((h) => (
                  <div key={h.id} onClick={() => { setSelectedHotel(h); setView("hotel_detail"); }}
                    style={{ background: T.surface, borderRadius: "12px", border: `1px solid ${T.border}`, borderLeft: `4px solid ${h.isOpen ? T.primary : T.textDim}`, padding: `${s(4)} ${s(5)}`, cursor: "pointer", transition: "box-shadow 0.15s" }}
                    onMouseEnter={(e) => e.currentTarget.style.boxShadow = `0 2px 8px rgba(0,0,0,0.06)`}
                    onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 700, color: T.text }}>{h.name}</div>
                        <div style={{ fontSize: "0.8rem", color: T.textMuted, marginTop: s(1) }}>
                          {h.slug} · {h.isOpen ? "Open" : "Closed"} · Onboarded {new Date(h.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <span style={{ fontSize: "1.2rem", color: T.textDim }}>→</span>
                    </div>
                    {h.adminUsers && h.adminUsers.length > 0 && (
                      <div style={{ fontSize: "0.8rem", color: T.textMuted, marginTop: s(2), borderTop: `1px solid ${T.border}`, paddingTop: s(2) }}>
                        Admin: {h.adminUsers.map((a) => a.name).join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : view === "hotel_detail" && selectedHotel ? (
          <HotelDetail hotelId={selectedHotel.id} onBack={() => setView("hotels")} onToggle={handleToggleHotel} token={token} />
        ) : view === "create_hotel" ? (
          createResult ? (
            <div style={{ textAlign: "center", padding: s(10) }}>
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: T.successMuted, color: T.success, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "1.5rem" }}>✓</div>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: T.text, marginBottom: s(2) }}>{createResult.hotel.name} created</h2>
              <div style={{ background: T.successMuted, borderRadius: T.radius, padding: s(4), margin: `${s(4)} auto`, maxWidth: "400px", textAlign: "left", fontSize: "0.9rem", color: T.text, border: `1px solid #A7F3D0` }}>
                <div style={{ fontWeight: 700, marginBottom: s(2) }}>Welcome SMS will be sent to:</div>
                <div style={{ color: T.textMuted, marginBottom: s(2) }}>{hotelForm.adminName} at {hotelForm.adminPhone}</div>
                <div style={{ fontWeight: 700, marginBottom: s(1) }}>Hotel Admin Credentials:</div>
                <div style={{ color: T.textMuted }}>Username: <strong>{hotelForm.adminUsername}</strong></div>
                <div style={{ color: T.textMuted }}>Temp password: <strong style={{ fontFamily: "monospace" }}>{createResult.tempPassword}</strong></div>
              </div>
              <button onClick={() => { setCreateResult(null); setHotelForm({ name: "", slug: "", adminUsername: "", adminName: "", adminPhone: "", isOpen: true, autoCloseAt: "" }); setView("hotels"); }}
                style={{ background: T.primary, color: "white", border: "none", padding: `${s(3)} ${s(6)}`, borderRadius: T.radius, fontWeight: 700, cursor: "pointer", marginTop: s(4) }}>Done</button>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, marginBottom: s(6) }}>Add Hotel</h1>
              <div style={{ display: "flex", flexDirection: "column", gap: s(6), maxWidth: "520px" }}>
                {/* Section 1: Hotel entity */}
                <div>
                  <h2 style={{ fontSize: "1rem", fontWeight: 700, color: T.primary, marginBottom: s(3) }}>Tenant Details</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: s(3) }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T.textMuted, marginBottom: s(1) }}>Hotel Name</label>
                      <input value={hotelForm.name} onChange={(e) => setHotelForm({ ...hotelForm, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") })}
                        className="input-field" style={{ fontFamily: T.font }} placeholder="e.g. Wambu's Corner Hotel" />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T.textMuted, marginBottom: s(1) }}>Slug (URL identifier)</label>
                      <input value={hotelForm.slug} onChange={(e) => setHotelForm({ ...hotelForm, slug: e.target.value })}
                        className="input-field" style={{ fontFamily: "monospace" }} />
                    </div>
                  </div>
                </div>
                {/* Section 2: First admin */}
                <div>
                  <h2 style={{ fontSize: "1rem", fontWeight: 700, color: T.primary, marginBottom: s(3) }}>First Management Account</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: s(3) }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T.textMuted, marginBottom: s(1) }}>Admin Name</label>
                      <input value={hotelForm.adminName} onChange={(e) => setHotelForm({ ...hotelForm, adminName: e.target.value })}
                        className="input-field" style={{ fontFamily: T.font }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T.textMuted, marginBottom: s(1) }}>Admin Username</label>
                      <input value={hotelForm.adminUsername} onChange={(e) => setHotelForm({ ...hotelForm, adminUsername: e.target.value })}
                        className="input-field" style={{ fontFamily: T.font }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T.textMuted, marginBottom: s(1) }}>Admin Phone (for welcome SMS)</label>
                      <input value={hotelForm.adminPhone} onChange={(e) => setHotelForm({ ...hotelForm, adminPhone: e.target.value })}
                        className="input-field" style={{ fontFamily: T.font }} placeholder="2547XXXXXXXX" />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: s(2) }}>
                      <input type="checkbox" id="hotelOpen" checked={hotelForm.isOpen} onChange={(e) => setHotelForm({ ...hotelForm, isOpen: e.target.checked })} />
                      <label htmlFor="hotelOpen" style={{ fontSize: "0.85rem", color: T.text }}>Start with hotel open for orders</label>
                    </div>
                  </div>
                </div>
                <button onClick={handleCreateHotel} disabled={submitting || !hotelForm.name || !hotelForm.slug || !hotelForm.adminUsername || !hotelForm.adminName || !hotelForm.adminPhone}
                  style={{ background: T.primary, color: "white", border: "none", padding: s(4), borderRadius: T.radius, fontWeight: 700, fontSize: "0.95rem", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting || !hotelForm.name || !hotelForm.slug || !hotelForm.adminUsername || !hotelForm.adminName || !hotelForm.adminPhone ? 0.6 : 1, alignSelf: "flex-start", minWidth: "200px" }}>
                  {submitting ? "Creating…" : "Create Hotel & Seed Admin"}
                </button>
              </div>
            </>
          )
        ) : view === "admins" ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: s(6) }}>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, margin: 0 }}>Platform Admins</h1>
              <button onClick={() => setView("create_admin")} style={{ background: T.primary, color: "white", border: "none", padding: `${s(2)} ${s(5)}`, borderRadius: T.radius, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>＋ Add Admin</button>
            </div>
            {admins.length === 0 ? (
              <div style={{ textAlign: "center", padding: s(10), color: T.textMuted }}>No platform admins yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: s(2) }}>
                {admins.map((a) => (
                  <div key={a.id} style={{ background: T.surface, borderRadius: T.radius, border: `1px solid ${T.border}`, padding: s(4), display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: T.text }}>{a.name}</div>
                      <div style={{ fontSize: "0.8rem", color: T.textMuted }}>@{a.username} · Added {new Date(a.createdAt).toLocaleDateString()}</div>
                    </div>
                    <button onClick={() => {
                      setConfirm({
                        title: `Remove ${a.name}?`,
                        message: `${a.name} will lose all platform-level access immediately. This cannot be undone. Are you sure?`,
                        onConfirm: () => handleDeleteAdmin(a.id),
                      });
                    }}
                      style={{ background: "none", border: `1px solid #FCA5A5`, color: T.danger, padding: `${s(1)} ${s(3)}`, borderRadius: T.radius, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : view === "create_admin" ? (
          adminResult ? (
            <div style={{ textAlign: "center", padding: s(10), maxWidth: "480px" }}>
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: T.primaryMuted, color: T.primary, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "1.5rem" }}>🔑</div>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: T.text, marginBottom: s(2) }}>Platform Admin Created</h2>
              <div style={{ background: T.primaryMuted, borderRadius: T.radius, padding: s(4), margin: `${s(4)} auto`, maxWidth: "380px", textAlign: "left", fontSize: "0.9rem", border: `1px solid ${T.primaryLight}` }}>
                <div style={{ fontWeight: 700, marginBottom: s(2) }}>One-time credentials:</div>
                <div style={{ color: T.textMuted }}>Username: <strong>{adminResult.username}</strong></div>
                <div style={{ color: T.textMuted }}>Name: <strong>{adminResult.name}</strong></div>
                <div style={{ color: T.textMuted }}>Temp password: <strong style={{ fontFamily: "monospace" }}>{adminResult.tempPassword}</strong></div>
              </div>
              <button onClick={() => { setAdminResult(null); setAdminForm({ username: "", name: "" }); setView("admins"); }}
                style={{ background: T.primary, color: "white", border: "none", padding: `${s(3)} ${s(6)}`, borderRadius: T.radius, fontWeight: 700, cursor: "pointer", marginTop: s(4) }}>Done</button>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, marginBottom: s(2) }}>Add Platform Admin</h1>
              <p style={{ fontSize: "0.9rem", color: T.warning, background: T.warningMuted, padding: s(3), borderRadius: T.radius, marginBottom: s(6), border: `1px solid #FDE68A` }}>
                ⚠ This grants full platform-level access to create and manage hotels and other platform administrators.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: s(4), maxWidth: "400px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T.textMuted, marginBottom: s(1) }}>Full Name</label>
                  <input value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                    className="input-field" style={{ fontFamily: T.font }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T.textMuted, marginBottom: s(1) }}>Username</label>
                  <input value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                    className="input-field" style={{ fontFamily: T.font }} />
                </div>
                <button onClick={handleCreateAdmin} disabled={adminSubmitting || !adminForm.name || !adminForm.username}
                  style={{ background: T.primary, color: "white", border: "none", padding: s(4), borderRadius: T.radius, fontWeight: 700, fontSize: "0.95rem", cursor: adminSubmitting ? "not-allowed" : "pointer", opacity: adminSubmitting || !adminForm.name || !adminForm.username ? 0.6 : 1, alignSelf: "flex-start", minWidth: "180px" }}>
                  {adminSubmitting ? "Creating…" : "Create Platform Admin"}
                </button>
              </div>
            </>
          )
        ) : view === "audit" ? (
          <>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, marginBottom: s(6) }}>Audit Log</h1>
            {auditRows.length === 0 ? (
              <div style={{ textAlign: "center", padding: s(10), color: T.textMuted }}>No platform events recorded yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: s(2) }}>
                {auditRows.map((r: any) => (
                  <div key={r.id} style={{ background: T.surface, borderRadius: T.radius, border: `1px solid ${T.border}`, padding: s(3), fontSize: "0.85rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, color: T.text, fontFamily: "monospace", fontSize: "0.8rem" }}>{r.eventName}</span>
                      <span style={{ color: T.textDim, fontSize: "0.8rem" }}>{new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                    <div style={{ color: T.textMuted, marginTop: s(1) }}>
                      {r.payload?.hotelName && <span>Hotel: {r.payload.hotelName} · </span>}
                      {r.payload?.adminName && <span>Admin: {r.payload.adminName} · </span>}
                      {r.payload?.createdBy && <span>By: {r.payload.createdBy}</span>}
                      {r.payload?.newStatus && <span>New status: {r.payload.newStatus}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : view === "outbox" ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: s(6) }}>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, margin: 0 }}>Outbox</h1>
              <button onClick={fetch} style={{ background: "none", border: `1px solid ${T.border}`, padding: `${s(1)} ${s(4)}`, borderRadius: T.radius, fontSize: "0.85rem", cursor: "pointer", color: T.textMuted }}>Refresh</button>
            </div>
            {outboxRows.length === 0 ? (
              <div style={{ textAlign: "center", padding: s(10), color: T.textMuted }}>No outbox events.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: s(2) }}>
                {outboxRows.map((r: any) => (
                  <div key={r.id} style={{ background: r.status === "failed" ? T.dangerMuted : T.surface, borderRadius: T.radius, border: `1px solid ${r.status === "failed" ? "#FECACA" : T.border}`, padding: s(3), fontSize: "0.85rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, color: T.text }}>{r.eventName}</span>
                      <span style={{ color: r.status === "failed" ? T.danger : T.textMuted, fontWeight: 600, fontSize: "0.8rem" }}>{r.status} (attempts: {r.attempts})</span>
                    </div>
                    <div style={{ color: T.textMuted, marginTop: s(1) }}>{new Date(r.createdAt).toLocaleString()}</div>
                    {r.lastError && <div style={{ color: T.danger, marginTop: s(1) }}>Error: {r.lastError}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </main>

      {/* Confirmation modals */}
      {confirm && (
        <Modal
          isOpen={true}
          type="danger"
          title={confirm.title}
          message={confirm.message}
          confirmText="Confirm"
          cancelText="Cancel"
          onConfirm={() => { confirm.onConfirm(); setConfirm(null); }}
          onCancel={() => { setConfirm(null); }}
        />
      )}
    </div>
  );
};

// ── Hotel Detail sub-view ──
function HotelDetail({ hotelId, onBack, onToggle, token: tok }: { hotelId: string; onBack: () => void; onToggle: (id: string) => void; token: string }) {
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const T2 = T;

  useEffect(() => {
    (async () => {
      const res = await apiGet<Hotel>(`/platform/hotels/${hotelId}`, tok);
      if (res.success && res.data) setHotel(res.data);
      setDetailLoading(false);
    })();
  }, [hotelId, tok]);

  if (detailLoading) return <div style={{ color: T2.textDim }}>Loading…</div>;
  if (!hotel) return <div style={{ color: T2.danger }}>Hotel not found.</div>;

  return (
    <>
      <button onClick={onBack} style={{ background: "none", border: "none", color: T2.primary, fontSize: "0.9rem", cursor: "pointer", padding: 0, marginBottom: s(4), fontWeight: 600 }}>← Back to Hotels</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: s(6) }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: T2.text, margin: 0 }}>{hotel.name}</h1>
          <div style={{ fontSize: "0.85rem", color: T2.textMuted, marginTop: s(1) }}>
            {hotel.slug} · {hotel.isOpen ? "Open" : "Closed"}
            {hotel._count && ` · ${hotel._count.orders} orders`}
            · Onboarded {new Date(hotel.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: s(2) }}>
          <button onClick={() => onToggle(hotel.id)}
            style={{ background: hotel.isOpen ? T2.dangerMuted : T2.successMuted, color: hotel.isOpen ? T2.danger : T2.success, border: `1px solid ${hotel.isOpen ? "#FECACA" : "#A7F3D0"}`, padding: `${s(2)} ${s(4)}`, borderRadius: T2.radius, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>
            {hotel.isOpen ? "Suspend" : "Activate"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: s(6), marginBottom: s(6) }}>
        {/* Admins */}
        <div>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: T2.text, marginBottom: s(3) }}>Management Staff</h3>
          {(!hotel.adminUsers || hotel.adminUsers.length === 0) ? (
            <div style={{ color: T2.textMuted, fontSize: "0.85rem" }}>No admin users.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: s(2) }}>
              {hotel.adminUsers.map((a: any) => (
                <div key={a.id} style={{ background: T2.surface, borderRadius: T2.radius, border: `1px solid ${T2.border}`, padding: s(3), fontSize: "0.85rem" }}>
                  <div style={{ fontWeight: 700, color: T2.text }}>{a.name}</div>
                  <div style={{ color: T2.textMuted }}>@{a.username} · {a.role === "HOTEL_ADMIN" ? "Admin" : "Staff"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Staff */}
        <div>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: T2.text, marginBottom: s(3) }}>Staff (SMS Recipients)</h3>
          {(!hotel.staffUsers || hotel.staffUsers.length === 0) ? (
            <div style={{ color: T2.textMuted, fontSize: "0.85rem" }}>No staff users.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: s(2) }}>
              {hotel.staffUsers.map((s: any) => (
                <div key={s.id} style={{ background: T2.surface, borderRadius: T2.radius, border: `1px solid ${T2.border}`, padding: s(3), fontSize: "0.85rem" }}>
                  <div style={{ fontWeight: 700, color: T2.text }}>{s.name}</div>
                  <div style={{ color: T2.textMuted }}>{s.phone}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Events / Audit trail */}
      <div>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: T2.text, marginBottom: s(3) }}>Activity</h3>
        {(!hotel.events || hotel.events.length === 0) ? (
          <div style={{ color: T2.textMuted, fontSize: "0.85rem" }}>No events recorded.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: s(2) }}>
            {hotel.events.map((e: any) => (
              <div key={e.id} style={{ background: T2.surface, borderRadius: T2.radius, border: `1px solid ${T2.border}`, padding: s(3), fontSize: "0.85rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, color: T2.text, fontFamily: "monospace", fontSize: "0.8rem" }}>{e.eventName}</span>
                  <span style={{ color: T2.textDim, fontSize: "0.8rem" }}>{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ color: T2.textMuted, marginTop: s(1) }}>
                  {e.payload?.createdBy && <span>By: {e.payload.createdBy}</span>}
                  {e.payload?.newStatus && <span>Status: {e.payload.newStatus}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
