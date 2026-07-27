/**
 * Purpose: Admin Orders Management Dashboard for tableDash.
 * Responsibilities: Displays categorized order tabs (New, Preparing, Out for Delivery),
 *   renders order cards with quick Accept/View triggers, listens to real-time WS order alerts,
 *   and shows meaningful in-app notifications for ORDER_CREATED, ORDER_STATUS_UPDATED,
 *   ORDER_BOUNCED events via the notification panel.
 * Dependencies: React, apiGet/apiPatch helpers, useWebSocket, NotificationsContext.
 * When to modify: When changing status tab filters or order card action buttons.
 */

import React, { useEffect, useState } from "react";
import { apiGet, apiPatch } from "../../lib/api";
import { useWebSocket } from "../../lib/websocket";
import { useNotifications } from "../../context/NotificationsContext";
import { AdminNotificationBell, AdminNotificationPanel } from "../../components/AdminNotificationPanel";
import { LogOut } from "lucide-react";

interface AdminOrdersPageProps {
  token: string;
  onSelectOrder: (order: any) => void;
  onLogout: () => void;
}

export const AdminOrdersPage: React.FC<AdminOrdersPageProps> = ({
  token,
  onSelectOrder,
  onLogout,
}) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"NEW" | "PREPARING" | "OUT_FOR_DELIVERY">("NEW");
  const [panelOpen, setPanelOpen] = useState(false);
  const { pushNotification } = useNotifications();

  const fetchOrders = async () => {
    const res = await apiGet<any[]>("/orders", token);
    if (res.success && res.data) {
      setOrders(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Connect WebSocket for live admin broadcasts
  useWebSocket("admin", undefined, (event: any) => {
    if (event.type === "ORDER_CREATED") {
      const order = event.payload as any;
      setOrders((prev) => [order, ...prev]);
      pushNotification(
        "info",
        `🛎 New Order #${order.orderNumber}`,
        `${order.customer?.firstName} (${order.customer?.phone}) ordered ${
          order.orderItems?.map((it: any) => `${it.quantity}× ${it.name}`).join(", ")
        } — KSh ${order.totalAmount}`
      );

    } else if (event.type === "ORDER_STATUS_UPDATED") {
      const updated = event.payload as any;
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));

      const statusLabels: Record<string, string> = {
        ACCEPTED:           "Accepted by Kitchen",
        PREPARING:          "Now Preparing",
        READY_FOR_DELIVERY: "Ready for Delivery",
        OUT_FOR_DELIVERY:   "Out for Delivery",
        DELIVERED:          "Delivered",
        CANCELLED:          "Cancelled",
      };
      const label = statusLabels[updated.status] ?? updated.status;
      pushNotification(
        updated.status === "CANCELLED" ? "danger" : updated.status === "DELIVERED" ? "success" : "info",
        `Order #${updated.orderNumber} — ${label}`,
        `Customer: ${updated.customer?.firstName} · KSh ${updated.totalAmount} · ${updated.marketSection || "—"}`
      );

    } else if (event.type === "ORDER_BOUNCED") {
      const b = (event.payload as any);
      const reason = b.reason === "out_of_stock"
        ? `Only ${b.availableQty} portion(s) available, customer requested ${b.requestedQty}`
        : "Item is currently marked unavailable";
      pushNotification(
        "danger",
        `⚠️ Order Bounced — ${b.productName}`,
        `Customer ${b.customerName} (${b.customerPhone}) could not order. Reason: ${reason}. Restock or mark item available.`,
        { duration: 9000 }
      );
    }
  });

  const handleAcceptOrder = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await apiPatch<any>(`/orders/${orderId}/status`, { status: "ACCEPTED" }, token);
    if (res.success && res.data) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data : o)));
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (activeTab === "NEW") return o.status === "NEW" || o.status === "ACCEPTED";
    if (activeTab === "PREPARING") return o.status === "PREPARING" || o.status === "READY_FOR_DELIVERY";
    if (activeTab === "OUT_FOR_DELIVERY") return o.status === "OUT_FOR_DELIVERY";
    return true;
  });

  const countNew = orders.filter((o) => o.status === "NEW" || o.status === "ACCEPTED").length;
  const countPreparing = orders.filter((o) => o.status === "PREPARING" || o.status === "READY_FOR_DELIVERY").length;
  const countOut = orders.filter((o) => o.status === "OUT_FOR_DELIVERY").length;

  const STATUS_BADGE_COLORS: Record<string, { bg: string; color: string }> = {
    NEW:                { bg: "#FEE2E2", color: "#DC2626" },
    ACCEPTED:           { bg: "#EDE9FE", color: "#7C3AED" },
    PREPARING:          { bg: "#FEF3C7", color: "#D97706" },
    READY_FOR_DELIVERY: { bg: "#DBEAFE", color: "#1D4ED8" },
    OUT_FOR_DELIVERY:   { bg: "#E0E7FF", color: "#4F46E5" },
    DELIVERED:          { bg: "#DCFCE7", color: "#15803D" },
    CANCELLED:          { bg: "#F3F4F6", color: "#6B7280" },
  };

  return (
    <div className="admin-container">
      {/* Admin Header */}
      <header className="header-bar">
        <div className="header-title" style={{ fontSize: "1.1rem" }}>Orders</div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <AdminNotificationBell onClick={() => setPanelOpen(true)} />
          <button
            onClick={onLogout}
            title="Logout"
            style={{ background: "rgba(239,68,68,0.3)", border: "none", color: "white", padding: "6px 10px", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ padding: "20px" }}>
        {/* Status Tabs */}
        <div style={{ display: "flex", gap: "8px", background: "#F3F4F6", padding: "4px", borderRadius: "12px", marginBottom: "20px" }}>
          {[
            { key: "NEW", label: "New", count: countNew },
            { key: "PREPARING", label: "Preparing", count: countPreparing },
            { key: "OUT_FOR_DELIVERY", label: "Out", count: countOut },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                flex: 1, padding: "10px", borderRadius: "8px", border: "none",
                background: activeTab === tab.key ? "#FFFFFF" : "transparent",
                color: activeTab === tab.key ? "#1E4D36" : "#6B7280",
                fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
                boxShadow: activeTab === tab.key ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
                transition: "all 0.15s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span style={{ background: activeTab === tab.key ? "#1E4D36" : "#D1D5DB", color: activeTab === tab.key ? "white" : "#6B7280", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 800, padding: "1px 6px" }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Orders Cards List */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>Loading incoming orders...</div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>
            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📭</div>
            {activeTab === "NEW"
              ? "There are currently no new orders."
              : activeTab === "PREPARING"
                ? "There are currently no orders being prepared."
                : "There are currently no orders out for delivery."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
            {filteredOrders.map((ord) => {
              const badge = STATUS_BADGE_COLORS[ord.status] ?? STATUS_BADGE_COLORS["NEW"]!;
              return (
                <div
                  key={ord.id}
                  onClick={() => onSelectOrder(ord)}
                  className="card"
                  style={{ cursor: "pointer", position: "relative", transition: "all 0.18s" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "flex-start" }}>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: "1.05rem", color: "#1E4D36" }}>#{ord.orderNumber}</span>
                      <span style={{ fontSize: "0.75rem", color: "#6B7280", marginLeft: "8px" }}>
                        {new Date(ord.orderedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <span style={{ background: badge.bg, color: badge.color, borderRadius: "8px", padding: "3px 10px", fontWeight: 700, fontSize: "0.73rem" }}>
                      {ord.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1F2937" }}>
                    {ord.customer?.firstName} ({ord.customer?.phone})
                  </div>

                  <div style={{ fontSize: "0.85rem", color: "#4B5563", marginTop: "4px" }}>
                    {ord.orderItems?.map((it: any) => `${it.quantity}× ${it.name}`).join(", ")}
                  </div>

                  <div style={{ fontSize: "0.8rem", color: "#6B7280", marginTop: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                    📍 {ord.marketSection} — {ord.locationDescription}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", paddingTop: "8px", borderTop: "1px solid #F3F4F6" }}>
                    <span style={{ fontWeight: 800, fontSize: "1rem", color: "#1F2937" }}>KSh {ord.totalAmount}</span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {ord.status === "NEW" && (
                        <button
                          onClick={(e) => handleAcceptOrder(ord.id, e)}
                          className="btn btn-primary"
                          style={{ padding: "6px 14px", fontSize: "0.85rem" }}
                        >
                          Accept
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectOrder(ord); }}
                        className="btn btn-secondary"
                        style={{ padding: "6px 14px", fontSize: "0.85rem" }}
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notification Panel */}
      <AdminNotificationPanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
};
