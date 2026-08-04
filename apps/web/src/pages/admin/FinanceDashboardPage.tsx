import { motion } from "framer-motion";
import { ArrowLeft, TrendingUp, Wallet, Banknote, RefreshCw, XCircle, BarChart3, Calendar, DollarSign, CreditCard, FileText, UtensilsCrossed } from "lucide-react";
import { useState, useEffect } from "react";
import { apiGet } from "../../lib/api";
import { PageTransition } from "../../components/ui/PageTransition";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

interface FinanceDashboardPageProps {
  token: string;
  onBackToDashboard: () => void;
  onNavigateToOrders: () => void;
  onOpenPendingCollection: () => void;
}

const METRICS = [
  { key: "todayRevenue", label: "Today's Revenue", icon: TrendingUp, color: "#114B36", bg: "#EBF5F0", prefix: true },
  { key: "cashRevenue", label: "Cash Revenue", icon: Banknote, color: "#15803D", bg: "#DCFCE7", prefix: true },
  { key: "mpesaRevenue", label: "M-Pesa Revenue", icon: CreditCard, color: "#2563EB", bg: "#DBEAFE", prefix: true },
  { key: "outstandingBalance", label: "Outstanding", icon: Wallet, color: "#DC2626", bg: "#FEE2E2", prefix: true },
  { key: "dailyCashPosition", label: "Daily Cash Position", icon: DollarSign, color: "#114B36", bg: "#EBF5F0", prefix: true },
  { key: "refundsProcessed", label: "Refunds", icon: RefreshCw, color: "#7C3AED", bg: "#EDE9FE", suffix: "" },
  { key: "refundsAmount", label: "Refunded Amount", icon: XCircle, color: "#DC2626", bg: "#FEE2E2", prefix: true },
  { key: "cancelledCount", label: "Cancelled", icon: XCircle, color: "#6B7280", bg: "#F3F4F6", suffix: "" },
];

export const FinanceDashboardPage: React.FC<FinanceDashboardPageProps> = ({ token, onBackToDashboard, onNavigateToOrders, onOpenPendingCollection }) => {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    setLoading(true);
    const res = await apiGet<any>("/finance/dashboard", token);
    if (res.success && res.data) setMetrics(res.data);
    setLoading(false);
  };

  useEffect(() => { fetchMetrics(); }, []);

  return (
    <div className="admin-container">
      <header className="bg-[#114B36] text-white px-4 py-3 sticky top-0 z-40 shadow-[0_2px_8px_rgba(17,75,54,0.15)]">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <button onClick={onBackToDashboard} className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white"><ArrowLeft size={20} /></button>
          <h1 className="font-bold text-lg">Finance</h1>
        </div>
      </header>

      <PageTransition>
        <div className="p-4 max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="font-bold text-lg text-[#1F2937]">Dashboard</h2>
            <div className="flex gap-2">
              {onOpenPendingCollection && (
                <Button size="sm" variant="secondary" onClick={onOpenPendingCollection}><UtensilsCrossed size={14} className="mr-1" />Pending Collection</Button>
              )}
              {onNavigateToOrders && <Button size="sm" variant="secondary" onClick={onNavigateToOrders}><FileText size={14} className="mr-1" />Order History</Button>}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-4 border-[#E5E7EB] border-t-[#114B36] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-[#6B7280]">Loading financial data...</p>
            </div>
          ) : !metrics ? (
            <div className="text-center py-16 text-sm text-[#6B7280]">Failed to load financial data.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                {METRICS.map((card, i) => {
                  const value = metrics[card.key];
                  const display = value !== undefined ? (card.prefix ? `KSh ${Number(value).toFixed(2)}` : value) : "—";
                  return (
                    <motion.div key={card.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                      className="bg-white rounded-2xl p-4 text-center shadow-[0_2px_8px_rgba(17,75,54,0.06)] border border-[#E5E7EB]">
                      <div className="flex justify-center mb-2">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: card.bg }}>
                          <card.icon size={18} style={{ color: card.color }} />
                        </div>
                      </div>
                      <p className="text-xl font-extrabold" style={{ color: card.color }}>{display}</p>
                      <p className="text-[0.65rem] text-[#6B7280] font-semibold mt-1 uppercase tracking-wider">{card.label}</p>
                    </motion.div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                  className="bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
                  <h3 className="font-bold text-sm text-[#1F2937] mb-3 flex items-center gap-2"><Calendar size={14} /> Weekly Summary</h3>
                  {metrics.weeklySummary?.length > 0 ? (
                    <div className="space-y-2">
                      {metrics.weeklySummary.map((day: any) => (
                        <div key={day.date} className="flex items-center justify-between py-1.5 border-b border-[#F3F4F6] last:border-0">
                          <span className="text-xs font-medium text-[#6B7280]">{new Date(day.date).toLocaleDateString("en-KE", { weekday: "short", month: "short", day: "numeric" })}</span>
                          <span className="text-sm font-bold text-[#114B36]">KSh {Number(day.revenue).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-[#9CA3AF]">No data for this week.</p>}
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                  className="bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
                  <h3 className="font-bold text-sm text-[#1F2937] mb-3 flex items-center gap-2"><BarChart3 size={14} /> Top Customers</h3>
                  {metrics.topCustomers?.length > 0 ? (
                    <div className="space-y-2">
                      {metrics.topCustomers.map((c: any, i: number) => (
                        <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-[#F3F4F6] last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[0.6rem] font-bold text-[#9CA3AF] w-4">{i + 1}.</span>
                            <span className="text-xs font-semibold text-[#1F2937] truncate max-w-[140px]">{c.name}</span>
                            <Badge variant="brand">{c.orderCount}</Badge>
                          </div>
                          <span className="text-xs font-bold text-[#114B36]">KSh {Number(c.totalSpent).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-[#9CA3AF]">No customer data yet.</p>}
                </motion.div>
              </div>

              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                className="bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
                <h3 className="font-bold text-sm text-[#1F2937] mb-3 flex items-center gap-2"><BarChart3 size={14} /> Monthly Summary</h3>
                {metrics.monthlySummary?.length > 0 ? (
                  <div className="grid grid-cols-4 gap-3">
                    {metrics.monthlySummary.map((week: any) => (
                      <div key={week.week} className="text-center p-3 rounded-xl bg-[#F9FAFB] border border-[#F3F4F6]">
                        <p className="text-[0.6rem] font-semibold text-[#6B7280] uppercase">{week.week}</p>
                        <p className="text-sm font-extrabold text-[#114B36] mt-1">KSh {Number(week.revenue).toFixed(0)}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-[#9CA3AF]">No data for this month.</p>}
              </motion.div>
            </>
          )}
        </div>
      </PageTransition>


    </div>
  );
};
