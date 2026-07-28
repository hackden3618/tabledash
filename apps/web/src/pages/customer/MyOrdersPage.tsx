import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useWebSocket } from "../../lib/websocket";
import { ClipboardList, Package, RefreshCw, ChevronRight, Settings } from "lucide-react";
import { Header } from "../../components/ui/Header";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageTransition } from "../../components/ui/PageTransition";

interface MyOrdersPageProps {
  onGoToAuth: () => void;
  onTrackOrder: (orderId: string) => void;
  onGoToProfile?: () => void;
}

const TERMINAL_CONFIG: Record<string, { label: string; variant: "success" | "danger" }> = {
  DELIVERED: { label: "✓ Delivered", variant: "success" },
  CANCELLED: { label: "✕ Cancelled", variant: "danger" },
};

export const MyOrdersPage: React.FC<MyOrdersPageProps> = ({ onGoToAuth, onTrackOrder, onGoToProfile }) => {
  const { customer, isLoggedIn, isLoading, logout, refreshProfile } = useCustomerAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [lastUpdatedId, setLastUpdatedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (customer?.recentOrders) {
      setOrders(customer.recentOrders);
    }
  }, [customer?.recentOrders]);

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshProfile();
    } catch (err) {
      console.error("Failed to manually refresh profile:", err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  useWebSocket("customer", undefined, (event) => {
    if (event.type === "ORDER_STATUS_UPDATED") {
      const updated = event.payload as any;
      setOrders((prev) => {
        const exists = prev.some((o) => o.id === updated.id);
        if (exists) return prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o));
        return [updated, ...prev];
      });
      setLastUpdatedId(updated.id);
      setTimeout(() => setLastUpdatedId(null), 3000);
    } else if (event.type === "ORDER_CREATED") {
      const newOrder = event.payload as any;
      setOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });
      setLastUpdatedId(newOrder.id);
      setTimeout(() => setLastUpdatedId(null), 3000);
    }
  });

  if (isLoading) {
    return (
      <div className="app-container">
        <Header title="My Orders" />
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-[#E5E7EB] border-t-[#114B36] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Logged-out state
  if (!isLoggedIn) {
    return (
      <div className="app-container">
        <Header title="My Orders" />
        <EmptyState
          icon={<ClipboardList size={36} />}
          title="Track your orders"
          description="Sign in or create a free account to see your order history and have your delivery location saved for next time."
          action={{ label: "Sign In / Create Account", onClick: onGoToAuth }}
        />
      </div>
    );
  }

  // Logged-in state
  return (
    <div className="app-container">
      <Header
        title="My Orders"
        rightAction={
          <button
            onClick={logout}
            className="px-3 py-1.5 rounded-xl bg-white/15 text-xs font-semibold text-white hover:bg-white/20 transition-colors bg-none border-none cursor-pointer"
          >
            Sign Out
          </button>
        }
      />

      <PageTransition>
        <div className="px-4 py-5">
          {/* Welcome strip */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#EBF5F0] rounded-2xl p-4 mb-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#114B36] flex items-center justify-center text-white font-bold text-base shrink-0">
                {customer?.firstName?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-[#1F2937]">Hi, {customer?.firstName}!</p>
                <p className="text-xs text-[#6B7280]">{customer?.phone}</p>
              </div>
              {onGoToProfile && (
                <button onClick={onGoToProfile}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 text-xs font-bold text-[#114B36] border border-[#C2E2D3] cursor-pointer bg-none transition-colors hover:bg-white"
                >
                  <Settings size={13} /> Profile
                </button>
              )}
            </div>
          </motion.div>

          {orders.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Package size={40} className="text-[#D1D5DB] mb-3" />
              <p className="font-semibold text-[#6B7280]">No orders yet</p>
              <p className="text-sm text-[#9CA3AF]">Your order history will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-[#114B36] text-sm">Recent Orders</h2>
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EBF5F0] text-xs font-bold text-[#16A34A] border border-[#C2E2D3] cursor-pointer disabled:opacity-50 bg-none transition-colors hover:bg-[#C2E2D3]"
                >
                  <RefreshCw size={11} className={isRefreshing ? "animate-spin" : ""} />
                  {isRefreshing ? "Syncing..." : "Sync"}
                </button>
              </div>

              <AnimateOrders
                orders={orders}
                lastUpdatedId={lastUpdatedId}
                onTrackOrder={onTrackOrder}
                terminalConfig={TERMINAL_CONFIG}
              />
            </div>
          )}
        </div>
      </PageTransition>
    </div>
  );
};

function AnimateOrders({
  orders,
  lastUpdatedId,
  onTrackOrder,
  terminalConfig,
}: {
  orders: any[];
  lastUpdatedId: string | null;
  onTrackOrder: (id: string) => void;
  terminalConfig: Record<string, { label: string; variant: "success" | "danger" }>;
}) {
  return (
    <>
      {orders.map((order: any, idx: number) => {
        const isTerminal = order.status === "DELIVERED" || order.status === "CANCELLED";
        const termCfg = terminalConfig[order.status];
        const justUpdated = lastUpdatedId === order.id;

        return (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.03 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
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
                    <span className="text-[0.6rem] font-bold bg-[#DCFCE7] text-[#15803D] px-2 py-0.5 rounded-full">
                      Just updated!
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  {new Date(order.orderedAt).toLocaleDateString("en-KE", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>

              {isTerminal && termCfg ? (
                <Badge variant={termCfg.variant}>{termCfg.label}</Badge>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FEF3C7] text-[#D97706] rounded-lg text-xs font-bold">
                  <span className="w-1.5 h-1.5 bg-[#F59E0B] rounded-full animate-pulse" />
                  In Progress
                </span>
              )}
            </div>

            <div className="border-t border-[#F3F4F6] pt-2.5 flex items-center justify-between">
              <span className="text-xs text-[#6B7280]">{order.orderItems?.length ?? 0} item(s)</span>
              <span className="font-bold text-sm text-[#114B36]">KSh {order.totalAmount}</span>
            </div>

            <div className="mt-2 flex items-center justify-end">
              <span className="text-xs font-semibold text-[#114B36] flex items-center gap-0.5">
                {!isTerminal ? "Track live" : "View details"} <ChevronRight size={12} />
              </span>
            </div>
          </motion.div>
        );
      })}
    </>
  );
}
