/**
 * Purpose: Main React Application Container and Navigation Router for Ladha.
 * Responsibilities: Wraps application in CartProvider + CustomerAuthProvider + NotificationsProvider contexts,
 *   manages active page view transitions, and handles admin session tokens.
 * Dependencies: CartProvider, CustomerAuthProvider, NotificationsProvider, NotificationToastContainer, customer pages, admin pages.
 * When to modify: When adding new application views or changing top-level route flows.
 */

import { useEffect, useState } from "react";
import { CartProvider } from "./context/CartContext";
import { CustomerAuthProvider } from "./context/CustomerAuthContext";
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
  | "customer_tracker_list"
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
  const { toasts, dismissToast, setScope, clearScope } = useNotifications();
  const { token: adminToken, isLoggedIn: isAdminLoggedIn, hydrating: adminHydrating, login: adminLogin, logout: adminLogout } = useAdminAuth();
  usePlatformAdminAuth();

  const [currentView, setCurrentView] = useState<ViewState>(() => {
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

  // Listen for URL changes (pop state / back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === "/kitchen") {
        setCurrentView(isAdminLoggedIn ? "admin_orders" : "admin_login");
      } else if (path === "/platform") {
        setCurrentView("platform_admin");
      } else if (currentView.startsWith("admin_") || currentView === "platform_admin") {
        setCurrentView("customer_menu");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isAdminLoggedIn, currentView]);

  const isCustomerView = currentView.startsWith("customer_");
  const isAdminView = currentView.startsWith("admin_");

  const getAdminTab = (): AdminTab => {
    switch (currentView) {
      case "admin_dashboard": return "dashboard";
      case "admin_menu_manage": return "menu";
      case "admin_settings": return "settings";
      case "admin_order_history": return "history";
      default: return "orders";
    }
  };

  const handleAdminTab = (tab: AdminTab) => {
    if (tab === "orders") setCurrentView("admin_orders");
    else if (tab === "dashboard") setCurrentView("admin_dashboard");
    else if (tab === "menu") setCurrentView("admin_menu_manage");
    else if (tab === "settings") setCurrentView("admin_settings");
    else if (tab === "history") setCurrentView("admin_order_history");
  };

  const getActiveTab = (): CustomerTab => {
    if (currentView === "customer_cart") return "cart";
    if (currentView === "customer_tracker_list" || currentView === "customer_tracking" || currentView === "customer_confirmation") return "tracking";
    if (currentView === "customer_auth" || currentView === "customer_my_orders" || currentView === "customer_profile") return "account";
    return "menu";
  };

  const handleSelectTab = (tab: CustomerTab) => {
    if (tab === "menu") setCurrentView("customer_menu");
    if (tab === "cart") setCurrentView("customer_cart");
    if (tab === "tracking") setCurrentView("customer_tracker_list");
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
          onGoToProfile={() => setCurrentView("customer_profile")}
        />
      )}

      {currentView === "customer_profile" && (
        <CustomerProfilePage
          onBack={() => setCurrentView("customer_my_orders")}
        />
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
          onNavigateToOrders={() => setCurrentView("admin_orders")}
          onNavigateToMenu={() => setCurrentView("admin_menu_manage")}
          onNavigateToSettings={() => setCurrentView("admin_settings")}
          onNavigateToHistory={() => setCurrentView("admin_order_history")}
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
