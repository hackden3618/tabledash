/**
 * Purpose: Admin Orders Management Dashboard for tableDash.
 * Responsibilities: Displays categorized order tabs (New, Preparing, Out for Delivery), renders order cards with quick Accept/View triggers, and listens to real-time WS order alerts.
 * Dependencies: React, apiGet helper, apiPatch helper, useWebSocket hook.
 * When to modify: When changing status tab filters or order card action buttons.
 */

import React, { useEffect, useState } from "react";
import { apiGet, apiPatch } from "../../lib/api";
import { useWebSocket } from "../../lib/websocket";

interface AdminOrdersPageProps {
  token: string;
  onSelectOrder: (order: any) => void;
  onNavigateDashboard: () => void;
  onNavigateMenuManage: () => void;
  onLogout: () => void;
}

export const AdminOrdersPage: React.FC<AdminOrdersPageProps> = ({
  token,
  onSelectOrder,
  onNavigateDashboard,
  onNavigateMenuManage,
  onLogout,
}) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"NEW" | "PREPARING" | "OUT_FOR_DELIVERY">("NEW");

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

  // Connect WebSocket to receive live admin broadcasts
  useWebSocket("admin", undefined, (event) => {
    if (event.type === "ORDER_CREATED") {
      setOrders((prev) => [event.payload, ...prev]);
    } else if (event.type === "ORDER_STATUS_UPDATED") {
      const updatedOrder = event.payload as any;
      setOrders((prev) =>
        prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
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

  return (
    <div className="admin-container">
      {/* Admin Header */}
      <header className="header-bar">
        <div className="header-title">📋 Orders Management</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onNavigateDashboard}
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "white",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Dashboard
          </button>          <button
            onClick={onNavigateMenuManage}
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "white",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Menu
          </button>
          <button
            onClick={onLogout}
            style={{
              background: "rgba(239,68,68,0.3)",
              border: "none",
              color: "white",
              padding: "6px 10px",
              borderRadius: "6px",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ padding: "20px" }}>
        {/* Status Tabs */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            background: "#F3F4F6",
            padding: "4px",
            borderRadius: "12px",
            marginBottom: "20px",
          }}
        >
          <button
            onClick={() => setActiveTab("NEW")}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "8px",
              border: "none",
              background: activeTab === "NEW" ? "#FFFFFF" : "transparent",
              color: activeTab === "NEW" ? "#1E4D36" : "#6B7280",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              boxShadow: activeTab === "NEW" ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
            }}
          >
            New ({countNew})
          </button>
          <button
            onClick={() => setActiveTab("PREPARING")}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "8px",
              border: "none",
              background: activeTab === "PREPARING" ? "#FFFFFF" : "transparent",
              color: activeTab === "PREPARING" ? "#1E4D36" : "#6B7280",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              boxShadow: activeTab === "PREPARING" ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
            }}
          >
            Preparing ({countPreparing})
          </button>
          <button
            onClick={() => setActiveTab("OUT_FOR_DELIVERY")}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "8px",
              border: "none",
              background: activeTab === "OUT_FOR_DELIVERY" ? "#FFFFFF" : "transparent",
              color: activeTab === "OUT_FOR_DELIVERY" ? "#1E4D36" : "#6B7280",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              boxShadow: activeTab === "OUT_FOR_DELIVERY" ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
            }}
          >
            Out ({countOut})
          </button>
        </div>

        {/* Orders Cards List */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>
            Loading incoming orders...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>
            No orders in this status right now.
          </div>
        ) : (
          <div className="admin-orders-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
            {filteredOrders.map((ord) => (
              <div
                key={ord.id}
                onClick={() => onSelectOrder(ord)}
                className="card"
                style={{ cursor: "pointer", position: "relative" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: "1.05rem", color: "#1E4D36" }}>
                      #{ord.orderNumber}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#6B7280", marginLeft: "8px" }}>
                      {new Date(ord.orderedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <span
                    className={`badge ${
                      ord.status === "NEW"
                        ? "badge-new"
                        : ord.status === "PREPARING"
                        ? "badge-preparing"
                        : ord.status === "OUT_FOR_DELIVERY"
                        ? "badge-out"
                        : "badge-delivered"
                    }`}
                  >
                    {ord.status}
                  </span>
                </div>

                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1F2937" }}>
                  {ord.customer?.firstName} ({ord.customer?.phone})
                </div>

                <div style={{ fontSize: "0.85rem", color: "#4B5563", marginTop: "4px" }}>
                  {ord.orderItems?.map((it: any) => `${it.quantity}x ${it.name}`).join(", ")}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "#6B7280", marginTop: "8px" }}>
                  📍 <span>{ord.marketSection} — {ord.locationDescription}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", paddingTop: "8px", borderTop: "1px solid #F3F4F6" }}>
                  <span style={{ fontWeight: 800, fontSize: "1rem", color: "#1F2937" }}>
                    Total: KSh {ord.totalAmount}
                  </span>

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
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectOrder(ord);
                      }}
                      className="btn btn-secondary"
                      style={{ padding: "6px 14px", fontSize: "0.85rem" }}
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
