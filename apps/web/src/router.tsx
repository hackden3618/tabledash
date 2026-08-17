/**
 * Purpose: React Router (data router) for Ladha. Replaces the previous flat
 *   ViewState switch in App.tsx with real URLs, native back/forward support,
 *   deep-linkable pages, refresh-safe flows, and layout-level auth guards.
 * Responsibilities:
 *   - Defines the full route tree (customer, kitchen, platform).
 *   - AppContent (root layout) wires the realtime WebSocket + notification scope
 *     and holds cross-route flow state (placed order, return-to-checkout).
 *   - Thin wrapper components adapt the legacy page props (callbacks + tokens)
 *     to `useNavigate`/`useParams`, and fetch-by-ID on deep-link / refresh.
 * When to modify: When adding pages, routes, or changing top-level flows.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createBrowserRouter, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useCustomerAuth } from "./context/CustomerAuthContext";
import { useAdminAuth } from "./context/AdminAuthContext";
import { usePlatformAdminAuth } from "./context/PlatformAdminAuthContext";
import { useNotifications } from "./context/NotificationsContext";
import { NotificationToastContainer } from "./components/NotificationToast";
import { BottomNav, type CustomerTab } from "./components/ui/BottomNav";
import { AdminBottomNavBar, type AdminTab } from "./components/AdminBottomNavBar";
import { apiGet } from "./lib/api";
import { decodeJwt } from "./lib/jwt";
import { useWebSocket, type WsEventPayload } from "./lib/websocket";
import { useManifestSwitcher } from "./pwa/manifestSwitcher";
import { registerServiceWorker } from "./pwa/push";
import { InstallBanner } from "./components/InstallBanner";
import { PersistentNotificationCard } from "./components/PersistentNotificationCard";
import { Modal } from "./components/ui/Modal";

import { CartPage } from "./pages/customer/CartPage";
import { ConfirmationPage } from "./pages/customer/ConfirmationPage";
import { CustomerAuthPage } from "./pages/customer/CustomerAuthPage";
import { LocationPage } from "./pages/customer/LocationPage";
import { MenuListPage } from "./pages/customer/MenuListPage";
import { MyOrdersPage } from "./pages/customer/MyOrdersPage";
import { OrderTrackingPage } from "./pages/customer/OrderTrackingPage";
import { SearchPage } from "./pages/customer/SearchPage";
import { TrackingListPage } from "./pages/customer/TrackingListPage";
import { CustomerProfilePage } from "./pages/customer/CustomerProfilePage";
import { InboxPage } from "./pages/InboxPage";
import { WalletPage } from "./pages/customer/WalletPage";
import { WalletHotelDetailPage } from "./pages/customer/WalletHotelDetailPage";
import { WalletActivityPage } from "./pages/customer/WalletActivityPage";

import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminOrderDetailsPage } from "./pages/admin/AdminOrderDetailsPage";
import { AdminMenuManagePage } from "./pages/admin/AdminMenuManagePage";
import { AdminOrderHistoryPage } from "./pages/admin/AdminOrderHistoryPage";
import { AdminOrdersPage } from "./pages/admin/AdminOrdersPage";
import { AdminSettingsPage } from "./pages/admin/AdminSettingsPage";
import { FinanceDashboardPage } from "./pages/admin/FinanceDashboardPage";
import { PendingCollectionPage } from "./pages/admin/PendingCollectionPage";
import { PlatformAdminPage } from "./pages/platform/PlatformAdminPage";
import { SetPasswordPage } from "./pages/SetPasswordPage";

/* ─────────────────────────────────────────────────────────────────────────────
 * Cross-route flow state (kept intentionally small — everything else lives in
 * the URL or in the auth/cart contexts).
 * ───────────────────────────────────────────────────────────────────────────── */

interface AppFlowState {
    placedOrder: any;
    setPlacedOrder: (order: any) => void;
    returnToCheckout: boolean;
    setReturnToCheckout: (value: boolean) => void;
}

const AppFlowContext = createContext<AppFlowState>({
    placedOrder: null,
    setPlacedOrder: () => {},
    returnToCheckout: false,
    setReturnToCheckout: () => {},
});

const useAppFlow = (): AppFlowState => useContext(AppFlowContext);

/* ─────────────────────────────────────────────────────────────────────────────
 * Root layout: realtime WebSocket, notification scope, toasts, flow state.
 * ───────────────────────────────────────────────────────────────────────────── */

function FullScreenLoader() {
    return (
        <div className="flex min-h-dvh items-center justify-center bg-white">
            <div className="h-10 w-10 border-4 border-[#E5E7EB] border-t-[#114B36] rounded-full animate-spin" />
        </div>
    );
}

function AppContent() {
    const { toasts, dismissToast, setScope, clearScope, pushNotification } = useNotifications();
    const { token: customerToken, customer } = useCustomerAuth();
    const { token: adminToken, user: adminUser } = useAdminAuth();
    const { token: platformToken } = usePlatformAdminAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const [placedOrder, setPlacedOrder] = useState<any>(null);
    const [returnToCheckout, setReturnToCheckout] = useState(false);
    const [reviewPromptOrderId, setReviewPromptOrderId] = useState<string | null>(null);

    const path = location.pathname;
    const isKitchenPath = path === "/kitchen" || path.startsWith("/kitchen/");
    const isPlatformPath = path === "/platform" || path.startsWith("/platform/");
    const isAdminPath = isKitchenPath || isPlatformPath;
    const isCustomerView = !isAdminPath;
    const notificationScope = isPlatformPath ? "platform" : isKitchenPath ? "admin" : "customer";

    // Route changes don't reset scroll on their own — without this, navigating
    // away from a spot you'd scrolled down to (e.g. a long pending-collection
    // list) lands you at that same pixel offset on the new page, which on a
    // long page like order details can be at or near the bottom. Skip it when
    // the destination carries its own hash target (e.g. #payment, #review) —
    // that page owns scrolling itself once its content has rendered.
    useEffect(() => {
        if (location.hash) return;
        window.scrollTo(0, 0);
    }, [location.pathname, location.hash]);

    // Sync notification scope with the active route.
    useEffect(() => {
        if (isCustomerView) {
            clearScope("admin");
            clearScope("platform");
            setScope("customer");
        } else if (isKitchenPath) {
            clearScope("customer");
            clearScope("platform");
            setScope("admin");
        } else if (isPlatformPath) {
            clearScope("customer");
            clearScope("admin");
            setScope("platform");
        }
    }, [isCustomerView, isKitchenPath, isPlatformPath, setScope, clearScope]);

    const realtimeRole = isAdminPath ? "admin" : "customer";
    const realtimeToken = isKitchenPath ? adminToken : isPlatformPath ? platformToken : customerToken;

    useManifestSwitcher(isKitchenPath);

    useEffect(() => {
        void registerServiceWorker(isKitchenPath);
    }, [isKitchenPath]);

    // Push subscriptions require a direct user gesture to call requestPermission()
    // on mobile (especially iOS Safari). Auto-calling it from a useEffect silently
    // fails. Both kitchen and customer use the PersistentNotificationCard UI instead,
    // which ensures the subscribe call originates from a real button click.

    const currentIdentityKey = isPlatformPath ? (platformToken ? `platform:${decodeJwt(platformToken)?.sub ?? ""}` : "") : isKitchenPath ? (adminUser?.id ? `admin:${adminUser.id}` : "") : (customer?.id ? `customer:${customer.id}` : `guest:${localStorage.getItem("ladha_guest_id") || ""}`);

    const rootSocket = useWebSocket(realtimeRole, undefined, (event: WsEventPayload) => {
        window.dispatchEvent(new CustomEvent("ladha:realtime", { detail: event }));
        if (event.type === "MESSAGE_CREATED") {
            const message = event.payload as { body?: string; senderIdentityKey?: string };
            if (message.senderIdentityKey !== currentIdentityKey) pushNotification("info", "New message", message.body || "You have a new message.", { scope: notificationScope });
        } else if (event.type === "ANNOUNCEMENT_PUBLISHED") {
            const announcement = event.payload as { title?: string; body?: string; sourceName?: string };
            if ((announcement as { senderIdentityKey?: string }).senderIdentityKey !== currentIdentityKey) pushNotification("info", announcement.title || "New announcement", `${announcement.sourceName ? `${announcement.sourceName}: ` : ""}${announcement.body || "A new announcement is available."}`, { scope: notificationScope });
        } else if (event.type === "NOTIFICATION") {
            const notification = event.payload as { category?: string; title?: string; message?: string };
            const categoryMap: Record<string, "info" | "danger" | "success" | "warning"> = {
                dispatch: "info",
                cancellation: "warning",
            };
            pushNotification(categoryMap[notification.category || ""] || "info", notification.title || "", notification.message || "", { scope: notificationScope });
        } else if (event.type === "ORDER_PAYMENT_UPDATED") {
            const payment = event.payload as { orderId?: string; paymentStatus?: string; status?: string; amountPaid?: number; totalAmount?: number; orderNumber?: number };
            if (isAdminPath) {
                const statusLabel = payment.paymentStatus === "REFUNDED" ? "Refunded" : payment.paymentStatus === "PAID" ? "Paid" : payment.paymentStatus === "PARTIAL" ? "Partial" : "Unpaid";
                pushNotification("info", "Payment Updated", `Order #${payment.orderNumber} — ${statusLabel} (KSh ${Number(payment.amountPaid ?? 0).toFixed(2)} / ${Number(payment.totalAmount ?? 0).toFixed(2)})`, { scope: notificationScope });
            } else if (payment.orderId && payment.paymentStatus === "PAID" && payment.status === "DELIVERED") {
                const promptKey = `ladha_review_prompted:${payment.orderId}`;
                if (!localStorage.getItem(promptKey)) {
                    localStorage.setItem(promptKey, "1");
                    setReviewPromptOrderId(payment.orderId);
                }
            }
        } else if (event.type === "HOTEL_CLOSING") {
            const closing = event.payload as { hotelId?: string; hotelName?: string; closingIn?: number };
            if (closing.closingIn !== undefined && closing.closingIn <= 0) {
                pushNotification("warning", "Hotel Closed", `${closing.hotelName || "A hotel"} is now closed for new orders.`, { scope: notificationScope });
            } else if (closing.closingIn !== undefined) {
                pushNotification("warning", "Hotel Closing", `${closing.hotelName || "A hotel"} will close in ${closing.closingIn}s — place your order soon.`, { scope: notificationScope, duration: 10000 });
            }
        } else if (event.type === "HOTEL_STATUS_UPDATED") {
            const status = event.payload as { hotelId?: string; hotelName?: string; isOpen?: boolean };
            if (status.hotelName) {
                pushNotification(status.isOpen ? "info" : "warning", status.isOpen ? "Hotel Open" : "Hotel Closed", `${status.hotelName} is now ${status.isOpen ? "open" : "closed"}.`, { scope: notificationScope });
            }
        }
    }, undefined, realtimeToken);
    useEffect(() => {
        const handleSend = (event: Event) => rootSocket.send((event as CustomEvent).detail);
        window.addEventListener("ladha:send", handleSend);
        return () => window.removeEventListener("ladha:send", handleSend);
    }, [rootSocket.send]);

    return (
        <>
            <NotificationToastContainer toasts={toasts} onDismiss={dismissToast} />
            <AppFlowContext.Provider value={{ placedOrder, setPlacedOrder, returnToCheckout, setReturnToCheckout }}>
                <Outlet />
                <Modal isOpen={Boolean(reviewPromptOrderId)} onClose={() => setReviewPromptOrderId(null)} type="success" title="How was your order?" message="Your order is complete and payment is recorded. Would you like to leave a quick review?" primaryAction={{ label: "Leave a review", onClick: () => { const orderId = reviewPromptOrderId; setReviewPromptOrderId(null); if (orderId) navigate(`/orders/${orderId}/tracking`); } }} secondaryAction={{ label: "Not now", onClick: () => setReviewPromptOrderId(null) }} />
            </AppFlowContext.Provider>
        </>
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Customer shell — sticky bottom nav around customer routes.
 * ───────────────────────────────────────────────────────────────────────────── */

const getActiveTab = (path: string): CustomerTab => {
    if (path === "/cart") return "cart";
    if (path === "/orders" || path.startsWith("/orders/")) return "tracking";
    if (path === "/inbox" || path.startsWith("/inbox/")) return "conversations";
    if (path === "/account" || path === "/auth" || path.startsWith("/account/")) return "account";
    return "menu";
};

function CustomerShell() {
    const navigate = useNavigate();
    const location = useLocation();
    const { placedOrder } = useAppFlow();

    const handleSelectTab = (tab: CustomerTab) => {
        if (tab === "menu") navigate("/");
        else if (tab === "cart") navigate("/cart");
        else if (tab === "tracking") navigate("/orders");
        else if (tab === "conversations") navigate("/inbox");
        else if (tab === "account") navigate("/account");
    };

    return (
        <>
            <InstallBanner scope="customer" />
            <Outlet />
            <BottomNav
                activeTab={getActiveTab(location.pathname)}
                onSelectTab={handleSelectTab}
                hasActiveOrder={Boolean(placedOrder)}
            />
        </>
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Kitchen shell — admin auth guard + AdminBottomNavBar.
 * ───────────────────────────────────────────────────────────────────────────── */

const getAdminTab = (path: string): AdminTab => {
    if (path === "/kitchen/dashboard") return "dashboard";
    if (path === "/kitchen/menu") return "menu";
    if (path === "/kitchen/settings") return "settings";
    if (path === "/kitchen/history") return "history";
    if (path === "/kitchen/conversations") return "messages";
    if (path === "/kitchen/finance") return "finance";
    return "orders";
};

const isKitchenNavHidden = (path: string): boolean => {
    if (path === "/kitchen" || path === "/kitchen/login") return true;
    if (/^\/kitchen\/(orders|map)\/[^/]+$/.test(path)) return true;
    return false;
};

function KitchenShell() {
    const navigate = useNavigate();
    const location = useLocation();
    const { isLoggedIn, hydrating, token: adminToken } = useAdminAuth();

    if (!hydrating && !isLoggedIn && location.pathname !== "/kitchen" && location.pathname !== "/kitchen/login") {
        return <Navigate to="/kitchen" replace />;
    }

    const handleAdminTab = (tab: AdminTab) => {
        if (tab === "orders") navigate("/kitchen/orders");
        else if (tab === "dashboard") navigate("/kitchen/dashboard");
        else if (tab === "menu") navigate("/kitchen/menu");
        else if (tab === "settings") navigate("/kitchen/settings");
        else if (tab === "history") navigate("/kitchen/history");
        else if (tab === "messages") navigate("/kitchen/conversations");
        else if (tab === "finance") navigate("/kitchen/finance");
    };

    return (
        <div className="kitchen-theme">
            {!hydrating && isLoggedIn && <InstallBanner scope="admin" />}
            {!hydrating && isLoggedIn && !isKitchenNavHidden(location.pathname) && (
                <PersistentNotificationCard variant="banner" token={adminToken ?? undefined} />
            )}
            <Outlet />
            {!hydrating && isLoggedIn && !isKitchenNavHidden(location.pathname) && (
                <AdminBottomNavBar
                    activeTab={getAdminTab(location.pathname)}
                    onSelectTab={handleAdminTab}
                />
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Customer route wrappers.
 * ───────────────────────────────────────────────────────────────────────────── */

function MenuRoute() {
    const navigate = useNavigate();
    return (
        <MenuListPage
            onNavigateToCart={() => navigate("/cart")}
            onNavigateToAccount={() => navigate("/account")}
            onNavigateToConversations={() => navigate("/inbox")}
            // When a hotel is tapped on the marketplace, push its slug into
            // the URL so the address bar always holds a shareable/QR-able link.
            onNavigateToHotel={(slug) => navigate(`/h/${slug}`)}
        />
    );
}

/** QR-code entry point — e.g. printed on a table tent as https://ladha.co.ke/h/riverside-food-court */
function HotelDirectRoute() {
    const navigate = useNavigate();
    const { hotelSlug } = useParams();
    return (
        <MenuListPage
            initialHotelSlug={hotelSlug}
            onNavigateToCart={() => navigate("/cart")}
            onNavigateToAccount={() => navigate("/account")}
            onNavigateToConversations={() => navigate("/inbox")}
            // Back from hotel menu returns to marketplace root
            onBackToMarketplace={() => navigate("/")}
        />
    );
}

function InboxRoute() {
    const navigate = useNavigate();
    const { token, customer } = useCustomerAuth();
    const { conversationId } = useParams();
    return (
        <InboxPage
            token={token}
            actorId={customer?.id}
            initialConversationId={conversationId}
            onBack={() => navigate("/")}
        />
    );
}

function CartRoute() {
    const navigate = useNavigate();
    return (
        <CartPage
            onBackToMenu={() => navigate("/")}
            onContinueToDelivery={() => navigate("/checkout")}
        />
    );
}

function CheckoutRoute() {
    const navigate = useNavigate();
    const { customer, syncCustomer } = useCustomerAuth();
    const { setPlacedOrder, setReturnToCheckout } = useAppFlow();
    return (
        <LocationPage
            onBackToCart={() => navigate("/cart")}
            onOrderPlaced={(order) => {
                const primary = Array.isArray(order) ? order[0] : order;
                if (primary?.customerProfile && customer?.id === primary.customerProfile.id) syncCustomer(primary.customerProfile);
                setPlacedOrder(primary);
                navigate(`/orders/${primary?.id}/confirmation`, { replace: true });
            }}
            onNavigateToVerify={() => {
                setReturnToCheckout(true);
                navigate("/auth");
            }}
        />
    );
}

function ConfirmationRoute() {
    const navigate = useNavigate();
    const location = useLocation();
    const { orderId } = useParams();
    const { token } = useCustomerAuth();
    const { placedOrder, setPlacedOrder } = useAppFlow();
    const [fetchedOrder, setFetchedOrder] = useState<any | null>(null);

    const state = location.state as { order?: any } | null;
    useEffect(() => {
        if (!orderId) return;
        if (state?.order?.id === orderId) {
            setFetchedOrder(state.order);
            return;
        }
        if (placedOrder?.id === orderId) {
            setFetchedOrder(placedOrder);
            return;
        }
        let active = true;
        apiGet<any>(`/orders/${orderId}`, token).then((result) => {
            if (active && result.success && result.data) {
                setFetchedOrder(result.data);
                setPlacedOrder(result.data);
            }
        }).catch(() => {});
        return () => { active = false; };
    }, [orderId, token, state?.order]);

    const order = fetchedOrder || (placedOrder?.id === orderId ? placedOrder : null);
    if (!order) return <FullScreenLoader />;
    return (
        <ConfirmationPage
            order={order}
            onTrackOrder={(id) => navigate(`/orders/${id}/tracking`)}
            onBackToHome={() => navigate("/")}
        />
    );
}

function TrackingRoute() {
    const navigate = useNavigate();
    const { orderId } = useParams();
    return (
        <OrderTrackingPage
            orderId={orderId || ""}
            onBackToHome={() => navigate("/")}
        />
    );
}

function TrackingListRoute() {
    const navigate = useNavigate();
    const { placedOrder } = useAppFlow();
    return (
        <TrackingListPage
            placedOrderId={placedOrder?.id || undefined}
            onTrackOrder={(orderId) => navigate(`/orders/${orderId}/tracking`)}
            onGoToAuth={() => navigate("/auth")}
        />
    );
}

function SearchRoute() {
    const navigate = useNavigate();
    return (
        <SearchPage
            onBack={() => navigate("/")}
            onNavigateToMenu={() => navigate("/")}
            onNavigateToConversations={() => navigate("/inbox")}
        />
    );
}

function AuthRoute() {
    const navigate = useNavigate();
    const { returnToCheckout, setReturnToCheckout } = useAppFlow();
    const goAfterAuth = useCallback(() => {
        if (returnToCheckout) {
            setReturnToCheckout(false);
            navigate("/checkout");
        } else {
            navigate("/account");
        }
    }, [returnToCheckout, setReturnToCheckout, navigate]);
    return <CustomerAuthPage onBack={goAfterAuth} onSuccess={goAfterAuth} />;
}

function MyOrdersRoute() {
    const navigate = useNavigate();
    return (
        <MyOrdersPage
            onGoToAuth={() => navigate("/auth")}
            onTrackOrder={(orderId) => navigate(`/orders/${orderId}/tracking`)}
            onGoToProfile={() => navigate("/account/profile")}
            onNavigateToWallet={() => navigate("/account/wallet")}
        />
    );
}

function ProfileRoute() {
    const navigate = useNavigate();
    return <CustomerProfilePage onBack={() => navigate("/account")} />;
}

function WalletRoute() {
    const navigate = useNavigate();
    return (
        <WalletPage
            onBack={() => navigate("/account")}
            onSelectHotel={(hotelId, hotelName) => navigate(`/account/wallet/hotel/${hotelId}`, { state: { name: hotelName } })}
            onOpenActivity={() => navigate("/account/wallet/activity")}
        />
    );
}

function WalletHotelRoute() {
    const navigate = useNavigate();
    const location = useLocation();
    const { hotelId } = useParams();
    const { token } = useCustomerAuth();
    const state = location.state as { name?: string } | null;
    const [hotelName, setHotelName] = useState<string | null>(state?.name ?? null);

    useEffect(() => {
        if (hotelName || !hotelId) return;
        let active = true;
        apiGet<any>(`/finance/wallet/${hotelId}`, token).then((result) => {
            if (active && result.success && result.data?.hotelName) setHotelName(result.data.hotelName);
        }).catch(() => {});
        return () => { active = false; };
    }, [hotelId, hotelName, token]);

    if (!hotelId || !hotelName) return <FullScreenLoader />;
    return (
        <WalletHotelDetailPage
            hotelId={hotelId}
            hotelName={hotelName}
            onBack={() => navigate("/account/wallet")}
        />
    );
}

function WalletActivityRoute() {
    const navigate = useNavigate();
    return <WalletActivityPage onBack={() => navigate("/account/wallet")} />;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Kitchen route wrappers.
 * ───────────────────────────────────────────────────────────────────────────── */

function AdminLoginRoute() {
    const navigate = useNavigate();
    const { isLoggedIn, hydrating, login } = useAdminAuth();
    if (!hydrating && isLoggedIn) return <Navigate to="/kitchen/dashboard" replace />;
    return (
        <AdminLoginPage
            onLoginSuccess={(token, user, hotels) => {
                login(token, user, hotels);
                navigate("/kitchen/dashboard", { replace: true });
            }}
        />
    );
}

function AdminOrdersRoute() {
    const navigate = useNavigate();
    const { token, logout } = useAdminAuth();
    return (
        <AdminOrdersPage
            token={token}
            onSelectOrder={(order) => navigate(`/kitchen/orders/${order.id}`, { state: { order } })}
            onLogout={() => {
                logout();
                navigate("/", { replace: true });
            }}
            onOpenPendingCollection={() => navigate("/kitchen/pending-collection")}
        />
    );
}

function AdminOrderDetailsRoute() {
    const navigate = useNavigate();
    const location = useLocation();
    const { orderId } = useParams();
    const { token, user } = useAdminAuth();
    const state = location.state as { order?: any } | null;
    const [order, setOrder] = useState<any | null>(null);

    useEffect(() => {
        if (!orderId) return;
        if (state?.order?.id === orderId) {
            setOrder(state.order);
        }
        let active = true;
        apiGet<any>(`/orders/${orderId}`, token).then((result) => {
            if (active && result.success && result.data) setOrder(result.data);
        }).catch(() => {});
        return () => { active = false; };
    }, [orderId, token, state?.order]);

    if (!order || !orderId) return <FullScreenLoader />;
    return (
        <AdminOrderDetailsPage
            order={order}
            token={token}
            canRefund={user?.role === "HOTEL_ADMIN"}
            onBack={() => navigate("/kitchen/orders")}
            onOrderUpdated={setOrder}
        />
    );
}

function AdminDashboardRoute() {
    const navigate = useNavigate();
    const { token } = useAdminAuth();
    return (
        <AdminDashboardPage
            token={token}
            onNavigateToOrders={() => navigate("/kitchen/orders")}
            onNavigateToMenu={() => navigate("/kitchen/menu")}
            onNavigateToSettings={() => navigate("/kitchen/settings")}
            onNavigateToHistory={() => navigate("/kitchen/history")}
            onNavigateToFinance={() => navigate("/kitchen/finance")}
        />
    );
}

function AdminMenuRoute() {
    const navigate = useNavigate();
    const { token } = useAdminAuth();
    return <AdminMenuManagePage token={token} onBackToOrders={() => navigate("/kitchen/orders")} />;
}

function AdminSettingsRoute() {
    const navigate = useNavigate();
    const { token } = useAdminAuth();
    return <AdminSettingsPage token={token} onBackToOrders={() => navigate("/kitchen/orders")} />;
}

function AdminHistoryRoute() {
    const navigate = useNavigate();
    const { token } = useAdminAuth();
    return (
        <AdminOrderHistoryPage
            token={token}
            onBackToOrders={() => navigate("/kitchen/orders")}
            onOpenOrder={(order) => navigate(`/kitchen/orders/${order.id}`, { state: { order } })}
        />
    );
}

function AdminConversationsRoute() {
    const navigate = useNavigate();
    const { token, user } = useAdminAuth();
    const hotelId = token ? String(decodeJwt(token)?.hotelId ?? "") : undefined;
    return (
        <InboxPage
            token={token}
            actorId={user?.id}
            mode="hotel"
            hotelId={hotelId}
            title="Inbox"
            onBack={() => navigate("/kitchen/orders")}
        />
    );
}

function AdminFinanceRoute() {
    const navigate = useNavigate();
    const { token } = useAdminAuth();
    return (
        <FinanceDashboardPage
            token={token}
            onBackToDashboard={() => navigate("/kitchen/dashboard")}
            onNavigateToOrders={() => navigate("/kitchen/history")}
            onOpenPendingCollection={() => navigate("/kitchen/pending-collection")}
        />
    );
}

function AdminPendingCollectionRoute() {
    const navigate = useNavigate();
    const { token } = useAdminAuth();
    return (
        <PendingCollectionPage
            token={token}
            onBack={() => navigate("/kitchen/finance")}
            onOpenOrder={(order) => navigate(`/kitchen/orders/${order.id}#payment`, { state: { order } })}
        />
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Platform route.
 * ───────────────────────────────────────────────────────────────────────────── */

function PlatformRoute() {
    const navigate = useNavigate();
    return <PlatformAdminPage onBack={() => navigate("/")} />;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Route tree.
 * ───────────────────────────────────────────────────────────────────────────── */

export const router = createBrowserRouter([
    {
        element: <AppContent />,
        children: [
            {
                element: <CustomerShell />,
                children: [
                    { index: true, element: <MenuRoute /> },
                    { path: "h/:hotelSlug", element: <HotelDirectRoute /> },
                    { path: "search", element: <SearchRoute /> },
                    { path: "cart", element: <CartRoute /> },
                    { path: "checkout", element: <CheckoutRoute /> },
                    { path: "orders", element: <TrackingListRoute /> },
                    { path: "orders/:orderId/confirmation", element: <ConfirmationRoute /> },
                    { path: "orders/:orderId/tracking", element: <TrackingRoute /> },
                    { path: "account", element: <MyOrdersRoute /> },
                    { path: "account/profile", element: <ProfileRoute /> },
                    { path: "account/wallet", element: <WalletRoute /> },
                    { path: "account/wallet/activity", element: <WalletActivityRoute /> },
                    { path: "account/wallet/hotel/:hotelId", element: <WalletHotelRoute /> },
                    { path: "auth", element: <AuthRoute /> },
                    { path: "inbox", element: <InboxRoute /> },
                    { path: "inbox/:conversationId", element: <InboxRoute /> },
                ],
            },
            {
                path: "kitchen",
                element: <KitchenShell />,
                children: [
                    { index: true, element: <AdminLoginRoute /> },
                    { path: "login", element: <AdminLoginRoute /> },
                    { path: "orders", element: <AdminOrdersRoute /> },
                    { path: "orders/:orderId", element: <AdminOrderDetailsRoute /> },
                    { path: "dashboard", element: <AdminDashboardRoute /> },
                    { path: "menu", element: <AdminMenuRoute /> },
                    { path: "settings", element: <AdminSettingsRoute /> },
                    { path: "history", element: <AdminHistoryRoute /> },
                    { path: "conversations", element: <AdminConversationsRoute /> },
                    { path: "finance", element: <AdminFinanceRoute /> },
                    { path: "pending-collection", element: <AdminPendingCollectionRoute /> },
                ],
            },
            {
                path: "platform",
                element: <PlatformRoute />,
            },
            { path: "set-password", element: <SetPasswordPage /> },
            { path: "*", element: <Navigate to="/" replace /> },
        ],
    },
]);
