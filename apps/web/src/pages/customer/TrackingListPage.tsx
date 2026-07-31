import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { apiGet } from "../../lib/api";
import { Truck, ChevronRight, Package } from "lucide-react";
import { Header } from "../../components/ui/Header";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageTransition } from "../../components/ui/PageTransition";

interface TrackingListPageProps {
  onTrackOrder: (orderId: string) => void;
  onGoToAuth?: () => void;
  placedOrderId?: string;
}

const ACTIVE_STATUSES = ["NEW", "ACCEPTED", "PREPARING", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY"];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  NEW:                { label: "Order Placed",       color: "#DC2626" },
  ACCEPTED:           { label: "Accepted by Kitchen",color: "#7C3AED" },
  PREPARING:          { label: "Preparing Meal",     color: "#D97706" },
  READY_FOR_DELIVERY: { label: "Ready for Delivery", color: "#1D4ED8" },
  OUT_FOR_DELIVERY:   { label: "Out for Delivery",   color: "#4F46E5" },
};

export const TrackingListPage: React.FC<TrackingListPageProps> = ({ onTrackOrder, onGoToAuth, placedOrderId }) => {
  const { customer, isLoggedIn, isLoading, refreshProfile } = useCustomerAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [guestOrder, setGuestOrder] = useState<any | null>(null);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [lastUpdatedId, setLastUpdatedId] = useState<string | null>(null);

  // Hydrate guest order from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ladha_last_order");
      if (raw) setGuestOrder(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Fetch guest order live data if not logged in. If the order no longer
  // exists (e.g. dev DB reset), drop the stale card instead of persisting it.
  useEffect(() => {
    const orderId = guestOrder?.id || placedOrderId;
    if (!isLoggedIn && orderId) {
      apiGet<any>(`/orders/${orderId}`).then((res) => {
        if (res.success && res.data) {
          setGuestOrder(res.data);
          localStorage.setItem("ladha_last_order", JSON.stringify(res.data));
        } else {
          localStorage.removeItem("ladha_last_order");
          setGuestOrder(null);
        }
      });
    }
  }, [guestOrder?.id, placedOrderId, isLoggedIn]);

  useEffect(() => {
    if (customer?.recentOrders) {
      setOrders(customer.recentOrders);
    }
  }, [customer?.recentOrders]);

  useEffect(() => {
    const fromAccount = orders.filter((o: any) => ACTIVE_STATUSES.includes(o.status));
    const fromGuest = guestOrder && ACTIVE_STATUSES.includes(guestOrder.status) ? [guestOrder] : [];
    const merged = [...fromGuest, ...fromAccount.filter((o) => !fromGuest.some((g) => g.id === o.id))];
    setActiveOrders(merged);
  }, [orders, guestOrder]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.type === "ORDER_STATUS_UPDATED" || detail.type === "ORDER_CREATED") {
        const updated = detail.payload;
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === updated.id);
          if (exists) return prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o));
          return [updated, ...prev];
        });
        setLastUpdatedId(updated.id);
        setTimeout(() => setLastUpdatedId(null), 3000);
        if (detail.type === "ORDER_STATUS_UPDATED") refreshProfile();
      }
    };
    window.addEventListener("tabledash:realtime", handler);
    return () => window.removeEventListener("tabledash:realtime", handler);
  }, [refreshProfile]);

  if (isLoading) {
    return (
      <div className="app-container">
        <Header title="Live Tracker" />
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-[#E5E7EB] border-t-[#114B36] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!isLoggedIn && activeOrders.length === 0) {
    return (
      <div className="app-container">
        <Header title="Live Tracker" />
        <EmptyState
          icon={<Truck size={36} />}
          title="Track your deliveries"
          description="Sign in to see your active deliveries and track them live."
          action={{ label: "Sign In / Create Account", onClick: onGoToAuth || (() => window.location.href = "/") }}
        />
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header title="Live Tracker" />

      <PageTransition>
        <div className="px-4 py-5">
          {activeOrders.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Package size={48} className="text-[#D1D5DB] mb-4" />
              <p className="font-bold text-base text-[#6B7280]">No active deliveries</p>
              <p className="text-sm text-[#9CA3AF] mt-1">Your ongoing deliveries will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-bold text-[#114B36] uppercase tracking-wider">
                {activeOrders.length} Active {activeOrders.length === 1 ? "Delivery" : "Deliveries"}
              </p>

              {activeOrders.map((order: any, idx: number) => {
                const cfg = STATUS_LABELS[order.status] || { label: order.status, color: "#6B7280" };
                const justUpdated = lastUpdatedId === order.id;

                return (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onTrackOrder(order.id)}
                    className={`
                      p-4 bg-white rounded-2xl cursor-pointer transition-all duration-200
                      shadow-[0_2px_8px_rgba(17,75,54,0.06)] hover:shadow-[0_8px_24px_rgba(17,75,54,0.1)]
                      ${justUpdated ? "ring-2 ring-[#22C55E] ring-offset-2" : ""}
                    `}
                  >
                    <div className="flex items-start justify-between mb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-[#1F2937]">Order #{order.orderNumber}</p>
                          {justUpdated && (
                            <span className="text-[0.55rem] font-bold bg-[#DCFCE7] text-[#15803D] px-2 py-0.5 rounded-full">
                              Updated!
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#9CA3AF] mt-0.5">
                          {new Date(order.orderedAt).toLocaleDateString("en-KE", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0"
                        style={{ backgroundColor: `${cfg.color}15`, color: cfg.color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: cfg.color }} />
                        {cfg.label}
                      </span>
                    </div>

                    <div className="border-t border-[#F3F4F6] pt-2.5 flex items-center justify-between">
                      <span className="text-xs text-[#6B7280]">{order.orderItems?.length ?? 0} item(s)</span>
                      <span className="font-bold text-sm text-[#114B36]">KSh {order.totalAmount}</span>
                    </div>

                    <div className="mt-2 flex items-center justify-end">
                      <span className="text-xs font-semibold text-[#114B36] flex items-center gap-0.5">
                        Track live <ChevronRight size={12} />
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </PageTransition>
    </div>
  );
};
