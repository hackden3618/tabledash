import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiGet } from "../../lib/api";
import {
  CheckCircle2, Clock, Settings,
  ShoppingBag, TrendingUp, Utensils, Wallet, XCircle, Calendar, BarChart3
} from "lucide-react";
import { PageTransition } from "../../components/ui/PageTransition";
import { Badge } from "../../components/ui/Badge";

interface AdminDashboardPageProps {
  token: string;
  onBackToOrders?: () => void;
  onNavigateToOrders?: () => void;
  onNavigateToMenu?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToHistory?: () => void;
  onNavigateToFinance?: () => void;
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
  { label: "Finance", icon: BarChart3, color: "#15803D", bg: "#DCFCE7" },
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
  onNavigateToFinance,
}) => {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newOrderAlert, setNewOrderAlert] = useState(false);
  const [range, setRange] = useState<"all" | "this-month" | "last-month" | "custom">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const monthRange = (offset: number) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { startDate: format(start), endDate: format(end) };
  };

  const effectiveRange = () => range === "this-month" ? monthRange(0) : range === "last-month" ? monthRange(-1) : range === "custom" ? { startDate, endDate } : {};
  const rangeLabel = () => {
    if (range === "all") return "All time";
    const dates = effectiveRange();
    if (range === "this-month") return new Date().toLocaleString("en-KE", { month: "long", year: "numeric" });
    if (range === "last-month") return new Date(new Date().getFullYear(), new Date().getMonth() - 1).toLocaleString("en-KE", { month: "long", year: "numeric" });
    return dates.startDate && dates.endDate ? `${dates.startDate} – ${dates.endDate}` : "Choose dates";
  };

  const fetchMetrics = async (quiet = false) => {
    if (!quiet) setLoading(true);
    const dates = effectiveRange();
    const query = new URLSearchParams();
    if (dates.startDate) query.set("startDate", dates.startDate);
    if (dates.endDate) query.set("endDate", dates.endDate);
    const res = await apiGet<any>(`/orders/dashboard/metrics${query.size ? `?${query}` : ""}`, token);
    if (res.success && res.data) {
      setMetrics(res.data);
    }
    if (!quiet) setLoading(false);
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.type === "ORDER_CREATED") {
        setNewOrderAlert(true);
        setTimeout(() => setNewOrderAlert(false), 10000);
        void fetchMetrics(true);
      }
      if (detail.type === "ORDER_STATUS_UPDATED" || detail.type === "ORDER_PAYMENT_UPDATED") {
        void fetchMetrics(true);
      }
    };
    window.addEventListener("ladha:realtime", handler);
    return () => window.removeEventListener("ladha:realtime", handler);
  }, [token, range, startDate, endDate]);

  useEffect(() => {
    void fetchMetrics();
  }, [token, range, startDate, endDate]);

  const actionOnClick = (label: string) => {
    switch (label) {
      case "Orders": return onNavigateToOrders ?? onBackToOrders;
      case "Menu": return onNavigateToMenu ?? onBackToOrders;
      case "Finance": return onNavigateToFinance ?? onBackToOrders;
      case "Settings": return onNavigateToSettings ?? onBackToOrders;
      case "History": return onNavigateToHistory ?? onBackToOrders;
      default: return onNavigateToOrders ?? onBackToOrders;
    }
  };

  const pendingCount = Number(metrics?.pendingOrders ?? 0);

  return (
    <div className="admin-container">
      <header className="bg-[#114B36] text-white px-4 py-3 sticky top-0 z-40 shadow-[0_2px_8px_rgba(17,75,54,0.15)]">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
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
                className="relative flex flex-col items-center justify-center p-5 rounded-2xl gap-2.5 cursor-pointer border-none"
                style={{ background: action.bg, color: action.color }}
              >
                {action.label === "Orders" && pendingCount > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1.5 rounded-full bg-[#EF4444] text-white text-[0.65rem] font-bold flex items-center justify-center shadow-md">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
                <action.icon size={28} />
                <span className="font-bold text-sm">{action.label}</span>
              </motion.button>
            ))}
          </div>

          {/* Metrics */}
          <div className="mb-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-lg text-[#1F2937]">Business Metrics</h2>
              <span className="text-xs font-semibold bg-[#E5E7EB] text-[#6B7280] px-3 py-1.5 rounded-full whitespace-nowrap">{rangeLabel()}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {([ ["all", "All time"], ["this-month", "This month"], ["last-month", "Last month"], ["custom", "Custom range"] ] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setRange(key)} className={`rounded-full px-3 py-1.5 text-xs font-bold border cursor-pointer ${range === key ? "border-[#114B36] bg-[#114B36] text-white" : "border-[#D1D5DB] bg-white text-[#4B5563]"}`}>{label}</button>)}
            </div>
            {range === "custom" && <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#F9FAFB] p-3 border border-[#E5E7EB]"><label className="text-xs font-semibold text-[#4B5563]">From<input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-2 py-2 text-sm" /></label><label className="text-xs font-semibold text-[#4B5563]">To<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-2 py-2 text-sm" /></label></div>}
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
