/**
 * Purpose: Main React Application Container and Navigation Router for tableDash.
 * Responsibilities: Wraps application in CartProvider + CustomerAuthProvider + NotificationsProvider contexts,
 *   manages active page view transitions, and handles admin session tokens.
 * Dependencies: CartProvider, CustomerAuthProvider, NotificationsProvider, NotificationToastContainer, customer pages, admin pages.
 * When to modify: When adding new application views or changing top-level route flows.
 */

import { useEffect, useState } from "react";
import { CartProvider } from "./context/CartContext";
import { CustomerAuthProvider } from "./context/CustomerAuthContext";
import { NotificationsProvider, useNotifications } from "./context/NotificationsContext";
import { NotificationToastContainer } from "./components/NotificationToast";

// Customer Views
import { BottomNavBar, type CustomerTab } from "./components/BottomNavBar";
import { CartPage } from "./pages/customer/CartPage";
import { ConfirmationPage } from "./pages/customer/ConfirmationPage";
import { CustomerAuthPage } from "./pages/customer/CustomerAuthPage";
import { LocationPage } from "./pages/customer/LocationPage";
import { MenuListPage } from "./pages/customer/MenuListPage";
import { MyOrdersPage } from "./pages/customer/MyOrdersPage";
import { OrderTrackingPage } from "./pages/customer/OrderTrackingPage";

// Admin Views
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminMapViewPage } from "./pages/admin/AdminMapViewPage";
import { AdminMenuManagePage } from "./pages/admin/AdminMenuManagePage";
import { AdminOrderDetailsPage } from "./pages/admin/AdminOrderDetailsPage";
import { AdminOrderHistoryPage } from "./pages/admin/AdminOrderHistoryPage";
import { AdminOrdersPage } from "./pages/admin/AdminOrdersPage";
import { AdminSettingsPage } from "./pages/admin/AdminSettingsPage";
import { PlatformAdminPage } from "./pages/platform/PlatformAdminPage";

type ViewState =
  | "customer_menu"
  | "customer_cart"
  | "customer_location"
  | "customer_confirmation"
  | "customer_tracking"
  | "customer_auth"
  | "customer_my_orders"
  | "admin_login"
  | "admin_orders"
  | "admin_order_details"
  | "admin_map_view"
  | "admin_dashboard"
  | "admin_menu_manage"
  | "admin_settings"
  | "admin_order_history"
  | "platform_admin";

export function AppContent() {
  const [currentView, setCurrentView] = useState<ViewState>(() => {
    const path = window.location.pathname;
    if (path === "/kitchen") {
      const token = localStorage.getItem("tableDash_token");
      return token ? "admin_orders" : "admin_login";
    }
    if (path === "/platform") {
      return "platform_admin";
    }
    return "customer_menu";
  });

  const { toasts, dismissToast, setScope, clearScope } = useNotifications();

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

  // Admin Auth State
  const [adminToken, setAdminToken] = useState<string>(
    () => localStorage.getItem("tableDash_token") || ""
  );

  // Listen for URL changes (pop state / back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === "/kitchen") {
        setCurrentView(adminToken ? "admin_orders" : "admin_login");
      } else if (path === "/platform") {
        setCurrentView("platform_admin");
      } else if (currentView.startsWith("admin_") || currentView === "platform_admin") {
        setCurrentView("customer_menu");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [adminToken, currentView]);

  const isCustomerView = currentView.startsWith("customer_");

  const getActiveTab = (): CustomerTab => {
    if (currentView === "customer_cart") return "cart";
    if (currentView === "customer_tracking" || currentView === "customer_confirmation") return "tracking";
    if (currentView === "customer_auth" || currentView === "customer_my_orders") return "account";
    return "menu";
  };

  const handleSelectTab = (tab: CustomerTab) => {
    if (tab === "menu") setCurrentView("customer_menu");
    if (tab === "cart") setCurrentView("customer_cart");
    if (tab === "tracking") setCurrentView("customer_tracking");
    if (tab === "account") setCurrentView("customer_my_orders");
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
        />
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

      {currentView === "customer_tracking" && (
        <OrderTrackingPage
          orderId={trackingOrderId || placedOrder?.id}
          onBackToHome={() => setCurrentView("customer_menu")}
        />
      )}

      {currentView === "customer_auth" && (
        <CustomerAuthPage
          onBack={() => setCurrentView("customer_my_orders")}
          onSuccess={() => setCurrentView("customer_my_orders")}
        />
      )}

      {currentView === "customer_my_orders" && (
        <MyOrdersPage
          onGoToAuth={() => setCurrentView("customer_auth")}
          onTrackOrder={(orderId) => {
            setTrackingOrderId(orderId);
            setCurrentView("customer_tracking");
          }}
        />
      )}

      {/* Customer Sticky Bottom Navigation */}
      {isCustomerView && (
        <BottomNavBar
          activeTab={getActiveTab()}
          onSelectTab={handleSelectTab}
          hasActiveOrder={Boolean(placedOrder || trackingOrderId)}
        />
      )}

      {/* ─── Admin Management Application Flow ─────────────────────────────────── */}
      {currentView === "admin_login" && (
        <AdminLoginPage
          onLoginSuccess={(token) => {
            setAdminToken(token);
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
          onNavigateDashboard={() => setCurrentView("admin_dashboard")}
          onNavigateMenuManage={() => setCurrentView("admin_menu_manage")}
          onNavigateOrderHistory={() => setCurrentView("admin_order_history")}
          onNavigateSettings={() => setCurrentView("admin_settings")}
          onLogout={() => {
            localStorage.removeItem("tableDash_token");
            setAdminToken("");
            setCurrentView("customer_menu");
          }}
        />
      )}

      {currentView === "admin_order_details" && selectedAdminOrder && (
        <AdminOrderDetailsPage
          order={selectedAdminOrder}
          token={adminToken}
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
        />
      )}

      {/* ─── Platform Admin Panel (self-contained auth) ──────────────── */}
      {currentView === "platform_admin" && (
        <PlatformAdminPage
          onBack={() => setCurrentView("customer_menu")}
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
          <AppContent />
        </CustomerAuthProvider>
      </CartProvider>
    </NotificationsProvider>
  );
}

export default App;
