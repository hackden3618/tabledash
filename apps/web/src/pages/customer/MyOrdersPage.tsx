import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiGet } from "../../lib/api";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { ClipboardList, Package, RefreshCw, ChevronRight, Settings, Wallet } from "lucide-react";
import { Header } from "../../components/ui/Header";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageTransition } from "../../components/ui/PageTransition";

interface MyOrdersPageProps {
  onGoToAuth: () => void;
  onTrackOrder: (orderId: string) => void;
  onGoToProfile?: () => void;
  onNavigateToWallet?: () => void;
}

const TERMINAL_CONFIG: Record<string, { label: string; variant: "success" | "danger" }> = {
  DELIVERED: { label: "✓ Delivered", variant: "success" },
  CANCELLED: { label: "✕ Cancelled", variant: "danger" },
};

export const MyOrdersPage: React.FC<MyOrdersPageProps> = ({ onGoToAuth, onTrackOrder, onGoToProfile, onNavigateToWallet }) => {
  const { customer, isLoggedIn, isLoading, logout, refreshProfile } = useCustomerAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [guestOrders, setGuestOrders] = useState<any[]>([]);
  const [guestOrderId, setGuestOrderId] = useState<string | null>(null);
  const [lastUpdatedId, setLastUpdatedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Hydrate guest orders from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ladha_last_order");
      if (raw) {
        const parsed = JSON.parse(raw);
        setGuestOrders([parsed]);
        setGuestOrderId(parsed.id);
      }
    } catch { /* ignore */ }
  }, []);

  // Keep guest order data fresh by fetching latest. If the order no longer
  // exists (e.g. dev DB reset), drop the stale card instead of persisting it.
  useEffect(() => {
    if (!isLoggedIn && guestOrderId) {
      apiGet<any>(`/orders/${guestOrderId}`).then((res) => {
        if (res.success && res.data) {
          setGuestOrders([res.data]);
          localStorage.setItem("ladha_last_order", JSON.stringify(res.data));
        } else {
          localStorage.removeItem("ladha_last_order");
          setGuestOrders([]);
          setGuestOrderId(null);
        }
      });
    }
  }, [guestOrderId, isLoggedIn]);

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

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.type === "ORDER_STATUS_UPDATED") {
        const updated = detail.payload;
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === updated.id);
          if (exists) return prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o));
          return [updated, ...prev];
        });
        setLastUpdatedId(updated.id);
        setTimeout(() => setLastUpdatedId(null), 3000);
      } else if (detail.type === "ORDER_CREATED") {
        const newOrder = detail.payload;
        setOrders((prev) => {
          if (prev.some((o) => o.id === newOrder.id)) return prev;
          return [newOrder, ...prev];
        });
        setLastUpdatedId(newOrder.id);
        setTimeout(() => setLastUpdatedId(null), 3000);
      }
    };
    window.addEventListener("tabledash:realtime", handler);
    return () => window.removeEventListener("tabledash:realtime", handler);
  }, []);

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

  // Logged-out state — show guest order if available, otherwise prompt sign-in
  if (!isLoggedIn && guestOrders.length === 0) {
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
  const allOrders = isLoggedIn ? orders : [...guestOrders, ...orders.filter((o) => !guestOrders.some((g) => g.id === o.id))];

  return (
    <div className="app-container">
      <Header
        title="My Orders"
        rightAction={isLoggedIn ? (
          <button
            onClick={logout}
            className="px-3 py-1.5 rounded-xl bg-white/15 text-xs font-semibold text-white hover:bg-white/20 transition-colors bg-none border-none cursor-pointer"
          >
            Sign Out
          </button>
        ) : undefined}
      />

      <PageTransition>
        <div className="px-4 py-5">
          {isLoggedIn && (
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
                <div className="flex items-center gap-1.5">
                  {onNavigateToWallet && (
                    <button onClick={onNavigateToWallet}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#114B36] text-xs font-bold text-white border-none cursor-pointer transition-colors hover:bg-[#0D3D2B]"
                    >
                      <Wallet size={13} /> Wallet
                    </button>
                  )}
                  {onGoToProfile && (
                    <button onClick={onGoToProfile}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 text-xs font-bold text-[#114B36] border border-[#C2E2D3] cursor-pointer bg-none transition-colors hover:bg-white"
                    >
                      <Settings size={13} /> Profile
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {!isLoggedIn && guestOrders.length > 0 && (
            <div className="bg-[#FEF3C7] border border-[#FCD34D] rounded-2xl p-3.5 mb-5">
              <p className="text-xs font-semibold text-[#92400E]">Guest session — your order is saved on this device. <button onClick={onGoToAuth} className="underline font-bold bg-none border-none cursor-pointer text-[#92400E]">Sign in</button> to keep it forever.</p>
            </div>
          )}

          {allOrders.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Package size={40} className="text-[#D1D5DB] mb-3" />
              <p className="font-semibold text-[#6B7280]">No orders yet</p>
              <p className="text-sm text-[#9CA3AF]">Your order history will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold text-[#114B36] text-sm">Recent Orders</h2>
                {isLoggedIn && (
                  <button
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EBF5F0] text-xs font-bold text-[#16A34A] border border-[#C2E2D3] cursor-pointer disabled:opacity-50 bg-none transition-colors hover:bg-[#C2E2D3]"
                  >
                    <RefreshCw size={11} className={isRefreshing ? "animate-spin" : ""} />
                    {isRefreshing ? "Syncing..." : "Sync"}
                  </button>
                )}
              </div>

              <AnimateOrders
                orders={allOrders}
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
                <span className={`text-[0.6rem] font-bold px-2.5 py-1 rounded-full ${
                  termCfg.variant === "success" ? "bg-[#DCFCE7] text-[#15803D]" : "bg-[#FEE2E2] text-[#DC2626]"
                }`}>{termCfg.label}</span>
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
