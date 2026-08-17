import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, apiPatch } from "../../lib/api";
import { useNotifications } from "../../context/NotificationsContext";
import { AdminNotificationBell, AdminNotificationPanel } from "../../components/AdminNotificationPanel";
import { LogOut, ShoppingBag, MapPin, Phone, ChevronRight, UtensilsCrossed } from "lucide-react";
import { StatusBadge } from "../../components/ui/Badge";
import { formatOrderLocation } from "../../lib/orderLocation";

interface AdminOrdersPageProps {
  token: string;
  onSelectOrder: (order: any) => void;
  onLogout: () => void;
  onOpenPendingCollection: () => void;
}

const TAB_CONFIG = {
  NEW: { label: "New", color: "#DC2626", bg: "#FEE2E2" },
  PREPARING: { label: "Preparing", color: "#D97706", bg: "#FEF3C7" },
  OUT_FOR_DELIVERY: { label: "Out for Delivery", color: "#4F46E5", bg: "#E0E7FF" },
};

export const AdminOrdersPage: React.FC<AdminOrdersPageProps> = ({
  token,
  onSelectOrder,
  onLogout,
  onOpenPendingCollection,
}) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"NEW" | "PREPARING" | "OUT_FOR_DELIVERY">("NEW");
  const [panelOpen, setPanelOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
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
    const fetchPendingCount = async () => {
      const res = await apiGet<any[]>("/orders/pending-collection", token);
      if (res.success && res.data) setPendingCount(res.data.length);
    };
    void fetchPendingCount();
  }, [token]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const msg = detail as { type: string; payload: any };
      if (msg.type === "ORDER_CREATED") {
        const order = msg.payload;
        setOrders((prev) => [order, ...prev]);
        pushNotification(
          "info",
          `🛎 New Order #${order.orderNumber}`,
          `${order.customer?.firstName} (${order.customer?.phone}) ordered ${order.orderItems?.map((it: any) => `${it.quantity}× ${it.name}`).join(", ")} — KSh ${order.totalAmount}`
        );
      } else if (msg.type === "ORDER_STATUS_UPDATED") {
        const updated = msg.payload;
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
        const statusLabels: Record<string, string> = {
          ACCEPTED: "Accepted by Kitchen",
          PREPARING: "Now Preparing",
          READY_FOR_DELIVERY: "Ready for Delivery",
          OUT_FOR_DELIVERY: "Out for Delivery",
          DELIVERED: "Delivered",
          CANCELLED: "Cancelled",
        };
        const label = statusLabels[updated.status] ?? updated.status;
        pushNotification(
          updated.status === "CANCELLED" ? "danger" : updated.status === "DELIVERED" ? "success" : "info",
          `Order #${updated.orderNumber} — ${label}`,
          `Customer: ${updated.customer?.firstName} · KSh ${updated.totalAmount} · ${updated.marketSection || "—"}`
        );
      } else if (msg.type === "ORDER_BOUNCED") {
        const b = msg.payload;
        const reason = b.reason === "out_of_stock"
          ? `Only ${b.availableQty} portion(s) available, customer requested ${b.requestedQty}`
          : "Item is currently marked unavailable";
        pushNotification("danger", `⚠️ Order Bounced — ${b.productName}`, `Customer ${b.customerName} (${b.customerPhone}) could not order. Reason: ${reason}. Restock or mark item available.`, { duration: 9000 });
      }
    };
    window.addEventListener("ladha:realtime", handler);
    return () => window.removeEventListener("ladha:realtime", handler);
  }, [pushNotification]);

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
      {/* Header */}
      <header className="bg-[#114B36] text-white px-4 py-3 sticky top-0 z-40 shadow-[0_2px_8px_rgba(17,75,54,0.15)]">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <h1 className="font-bold text-lg flex items-center gap-2">
            <ShoppingBag size={20} /> Orders
          </h1>
          <div className="flex items-center gap-2">
            <AdminNotificationBell onClick={() => setPanelOpen(true)} />
            <button
              onClick={onLogout}
              className="px-3 py-1.5 rounded-xl bg-white/15 text-xs font-semibold text-white hover:bg-white/25 transition-colors flex items-center gap-1.5 bg-none border-none cursor-pointer"
            >
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
      </header>

      <div className="p-4 max-w-4xl mx-auto">
        {/* Pending Collection entry — payment + utensil follow-ups after delivery */}
        <button
          onClick={onOpenPendingCollection}
          className="w-full flex items-center justify-between bg-[#FEF3C7] border border-amber-200 rounded-xl px-4 py-3 mb-4 text-left hover:bg-[#FDE68A] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2.5 text-sm font-bold text-[#92400E]">
            <UtensilsCrossed size={16} />
            Pending Collection
          </span>
          <span className="flex items-center gap-2">
            {pendingCount > 0 && (
              <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-[#DC2626] text-white">
                {pendingCount} open
              </span>
            )}
            <ChevronRight size={16} className="text-[#92400E]" />
          </span>
        </button>

        {/* Status Tabs */}
        <div className="flex gap-2 bg-[#F3F4F6] p-1 rounded-xl mb-5">
          {(["NEW", "PREPARING", "OUT_FOR_DELIVERY"] as const).map((key) => {
            const cfg = TAB_CONFIG[key];
            const count = key === "NEW" ? countNew : key === "PREPARING" ? countPreparing : countOut;
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`
                  flex-1 py-2.5 rounded-lg font-bold text-sm transition-all duration-200
                  flex items-center justify-center gap-2 bg-none border-none cursor-pointer
                  ${isActive ? "bg-white text-[#114B36] shadow-sm" : "text-[#6B7280] hover:text-[#1F2937]"}
                `}
              >
                <span>{cfg.label}</span>
                <span className={`
                  px-2 py-0.5 rounded-full text-xs font-bold
                  ${isActive ? "bg-[#114B36] text-white" : "bg-[#D1D5DB] text-[#6B7280]"}
                `}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Orders */}
        {loading ? (
          <div className="text-center py-16">
            <div className="w-10 h-10 border-4 border-[#E5E7EB] border-t-[#114B36] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-[#6B7280]">Loading orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag size={48} className="text-[#D1D5DB] mx-auto mb-3" />
            <p className="font-semibold text-[#6B7280]">No {activeTab.toLowerCase().replace(/_/g, " ")} orders</p>
            <p className="text-sm text-[#9CA3AF] mt-1">
              {activeTab === "NEW" ? "New orders will appear here" : "Orders will move here as they're updated"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredOrders.map((ord, idx) => (
              <motion.div
                key={ord.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                whileHover={{ y: -2 }}
                onClick={() => onSelectOrder(ord)}
                className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(17,75,54,0.06)] hover:shadow-[0_8px_24px_rgba(17,75,54,0.1)] cursor-pointer transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-2.5">
                  <div>
                    <span className="font-extrabold text-lg text-[#114B36]">#{ord.orderNumber}</span>
                    <span className="text-xs text-[#6B7280] ml-2">
                      {new Date(ord.orderedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <StatusBadge status={ord.status} />
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-[#EBF5F0] flex items-center justify-center text-[#114B36] font-bold text-sm shrink-0">
                    {ord.customer?.firstName?.[0] || "?"}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-[#1F2937]">{ord.customer?.firstName}</p>
                    <p className="text-xs text-[#6B7280] flex items-center gap-1">
                      <Phone size={10} /> {ord.customer?.phone}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-[#4B5563] line-clamp-2 mb-3">
                  {ord.orderItems?.map((it: any) => `${it.quantity}× ${it.name}`).join(", ")}
                </p>

                <div className="flex items-start gap-1.5 text-xs text-[#6B7280] mb-3">
                  <MapPin size={12} className="mt-0.5 shrink-0" />
                  <span>{formatOrderLocation(ord)}</span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#F3F4F6]">
                  <span className="font-extrabold text-base text-[#114B36]">KSh {ord.totalAmount}</span>
                  <div className="flex gap-2">
                    {ord.status === "NEW" && (
                      <button
                        onClick={(e) => handleAcceptOrder(ord.id, e)}
                        className="px-4 py-1.5 rounded-xl bg-[#114B36] text-white text-xs font-bold hover:bg-[#0D3D2B] transition-colors bg-none border-none cursor-pointer"
                      >
                        Accept
                      </button>
                    )}
                    <span className="text-[#114B36] text-xs font-semibold flex items-center gap-0.5">
                      View <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AdminNotificationPanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
};
