/**
 * Purpose: Main React Application Container and Navigation Router for Ladha.
 * Responsibilities: Wraps application in CartProvider + CustomerAuthProvider + NotificationsProvider contexts,
 *   manages active page view transitions, and handles admin session tokens.
 * Dependencies: CartProvider, CustomerAuthProvider, NotificationsProvider, NotificationToastContainer, customer pages, admin pages.
 * When to modify: When adding new application views or changing top-level route flows.
 */

// TODO - have a proper navigation stack instead of just a single page, but still make it a single page application... in the sense that it doesn't load when navigating, use a router if needed even if you're going to have "/sections" since the user closes out when trying to go back

import { useCallback, useEffect, useState } from "react";
import { CartProvider } from "./context/CartContext";
import { CustomerAuthProvider, useCustomerAuth } from "./context/CustomerAuthContext";
import { AdminAuthProvider, useAdminAuth } from "./context/AdminAuthContext";
import { PlatformAdminAuthProvider, usePlatformAdminAuth } from "./context/PlatformAdminAuthContext";
import { NotificationsProvider, useNotifications } from "./context/NotificationsContext";
import { NotificationToastContainer } from "./components/NotificationToast";

import { BottomNav, type CustomerTab } from "./components/ui/BottomNav";
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
import { decodeJwt } from "./lib/jwt";
import { useWebSocket, type WsEventPayload } from "./lib/websocket";

// Admin Views
import { AdminBottomNavBar, type AdminTab } from "./components/AdminBottomNavBar";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminMapViewPage } from "./pages/admin/AdminMapViewPage";
import { AdminMenuManagePage } from "./pages/admin/AdminMenuManagePage";
import { AdminOrderDetailsPage } from "./pages/admin/AdminOrderDetailsPage";
import { AdminOrderHistoryPage } from "./pages/admin/AdminOrderHistoryPage";
import { AdminOrdersPage } from "./pages/admin/AdminOrdersPage";
import { AdminSettingsPage } from "./pages/admin/AdminSettingsPage";
import { FinanceDashboardPage } from "./pages/admin/FinanceDashboardPage";
import { PendingCollectionPage } from "./pages/admin/PendingCollectionPage";
import { PlatformAdminPage } from "./pages/platform/PlatformAdminPage";



type ViewState =
    | "customer_menu"
    | "customer_cart"
    | "customer_location"
    | "customer_confirmation"
    | "customer_tracking"
    | "customer_search"
    | "customer_auth"
    | "customer_my_orders"
    | "customer_profile"
    | "customer_conversations"
    | "customer_tracker_list"
    | "customer_wallet"
    | "customer_wallet_hotel"
    | "customer_wallet_activity"
    | "admin_login"
    | "admin_orders"
    | "admin_order_details"
    | "admin_map_view"
    | "admin_dashboard"
    | "admin_menu_manage"
    | "admin_settings"
    | "admin_order_history"
    | "admin_conversations"
    | "admin_finance"
    | "admin_pending_collection"
    | "platform_admin";

export function AppContent() {
    const { toasts, dismissToast, setScope, clearScope, pushNotification } = useNotifications();
    const { token: customerToken, customer } = useCustomerAuth();
    const { token: adminToken, user: adminUser, isLoggedIn: isAdminLoggedIn, hydrating: adminHydrating, login: adminLogin, logout: adminLogout } = useAdminAuth();
    const { token: platformToken } = usePlatformAdminAuth();

    const [currentView, setCurrentViewState] = useState<ViewState>(() => {
        const path = window.location.pathname;
        if (path === "/kitchen") {
            const stored = localStorage.getItem("ladha_token");
            return stored ? "admin_orders" : "admin_login";
        }
        if (path === "/platform") {
            const stored = localStorage.getItem("ladha_platform_token");
            return stored ? "platform_admin" : "platform_admin";
        }
        return "customer_menu";
    });

    // Keep the browser history aligned with the in-app state-machine so Back
    // returns to the screen the user actually visited.
    const setCurrentView = useCallback((nextView: ViewState) => {
        window.history.pushState({ view: nextView }, "", window.location.href);
        setCurrentViewState(nextView);
    }, []);

    useEffect(() => {
        if (!window.history.state?.view) {
            window.history.replaceState({ view: currentView }, "", window.location.href);
        }
    }, []);

    // Auto-redirect admin to/from login based on auth state
    useEffect(() => {
        if (adminHydrating) return;
        if (currentView.startsWith("admin_") && !isAdminLoggedIn) {
            setCurrentView("admin_login");
        } else if (currentView === "admin_login" && isAdminLoggedIn) {
            setCurrentView("admin_orders");
        }
    }, [isAdminLoggedIn, adminHydrating, currentView]);

    // Sync notification scope with current view
    useEffect(() => {
        if (currentView.startsWith("customer_")) {
            clearScope("admin");
            clearScope("platform");
            setScope("customer");
        } else if (currentView.startsWith("admin_")) {
            clearScope("customer");
            clearScope("platform");
            setScope("admin");
        } else if (currentView === "platform_admin") {
            clearScope("customer");
            clearScope("admin");
            setScope("platform");
        }
    }, [currentView, setScope, clearScope]);

    // State data for active flows
    const [placedOrder, setPlacedOrder] = useState<any>(null);
    const [trackingOrderId, setTrackingOrderId] = useState<string>("");
    const [selectedAdminOrder, setSelectedAdminOrder] = useState<any>(null);
    const [selectedWalletHotel, setSelectedWalletHotel] = useState<{ id: string; name: string } | null>(null);
    const [returnToCheckout, setReturnToCheckout] = useState(false);

    // Listen for URL changes (pop state / back/forward)
    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            const path = window.location.pathname;
            if (path === "/kitchen") {
                setCurrentViewState(isAdminLoggedIn ? "admin_orders" : "admin_login");
            } else if (path === "/platform") {
                setCurrentViewState("platform_admin");
            } else if (event.state?.view) {
                setCurrentViewState(event.state.view as ViewState);
            } else if (currentView.startsWith("admin_") || currentView === "platform_admin") {
                setCurrentViewState("customer_menu");
            }
        };
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, [isAdminLoggedIn, currentView]);

    const isCustomerView = currentView.startsWith("customer_");
    const isAdminView = currentView.startsWith("admin_");
    const realtimeRole = isAdminView || currentView === "platform_admin" ? "admin" : "customer";
    const realtimeToken = isAdminView ? adminToken : currentView === "platform_admin" ? platformToken : customerToken;
    const currentIdentityKey = currentView === "platform_admin" ? (platformToken ? `platform:${decodeJwt(platformToken)?.sub ?? ""}` : "") : isAdminView ? (adminUser?.id ? `admin:${adminUser.id}` : "") : (customer?.id ? `customer:${customer.id}` : `guest:${localStorage.getItem("tableDash_guest_id") || ""}`);
    const rootSocket = useWebSocket(realtimeRole, undefined, (event: WsEventPayload) => {
        window.dispatchEvent(new CustomEvent("tabledash:realtime", { detail: event }));
        if (event.type === "MESSAGE_CREATED") {
            const message = event.payload as { body?: string; senderIdentityKey?: string };
            if (message.senderIdentityKey !== currentIdentityKey) pushNotification("info", "New message", message.body || "You have a new message.", { scope: isCustomerView ? "customer" : currentView === "platform_admin" ? "platform" : "admin" });
        } else if (event.type === "ANNOUNCEMENT_PUBLISHED") {
            const announcement = event.payload as { title?: string; body?: string; sourceName?: string };
            if ((announcement as { senderIdentityKey?: string }).senderIdentityKey !== currentIdentityKey) pushNotification("info", announcement.title || "New announcement", `${announcement.sourceName ? `${announcement.sourceName}: ` : ""}${announcement.body || "A new announcement is available."}`, { scope: isCustomerView ? "customer" : currentView === "platform_admin" ? "platform" : "admin" });
        } else if (event.type === "NOTIFICATION") {
            const notification = event.payload as { category?: string; title?: string; message?: string };
            const categoryMap: Record<string, "info" | "danger" | "success" | "warning"> = {
                dispatch: "info",
                cancellation: "warning",
            };
            pushNotification(categoryMap[notification.category || ""] || "info", notification.title || "", notification.message || "", { scope: isCustomerView ? "customer" : currentView === "platform_admin" ? "platform" : "admin" });
        } else if (event.type === "ORDER_PAYMENT_UPDATED") {
            const payment = event.payload as { paymentStatus?: string; amountPaid?: number; totalAmount?: number; orderNumber?: number };
            if (currentView.startsWith("admin_") || currentView === "platform_admin") {
                const statusLabel = payment.paymentStatus === "REFUNDED" ? "Refunded" : payment.paymentStatus === "PAID" ? "Paid" : payment.paymentStatus === "PARTIAL" ? "Partial" : "Unpaid";
                pushNotification("info", "Payment Updated", `Order #${payment.orderNumber} — ${statusLabel} (KSh ${Number(payment.amountPaid ?? 0).toFixed(2)} / ${Number(payment.totalAmount ?? 0).toFixed(2)})`, { scope: currentView === "platform_admin" ? "platform" : "admin" });
            }
        } else if (event.type === "HOTEL_CLOSING") {
            const closing = event.payload as { hotelId?: string; hotelName?: string; closingIn?: number };
            if (closing.closingIn !== undefined && closing.closingIn <= 0) {
                pushNotification("warning", "Hotel Closed", `${closing.hotelName || "A hotel"} is now closed for new orders.`, { scope: isCustomerView ? "customer" : currentView === "platform_admin" ? "platform" : "admin" });
            } else if (closing.closingIn !== undefined) {
                pushNotification("warning", "Hotel Closing", `${closing.hotelName || "A hotel"} will close in ${closing.closingIn}s — place your order soon.`, { scope: isCustomerView ? "customer" : currentView === "platform_admin" ? "platform" : "admin", duration: 10000 });
            }
        } else if (event.type === "HOTEL_STATUS_UPDATED") {
            const status = event.payload as { hotelId?: string; hotelName?: string; isOpen?: boolean };
            if (status.hotelName) {
                pushNotification(status.isOpen ? "info" : "warning", status.isOpen ? "Hotel Open" : "Hotel Closed", `${status.hotelName} is now ${status.isOpen ? "open" : "closed"}.`, { scope: isCustomerView ? "customer" : currentView === "platform_admin" ? "platform" : "admin" });
            }
        }
    }, undefined, realtimeToken);
    useEffect(() => {
        const handleSend = (event: Event) => rootSocket.send((event as CustomEvent).detail);
        window.addEventListener("tabledash:send", handleSend);
        return () => window.removeEventListener("tabledash:send", handleSend);
    }, [rootSocket.send]);

    const getAdminTab = (): AdminTab => {
        switch (currentView) {
            case "admin_dashboard": return "dashboard";
            case "admin_menu_manage": return "menu";
            case "admin_settings": return "settings";
            case "admin_order_history": return "history";
            case "admin_conversations": return "messages";
            case "admin_finance": return "finance";
            default: return "orders";
        }
    };

    const handleAdminTab = (tab: AdminTab) => {
        if (tab === "orders") setCurrentView("admin_orders");
        else if (tab === "dashboard") setCurrentView("admin_dashboard");
        else if (tab === "menu") setCurrentView("admin_menu_manage");
        else if (tab === "settings") setCurrentView("admin_settings");
        else if (tab === "history") setCurrentView("admin_order_history");
        else if (tab === "messages") setCurrentView("admin_conversations");
        else if (tab === "finance") setCurrentView("admin_finance");
    };

    const getActiveTab = (): CustomerTab => {
        if (currentView === "customer_cart") return "cart";
        if (currentView === "customer_tracker_list" || currentView === "customer_tracking" || currentView === "customer_confirmation") return "tracking";
        if (currentView === "customer_conversations") return "conversations";
        if (currentView === "customer_auth" || currentView === "customer_my_orders" || currentView === "customer_profile" || currentView === "customer_wallet" || currentView === "customer_wallet_hotel" || currentView === "customer_wallet_activity") return "account";
        return "menu";
    };

    const handleSelectTab = (tab: CustomerTab) => {
        if (tab === "menu") setCurrentView("customer_menu");
        if (tab === "cart") setCurrentView("customer_cart");
        if (tab === "tracking") setCurrentView("customer_tracker_list");
        if (tab === "conversations") setCurrentView("customer_conversations");
        if (tab === "account") setCurrentView("customer_my_orders");
        return "menu";
    };

    return (
        <>
            {/* Global Toast Container */}
            <NotificationToastContainer toasts={toasts} onDismiss={dismissToast} />

            {/* ─── Customer Application Flow ─────────────────────────────────────────── */}
            {currentView === "customer_menu" && (
                <MenuListPage
                    onNavigateToCart={() => setCurrentView("customer_cart")}
                    onNavigateToAccount={() => setCurrentView("customer_my_orders")}
                    onNavigateToConversations={() => setCurrentView("customer_conversations")}
                />
            )}

            {currentView === "customer_conversations" && (
                <InboxPage token={customerToken} actorId={customer?.id} onBack={() => setCurrentView("customer_menu")} />
            )}

            {currentView === "customer_cart" && (
                <CartPage
                    onBackToMenu={() => setCurrentView("customer_menu")}
                    onContinueToDelivery={() => setCurrentView("customer_location")}
                />
            )}

            {currentView === "customer_location" && (
                <LocationPage
                    onBackToCart={() => setCurrentView("customer_cart")}
                    onOrderPlaced={(order) => {
                        const primary = Array.isArray(order) ? order[0] : order;
                        setPlacedOrder(primary);
                        setCurrentView("customer_confirmation");
                    }}
                    onNavigateToVerify={() => {
                        setReturnToCheckout(true);
                        setCurrentView("customer_auth");
                    }}
                />
            )}

            {currentView === "customer_confirmation" && (
                <ConfirmationPage
                    order={placedOrder}
                    onTrackOrder={(orderId) => {
                        setTrackingOrderId(orderId);
                        setCurrentView("customer_tracking");
                    }}
                    onBackToHome={() => setCurrentView("customer_menu")}
                />
            )}

            {currentView === "customer_tracker_list" && (
                <TrackingListPage
                    placedOrderId={placedOrder?.id || trackingOrderId || undefined}
                    onTrackOrder={(orderId) => {
                        setTrackingOrderId(orderId);
                        setCurrentView("customer_tracking");
                    }}
                    onGoToAuth={() => setCurrentView("customer_auth")}
                />
            )}

            {currentView === "customer_tracking" && (
                <OrderTrackingPage
                    orderId={trackingOrderId || placedOrder?.id}
                    onBackToHome={() => setCurrentView("customer_menu")}
                />
            )}

            {currentView === "customer_search" && (
                <SearchPage
                    onBack={() => setCurrentView("customer_menu")}
                    onNavigateToMenu={() => setCurrentView("customer_menu")}
                    onNavigateToConversations={() => setCurrentView("customer_conversations")}
                />
            )}

            {currentView === "customer_auth" && (
                <CustomerAuthPage
                    onBack={() => {
                        if (returnToCheckout) {
                            setReturnToCheckout(false);
                            setCurrentView("customer_location");
                        } else {
                            setCurrentView("customer_my_orders");
                        }
                    }}
                    onSuccess={() => {
                        if (returnToCheckout) {
                            setReturnToCheckout(false);
                            setCurrentView("customer_location");
                        } else {
                            setCurrentView("customer_my_orders");
                        }
                    }}
                />
            )}

            {currentView === "customer_my_orders" && (
                <MyOrdersPage
                    onGoToAuth={() => setCurrentView("customer_auth")}
                    onTrackOrder={(orderId) => {
                        setTrackingOrderId(orderId);
                        setCurrentView("customer_tracking");
                    }}
                    onGoToProfile={() => setCurrentView("customer_profile")}
                    onNavigateToWallet={() => setCurrentView("customer_wallet")}
                />
            )}

            {currentView === "customer_profile" && (
                <CustomerProfilePage
                    onBack={() => setCurrentView("customer_my_orders")}
                />
            )}

            {currentView === "customer_wallet" && (
                <WalletPage
                    onBack={() => setCurrentView("customer_my_orders")}
                    onSelectHotel={(hotelId, hotelName) => {
                        setSelectedWalletHotel({ id: hotelId, name: hotelName });
                        setCurrentView("customer_wallet_hotel");
                    }}
                    onOpenActivity={() => setCurrentView("customer_wallet_activity")}
                />
            )}

            {currentView === "customer_wallet_hotel" && selectedWalletHotel && (
                <WalletHotelDetailPage
                    hotelId={selectedWalletHotel.id}
                    hotelName={selectedWalletHotel.name}
                    onBack={() => setCurrentView("customer_wallet")}
                />
            )}

            {currentView === "customer_wallet_activity" && (
                <WalletActivityPage onBack={() => setCurrentView("customer_wallet")} />
            )}

            {/* Customer Sticky Bottom Navigation */}
            {isCustomerView && (
                <BottomNav
                    activeTab={getActiveTab()}
                    onSelectTab={handleSelectTab}
                    hasActiveOrder={Boolean(placedOrder || trackingOrderId)}
                />
            )}

            {/* ─── Admin Management Application Flow ─────────────────────────────────── */}
            {currentView === "admin_login" && (
                <AdminLoginPage
                    onLoginSuccess={(token, loginUser) => {
                        adminLogin(token, loginUser);
                        setCurrentView("admin_orders");
                    }}
                />
            )}

            {currentView === "admin_orders" && (
                <AdminOrdersPage
                    token={adminToken}
                    onSelectOrder={(order) => {
                        setSelectedAdminOrder(order);
                        setCurrentView("admin_order_details");
                    }}
                    onLogout={() => {
                        adminLogout();
                        setCurrentView("customer_menu");
                    }}
                    onOpenPendingCollection={() => setCurrentView("admin_pending_collection")}
                />
            )}

            {currentView === "admin_order_details" && selectedAdminOrder && (
                <AdminOrderDetailsPage
                    order={selectedAdminOrder}
                    token={adminToken}
                    canRefund={adminUser?.role === "HOTEL_ADMIN"}
                    onBack={() => setCurrentView("admin_orders")}
                    onOpenMap={(order) => {
                        setSelectedAdminOrder(order);
                        setCurrentView("admin_map_view");
                    }}
                    onOrderUpdated={(updated) => setSelectedAdminOrder(updated)}
                />
            )}

            {currentView === "admin_map_view" && selectedAdminOrder && (
                <AdminMapViewPage
                    order={selectedAdminOrder}
                    onBack={() => setCurrentView("admin_order_details")}
                />
            )}

            {currentView === "admin_dashboard" && (
                <AdminDashboardPage
                    token={adminToken}
                    onBackToOrders={() => setCurrentView("admin_orders")}
                    onNavigateToOrders={() => setCurrentView("admin_orders")}
                    onNavigateToMenu={() => setCurrentView("admin_menu_manage")}
                    onNavigateToSettings={() => setCurrentView("admin_settings")}
                    onNavigateToHistory={() => setCurrentView("admin_order_history")}
                    onNavigateToFinance={() => setCurrentView("admin_finance")}
                />
            )}

            {currentView === "admin_menu_manage" && (
                <AdminMenuManagePage
                    token={adminToken}
                    onBackToOrders={() => setCurrentView("admin_orders")}
                />
            )}

            {currentView === "admin_settings" && (
                <AdminSettingsPage
                    token={adminToken}
                    onBackToOrders={() => setCurrentView("admin_orders")}
                />
            )}

            {currentView === "admin_order_history" && (
                <AdminOrderHistoryPage
                    token={adminToken}
                    onBackToOrders={() => setCurrentView("admin_orders")}
                    onOpenOrder={(order) => {
                        setSelectedAdminOrder(order);
                        setCurrentView("admin_order_details");
                    }}
                />
            )}

            {currentView === "admin_conversations" && (
                <InboxPage token={adminToken} actorId={adminUser?.id} mode="hotel" hotelId={adminToken ? String(decodeJwt(adminToken)?.hotelId ?? "") : undefined} title="Inbox" onBack={() => setCurrentView("admin_orders")} />
            )}

            {currentView === "admin_finance" && (
                <FinanceDashboardPage token={adminToken} onBackToDashboard={() => setCurrentView("admin_dashboard")} onNavigateToOrders={() => setCurrentView("admin_order_history")} onOpenPendingCollection={() => setCurrentView("admin_pending_collection")} />
            )}

            {currentView === "admin_pending_collection" && (
                <PendingCollectionPage
                    token={adminToken}
                    onBack={() => setCurrentView("admin_finance")}
                    onOpenOrder={(order) => {
                        setSelectedAdminOrder(order);
                        setCurrentView("admin_order_details");
                    }}
                />
            )}

            {/* ─── Platform Admin Panel (self-contained auth) ──────────────── */}
            {currentView === "platform_admin" && (
                <PlatformAdminPage onBack={() => window.location.href = "/"} />
            )}

            {/* Admin Bottom Navigation — persistent across all admin views (except login and order details) */}
            {isAdminView && currentView !== "admin_login" && currentView !== "admin_order_details" && currentView !== "admin_map_view" && (
                <AdminBottomNavBar
                    activeTab={getAdminTab()}
                    onSelectTab={handleAdminTab}
                />
            )}
        </>
    );
}

export function App() {
    return (
        <NotificationsProvider>
            <CartProvider>
                <CustomerAuthProvider>
                    <AdminAuthProvider>
                        <PlatformAdminAuthProvider>
                            <AppContent />
                        </PlatformAdminAuthProvider>
                    </AdminAuthProvider>
                </CustomerAuthProvider>
            </CartProvider>
        </NotificationsProvider>
    );
}

export default App;
