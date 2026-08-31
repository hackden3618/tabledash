import React, { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../../lib/api";
import { useNotifications } from "../../context/NotificationsContext";
import { usePlatformAdminAuth } from "../../context/PlatformAdminAuthContext";
import { AdminNotificationPanel } from "../../components/AdminNotificationPanel";
import { Modal } from "../../components/ui/Modal";
import { InboxPage } from "../InboxPage";
import { GeographyWorkspace } from "./GeographyWorkspace";
import { Activity, ArrowUpRight, Bell, Building2, ChevronRight, ClipboardList, LayoutDashboard, LogOut, MapPin, Menu, MessageCircle, Plus, RefreshCw, Send, Settings2, ShieldCheck, UserPlus, Users, UserCircle, X } from "lucide-react";

export type PlatformView = "login" | "overview" | "hotels" | "hotel_detail" | "create_hotel" | "geography" | "admins" | "create_admin" | "audit" | "outbox" | "communications" | "profile" | "settings";

interface PlatformMe {
    id: string; username: string; name: string; role: string;
}
interface PlatformDashboard {
    hotelCount: number; activeHotelCount: number; platformAdminCount: number;
    totalOrders: number; failedOutboxCount: number; platformBrand: string;
}

// NOTE - all actions here are highly impactful to business operations; destructive actions stay behind confirmation.
interface Hotel {
    id: string; name: string; slug: string; isOpen: boolean; isListed?: boolean;
    autoCloseAt: string | null; imageUrl: string | null; createdAt: string; deletedAt: string | null;
    adminUsers?: { id: string; name: string; username: string; role: string }[];
    _count?: { orders: number };
    events?: any[]; staffUsers?: { id: string; name: string; phone: string }[];
    zone?: DeliveryRegion; townRegion?: DeliveryArea;
}
interface AdminUser { id: string; name: string; username: string; createdAt: string; }
interface DeliveryRegion { id: string; name: string; type: string; locationLabel: string; locationPlaceholder: string; active?: boolean; megaRegionId: string; megaRegion?: MegaRegion; }
interface DeliveryArea { id: string; townId: string; name: string; active: boolean; isFallback: boolean; }
interface MegaRegion { id: string; name: string; type: string; active?: boolean; }
interface GeoAreaNode { id: string; townId: string; name: string; active: boolean; isFallback: boolean; note: string | null; displayOrder: number; customerCount: number; }
interface GeoTownNode { id: string; name: string; active: boolean; type: string; hotelCount: number; areaCount: number; activeAreaCount: number; locationLabel: string; locationPlaceholder: string; areas: GeoAreaNode[]; }
interface GeoCountyNode { id: string; name: string; type: string; active: boolean; townCount: number; activeTownCount: number; areaCount: number; activeAreaCount: number; towns: GeoTownNode[]; }
interface GeoHierarchyNode { counties: GeoCountyNode[]; summary: { countyCount: number; townCount: number; areaCount: number; hotelCount: number }; }

const T = {
    bg: "#F4F7F5",
    surface: "#FFFFFF",
    border: "#DDE7E1",
    primary: "#123D2E",
    primaryMuted: "#E8F2EC",
    primaryLight: "#C8E2D3",
    text: "#20372D",
    textMuted: "#6B7F74",
    textDim: "#94A39B",
    danger: "#DC2626",
    dangerMuted: "#FEF2F2",
    success: "#15803D",
    successMuted: "#DCFCE7",
    warning: "#A16207",
    warningMuted: "#FFF7D6",
    radius: "12px",
    font: "Inter, system-ui, -apple-system, sans-serif",
};

function s(num: number) { return `${num * 4}px`; }

function formatAuditEventName(value: unknown) {
    const eventName = typeof value === "string" && value.trim() ? value : "Platform event";
    return eventName.replaceAll("_", " ").toLowerCase();
}

function formatAuditDate(value: unknown) {
    const date = value ? new Date(String(value)) : null;
    return date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "Recently";
}

export const PlatformAdminPage: React.FC<{
    onBack: () => void;
    routeView?: PlatformView;
    routeHotelId?: string;
    onNavigate?: (view: PlatformView, hotelId?: string) => void;
}> = ({ onBack, routeView, routeHotelId, onNavigate }) => {
    const { token, user, login: authLogin, logout: authLogout } = usePlatformAdminAuth();
    const [view, setView] = useState<PlatformView>(() => {
        if (routeView) return routeView;
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
    const [deliveryAreas, setDeliveryAreas] = useState<DeliveryArea[]>([]);
    const [megaRegions, setMegaRegions] = useState<MegaRegion[]>([]);
    const [geoAlerts, setGeoAlerts] = useState<{ townsMissingActiveArea: { id: string; name: string; county: string }[]; hotelsInInactiveTowns: { id: string; name: string; count: number }[]; inactiveAreasWithCustomers: { id: string; name: string; townId: string; townName: string; count: number }[] }>({ townsMissingActiveArea: [], hotelsInInactiveTowns: [], inactiveAreasWithCustomers: [] });
    const [focusTownId, setFocusTownId] = useState<string | null>(null);
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

    const navigateTo = useCallback((nextView: PlatformView, hotelId?: string) => {
        if (onNavigate) onNavigate(nextView, hotelId);
        else setView(nextView);
    }, [onNavigate]);

    useEffect(() => {
        if (routeView && routeView !== view) setView(routeView);
    }, [routeView, view]);

    useEffect(() => {
        if (!routeHotelId) return;
        const hotel = hotels.find((candidate) => candidate.id === routeHotelId);
        if (hotel) setSelectedHotel(hotel);
    }, [hotels, routeHotelId]);

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
        name: "", slug: "", adminUsername: "", adminName: "", adminPhone: "", zoneId: "", townRegionId: "", isOpen: true, autoCloseAt: "",
    });
    const [createResult, setCreateResult] = useState<any>(null);
    const [submitting, setSubmitting] = useState(false);
    const [showRegionForm, setShowRegionForm] = useState(false);
    const [regionSaving, setRegionSaving] = useState(false);
    const [regionForm, setRegionForm] = useState({ name: "", megaRegionId: "", type: "OTHER", locationLabel: "Delivery point", locationPlaceholder: "e.g. building, landmark, stall number" });

    // ── Create Admin ──
    const [adminForm, setAdminForm] = useState({ username: "", name: "", phone: "" });
    const [adminResult, setAdminResult] = useState<any>(null);
    const [adminSubmitting, setAdminSubmitting] = useState(false);

    // ── Confirm modals ──
    const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

    const fetch = useCallback(async () => {
        if (!token || view === "login") { setLoading(false); return; }
        setLoading(true);
        const [dashRes, hotelsRes, adminsRes, auditRes, outboxRes, geoRes, heroRes] = await Promise.all([
            apiGet<PlatformDashboard>("/platform/dashboard", token),
            apiGet<Hotel[]>("/platform/hotels", token),
            apiGet<AdminUser[]>("/platform/admins", token),
            apiGet<any[]>("/platform/audit", token),
            apiGet<any[]>("/platform/outbox", token),
            apiGet<GeoHierarchyNode>("/platform/geography", token),
            apiGet<{ imageUrl: string }>("/platform/hero", token),
        ]);
        const authFailed = [dashRes, hotelsRes, adminsRes, auditRes, outboxRes, geoRes, heroRes].some((res) =>
            !res.success && /invalid|expired|session/i.test(res.error ?? "")
        );
        if (authFailed) {
            authLogout();
            navigateTo("login");
            setLoading(false);
            return;
        }
        if (dashRes.success && dashRes.data) setDashboard(dashRes.data);
        if (hotelsRes.success && hotelsRes.data) setHotels(hotelsRes.data);
        if (adminsRes.success && adminsRes.data) setAdmins(adminsRes.data);
        if (auditRes.success && auditRes.data) setAuditRows(auditRes.data);
        if (outboxRes.success && outboxRes.data) setOutboxRows(outboxRes.data);
        if (geoRes.success && geoRes.data) {
            const counties = geoRes.data.counties;
            const flatTowns = counties.flatMap((c) => c.towns.map((t) => ({
                id: t.id, name: t.name, type: t.type, locationLabel: t.locationLabel, locationPlaceholder: t.locationPlaceholder,
                active: t.active, megaRegionId: c.id, megaRegion: { id: c.id, name: c.name, type: c.type, active: c.active },
            })));
            const flatAreas = counties.flatMap((c) => c.towns.flatMap((t) => t.areas.map((area) => ({ id: area.id, townId: t.id, name: area.name, active: area.active, isFallback: area.isFallback }))));
            const countyOptions = counties.map((c) => ({ id: c.id, name: c.name, type: c.type, active: c.active }));
            setRegions(flatTowns);
            setDeliveryAreas(flatAreas);
            setMegaRegions(countyOptions);
            setHotelForm((form) => {
                const zoneId = form.zoneId || flatTowns[0]?.id || "";
                const currentAreaValid = flatAreas.some((area) => area.id === form.townRegionId && area.townId === zoneId && area.active);
                return { ...form, zoneId, townRegionId: currentAreaValid ? form.townRegionId : flatAreas.find((area) => area.townId === zoneId && area.active)?.id ?? "" };
            });
            setRegionForm((form) => form.megaRegionId ? form : { ...form, megaRegionId: countyOptions[0]?.id ?? "" });
            const townsMissingActiveArea: { id: string; name: string; county: string }[] = [];
            const hotelsInInactiveTowns: { id: string; name: string; count: number }[] = [];
            const inactiveAreasWithCustomers: { id: string; name: string; townId: string; townName: string; count: number }[] = [];
            for (const c of counties) {
                for (const t of c.towns) {
                    if (t.activeAreaCount === 0) townsMissingActiveArea.push({ id: t.id, name: t.name, county: c.name });
                    if (!t.active && t.hotelCount > 0) hotelsInInactiveTowns.push({ id: t.id, name: t.name, count: t.hotelCount });
                    for (const a of t.areas) {
                        if (!a.active && a.customerCount > 0) inactiveAreasWithCustomers.push({ id: a.id, name: a.name, townId: t.id, townName: t.name, count: a.customerCount });
                    }
                }
            }
            setGeoAlerts({ townsMissingActiveArea, hotelsInInactiveTowns, inactiveAreasWithCustomers });
        }
        if (heroRes.success && heroRes.data) setHeroImageUrl(heroRes.data.imageUrl);
        setLoading(false);
    }, [token, view, authLogout, navigateTo]);

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
        if (!token && view !== "login") navigateTo("login");
    }, [token, view, navigateTo]);

    // ── Login ──
    const handleLogin = async () => {
        if (loginSubmitting || !loginForm.username.trim() || !loginForm.password) return;
        setLoginError("");
        setLoginSubmitting(true);
        try {
            const res = await apiPost<{ token: string; user: PlatformMe }>("/platform/login", { ...loginForm, username: loginForm.username.trim(), password: loginForm.password.trim() });
            if (res.success && res.data) {
                authLogin(res.data.token, res.data.user);
                navigateTo("overview");
            } else {
                setLoginError(res.error || "Login failed");
            }
        } finally {
            setLoginSubmitting(false);
        }
    };

    const handleLogout = () => {
        authLogout();
        navigateTo("login");
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
        if (!regionForm.name.trim() || !regionForm.megaRegionId || regionSaving) return;
        setRegionSaving(true);
        const res = await apiPost<{ id: string }>("/platform/towns", { name: regionForm.name.trim(), megaRegionId: regionForm.megaRegionId, locationLabel: regionForm.locationLabel.trim(), locationPlaceholder: regionForm.locationPlaceholder.trim() }, token);
        setRegionSaving(false);
        if (res.success && res.data) {
            setShowRegionForm(false);
            setRegionForm({ name: "", megaRegionId: megaRegions[0]?.id ?? "", type: "OTHER", locationLabel: "Delivery point", locationPlaceholder: "e.g. building, landmark, stall number" });
            setHotelForm((form) => ({ ...form, zoneId: res.data!.id }));
            await fetch();
        } else {
            pushNotification("danger", "Failed to create town", res.error || "Unknown error", { scope: "platform" });
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

    // ── Hide/Show hotel on marketplace (non-destructive — order history, staff, and settings are untouched) ──
    const handleToggleListing = (id: string, currentlyListed: boolean) => {
        const hotel = hotels.find((h) => h.id === id);
        const hotelName = hotel?.name || "This hotel";
        setConfirm({
            title: currentlyListed ? `Hide ${hotelName} from the marketplace?` : `Show ${hotelName} on the marketplace?`,
            message: currentlyListed
                ? `${hotelName} will disappear from customer browsing and search. Existing orders and direct links are unaffected. You can re-list it anytime.`
                : `${hotelName} will become visible to customers browsing the marketplace again.`,
            onConfirm: () => void performToggleListing(id, !currentlyListed),
        });
    };

    const performToggleListing = async (id: string, isListed: boolean) => {
        const res = await apiPatch<Hotel>(`/platform/hotels/${id}/listing`, { isListed }, token);
        if (res.success && res.data) {
            pushNotification("info", "Hotel updated", `${res.data.name} is now ${isListed ? "listed" : "hidden"} on the marketplace`, { scope: "platform" });
            await fetch();
        } else {
            pushNotification("danger", "Error", res.error || "Failed to update listing", { scope: "platform" });
        }
        setConfirm(null);
    };

    // ── Delete Hotel ── soft delete: closes the hotel, hides it, and keeps every
    // order/ledger/review record intact for accounting and dispute history.
    const handleDeleteHotel = (id: string) => {
        const hotel = hotels.find((h) => h.id === id);
        const hotelName = hotel?.name || "This hotel";
        setConfirm({
            title: `Delete ${hotelName}?`,
            message: `${hotelName} will be removed from the marketplace and closed for new orders immediately. This cannot be undone from here — order and financial history is kept, but the hotel itself is gone. Are you sure?`,
            onConfirm: () => void performDeleteHotel(id),
        });
    };

    const performDeleteHotel = async (id: string) => {
        const res = await apiDelete<Hotel>(`/platform/hotels/${id}`, token);
        if (res.success) {
            pushNotification("info", "Hotel deleted", `${res.data?.name || "The hotel"} has been removed`, { scope: "platform" });
            if (view === "hotel_detail") navigateTo("hotels");
            await fetch();
        } else {
            pushNotification("danger", "Error", res.error || "Failed to delete hotel", { scope: "platform" });
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
            case "geography": return <MapPin size={17} />;
            case "admins": return <Users size={17} />;
            case "create_admin": return <UserPlus size={17} />;
            case "audit": return <ClipboardList size={17} />;
            case "outbox": return <Send size={17} />;
            case "communications": return <MessageCircle size={17} />;
            case "profile": return <UserCircle size={17} />;
            case "settings": return <Settings2 size={17} />;
            default: return <Activity size={17} />;
        }
    };

    const navItem = (v: PlatformView, label: string) => (
        <button
            onClick={() => { navigateTo(v); setSidebarOpen(false); }}
            style={{
                background: view === v ? "rgba(255,255,255,0.15)" : "transparent",
                color: view === v ? "#FFFFFF" : "rgba(231,244,237,0.64)",
                border: "none", padding: `${s(2)} ${s(3)}`, borderRadius: "10px",
                fontWeight: view === v ? 700 : 500, fontSize: "0.9rem", cursor: "pointer",
                textAlign: "left", width: "100%", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: s(3),
            }}
        >
            <span style={{ width: "20px", display: "inline-flex", justifyContent: "center", opacity: view === v ? 1 : 0.5 }}>{navIcon(v)}</span>
            {label}
        </button>
    );

    const navGroup = (label: string) => (
        <div style={{ marginTop: s(5), marginBottom: s(1), fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(231,244,237,0.36)", padding: `0 ${s(3)}`, pointerEvents: "none" }}>{label}</div>
    );

    // ── Login View ──
    if (view === "login") {
        return (
            <div className="platform-shell platform-login-shell" style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font, padding: s(4) }}>
                <div className="platform-login-card" style={{ width: "100%", maxWidth: "400px", background: T.surface, borderRadius: "20px", padding: s(8), border: `1px solid ${T.border}` }}>
                    <div style={{ textAlign: "center", marginBottom: s(6) }}>
                        <div className="platform-login-mark"><img src="/ladha_favicon.png" alt="Ladha" /></div>
                        <p className="platform-login-eyebrow">Ladha platform</p>
                        <h1 style={{ fontSize: "1.65rem", fontWeight: 800, color: T.text, margin: 0, letterSpacing: "-0.045em" }}>Welcome back</h1>
                        <p style={{ fontSize: "0.85rem", color: T.textMuted, marginTop: s(2) }}>Sign in to your platform command center.</p>
                    </div>
                    {loginError && <div style={{ background: T.dangerMuted, color: T.danger, padding: s(3), borderRadius: T.radius, fontSize: "0.85rem", marginBottom: s(4), fontWeight: 600 }}>{loginError}</div>}
                    <div style={{ display: "flex", flexDirection: "column", gap: s(4) }}>
                        <input placeholder="Username" value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                            className="input-field px-4" style={{ fontFamily: T.font }} autoComplete="username" />
                        <input type="password" placeholder="Password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                            className="input-field px-4" style={{ fontFamily: T.font }} autoComplete="current-password" onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
                        <button className="platform-login-submit" onClick={handleLogin} disabled={loginSubmitting || !loginForm.username.trim() || !loginForm.password}
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
    const hotelGroups = Array.from(filteredHotels.reduce((groups, hotel) => {
        const megaRegion = hotel.zone?.megaRegion?.name ?? "Town not assigned";
        const town = hotel.zone?.name ?? "Town not assigned";
        const key = `${megaRegion}::${town}`;
        const group = groups.get(key) ?? { megaRegion, town, hotels: [] as Hotel[] };
        group.hotels.push(hotel);
        groups.set(key, group);
        return groups;
    }, new Map<string, { megaRegion: string; town: string; hotels: Hotel[] }>()).values());
    const geographyIssueCount = geoAlerts.townsMissingActiveArea.length + geoAlerts.hotelsInInactiveTowns.length + geoAlerts.inactiveAreasWithCustomers.length;
    const attentionCount = (dashboard?.failedOutboxCount ?? 0) + geographyIssueCount;
    const hotelsNeedingAttention = hotels.filter((hotel) => !hotel.isOpen || hotel.isListed === false).slice(0, 4);
    const recentActivity = auditRows.slice(0, 4);

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
                width: sidebarWidth, background: "#123D2E",
                display: "flex", flexDirection: "column",
                position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50,
                padding: `${s(5)} ${s(4)}`, gap: s(1),
                overflowY: "auto", WebkitOverflowScrolling: "touch",
                transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: sidebarOpen ? "8px 0 30px rgba(8,36,26,0.22)" : "none",
            }}
                className="platform-sidebar"
            >
                {/* Sidebar header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: s(7) }}>
                    <div style={{ display: "flex", alignItems: "center", gap: s(3) }}>
                        <div className="platform-sidebar-mark"><img src="/ladha_favicon.png" alt="Ladha" /></div>
                        <div>
                            <div style={{ fontWeight: 750, color: "#FFFFFF", fontSize: "0.92rem", lineHeight: 1.3 }}>Ladha</div>
                            <div style={{ fontSize: "0.68rem", color: "rgba(231,244,237,0.55)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Platform console</div>
                        </div>
                    </div>
                    <button onClick={() => setSidebarOpen(false)}
                        style={{
                            background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.75)", cursor: "pointer",
                            width: "28px", height: "28px", borderRadius: "6px", display: "flex",
                            alignItems: "center", justifyContent: "center", fontSize: "1.1rem",
                            transition: "background 0.15s",
                        }}
                        aria-label="Close menu"
                    >
                        <X size={17} />
                    </button>
                </div>

                {navItem("overview", "Command center")}
                {navGroup("Operations")}
                {navItem("hotels", "Hotels")}
                {navItem("create_hotel", "Add Hotel")}
                {navItem("geography", "Geography")}
                {navGroup("Communications")}
                {navItem("communications", "Communications")}
                {navGroup("Governance")}
                {navItem("outbox", "Delivery health")}
                {navItem("audit", "Audit log")}
                {navItem("admins", "Platform admins")}
                {navGroup("Settings")}
                {navItem("settings", "Marketplace appearance")}
                {navGroup("Account")}
                {navItem("profile", "My Profile")}

                <div style={{ marginTop: "auto", padding: `${s(3)} ${s(2)} 0`, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                    {user && <div style={{ fontSize: "0.78rem", color: "#F4FBF6", marginBottom: s(1), fontWeight: 650 }}>{user.name} <span style={{ fontSize: "0.66rem", color: "rgba(231,244,237,0.5)", fontWeight: 700 }}>· {user.role?.replace("PLATFORM_", "").toLowerCase()}</span></div>}
                    <button onClick={handleLogout} style={{ background: "none", border: "none", color: "rgba(231,244,237,0.55)", fontSize: "0.78rem", cursor: "pointer", padding: 0, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: s(2) }}><LogOut size={14} /> Sign out</button>
                </div>
            </nav>

            {/* Main content */}
            <main style={{ flex: 1, height: "100dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", padding: s(8), maxWidth: "960px", marginLeft: "auto", marginRight: "auto" }}
                className="platform-main">
                {loading ? (
                    <div className="platform-loading" style={{ color: T.textDim }}>Loading your command center…</div>
                ) : view === "overview" ? (
                    <section className="command-center">
                        <header className="command-header">
                            <div>
                                <div className="command-eyebrow"><span /> Platform operations</div>
                                <h1>Command center</h1>
                                <p>Good to see you, {user?.name?.split(" ")[0] || "there"}. Here’s how Ladha is running right now.</p>
                            </div>
                            <div className="command-actions"><button className="command-secondary" onClick={() => void fetch()}><RefreshCw size={15} /> Refresh</button><button className="command-primary" onClick={() => navigateTo("create_hotel")}><Plus size={16} /> Add hotel</button></div>
                        </header>

                        <div className="command-pulse">
                            <div className="pulse-copy"><div className="pulse-label"><span /> Platform health</div><strong>{attentionCount === 0 ? "Everything is running smoothly" : `${attentionCount} item${attentionCount === 1 ? "" : "s"} need attention`}</strong><p>{dashboard?.activeHotelCount ?? 0} of {dashboard?.hotelCount ?? 0} hotels are currently accepting orders.</p></div>
                            <div className="pulse-actions"><div className="pulse-ring"><ShieldCheck size={24} /><span>{attentionCount === 0 ? "Healthy" : "Review"}</span></div><button onClick={() => navigateTo(attentionCount ? (dashboard?.failedOutboxCount ? "outbox" : "geography") : "hotels")}>{attentionCount ? "Review now" : "View hotels"} <ArrowUpRight size={15} /></button></div>
                        </div>

                        {dashboard && <div className="command-metrics">
                            <div className="metric-card metric-primary"><span>Platform orders</span><strong>{dashboard.totalOrders.toLocaleString()}</strong><small>All time</small></div>
                            <div className="metric-card"><span>Active hotels</span><strong>{dashboard.activeHotelCount}</strong><small>of {dashboard.hotelCount} onboarded</small></div>
                            <div className="metric-card"><span>Platform admins</span><strong>{dashboard.platformAdminCount}</strong><small>Access-controlled</small></div>
                            <div className={`metric-card ${attentionCount ? "metric-alert" : ""}`}><span>Open issues</span><strong>{attentionCount}</strong><small>{attentionCount ? "Needs review" : "No action needed"}</small></div>
                        </div>}

                        <div className="command-grid">
                            <section className="command-panel attention-panel"><div className="panel-heading"><div><span className="panel-kicker">Priority queue</span><h2>Needs attention</h2></div><span className={attentionCount ? "count-badge warning" : "count-badge"}>{attentionCount}</span></div>
                                {dashboard?.failedOutboxCount ? <button className="attention-row danger" onClick={() => navigateTo("outbox")}><span className="attention-icon">!</span><span><strong>Message delivery failures</strong><small>{dashboard.failedOutboxCount} outbox event{dashboard.failedOutboxCount === 1 ? "" : "s"} failed to send</small></span><ChevronRight size={17} /></button> : null}
                                {geoAlerts.townsMissingActiveArea.slice(0, 2).map((town) => <button key={town.id} className="attention-row" onClick={() => { setFocusTownId(town.id); navigateTo("geography"); }}><span className="attention-icon">⌖</span><span><strong>Coverage gap in {town.name}</strong><small>No active local delivery area</small></span><ChevronRight size={17} /></button>)}
                                {geoAlerts.hotelsInInactiveTowns.slice(0, 2).map((town) => <button key={town.id} className="attention-row" onClick={() => { setFocusTownId(town.id); navigateTo("geography"); }}><span className="attention-icon">⌖</span><span><strong>Inactive town: {town.name}</strong><small>{town.count} hotel{town.count === 1 ? "" : "s"} affected</small></span><ChevronRight size={17} /></button>)}
                                {attentionCount === 0 && <div className="empty-state"><ShieldCheck size={22} /><span><strong>All clear</strong><small>There are no delivery, geography, or messaging issues.</small></span></div>}
                            </section>
                            <section className="command-panel"><div className="panel-heading"><div><span className="panel-kicker">Network</span><h2>Hotel status</h2></div><button className="text-action" onClick={() => navigateTo("hotels")}>See all <ArrowUpRight size={14} /></button></div>
                                {(hotelsNeedingAttention.length ? hotelsNeedingAttention : hotels.slice(0, 4)).map((hotel) => <button className="hotel-row" key={hotel.id} onClick={() => { setSelectedHotel(hotel); navigateTo("hotel_detail", hotel.id); }}><span className={`hotel-avatar ${hotel.isOpen ? "" : "offline"}`}>{hotel.name.slice(0, 1)}</span><span><strong>{hotel.name}</strong><small>{hotel.zone?.name ?? "Location pending"}</small></span><span className={`status-pill ${hotel.isOpen ? "open" : "closed"}`}>{hotel.isOpen ? "Open" : "Closed"}</span><ChevronRight size={16} /></button>)}
                                {hotels.length === 0 && <div className="empty-state"><Building2 size={22} /><span><strong>No hotels yet</strong><small>Start building your marketplace by adding the first hotel.</small></span></div>}
                            </section>
                        </div>

                        <section className="command-panel activity-panel"><div className="panel-heading"><div><span className="panel-kicker">Governance</span><h2>Recent platform activity</h2></div><button className="text-action" onClick={() => navigateTo("audit")}>Audit log <ArrowUpRight size={14} /></button></div>
                            {recentActivity.length ? recentActivity.map((event: any, index: number) => <div className="activity-row" key={event?.id ?? `activity-${index}`}><span className="activity-dot" /><span><strong>{formatAuditEventName(event?.eventName)}</strong><small>{event?.payload?.hotelName || event?.payload?.adminName || event?.payload?.createdBy || "Platform event"}</small></span><time>{formatAuditDate(event?.createdAt)}</time></div>) : <div className="empty-state"><Activity size={22} /><span><strong>No recent activity</strong><small>Important platform changes will appear here.</small></span></div>}
                        </section>
                    </section>
                ) : view === "hotels" ? (
                    <section className="platform-workspace">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: s(6) }}>
                            <h1 className="platform-page-title" style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, margin: 0 }}>Hotels</h1>
                            <button className="platform-action primary" onClick={() => navigateTo("create_hotel")} style={{ background: T.primary, color: "white", border: "none", padding: `${s(2)} ${s(5)}`, borderRadius: T.radius, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>＋ Add Hotel</button>
                        </div>
                        <input placeholder="Search by name or slug…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                            style={{ width: "100%", padding: s(3), border: `1px solid ${T.border}`, borderRadius: T.radius, fontSize: "0.9rem", marginBottom: s(4), fontFamily: T.font, outline: "none", boxSizing: "border-box" }} />
                        {filteredHotels.length === 0 ? (
                            <div style={{ textAlign: "center", padding: s(10), color: T.textMuted, fontSize: "0.9rem" }}>No hotels found.</div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: s(5) }}>
                                {hotelGroups.map((group) => <section key={`${group.megaRegion}-${group.town}`}>
                                    <div style={{ marginBottom: s(2), color: T.textMuted, fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>{group.megaRegion} · {group.town}</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: s(3) }}>
                                {group.hotels.map((h) => (
                                    <button key={h.id} onClick={() => { setSelectedHotel(h); navigateTo("hotel_detail", h.id); }}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedHotel(h); navigateTo("hotel_detail", h.id); } }}
                                        style={{ background: T.surface, borderRadius: "12px", border: `1px solid ${T.border}`, borderLeft: `4px solid ${h.isOpen ? T.primary : T.textDim}`, padding: `${s(4)} ${s(5)}`, cursor: "pointer", transition: "box-shadow 0.15s" }}
                                        onMouseEnter={(e) => e.currentTarget.style.boxShadow = `0 2px 8px rgba(0,0,0,0.06)`}
                                        onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <div>
                                                <div style={{ fontWeight: 700, color: T.text }}>{h.name}</div>
                                                <div style={{ fontSize: "0.8rem", color: T.textMuted, marginTop: s(1) }}>
                                                    {h.slug} · {h.isOpen ? "Open" : "Closed"} · Onboarded {new Date(h.createdAt).toLocaleDateString()}
                                                    {h.isListed === false && <span style={{ color: T.warning, fontWeight: 700 }}> · Hidden from marketplace</span>}
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
                                ))}</div></section>)}
                            </div>
                        )}
                    </section>
                ) : view === "hotel_detail" && selectedHotel ? (
                    <HotelDetail hotelId={selectedHotel.id} onBack={() => navigateTo("hotels")} onToggle={handleToggleHotel} onToggleListing={handleToggleListing} onDelete={handleDeleteHotel} token={token} regions={regions} deliveryAreas={deliveryAreas} />
                ) : view === "geography" ? (
                    <GeographyWorkspace token={token} user={{ id: user?.id ?? "", username: user?.username ?? "", name: user?.name ?? "", role: user?.role ?? "" }} focusTownId={focusTownId} onOpenHotel={(id) => { const h = hotels.find((x) => x.id === id); if (h) { setSelectedHotel(h); navigateTo("hotel_detail", h.id); } }} />
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
                            <button onClick={() => { const zoneId = regions[0]?.id ?? ""; setCreateResult(null); setHotelForm({ name: "", slug: "", adminUsername: "", adminName: "", adminPhone: "", zoneId, townRegionId: deliveryAreas.find((area) => area.townId === zoneId && area.active)?.id ?? "", isOpen: true, autoCloseAt: "" }); navigateTo("hotels"); }}
                                style={{ background: T.primary, color: "white", border: "none", padding: `${s(3)} ${s(6)}`, borderRadius: T.radius, fontWeight: 700, cursor: "pointer", marginTop: s(4) }}>Done</button>
                        </div>
                    ) : (
                        <section className="platform-workspace platform-form-workspace">
                            <h1 className="platform-page-title" style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, marginBottom: s(6) }}>Add Hotel</h1>
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
                                            <label htmlFor="hotelRegion" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T.textMuted, marginBottom: s(1) }}>Town</label>
                                            <select id="hotelRegion" value={hotelForm.zoneId} onChange={(e) => { const zoneId = e.target.value; setHotelForm({ ...hotelForm, zoneId, townRegionId: deliveryAreas.find((area) => area.townId === zoneId && area.active)?.id ?? "" }); }} className="input-field" style={{ fontFamily: T.font }}>
                                                <option value="">Select a town</option>
                                                {regions.map((region) => <option key={region.id} value={region.id}>{region.name}{region.megaRegion ? ` · ${region.megaRegion.name}` : ""}</option>)}
                                            </select>
                                            {regions.length === 0 && <p style={{ color: T.warning, fontSize: "0.75rem", marginTop: s(1) }}>Create a county/city and town before onboarding a hotel.</p>}
                                            <label htmlFor="hotelDeliveryArea" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T.textMuted, margin: `${s(3)} 0 ${s(1)}` }}>Delivery area <span style={{ color: T.danger }}>*</span></label>
                                            <select id="hotelDeliveryArea" value={hotelForm.townRegionId} onChange={(e) => setHotelForm({ ...hotelForm, townRegionId: e.target.value })} className="input-field" style={{ fontFamily: T.font }} disabled={!hotelForm.zoneId}>
                                                <option value="">Select the hotel’s delivery area</option>
                                                {deliveryAreas.filter((area) => area.townId === hotelForm.zoneId && area.active).map((area) => <option key={area.id} value={area.id}>{area.name}{area.isFallback ? " · General area" : ""}</option>)}
                                            </select>
                                            {!deliveryAreas.some((area) => area.townId === hotelForm.zoneId && area.active) && hotelForm.zoneId && <p style={{ color: T.warning, fontSize: "0.75rem", marginTop: s(1) }}>This town has no active delivery area. Add one in Geography before onboarding a hotel.</p>}
                                            <button type="button" onClick={() => setShowRegionForm((open) => !open)} style={{ marginTop: s(2), background: "transparent", border: "none", color: T.primary, fontWeight: 700, cursor: "pointer", padding: 0 }}>{showRegionForm ? "Cancel new region" : "+ Add a new region"}</button>
                                            {showRegionForm && <div style={{ marginTop: s(2), padding: s(3), border: `1px solid ${T.border}`, borderRadius: T.radius, display: "flex", flexDirection: "column", gap: s(2) }}>
                                                <input value={regionForm.name} onChange={(e) => setRegionForm({ ...regionForm, name: e.target.value })} className="input-field" style={{ fontFamily: T.font }} placeholder="Town name e.g. Naivasha Town" />
                                                <select value={regionForm.megaRegionId} onChange={(e) => setRegionForm({ ...regionForm, megaRegionId: e.target.value })} className="input-field" style={{ fontFamily: T.font }}><option value="">Select county or city</option>{megaRegions.filter((region) => region.active !== false).map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select>
                                                <input value={regionForm.locationLabel} onChange={(e) => setRegionForm({ ...regionForm, locationLabel: e.target.value })} className="input-field" style={{ fontFamily: T.font }} placeholder="Customer location label" />
                                                <input value={regionForm.locationPlaceholder} onChange={(e) => setRegionForm({ ...regionForm, locationPlaceholder: e.target.value })} className="input-field" style={{ fontFamily: T.font }} placeholder="Customer location example" />
                                                <button type="button" onClick={() => void handleCreateRegion()} disabled={regionSaving || !regionForm.name.trim() || !regionForm.megaRegionId} style={{ background: T.primary, color: "white", border: "none", padding: s(2), borderRadius: T.radius, fontWeight: 700, cursor: "pointer", opacity: regionSaving || !regionForm.name.trim() || !regionForm.megaRegionId ? 0.6 : 1 }}>{regionSaving ? "Saving…" : "Save town"}</button>
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
                                <button className="platform-action primary form-submit" onClick={handleCreateHotel} disabled={submitting || !hotelForm.name || !hotelForm.slug || !hotelForm.zoneId || !hotelForm.townRegionId || !hotelForm.adminUsername || !hotelForm.adminName || !hotelForm.adminPhone}
                                    style={{ background: T.primary, color: "white", border: "none", padding: s(4), borderRadius: T.radius, fontWeight: 700, fontSize: "0.95rem", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting || !hotelForm.name || !hotelForm.slug || !hotelForm.zoneId || !hotelForm.townRegionId || !hotelForm.adminUsername || !hotelForm.adminName || !hotelForm.adminPhone ? 0.6 : 1, alignSelf: "flex-start", minWidth: "200px" }}>
                                    {submitting ? "Creating…" : "Create Hotel & Seed Admin"}
                                </button>
                            </div>
                        </section>
                    )
                ) : view === "admins" ? (
                    <section className="platform-workspace">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: s(6) }}>
                            <h1 className="platform-page-title" style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, margin: 0 }}>Platform Admins</h1>
                            <button className="platform-action primary" onClick={() => navigateTo("create_admin")} style={{ background: T.primary, color: "white", border: "none", padding: `${s(2)} ${s(5)}`, borderRadius: T.radius, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>＋ Add Admin</button>
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
                                            className="platform-action danger compact" style={{ background: "none", border: `1px solid #FCA5A5`, color: T.danger, padding: `${s(1)} ${s(3)}`, borderRadius: T.radius, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}>
                                            Remove
                                        </button>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
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
                            <button onClick={() => { setAdminResult(null); setAdminForm({ username: "", name: "", phone: "" }); navigateTo("admins"); }}
                                style={{ background: T.primary, color: "white", border: "none", padding: `${s(3)} ${s(6)}`, borderRadius: T.radius, fontWeight: 700, cursor: "pointer", marginTop: s(4) }}>Done</button>
                        </div>
                    ) : (
                        <section className="platform-workspace platform-form-workspace">
                            <h1 className="platform-page-title" style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, marginBottom: s(2) }}>Add Platform Admin</h1>
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
                                <button className="platform-action primary form-submit" onClick={handleCreateAdmin} disabled={adminSubmitting || !adminForm.name || !adminForm.username || !adminForm.phone}
                                    style={{ background: T.primary, color: "white", border: "none", padding: s(4), borderRadius: T.radius, fontWeight: 700, fontSize: "0.95rem", cursor: adminSubmitting ? "not-allowed" : "pointer", opacity: adminSubmitting || !adminForm.name || !adminForm.username || !adminForm.phone ? 0.6 : 1, alignSelf: "flex-start", minWidth: "180px" }}>
                                    {adminSubmitting ? "Creating…" : "Create Platform Admin"}
                                </button>
                            </div>
                        </section>
                    )
                ) : view === "audit" ? (
                    <section className="platform-workspace">
                        <h1 className="platform-page-title" style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, marginBottom: s(6) }}>Audit Log</h1>
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
                    </section>
                ) : view === "profile" ? (
                    <div style={{ maxWidth: "640px" }}>
                        <h1 className="platform-page-title" style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, marginBottom: s(2) }}>My Profile</h1>
                        <p style={{ color: T.textMuted, fontSize: "0.9rem", marginBottom: s(6) }}>Manage your platform administrator identity and password.</p>
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: s(5), display: "flex", flexDirection: "column", gap: s(3) }}>
                            <input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="Display name" className="input-field" />
                            <input value={profileForm.username} onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })} placeholder="Username" className="input-field" />
                            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: s(3), display: "grid", gap: s(3) }}><input type="password" value={profileForm.currentPassword} onChange={(e) => setProfileForm({ ...profileForm, currentPassword: e.target.value })} placeholder="Current password" className="input-field" /><input type="password" value={profileForm.newPassword} onChange={(e) => setProfileForm({ ...profileForm, newPassword: e.target.value })} placeholder="New password (optional)" className="input-field" /><input type="password" value={profileForm.confirmPassword} onChange={(e) => setProfileForm({ ...profileForm, confirmPassword: e.target.value })} placeholder="Confirm new password" className="input-field" /></div>
                            <button className="platform-action primary form-submit" onClick={() => void handleSaveProfile()} disabled={profileSaving || !profileForm.name.trim() || !profileForm.username.trim()} style={{ background: T.primary, color: "white", border: "none", padding: s(3), borderRadius: T.radius, fontWeight: 700, cursor: profileSaving ? "wait" : "pointer", opacity: profileSaving ? 0.65 : 1 }}>{profileSaving ? "Saving…" : "Save Profile"}</button>
                        </div>
                    </div>
                ) : view === "settings" ? (
                    <div style={{ maxWidth: "720px" }}>
                        <div className="settings-page-heading"><span className="panel-kicker">Marketplace settings</span><h1>Marketplace appearance</h1><p>Manage the visual details customers see when they discover Ladha.</p></div>
                        <section className="command-panel settings-card">
                            <div className="panel-heading"><div><h2>Homepage hero image</h2><p>Use a calm, well-lit food or local-kitchen image. Leave this blank to use the discovery fallback.</p></div><div className="settings-icon"><Settings2 size={18} /></div></div>
                            <label className="field-label" htmlFor="platformHeroImage">Image URL</label>
                            <input id="platformHeroImage" aria-label="Homepage hero image URL" value={heroImageUrl} onChange={(e) => setHeroImageUrl(e.target.value)} placeholder="https://…" style={{ width: "100%", boxSizing: "border-box", padding: s(3), fontFamily: T.font }} />
                            <div className="settings-actions"><button type="button" className="command-primary" onClick={() => void saveHeroImage()} disabled={heroSaving}>{heroSaving ? "Saving…" : "Save changes"}</button></div>
                        </section>
                    </div>
                ) : view === "communications" ? (
                    <InboxPage token={token} actorId={user?.id} mode="global" title="Communications" onBack={() => navigateTo("overview")} />
                ) : view === "outbox" ? (
                    <section className="platform-workspace">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: s(6) }}>
                            <h1 className="platform-page-title" style={{ fontSize: "1.5rem", fontWeight: 700, color: T.text, margin: 0 }}>Delivery Health</h1>
                            <button className="platform-action secondary" onClick={fetch} style={{ background: "none", border: `1px solid ${T.border}`, padding: `${s(1)} ${s(4)}`, borderRadius: T.radius, fontSize: "0.85rem", cursor: "pointer", color: T.textMuted }}>Refresh</button>
                        </div>
                        {outboxRows.length === 0 ? (
                            <div style={{ textAlign: "center", padding: s(10), color: T.textMuted }}>No outbox events.</div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: s(2) }}>
                                {outboxRows.map((r: any) => (
                                    <div key={r.id} style={{ background: r.status === "failed" ? T.dangerMuted : T.surface, borderRadius: T.radius, border: `1px solid ${r.status === "failed" ? "#FECACA" : T.border}`, padding: s(3), fontSize: "0.85rem" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <span style={{ fontWeight: 700, color: T.text }}>{r.eventName}</span>
                                            <span style={{ color: r.status === "failed" ? T.danger : T.textMuted, fontWeight: 600, fontSize: "0.8rem" }}>{r.status === "delivered" ? "delivered" : r.status === "awaiting_delivery" ? "awaiting delivery report" : `${r.status} (attempts: ${r.attempts})`}</span>
                                        </div>
                                        <div style={{ color: T.textMuted, marginTop: s(1) }}>{new Date(r.createdAt).toLocaleString()}</div>
                                        {r.providerStatus && <div style={{ color: r.status === "failed" ? T.danger : T.textMuted, marginTop: s(1) }}>Provider: {r.providerStatus}{r.providerMessageId ? ` · message ID ${r.providerMessageId}` : ""}</div>}
                                        {r.status === "pending" && r.nextAttemptAt && <div style={{ color: T.textMuted, marginTop: s(1) }}>Next retry: {new Date(r.nextAttemptAt).toLocaleString()}</div>}
                                        {r.lastError && <div style={{ color: T.danger, marginTop: s(1) }}>Error: {r.lastError}</div>}
                                        {r.status === "failed" && (
                                            <button className="platform-action danger compact" onClick={() => handleRetryOutbox(r.id)} style={{ marginTop: s(2), background: T.surface, color: T.danger, border: `1px solid #FECACA`, padding: `${s(1)} ${s(3)}`, borderRadius: T.radius, fontWeight: 700, fontSize: "0.8rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: s(1) }}>
                                                <RefreshCw size={13} /> Retry delivery
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
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

// ── Hotel Detail sub-view ──
function HotelDetail({ hotelId, onBack, onToggle, onToggleListing, onDelete, token: tok, regions: townOptions, deliveryAreas }: { hotelId: string; onBack: () => void; onToggle: (id: string, action: "open" | "close") => void; onToggleListing: (id: string, currentlyListed: boolean) => void; onDelete: (id: string) => void; token: string; regions: { id: string; name: string }[]; deliveryAreas: DeliveryArea[] }) {
    const [hotel, setHotel] = useState<Hotel | null>(null);
    const [detailLoading, setDetailLoading] = useState(true);
    const [zoneId, setZoneId] = useState("");
    const [townRegionId, setTownRegionId] = useState("");
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
                setTownRegionId(res.data.townRegion?.id ?? "");
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
        const res = await apiPatch<Hotel>(`/platform/hotels/${hotel.id}`, { zoneId, townRegionId }, tok);
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
        <section className="platform-workspace hotel-detail-workspace">
            <button className="platform-back-link" onClick={onBack} style={{ background: "none", border: "none", color: T2.primary, fontSize: "0.9rem", cursor: "pointer", padding: 0, marginBottom: s(4), fontWeight: 600 }}>← Back to Hotels</button>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: s(6) }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: T2.text, margin: 0 }}>{hotel.name}</h1>
                    <div style={{ fontSize: "0.85rem", color: T2.textMuted, marginTop: s(1) }}>
                        {hotel.slug} · {hotel.isOpen ? "Open" : "Closed"} · {hotel.isListed === false ? "Hidden from marketplace" : "Listed"}
                        {hotel._count && ` · ${hotel._count.orders} orders`}
                        · Onboarded {new Date(hotel.createdAt).toLocaleDateString()}
                    </div>
                </div>
                <div style={{ display: "flex", gap: s(2), flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button className={`platform-action ${hotel.isOpen ? "danger" : "primary"}`} onClick={() => onToggle(hotel.id, hotel.isOpen ? "close" : "open")}
                        style={{ background: hotel.isOpen ? T2.dangerMuted : T2.successMuted, color: hotel.isOpen ? T2.danger : T2.success, border: `1px solid ${hotel.isOpen ? "#FECACA" : "#A7F3D0"}`, padding: `${s(2)} ${s(4)}`, borderRadius: T2.radius, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>
                        {hotel.isOpen ? "Suspend" : "Activate"}
                    </button>
                    <button className="platform-action secondary" onClick={() => onToggleListing(hotel.id, hotel.isListed !== false)}
                        style={{ background: T2.surface, color: T2.text, border: `1px solid ${T2.border}`, padding: `${s(2)} ${s(4)}`, borderRadius: T2.radius, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>
                        {hotel.isListed === false ? "Show on marketplace" : "Hide from marketplace"}
                    </button>
                    <button className="platform-action danger" onClick={() => onDelete(hotel.id)}
                        style={{ background: T2.dangerMuted, color: T2.danger, border: `1px solid #FECACA`, padding: `${s(2)} ${s(4)}`, borderRadius: T2.radius, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>
                        Delete Hotel
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
                        <button className="platform-action primary" type="button" onClick={() => void saveDetails()} disabled={editSaving || !editForm.name.trim()}
                            style={{ background: T2.primary, color: "white", border: "none", borderRadius: T2.radius, padding: `${s(2)} ${s(4)}`, fontWeight: 700, fontSize: "0.85rem", cursor: editSaving ? "wait" : "pointer", opacity: editSaving || !editForm.name.trim() ? 0.6 : 1 }}>
                            {editSaving ? "Saving…" : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: s(6), padding: s(4), background: T2.surface, border: `1px solid ${T2.border}`, borderRadius: T2.radius, maxWidth: "520px" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: T2.text, marginBottom: s(2) }}>Hotel location</h3>
                <p style={{ color: T2.textMuted, fontSize: "0.8rem", marginBottom: s(2) }}>A hotel must have one home delivery area. Relocating it updates both its town and its exact delivery-area branch.</p>
                <div style={{ display: "grid", gap: s(2) }}>
                    <select value={zoneId} onChange={(event) => { const nextZoneId = event.target.value; setZoneId(nextZoneId); setTownRegionId(deliveryAreas.find((area) => area.townId === nextZoneId && area.active)?.id ?? ""); }} className="input-field" style={{ fontFamily: T2.font, width: "100%" }}>
                        <option value="">Select target town</option>
                        {townOptions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
                    </select>
                    <select value={townRegionId} onChange={(event) => setTownRegionId(event.target.value)} className="input-field" style={{ fontFamily: T2.font, width: "100%" }} disabled={!zoneId}>
                        <option value="">Select target delivery area</option>
                        {deliveryAreas.filter((area) => area.townId === zoneId && area.active).map((area) => <option key={area.id} value={area.id}>{area.name}{area.isFallback ? " · General area" : ""}</option>)}
                    </select>
                    <button className="platform-action primary" type="button" onClick={() => void saveRegion()} disabled={zoneSaving || !zoneId || !townRegionId || (zoneId === hotel.zone?.id && townRegionId === hotel.townRegion?.id)} style={{ background: T2.primary, color: "white", border: "none", borderRadius: T2.radius, padding: `${s(2)} ${s(4)}`, fontWeight: 700, opacity: zoneSaving || !zoneId || !townRegionId || (zoneId === hotel.zone?.id && townRegionId === hotel.townRegion?.id) ? 0.6 : 1, cursor: zoneSaving || !zoneId || !townRegionId ? "not-allowed" : "pointer" }}>{zoneSaving ? "Relocating…" : "Save location"}</button>
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
        </section>
    );
}
