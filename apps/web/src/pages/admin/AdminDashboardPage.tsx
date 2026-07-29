import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiGet } from "../../lib/api";
import { useWebSocket } from "../../lib/websocket";
import {
  ArrowLeft, CheckCircle2, Clock, Settings,
  ShoppingBag, TrendingUp, Utensils, Wallet, XCircle, Calendar
} from "lucide-react";
import { PageTransition } from "../../components/ui/PageTransition";
import { Badge } from "../../components/ui/Badge";

interface AdminDashboardPageProps {
  token: string;
  onBackToOrders: () => void;
  onNavigateToOrders?: () => void;
  onNavigateToMenu?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToHistory?: () => void;
}

const METRIC_CARDS = [
  { key: "totalOrders", label: "Total Orders", icon: ShoppingBag, color: "#4F46E5", bg: "#EEF2FF", suffix: "" },
  { key: "deliveredOrders", label: "Delivered", icon: CheckCircle2, color: "#22C55E", bg: "#DCFCE7", suffix: "" },
  { key: "pendingOrders", label: "Pending", icon: Clock, color: "#D97706", bg: "#FEF3C7", suffix: "" },
  { key: "totalSales", label: "Sales (excl. cancelled)", icon: TrendingUp, color: "#114B36", bg: "#EBF5F0", suffix: "KSh", prefix: true },
  { key: "outstandingBalance", label: "Outstanding", icon: Wallet, color: "#D97706", bg: "#FFFBEB", suffix: "KSh", prefix: true },
  { key: "cancelledOrders", label: "Cancelled", icon: XCircle, color: "#EF4444", bg: "#FEE2E2", suffix: "" },
  { key: "averageOrderValue", label: "Avg Value", icon: TrendingUp, color: "#7C3AED", bg: "#EDE9FE", suffix: "KSh", prefix: true },
];

const ACTIONS = [
  { label: "Orders", icon: ShoppingBag, color: "#4F46E5", bg: "#EEF2FF" },
  { label: "Menu", icon: Utensils, color: "#D97706", bg: "#FEF3C7" },
  { label: "Settings", icon: Settings, color: "#114B36", bg: "#EBF5F0" },
  { label: "History", icon: Calendar, color: "#7C3AED", bg: "#EDE9FE" },
];

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({
  token,
  onBackToOrders,
  onNavigateToOrders,
  onNavigateToMenu,
  onNavigateToSettings,
  onNavigateToHistory,
}) => {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newOrderAlert, setNewOrderAlert] = useState(false);

  useWebSocket("admin", undefined, (event) => {
    if (event.type === "ORDER_CREATED") {
      setNewOrderAlert(true);
      setTimeout(() => setNewOrderAlert(false), 10000);
    }
  });

  const fetchMetrics = async () => {
    setLoading(true);
    const res = await apiGet<any>("/orders/dashboard/metrics", token);
    if (res.success && res.data) {
      setMetrics(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const actionOnClick = (label: string) => {
    switch (label) {
      case "Orders": return onNavigateToOrders ?? onBackToOrders;
      case "Menu": return onNavigateToMenu ?? onBackToOrders;
      case "Settings": return onNavigateToSettings ?? onBackToOrders;
      case "History": return onNavigateToHistory ?? onBackToOrders;
      default: return onBackToOrders;
    }
  };

  return (
    <div className="admin-container">
      <header className="bg-[#114B36] text-white px-4 py-3 sticky top-0 z-40 shadow-[0_2px_8px_rgba(17,75,54,0.15)]">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <button
            onClick={onBackToOrders}
            className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold text-lg">Dashboard</h1>
        </div>
      </header>

      <PageTransition>
        <div className="p-4 max-w-4xl mx-auto">
          {/* Action Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {ACTIONS.map((action, i) => (
              <motion.button
                key={action.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={actionOnClick(action.label)}
                className="flex flex-col items-center justify-center p-5 rounded-2xl gap-2.5 cursor-pointer border-none"
                style={{ background: action.bg, color: action.color }}
              >
                <action.icon size={28} />
                <span className="font-bold text-sm">{action.label}</span>
              </motion.button>
            ))}
          </div>

          {/* Metrics */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg text-[#1F2937]">Today's Metrics</h2>
            <span className="text-xs font-semibold bg-[#E5E7EB] text-[#6B7280] px-3 py-1.5 rounded-full">Today</span>
          </div>

          {loading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-4 border-[#E5E7EB] border-t-[#114B36] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-[#6B7280]">Calculating metrics...</p>
            </div>
          ) : !metrics ? (
            <div className="text-center py-16 text-sm text-[#6B7280]">Failed to load metrics.</div>
          ) : (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                {METRIC_CARDS.map((card, i) => {
                  const value = metrics[card.key];
      const displayValue = value !== undefined && value !== null
                    ? card.prefix ? `KSh ${Number(value).toFixed(2)}` : value
                    : "—";

                  return (
                    <motion.div
                      key={card.key}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.03 }}
                      className="bg-white rounded-2xl p-4 text-center shadow-[0_2px_8px_rgba(17,75,54,0.06)] border border-[#E5E7EB]"
                    >
                      <div className="flex justify-center mb-2">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: card.bg }}>
                          <card.icon size={18} style={{ color: card.color }} />
                        </div>
                      </div>
                      <p className="text-xl font-extrabold" style={{ color: card.color }}>
                        {newOrderAlert && card.key === "totalOrders" && (
                          <span className="inline-block w-2 h-2 bg-[#22C55E] rounded-full animate-pulse mr-1" />
                        )}
                        {displayValue}
                      </p>
                      <p className="text-[0.65rem] text-[#6B7280] font-semibold mt-1 uppercase tracking-wider">{card.label}</p>
                    </motion.div>
                  );
                })}
              </div>

              {/* Top Items */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(17,75,54,0.06)]"
              >
                <h3 className="font-bold text-sm text-[#1F2937] mb-3">Top Ordered Items</h3>
                {metrics.topItems?.length === 0 ? (
                  <p className="text-sm text-[#6B7280]">No item sales recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {metrics.topItems?.map((item: any, idx: number) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between py-2 px-3 rounded-xl bg-[#F9FAFB] border border-[#F3F4F6]"
                      >
                        <span className="font-semibold text-sm text-[#1F2937]">
                          <span className="text-[#9CA3AF] font-normal">{idx + 1}.</span> {item.name}
                        </span>
                        <Badge variant="brand">{item.count} sold</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </div>
      </PageTransition>
    </div>
  );
};
