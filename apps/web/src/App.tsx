/**
 * Purpose: Main React Application Container and Navigation Router for tableDash.
 * Responsibilities: Wraps application in CartProvider context, manages active page view transitions, and handles admin session tokens.
 * Dependencies: CartProvider, customer pages, admin pages.
 * When to modify: When adding new application views or changing top-level route flows.
 */

import { useState } from "react";
import { CartProvider } from "./context/CartContext";

// Customer Views
import { CartPage } from "./pages/customer/CartPage";
import { ConfirmationPage } from "./pages/customer/ConfirmationPage";
import { LocationPage } from "./pages/customer/LocationPage";
import { MenuListPage } from "./pages/customer/MenuListPage";
import { OrderTrackingPage } from "./pages/customer/OrderTrackingPage";

// Admin Views
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminMapViewPage } from "./pages/admin/AdminMapViewPage";
import { AdminMenuManagePage } from "./pages/admin/AdminMenuManagePage";
import { AdminOrderDetailsPage } from "./pages/admin/AdminOrderDetailsPage";
import { AdminOrdersPage } from "./pages/admin/AdminOrdersPage";

type ViewState =
  | "customer_menu"
  | "customer_cart"
  | "customer_location"
  | "customer_confirmation"
  | "customer_tracking"
  | "admin_login"
  | "admin_orders"
  | "admin_order_details"
  | "admin_map_view"
  | "admin_dashboard"
  | "admin_menu_manage";

export function AppContent() {
  const [currentView, setCurrentView] = useState<ViewState>("customer_menu");

  // State data for active flows
  const [placedOrder, setPlacedOrder] = useState<any>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string>("");
  const [selectedAdminOrder, setSelectedAdminOrder] = useState<any>(null);

  // Admin Auth State
  const [adminToken, setAdminToken] = useState<string>(
    () => localStorage.getItem("tableDash_token") || ""
  );

  return (
    <>
      {/* Customer Application Flow */}
      {currentView === "customer_menu" && (
        <MenuListPage
          onNavigateToCart={() => setCurrentView("customer_cart")}
          onNavigateToAdminLogin={() => {
            if (adminToken) {
              setCurrentView("admin_orders");
            } else {
              setCurrentView("admin_login");
            }
          }}
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
            setPlacedOrder(order);
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

      {/* Admin Management Application Flow */}
      {currentView === "admin_login" && (
        <AdminLoginPage
          onLoginSuccess={(token) => {
            setAdminToken(token);
            setCurrentView("admin_orders");
          }}
          onBackToCustomer={() => setCurrentView("customer_menu")}
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
    </>
  );
}

export function App() {
  return (
    <CartProvider>
      <AppContent />
    </CartProvider>
  );
}

export default App;
