import React, { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../../lib/api";
import { useNotifications } from "../../context/NotificationsContext";
import { usePlatformAdminAuth } from "../../context/PlatformAdminAuthContext";
import { AdminNotificationPanel } from "../../components/AdminNotificationPanel";
import { Modal } from "../../components/ui/Modal";
import { InboxPage } from "../InboxPage";
import { Activity, Bell, Building2, ChevronRight, ClipboardList, LayoutDashboard, LogOut, MapPin, Menu, MessageCircle, Plus, RefreshCw, Send, UserPlus, Users, UserCircle, X } from "lucide-react";

type PlatformView = "login" | "overview" | "hotels" | "hotel_detail" | "create_hotel" | "regions" | "admins" | "create_admin" | "audit" | "outbox" | "communications" | "profile";

interface PlatformMe {
    id: string; username: string; name: string;
}
interface PlatformDashboard {
    hotelCount: number; activeHotelCount: number; platformAdminCount: number;
    totalOrders: number; failedOutboxCount: number; platformBrand: string;
}

// NOTE - all actions here are highly impactful to business operations; destructive actions stay behind confirmation.
interface Hotel {
    id: string; name: string; slug: string; isOpen: boolean;
    autoCloseAt: string | null; imageUrl: string | null; createdAt: string; deletedAt: string | null;
    adminUsers?: { id: string; name: string; username: string; role: string }[];
    _count?: { orders: number };
    events?: any[]; staffUsers?: { id: string; name: string; phone: string }[];
    zone?: DeliveryRegion;
}
interface AdminUser { id: string; name: string; username: string; createdAt: string; }
interface DeliveryRegion { id: string; name: string; type: string; locationLabel: string; locationPlaceholder: string; active?: boolean; }

const T = {
    bg: "#FFF8F0",
    surface: "#FFFFFF",
    border: "#EADFD3",
    primary: "#114B36",
    primaryMuted: "#EBF5F0",
    primaryLight: "#C2E2D3",
    text: "#1F2937",
    textMuted: "#6B7280",
    textDim: "#9CA3AF",
    danger: "#DC2626",
    dangerMuted: "#FEF2F2",
    success: "#15803D",
    successMuted: "#DCFCE7",
    warning: "#A16207",
    warningMuted: "#FFF7D6",
    radius: "14px",
    font: "Inter, system-ui, -apple-system, sans-serif",
};

function s(num: number) { return `${num * 4}px`; }

export const PlatformAdminPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { token, user, login: authLogin, logout: authLogout } = usePlatformAdminAuth();
    const [view, setView] = useState<PlatformView>(() => {
        const tok = localStorage.getItem("ladha_platform_token");
        return tok ? "overview" : "login";
    });
    const [dashboard, setDashboard] = useState<PlatformDashboard | null>(null);
    const [hotels, setHotels] = useState<Hotel[]>([]);
    const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [auditRows, setAuditRows] = useState<any[]>([]);
    const [outboxRows, setOutboxRows] = useState<any[]>([]);
    const [regions, setRegions] = useState<DeliveryRegion[]>([]);
    const [heroImageUrl, setHeroImageUrl] = useState("");
    const [heroSaving, setHeroSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchQ, setSearchQ] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 900);
    const [loginSubmitting, setLoginSubmitting] = useState(false);
    const [profileForm, setProfileForm] = useState({ name: "", username: "", currentPassword: "", newPassword: "", confirmPassword: "" });
    const [profileSaving, setProfileSaving] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);
    const { unreadCount, pushNotification } = useNotifications();

    useEffect(() => { if (user) setProfileForm((current) => ({ ...current, name: user.name, username: user.username })); }, [user]);

    useEffect(() => {
        const handleResize = () => setSidebarOpen(window.innerWidth >= 900);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // ── Login ──
    const [loginForm, setLoginForm] = useState({ username: "", password: "" });
    const [loginError, setLoginError] = useState("");

    // ── Create Hotel ──
    const [hotelForm, setHotelForm] = useState({
        name: "", slug: "", adminUsername: "", adminName: "", adminPhone: "", zoneId: "", isOpen: true, autoCloseAt: "",
    });
    const [createResult, setCreateResult] = useState<any>(null);
    const [submitting, setSubmitting] = useState(false);
    const [showRegionForm, setShowRegionForm] = useState(false);
    const [regionSaving, setRegionSaving] = useState(false);
    const [regionForm, setRegionForm] = useState({ name: "", type: "MARKET", locationLabel: "Delivery point", locationPlaceholder: "e.g. stall, bay, floor or office" });

    // ── Create Admin ──
    const [adminForm, setAdminForm] = useState({ username: "", name: "", phone: "" });
    const [adminResult, setAdminResult] = useState<any>(null);
    const [adminSubmitting, setAdminSubmitting] = useState(false);

    // ── Confirm modals ──
    const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

    const fetch = useCallback(async () => {
        if (!token) { setLoading(false); return; }
        setLoading(true);
        const [dashRes, hotelsRes, adminsRes, auditRes, outboxRes, regionsRes, heroRes] = await Promise.all([
            apiGet<PlatformDashboard>("/platform/dashboard", token),
            apiGet<Hotel[]>("/platform/hotels", token),
            apiGet<AdminUser[]>("/platform/admins", token),
            apiGet<any[]>("/platform/audit", token),
            apiGet<any[]>("/platform/outbox", token),
            apiGet<DeliveryRegion[]>("/platform/zones", token),
            apiGet<{ imageUrl: string }>("/platform/hero", token),
        ]);
        const authFailed = [dashRes, hotelsRes, adminsRes, auditRes, outboxRes, regionsRes, heroRes].some((res) =>
            !res.success && /invalid|expired|session/i.test(res.error ?? "")
        );
        if (authFailed) {
            authLogout();
            setView("login");
            setLoading(false);
            return;
        }
        if (dashRes.success && dashRes.data) setDashboard(dashRes.data);
        if (hotelsRes.success && hotelsRes.data) setHotels(hotelsRes.data);
        if (adminsRes.success && adminsRes.data) setAdmins(adminsRes.data);
        if (auditRes.success && auditRes.data) setAuditRows(auditRes.data);
        if (outboxRes.success && outboxRes.data) setOutboxRows(outboxRes.data);
        if (regionsRes.success && regionsRes.data) {
            setRegions(regionsRes.data);
            setHotelForm((form) => form.zoneId ? form : { ...form, zoneId: regionsRes.data![0]?.id ?? "" });
        }
        if (heroRes.success && heroRes.data) setHeroImageUrl(heroRes.data.imageUrl);
        setLoading(false);
    }, [token]);

    const saveHeroImage = async () => {
        if (heroSaving) return;
        setHeroSaving(true);
        const res = await apiPatch<{ imageUrl: string }>("/platform/hero", { imageUrl: heroImageUrl.trim() }, token);
        setHeroSaving(false);
        if (res.success) pushNotification("success", "Hero image updated", "The new marketplace hero is now live.", { scope: "platform" });
        else pushNotification("danger", "Hero image not saved", res.error || "Unable to update the hero image", { scope: "platform" });
    };

    useEffect(() => { fetch(); }, [fetch]);
    useEffect(() => {
        if (!token && view !== "login") setView("login");
    }, [token, view]);

    // ── Login ──
    const handleLogin = async () => {
        if (loginSubmitting || !loginForm.username.trim() || !loginForm.password) return;
        setLoginError("");
        setLoginSubmitting(true);
        try {
            const res = await apiPost<{ token: string; user: PlatformMe }>("/platform/login", { ...loginForm, username: loginForm.username.trim(), password: loginForm.password.trim() });
            if (res.success && res.data) {
                authLogin(res.data.token, res.data.user);
                setView("overview");
            } else {
                setLoginError(res.error || "Login failed");
            }
        } finally {
            setLoginSubmitting(false);
        }
    };

    const handleLogout = () => {
        authLogout();
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

    const handleCreateRegion = async () => {
        if (!regionForm.name.trim() || regionSaving) return;
        setRegionSaving(true);
        const res = await apiPost<DeliveryRegion>("/platform/zones", regionForm, token);
        setRegionSaving(false);
        if (res.success && res.data) {
            setRegions((current) => [...current, res.data!].sort((a, b) => a.name.localeCompare(b.name)));
            setHotelForm((form) => ({ ...form, zoneId: res.data!.id }));
            setRegionForm({ name: "", type: "MARKET", locationLabel: "Delivery point", locationPlaceholder: "e.g. stall, bay, floor or office" });
            setShowRegionForm(false);
        } else {
            pushNotification("danger", "Failed to create region", res.error || "Unknown error", { scope: "platform" });
        }
    };

    // ── Toggle Hotel ──
    // Always confirm the exact change first (suspend vs activate) and only act
    // once the platform admin commits to it — an open/closed flip impacts real
    // order flow for customers and staff, so it must never happen by accident.
    const handleToggleHotel = (id: string, action: "open" | "close") => {
        const hotel = hotels.find((h) => h.id === id);
        const hotelName = hotel?.name || "This hotel";
        setConfirm({
            title: action === "close" ? `Suspend ${hotelName}?` : `Activate ${hotelName}?`,
            message: action === "close"
                ? `Customers will stop being able to order from ${hotelName} and the kitchen will no longer receive new orders. Staff are notified by SMS. Are you sure?`
                : `Customers will be able to order from ${hotelName} again immediately. Are you sure?`,
            onConfirm: () => void performToggleHotel(id),
        });
    };

    const performToggleHotel = async (id: string) => {
        const res = await apiPatch<Hotel>(`/platform/hotels/${id}/toggle`, {}, token);
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
        const res = await apiPost<AdminUser & { setupLink: string }>("/platform/admins", adminForm, token);
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

    const handleRetryOutbox = async (id: string) => {
        const res = await apiPatch<{ retried: string }>(`/platform/outbox/${id}/retry`, {}, token);
        if (res.success) {
            pushNotification("success", "Retry queued", "The event has been returned to the dispatcher.", { scope: "platform" });
            await fetch();
        } else {
            pushNotification("danger", "Retry failed", res.error || "Could not retry this event.", { scope: "platform" });
        }
    };

    const handleSaveProfile = async () => {
        if (profileForm.newPassword && (profileForm.newPassword !== profileForm.confirmPassword || !profileForm.currentPassword || profileForm.newPassword.length < 8)) {
            pushNotification("danger", "Password not saved", "Enter the current password and matching new password of at least 8 characters.", { scope: "platform" }); return;
        }
        setProfileSaving(true);
        const res = await apiPatch<PlatformMe>("/platform/me", { name: profileForm.name.trim(), username: profileForm.username.trim(), ...(profileForm.newPassword ? { currentPassword: profileForm.currentPassword, newPassword: profileForm.newPassword } : {}) }, token);
        setProfileSaving(false);
        if (res.success && res.data) { authLogin(token, res.data); setProfileForm((current) => ({ ...current, currentPassword: "", newPassword: "", confirmPassword: "" })); pushNotification("success", "Profile saved", "Your profile settings have been updated.", { scope: "platform" }); }
        else pushNotification("danger", "Profile update failed", res.error || "Unable to update your profile.", { scope: "platform" });
    };

    // ── Nav icon mapping ──
    const navIcon = (v: PlatformView): React.ReactNode => {
        switch (v) {
            case "overview": return <LayoutDashboard size={17} />;
            case "hotels": return <Building2 size={17} />;
            case "create_hotel": return <Plus size={17} />;
            case "regions": return <MapPin size={17} />;
            case "admins": return <Users size={17} />;
            case "create_admin": return <UserPlus size={17} />;
            case "audit": return <ClipboardList size={17} />;
            case "outbox": return <Send size={17} />;
            case "communications": return <MessageCircle size={17} />;
            case "profile": return <UserCircle size={17} />;
            default: return <Activity size={17} />;
        }
    };

    const navItem = (v: PlatformView, label: string) => (
        <button
            onClick={() => { setView(v); setSidebarOpen(false); }}
            style={{
                background: view === v ? T.primaryMuted : "transparent",
                color: view === v ? T.primary : T.textMuted,
                border: "none", padding: `${s(3)} ${s(4)}`, borderRadius: T.radius,
                fontWeight: view === v ? 700 : 500, fontSize: "0.9rem", cursor: "pointer",
                textAlign: "left", width: "100%", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: s(3),
            }}
        >
            <span style={{ width: "20px", display: "inline-flex", justifyContent: "center", opacity: view === v ? 1 : 0.5 }}>{navIcon(v)}</span>
            {label}
        </button>
    );

    // ── Login View ──
    if (view === "login") {
        return (
            <div className="platform-shell" style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font, padding: s(4) }}>
                <div className="platform-login-card" style={{ width: "100%", maxWidth: "400px", background: T.surface, borderRadius: "16px", padding: s(8), border: `1px solid ${T.border}` }}>
                    <div style={{ textAlign: "center", marginBottom: s(6) }}>
                        <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: T.primary, color: "white", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontWeight: 800, fontSize: "1.2rem" }}>TD</div>
                        <h1 style={{ fontSize: "1.3rem", fontWeight: 700, color: T.text, margin: 0 }}>Ladha Deliveries</h1>
                        <p style={{ fontSize: "0.85rem", color: T.textMuted, marginTop: s(2) }}>Sign in to manage tenants and platform access</p>
                    </div>
                    {loginError && <div style={{ background: T.dangerMuted, color: T.danger, padding: s(3), borderRadius: T.radius, fontSize: "0.85rem", marginBottom: s(4), fontWeight: 600 }}>{loginError}</div>}
                    <div style={{ display: "flex", flexDirection: "column", gap: s(4) }}>
                        <input placeholder="Username" value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                            className="input-field" style={{ fontFamily: T.font }} autoComplete="username" />
                        <input type="password" placeholder="Password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                            className="input-field" style={{ fontFamily: T.font }} autoComplete="current-password" onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
                        <button onClick={handleLogin} disabled={loginSubmitting || !loginForm.username.trim() || !loginForm.password}
                            style={{ background: T.primary, color: "white", border: "none", padding: s(4), borderRadius: T.radius, fontWeight: 700, fontSize: "0.95rem", cursor: loginSubmitting ? "wait" : "pointer", opacity: loginSubmitting || !loginForm.username.trim() || !loginForm.password ? 0.6 : 1 }}>
                            {loginSubmitting ? "Signing in…" : "Sign In"}
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
    const sidebarWidth = 240;
    return (
        <div className="platform-shell" style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font, display: "flex" }}>
            {/* Subtle menu toggle — thin line icon, no background blob */}
            <button onClick={() => setSidebarOpen(true)}
                style={{
                    position: "fixed", top: s(4), right: s(4), zIndex: 60,
                    background: sidebarOpen ? "transparent" : T.surface,
                    border: `1px solid ${T.border}`, cursor: "pointer",
                    width: "36px", height: "36px", display: "flex",
                    flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: "4.5px", padding: 0, borderRadius: "10px",
                    opacity: sidebarOpen ? 0 : 1, pointerEvents: sidebarOpen ? "none" : "auto",
                    transition: "opacity 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
                aria-label="Open menu"
            >
                <Menu size={18} color={T.textMuted} aria-hidden="true" />
            </button>

            {/* Notification bell — fixed top-right, platform-scoped */}
            <button onClick={() => setPanelOpen(true)}
                style={{
                    position: "fixed", top: s(4), right: "calc(16px + 44px)", zIndex: 60,
                    background: T.surface,
                    border: `1px solid ${T.border}`, cursor: "pointer",
                    width: "36px", height: "36px", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    padding: 0, borderRadius: "10px",
                    transition: "box-shadow 0.15s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
                aria-label="Notifications"
                title="Notifications"
            >
                <Bell size={18} color={T.textMuted} aria-hidden="true" />
                {unreadCount > 0 && (
                    <span style={{
                        position: "absolute", top: -4, right: -4,
                        background: T.danger, color: "white",
                        borderRadius: "50%", fontSize: "0.6rem", fontWeight: 700,
                        minWidth: "18px", height: "18px", padding: "0 4px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: `2px solid ${T.surface}`,
                    }}>{unreadCount > 9 ? "9+" : unreadCount}</span>
                )}
            </button>

            {/* Overlay backdrop */}
            {sidebarOpen && (
                <div onClick={() => setSidebarOpen(false)}
                    onKeyDown={(e) => { if (e.key === "Escape") setSidebarOpen(false); }}
                    role="button" tabIndex={-1} aria-label="Close navigation menu"
                    style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 49 }}
                    className="platform-sidebar-overlay"
                />
            )}

            {/* Sidebar — clean drawer panel */}
            <nav style={{
                width: sidebarWidth, background: T.surface,
                display: "flex", flexDirection: "column",
                position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50,
                padding: s(6), gap: s(1),
                transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: sidebarOpen ? "4px 0 24px rgba(0,0,0,0.08)" : "none",
            }}
                className="platform-sidebar"
            >
                {/* Sidebar header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: s(8) }}>
                    <div style={{ display: "flex", alignItems: "center", gap: s(3) }}>
                        <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: T.primary, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.9rem" }}>TD</div>
                        <div>
                            <div style={{ fontWeight: 700, color: T.text, fontSize: "0.95rem", lineHeight: 1.3 }}>Ladha Deliveries</div>
                            <div style={{ fontSize: "0.75rem", color: T.textMuted }}>Platform Admin</div>
                        </div>
                    </div>
                    <button onClick={() => setSidebarOpen(false)}
                        style={{
                            background: "transparent", border: "none", color: T.textDim, cursor: "pointer",
                            width: "28px", height: "28px", borderRadius: "6px", display: "flex",
                            alignItems: "center", justifyContent: "center", fontSize: "1.1rem",
                            transition: "background 0.15s",
                        }}
                        aria-label="Close menu"
                    >
                        <X size={17} />
                    </button>
                </div>

                {navItem("overview", "Overview")}
                {navItem("hotels", "Hotels")}
                {navItem("create_hotel", "Add Hotel")}
                {navItem("regions", "Serving Regions")}
                {navItem("admins", "Platform Admins")}
                {navItem("create_admin", "Add Admin")}
                {navItem("audit", "Audit Log")}
                {navItem("outbox", "Outbox")}
                {navItem("communications", "Communications")}
                {navItem("profile", "My Profile")}

                <div style={{ marginTop: "auto", paddingTop: s(5), borderTop: `1px solid ${T.border}` }}>
                    {user && <div style={{ fontSize: "0.8rem", color: T.textMuted, marginBottom: s(2), fontWeight: 500 }}>{user.name}</div>}
                    <button onClick={handleLogout} style={{ background: "none", border: "none", color: T.textDim, fontSize: "0.85rem", cursor: "pointer", padding: 0, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: s(2) }}><LogOut size={15} /> Sign Out</button>
                </div>
            </nav>

            {/* Main content */}
            <main style={{ flex: 1, minHeight: "100vh", padding: s(8), maxWidth: "960px", marginLeft: "auto", marginRight: "auto" }}
                className="platform-main">
                {loading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "40vh", color: T.textDim }}>Loading…</div>
                ) : view === "overview" ? (
                    <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: s(4), marginBottom: s(6), flexWrap: "wrap" }}>
                            <div>
                                <p style={{ color: T.primary, fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: s(1) }}>Ladha Deliveries</p>
                                <h1 style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", fontWeight: 800, color: T.text, margin: 0 }}>Platform overview</h1>
                                <p style={{ color: T.textMuted, fontSize: "0.9rem", marginTop: s(1) }}>A clear view of your marketplace, tenants, and delivery operations.</p>
                            </div>
                            <span style={{ background: T.primaryMuted, color: T.primary, borderRadius: "999px", padding: `${s(2)} ${s(3)}`, fontSize: "0.75rem", fontWeight: 800 }}>Live operations</span>
                        </div>
                        {/* ── Stats grid ── */}
                        {dashboard && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: s(3), marginBottom: s(5) }}>
                                {[
                                    { label: "Total Hotels", value: dashboard.hotelCount, color: T.text },
                                    { label: "Active", value: dashboard.activeHotelCount, color: T.success },
                                    { label: "Platform Admins", value: dashboard.platformAdminCount, color: T.primary },
                                    { label: "Platform Orders", value: dashboard.totalOrders, color: T.text },
                                ].map((stat) => (
                                    <div key={stat.label} style={{ background: T.surface, borderRadius: "18px", padding: s(5), border: `1px solid ${T.border}`, boxShadow: "0 8px 24px rgba(17,75,54,0.06)" }}>
                                        <div style={{ fontSize: "2rem", fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                                        <div style={{ fontSize: "0.8rem", color: T.textMuted, marginTop: s(1) }}>{stat.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: "20px", padding: s(5), marginBottom: s(5) }}>
                            <div style={{ color: T.textDim, fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>Marketplace presentation</div>
                            <h2 style={{ color: T.text, fontSize: "1.05rem", margin: `${s(2)} 0 ${s(1)}` }}>Homepage hero image</h2>
                            <p style={{ color: T.textMuted, fontSize: "0.82rem", margin: `0 0 ${s(3)}` }}>Use a calm, well-lit food or local-kitchen image. Leave blank to use the discovery fallback.</p>
                            <div style={{ display: "flex", gap: s(2), flexWrap: "wrap" }}><input aria-label="Homepage hero image URL" value={heroImageUrl} onChange={(e) => setHeroImageUrl(e.target.value)} placeholder="https://…" style={{ flex: "1 1 280px", padding: s(3), border: `1px solid ${T.border}`, borderRadius: T.radius, fontFamily: T.font }} /><button type="button" onClick={() => void saveHeroImage()} disabled={heroSaving} style={{ background: T.primary, color: "white", border: "none", padding: `${s(2)} ${s(4)}`, borderRadius: T.radius, fontWeight: 700 }}>{heroSaving ? "Saving…" : "Save hero image"}</button></div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: s(4), marginBottom: s(5) }}>
                            <div style={{ background: T.primary, color: "white", borderRadius: "20px", padding: s(5), boxShadow: "0 12px 28px rgba(17,75,54,0.18)" }}>
                                <div style={{ fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.7 }}>Tenant operations</div>
                                <div style={{ fontSize: "1.25rem", fontWeight: 800, marginTop: s(2) }}>{dashboard?.activeHotelCount ?? 0} hotels accepting orders</div>
                                <p style={{ margin: `${s(2)} 0 0`, fontSize: "0.82rem", lineHeight: 1.5, opacity: 0.78 }}>Manage availability, onboarding, and hotel-level teams from one workspace.</p>
                            </div>
                            <div style={{ background: T.surface, borderRadius: "20px", padding: s(5), border: `1px solid ${T.border}`, boxShadow: "0 8px 24px rgba(17,75,54,0.05)" }}>
                                <div style={{ fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textDim }}>Recent tenants</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: s(2), marginTop: s(3) }}>
                                    {hotels.slice(0, 3).map((hotel) => <div key={hotel.id} style={{ display: "flex", justifyContent: "space-between", gap: s(2), fontSize: "0.85rem" }}><span style={{ color: T.text, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hotel.name}</span><span style={{ color: hotel.isOpen ? T.success : T.textDim, fontWeight: 800, fontSize: "0.72rem" }}>{hotel.isOpen ? "OPEN" : "CLOSED"}</span></div>)}
                                    {hotels.length === 0 && <span style={{ color: T.textMuted, fontSize: "0.82rem" }}>No tenants onboarded yet.</span>}
                                </div>
                            </div>
                        </div>
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
                                    <button key={h.id} onClick={() => { setSelectedHotel(h); setView("hotel_detail"); }}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedHotel(h); setView("hotel_detail"); } }}
                                        style={{ background: T.surface, borderRadius: "12px", border: `1px solid ${T.border}`, borderLeft: `4px solid ${h.isOpen ? T.primary : T.textDim}`, padding: `${s(4)} ${s(5)}`, cursor: "pointer", transition: "box-shadow 0.15s" }}
                                        onMouseEnter={(e) => e.currentTarget.style.boxShadow = `0 2px 8px rgba(0,0,0,0.06)`}
                                        onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <div>
                                                <div style={{ fontWeight: 700, color: T.text }}>{h.name}</div>
                                                <div style={{ fontSize: "0.8rem", color: T.textMuted, marginTop: s(1) }}>
                                                    {h.slug} · {h.isOpen ? "Open" : "Closed"} · {h.zone?.name ?? "Unassigned region"} · Onboarded {new Date(h.createdAt).toLocaleDateString()}
                                                </div>
                                            </div>
                                            <ChevronRight size={18} color={T.textDim} />
                                        </div>
                                        {h.adminUsers && h.adminUsers.length > 0 && (
                                            <div style={{ fontSize: "0.8rem", color: T.textMuted, marginTop: s(2), borderTop: `1px solid ${T.border}`, paddingTop: s(2) }}>
                                                Admin: {h.adminUsers.map((a) => a.name).join(", ")}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                ) : view === "hotel_detail" && selectedHotel ? (
                    <HotelDetail hotelId={selectedHotel.id} onBack={() => setView("hotels")} onToggle={handleToggleHotel} token={token} regions={regions} />
                ) : view === "regions" ? (
                    <ServingRegionsPage regions={regions} token={token} onChanged={setRegions} />
                ) : view === "create_hotel" ? (
                    createResult ? (
                        <div style={{ textAlign: "center", padding: s(10) }}>
                            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: T.successMuted, color: T.success, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "1.5rem" }}>✓</div>
                            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: T.text, marginBottom: s(2) }}>{createResult.hotel.name} created</h2>
                            <div style={{ background: T.successMuted, borderRadius: T.radius, padding: s(4), margin: `${s(4)} auto`, maxWidth: "400px", textAlign: "left", fontSize: "0.9rem", color: T.text, border: `1px solid #A7F3D0` }}>
                                <div style={{ fontWeight: 700, marginBottom: s(2) }}>Welcome SMS will be sent to:</div>
                                <div style={{ color: T.textMuted, marginBottom: s(2) }}>{hotelForm.adminName} at {hotelForm.adminPhone}</div>
                                <div style={{ fontWeight: 700, marginBottom: s(1) }}>Hotel Admin Setup Link:</div>
                                <div style={{ color: T.textMuted, wordBreak: "break-all" }}><strong>{createResult.setupLink}</strong></div>
                                <div style={{ fontSize: "0.8rem", color: T.textMuted, marginTop: s(1) }}>The link is also sent via SMS and expires in 24h.</div>
                            </div>
                            <button onClick={() => { setCreateResult(null); setHotelForm({ name: "", slug: "", adminUsername: "", adminName: "", adminPhone: "", zoneId: regions[0]?.id ?? "", isOpen: true, autoCloseAt: "" }); setView("hotels"); }}
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
                                                className="input-field" style={{ fontFamily: T.font }} placeholder="e.g. Riverside Food Court" />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T.textMuted, marginBottom: s(1) }}>Slug (URL identifier)</label>
                                            <input value={hotelForm.slug} onChange={(e) => setHotelForm({ ...hotelForm, slug: e.target.value })}
                                                className="input-field" style={{ fontFamily: "monospace" }} />
                                        </div>
                                        <div>
                                            <label htmlFor="hotelRegion" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T.textMuted, marginBottom: s(1) }}>Delivery Region</label>
                                            <select id="hotelRegion" value={hotelForm.zoneId} onChange={(e) => setHotelForm({ ...hotelForm, zoneId: e.target.value })} className="input-field" style={{ fontFamily: T.font }}>
                                                <option value="">Select a region</option>
                                                {regions.map((region) => <option key={region.id} value={region.id}>{region.name} · {region.type.replaceAll("_", " ")}</option>)}
                                            </select>
                                            {regions.length === 0 && <p style={{ color: T.warning, fontSize: "0.75rem", marginTop: s(1) }}>Create a delivery region before onboarding a hotel.</p>}
                                            <button type="button" onClick={() => setShowRegionForm((open) => !open)} style={{ marginTop: s(2), background: "transparent", border: "none", color: T.primary, fontWeight: 700, cursor: "pointer", padding: 0 }}>{showRegionForm ? "Cancel new region" : "+ Add a new region"}</button>
                                            {showRegionForm && <div style={{ marginTop: s(2), padding: s(3), border: `1px solid ${T.border}`, borderRadius: T.radius, display: "flex", flexDirection: "column", gap: s(2) }}>
                                                <input value={regionForm.name} onChange={(e) => setRegionForm({ ...regionForm, name: e.target.value })} className="input-field" style={{ fontFamily: T.font }} placeholder="Region name e.g. Machakos Bus Station" />
                                                <select value={regionForm.type} onChange={(e) => setRegionForm({ ...regionForm, type: e.target.value })} className="input-field" style={{ fontFamily: T.font }}><option value="MARKET">Market</option><option value="BUS_STATION">Bus station</option><option value="OFFICE_BUILDING">Office building</option><option value="RESIDENTIAL">Residential area</option><option value="OTHER">Other</option></select>
                                                <input value={regionForm.locationLabel} onChange={(e) => setRegionForm({ ...regionForm, locationLabel: e.target.value })} className="input-field" style={{ fontFamily: T.font }} placeholder="Customer location label" />
                                                <input value={regionForm.locationPlaceholder} onChange={(e) => setRegionForm({ ...regionForm, locationPlaceholder: e.target.value })} className="input-field" style={{ fontFamily: T.font }} placeholder="Customer location example" />
                                                <button type="button" onClick={() => void handleCreateRegion()} disabled={regionSaving || !regionForm.name.trim()} style={{ background: T.primary, color: "white", border: "none", padding: s(2), borderRadius: T.radius, fontWeight: 700, cursor: "pointer", opacity: regionSaving || !regionForm.name.trim() ? 0.6 : 1 }}>{regionSaving ? "Saving…" : "Save region"}</button>
                                            </div>}
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
                                <button onClick={handleCreateHotel} disabled={submitting || !hotelForm.name || !hotelForm.slug || !hotelForm.zoneId || !hotelForm.adminUsername || !hotelForm.adminName || !hotelForm.adminPhone}
                                    style={{ background: T.primary, color: "white", border: "none", padding: s(4), borderRadius: T.radius, fontWeight: 700, fontSize: "0.95rem", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting || !hotelForm.name || !hotelForm.slug || !hotelForm.zoneId || !hotelForm.adminUsername || !hotelForm.adminName || !hotelForm.adminPhone ? 0.6 : 1, alignSelf: "flex-start", minWidth: "200px" }}>
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
                                        {user?.username?.toLowerCase() === "hackden" && user.id !== a.id && <button onClick={() => {
                                            setConfirm({
                                                title: `Remove ${a.name}?`,
                                                message: `${a.name} will lose all platform-level access immediately. This cannot be undone. Are you sure?`,
                                                onConfirm: () => handleDeleteAdmin(a.id),
                                            });
                                        }}
                                            style={{ background: "none", border: `1px solid #FCA5A5`, color: T.danger, padding: `${s(1)} ${s(3)}`, borderRadius: T.radius, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}>
                                            Remove
                                        </button>}
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
                                <div style={{ fontWeight: 700, marginBottom: s(2) }}>One-time setup link:</div>
                                <div style={{ color: T.textMuted }}>Username: <strong>{adminResult.username}</strong></div>
                                <div style={{ color: T.textMuted }}>Name: <strong>{adminResult.name}</strong></div>
                                <div style={{ color: T.textMuted, wordBreak: "break-all" }}>Link: <strong>{adminResult.setupLink}</strong></div>
                            </div>
                            <div style={{ fontSize: "0.85rem", color: T.textMuted, marginTop: s(2) }}>The link has also been sent via SMS to their phone and expires in 2h.</div>
                            <button onClick={() => { setAdminResult(null); setAdminForm({ username: "", name: "", phone: "" }); setView("admins"); }}
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
                                <div>
                                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T.textMuted, marginBottom: s(1) }}>Phone Number <span style={{ color: T.danger }}>*</span></label>
                                    <input type="tel" value={adminForm.phone} onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                                        placeholder="07XXXXXXXX"
                                        className="input-field" style={{ fontFamily: T.font }} />
                                    <div style={{ fontSize: "0.75rem", color: T.textDim, marginTop: s(1) }}>They will receive login credentials via SMS</div>
                                </div>
                                <button onClick={handleCreateAdmin} disabled={adminSubmitting || !adminForm.name || !adminForm.username || !adminForm.phone}
                                    style={{ background: T.primary, color: "white", border: "none", padding: s(4), borderRadius: T.radius, fontWeight: 700, fontSize: "0.95rem", cursor: adminSubmitting ? "not-allowed" : "pointer", opacity: adminSubmitting || !adminForm.name || !adminForm.username || !adminForm.phone ? 0.6 : 1, alignSelf: "flex-start", minWidth: "180px" }}>
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
                ) : view === "profile" ? (
                    <div style={{ maxWidth: "640px" }}>
                        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, marginBottom: s(2) }}>My Profile</h1>
                        <p style={{ color: T.textMuted, fontSize: "0.9rem", marginBottom: s(6) }}>Manage your platform administrator identity and password.</p>
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: s(5), display: "flex", flexDirection: "column", gap: s(3) }}>
                            <input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="Display name" className="input-field" />
                            <input value={profileForm.username} onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })} placeholder="Username" className="input-field" />
                            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: s(3), display: "grid", gap: s(3) }}><input type="password" value={profileForm.currentPassword} onChange={(e) => setProfileForm({ ...profileForm, currentPassword: e.target.value })} placeholder="Current password" className="input-field" /><input type="password" value={profileForm.newPassword} onChange={(e) => setProfileForm({ ...profileForm, newPassword: e.target.value })} placeholder="New password (optional)" className="input-field" /><input type="password" value={profileForm.confirmPassword} onChange={(e) => setProfileForm({ ...profileForm, confirmPassword: e.target.value })} placeholder="Confirm new password" className="input-field" /></div>
                            <button onClick={() => void handleSaveProfile()} disabled={profileSaving || !profileForm.name.trim() || !profileForm.username.trim()} style={{ background: T.primary, color: "white", border: "none", padding: s(3), borderRadius: T.radius, fontWeight: 700, cursor: profileSaving ? "wait" : "pointer", opacity: profileSaving ? 0.65 : 1 }}>{profileSaving ? "Saving…" : "Save Profile"}</button>
                        </div>
                    </div>
                ) : view === "communications" ? (
                    <InboxPage token={token} actorId={user?.id} mode="global" title="Communications" onBack={() => setView("overview")} />
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
                                        {r.status === "failed" && (
                                            <button onClick={() => handleRetryOutbox(r.id)} style={{ marginTop: s(2), background: T.surface, color: T.danger, border: `1px solid #FECACA`, padding: `${s(1)} ${s(3)}`, borderRadius: T.radius, fontWeight: 700, fontSize: "0.8rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: s(1) }}>
                                                <RefreshCw size={13} /> Retry delivery
                                            </button>
                                        )}
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
                    onClose={() => setConfirm(null)}
                    primaryAction={{ label: "Confirm", variant: "danger", onClick: () => { confirm.onConfirm(); setConfirm(null); } }}
                    secondaryAction={{ label: "Cancel", onClick: () => setConfirm(null) }}
                />
            )}

            {/* Notification panel */}
            <AdminNotificationPanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} />
        </div>
    );
};

function ServingRegionsPage({ regions, token, onChanged }: { regions: DeliveryRegion[]; token: string; onChanged: (regions: DeliveryRegion[]) => void }) {
    const [drafts, setDrafts] = useState<Record<string, DeliveryRegion>>({});
    const [newRegion, setNewRegion] = useState({ name: "", type: "MARKET", locationLabel: "Delivery point", locationPlaceholder: "e.g. stall, bay, floor or office" });
    const [saving, setSaving] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const draftFor = (region: DeliveryRegion) => drafts[region.id] ?? region;
    const saveRegion = async (region: DeliveryRegion) => {
        setSaving(region.id);
        const res = await apiPatch<DeliveryRegion>(`/platform/zones/${region.id}`, draftFor(region), token);
        setSaving(null);
        if (res.success && res.data) onChanged(regions.map((item) => item.id === region.id ? res.data! : item));
    };
    const createRegion = async () => {
        if (!newRegion.name.trim() || creating) return;
        setCreating(true);
        const res = await apiPost<DeliveryRegion>("/platform/zones", newRegion, token);
        setCreating(false);
        if (res.success && res.data) {
            onChanged([...regions, res.data].sort((a, b) => a.name.localeCompare(b.name)));
            setNewRegion({ name: "", type: "MARKET", locationLabel: "Delivery point", locationPlaceholder: "e.g. stall, bay, floor or office" });
        }
    };

    return <div>
        <div style={{ marginBottom: s(6) }}><p style={{ color: T.primary, fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>Marketplace geography</p><h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: T.text, margin: 0 }}>Serving Regions</h1><p style={{ color: T.textMuted, fontSize: "0.9rem", marginTop: s(1) }}>Create and maintain delivery areas. Hotels are assigned to one region and appear there first for customers.</p></div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: s(4), marginBottom: s(5) }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: T.text, marginTop: 0 }}>Add serving region</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: s(2) }}>
                <input className="input-field" value={newRegion.name} onChange={(e) => setNewRegion({ ...newRegion, name: e.target.value })} placeholder="Region name" />
                <select className="input-field" value={newRegion.type} onChange={(e) => setNewRegion({ ...newRegion, type: e.target.value })}><option value="MARKET">Market</option><option value="BUS_STATION">Bus station</option><option value="OFFICE_BUILDING">Office building</option><option value="RESIDENTIAL">Residential</option><option value="OTHER">Other</option></select>
                <input className="input-field" value={newRegion.locationLabel} onChange={(e) => setNewRegion({ ...newRegion, locationLabel: e.target.value })} placeholder="Location label" />
                <input className="input-field" value={newRegion.locationPlaceholder} onChange={(e) => setNewRegion({ ...newRegion, locationPlaceholder: e.target.value })} placeholder="Location example" />
            </div>
            <button type="button" onClick={() => void createRegion()} disabled={creating || !newRegion.name.trim()} style={{ marginTop: s(3), background: T.primary, color: "white", border: "none", padding: `${s(2)} ${s(4)}`, borderRadius: T.radius, fontWeight: 700, opacity: creating || !newRegion.name.trim() ? 0.6 : 1 }}>{creating ? "Adding…" : "Add Region"}</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: s(3) }}>
            {regions.map((region) => { const draft = draftFor(region); return <div key={region.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: s(4) }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: s(2) }}>
                    <input className="input-field" value={draft.name} onChange={(e) => setDrafts({ ...drafts, [region.id]: { ...draft, name: e.target.value } })} />
                    <select className="input-field" value={draft.type} onChange={(e) => setDrafts({ ...drafts, [region.id]: { ...draft, type: e.target.value } })}><option value="MARKET">Market</option><option value="BUS_STATION">Bus station</option><option value="OFFICE_BUILDING">Office building</option><option value="RESIDENTIAL">Residential</option><option value="OTHER">Other</option></select>
                    <input className="input-field" value={draft.locationLabel} onChange={(e) => setDrafts({ ...drafts, [region.id]: { ...draft, locationLabel: e.target.value } })} />
                    <input className="input-field" value={draft.locationPlaceholder} onChange={(e) => setDrafts({ ...drafts, [region.id]: { ...draft, locationPlaceholder: e.target.value } })} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: s(3), marginTop: s(3) }}><label style={{ display: "flex", alignItems: "center", gap: s(2), color: T.textMuted, fontSize: "0.85rem" }}><input type="checkbox" checked={draft.active !== false} onChange={(e) => setDrafts({ ...drafts, [region.id]: { ...draft, active: e.target.checked } })} /> Available to customers</label><button type="button" onClick={() => void saveRegion(region)} disabled={saving === region.id} style={{ marginLeft: "auto", background: T.primary, color: "white", border: "none", padding: `${s(2)} ${s(4)}`, borderRadius: T.radius, fontWeight: 700 }}>{saving === region.id ? "Saving…" : "Save changes"}</button></div>
            </div>; })}
            {regions.length === 0 && <div style={{ color: T.textMuted, padding: s(6), textAlign: "center" }}>No serving regions configured.</div>}
        </div>
    </div>;
}

// ── Hotel Detail sub-view ──
function HotelDetail({ hotelId, onBack, onToggle, token: tok, regions }: { hotelId: string; onBack: () => void; onToggle: (id: string, action: "open" | "close") => void; token: string; regions: DeliveryRegion[] }) {
    const [hotel, setHotel] = useState<Hotel | null>(null);
    const [detailLoading, setDetailLoading] = useState(true);
    const [zoneId, setZoneId] = useState("");
    const [zoneSaving, setZoneSaving] = useState(false);
    const [editForm, setEditForm] = useState({ name: "", slug: "", imageUrl: "", isOpen: true, autoCloseAt: "" });
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState("");
    const T2 = T;

    useEffect(() => {
        (async () => {
            const res = await apiGet<Hotel>(`/platform/hotels/${hotelId}`, tok);
            if (res.success && res.data) {
                setHotel(res.data);
                setZoneId(res.data.zone?.id ?? "");
                setEditForm({
                    name: res.data.name,
                    slug: res.data.slug,
                    imageUrl: res.data.imageUrl ?? "",
                    isOpen: res.data.isOpen,
                    autoCloseAt: res.data.autoCloseAt ? res.data.autoCloseAt.slice(0, 16) : "",
                });
            }
            setDetailLoading(false);
        })();
    }, [hotelId, tok]);

    const saveRegion = async () => {
        if (!hotel || !zoneId || zoneSaving) return;
        setZoneSaving(true);
        const res = await apiPatch<Hotel>(`/platform/hotels/${hotel.id}`, { zoneId }, tok);
        setZoneSaving(false);
        if (res.success && res.data) setHotel(res.data);
    };

    const saveDetails = async () => {
        if (!hotel || editSaving) return;
        setEditSaving(true);
        setEditError("");
        const res = await apiPatch<Hotel>(`/platform/hotels/${hotel.id}`, {
            name: editForm.name.trim() || hotel.name,
            slug: editForm.slug.trim() || hotel.slug,
            imageUrl: editForm.imageUrl.trim(),
            isOpen: editForm.isOpen,
            autoCloseAt: editForm.autoCloseAt ? new Date(editForm.autoCloseAt).toISOString() : "",
        }, tok);
        setEditSaving(false);
        if (res.success && res.data) {
            setHotel(res.data);
            setEditForm({
                name: res.data.name,
                slug: res.data.slug,
                imageUrl: res.data.imageUrl ?? "",
                isOpen: res.data.isOpen,
                autoCloseAt: res.data.autoCloseAt ? res.data.autoCloseAt.slice(0, 16) : "",
            });
        } else {
            setEditError(res.error ?? "Failed to save hotel details");
        }
    };

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
                    <button onClick={() => onToggle(hotel.id, hotel.isOpen ? "close" : "open")}
                        style={{ background: hotel.isOpen ? T2.dangerMuted : T2.successMuted, color: hotel.isOpen ? T2.danger : T2.success, border: `1px solid ${hotel.isOpen ? "#FECACA" : "#A7F3D0"}`, padding: `${s(2)} ${s(4)}`, borderRadius: T2.radius, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>
                        {hotel.isOpen ? "Suspend" : "Activate"}
                    </button>
                </div>
            </div>

            <div style={{ marginBottom: s(6), padding: s(4), background: T2.surface, border: `1px solid ${T2.border}`, borderRadius: T2.radius, maxWidth: "520px" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: T2.text, marginBottom: s(2) }}>Hotel Details</h3>
                <p style={{ color: T2.textMuted, fontSize: "0.8rem", marginBottom: s(3) }}>Edit the public profile shown to customers on the marketplace.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: s(3) }}>
                    <div>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T2.textMuted, marginBottom: s(1) }}>Hotel Name</label>
                        <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="input-field" style={{ fontFamily: T2.font }} placeholder="e.g. Riverside Food Court" />
                    </div>
                    <div>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T2.textMuted, marginBottom: s(1) }}>Slug (URL identifier)</label>
                        <input value={editForm.slug} onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                            className="input-field" style={{ fontFamily: "monospace" }} />
                    </div>
                    <div>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T2.textMuted, marginBottom: s(1) }}>Image URL</label>
                        <input value={editForm.imageUrl} onChange={(e) => setEditForm({ ...editForm, imageUrl: e.target.value })}
                            className="input-field" style={{ fontFamily: "monospace" }} placeholder="https://…" />
                    </div>
                    <div>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T2.textMuted, marginBottom: s(1) }}>Auto-close (optional)</label>
                        <input type="datetime-local" value={editForm.autoCloseAt} onChange={(e) => setEditForm({ ...editForm, autoCloseAt: e.target.value })}
                            className="input-field" style={{ fontFamily: T2.font }} />
                        <p style={{ color: T2.textDim, fontSize: "0.75rem", marginTop: s(1) }}>Leave empty to keep the hotel open until manually closed.</p>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: s(2), fontSize: "0.85rem", fontWeight: 600, color: T2.text, cursor: "pointer" }}>
                        <input type="checkbox" checked={editForm.isOpen} onChange={(e) => setEditForm({ ...editForm, isOpen: e.target.checked })} style={{ width: "16px", height: "16px", accentColor: T2.primary }} />
                        Accepting orders now
                    </label>
                    {editError && <p style={{ color: T2.danger, fontSize: "0.8rem" }}>{editError}</p>}
                    <div style={{ display: "flex", gap: s(2) }}>
                        <button type="button" onClick={() => void saveDetails()} disabled={editSaving || !editForm.name.trim()}
                            style={{ background: T2.primary, color: "white", border: "none", borderRadius: T2.radius, padding: `${s(2)} ${s(4)}`, fontWeight: 700, fontSize: "0.85rem", cursor: editSaving ? "wait" : "pointer", opacity: editSaving || !editForm.name.trim() ? 0.6 : 1 }}>
                            {editSaving ? "Saving…" : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: s(6), padding: s(4), background: T2.surface, border: `1px solid ${T2.border}`, borderRadius: T2.radius, maxWidth: "520px" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: T2.text, marginBottom: s(2) }}>Delivery Region</h3>
                <p style={{ color: T2.textMuted, fontSize: "0.8rem", marginBottom: s(2) }}>Customers see this hotel when they choose this delivery area.</p>
                <div style={{ display: "flex", gap: s(2) }}>
                    <select value={zoneId} onChange={(event) => setZoneId(event.target.value)} className="input-field" style={{ fontFamily: T2.font, flex: 1 }}>
                        <option value="">Select a region</option>
                        {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
                    </select>
                    <button type="button" onClick={() => void saveRegion()} disabled={zoneSaving || !zoneId} style={{ background: T2.primary, color: "white", border: "none", borderRadius: T2.radius, padding: `0 ${s(3)}`, fontWeight: 700, opacity: zoneSaving || !zoneId ? 0.6 : 1 }}>{zoneSaving ? "Saving…" : "Save"}</button>
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
                            {hotel.staffUsers.map((staff: any) => (
                                <div key={staff.id} style={{ background: T2.surface, borderRadius: T2.radius, border: `1px solid ${T2.border}`, padding: s(3), fontSize: "0.85rem" }}>
                                    <div style={{ fontWeight: 700, color: T2.text }}>{staff.name}</div>
                                    <div style={{ color: T2.textMuted }}>{staff.phone}</div>
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
