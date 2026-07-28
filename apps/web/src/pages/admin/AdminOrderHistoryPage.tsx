import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, apiPatch } from "../../lib/api";
import { ArrowLeft, Calendar, CheckCircle2, DollarSign } from "lucide-react";
import { Button } from "../../components/ui/Button";

interface AdminOrderHistoryPageProps {
  token: string;
  onBackToOrders: () => void;
}

type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

const PAYMENT_BADGE: Record<PaymentStatus, { bg: string; color: string; label: string }> = {
  UNPAID:  { bg: "#FEE2E2", color: "#DC2626", label: "Unpaid" },
  PARTIAL: { bg: "#FEF3C7", color: "#D97706", label: "Partial" },
  PAID:    { bg: "#DCFCE7", color: "#15803D", label: "Paid" },
};

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  NEW:                { bg: "#FEE2E2", color: "#DC2626" },
  ACCEPTED:           { bg: "#EDE9FE", color: "#7C3AED" },
  PREPARING:          { bg: "#FEF3C7", color: "#D97706" },
  READY_FOR_DELIVERY: { bg: "#DBEAFE", color: "#1D4ED8" },
  OUT_FOR_DELIVERY:   { bg: "#E0E7FF", color: "#4F46E5" },
  DELIVERED:          { bg: "#DCFCE7", color: "#15803D" },
  CANCELLED:          { bg: "#F3F4F6", color: "#6B7280" },
};

export const AdminOrderHistoryPage: React.FC<AdminOrderHistoryPageProps> = ({
  token,
  onBackToOrders,
}) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const todayStr = new Date().toISOString().split("T")[0] ?? "";
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [editingPayment, setEditingPayment] = useState<Record<string, { status?: PaymentStatus; amount?: string }>>({});

  const fetchDailyOrders = async (date: string) => {
    setLoading(true);
    const res = await apiGet<any[]>(`/orders/daily?date=${date}`, token);
    if (res.success && res.data) {
      setOrders(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDailyOrders(selectedDate);
  }, [selectedDate]);

  const handleSavePayment = async (orderId: string) => {
    const edit = editingPayment[orderId];
    if (!edit) return;
    const payload: { paymentStatus?: string; amountPaid?: number } = {};
    if (edit.status) payload.paymentStatus = edit.status;
    if (edit.amount !== undefined) payload.amountPaid = parseFloat(edit.amount) || 0;
    const res = await apiPatch<any>(`/orders/${orderId}/payment`, payload, token);
    if (res.success && res.data) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data : o)));
      setEditingPayment((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    }
  };

  const totalDailyRevenue = orders
    .filter((o) => o.status !== "CANCELLED")
    .reduce((sum, o) => sum + Number(o.totalAmount), 0);

  const totalDailyCollected = orders
    .reduce((sum, o) => sum + Number(o.amountPaid || 0), 0);

  return (
    <div className="admin-container">
      <header className="bg-[#114B36] text-white px-4 py-3 sticky top-0 z-40 shadow-[0_2px_8px_rgba(17,75,54,0.15)]">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <button onClick={onBackToOrders} className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold text-lg">Order History</h1>
        </div>
      </header>

      <div className="p-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2 bg-[#F3F4F6] rounded-xl px-3.5 py-2.5">
            <Calendar size={18} className="text-[#6B7280]" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border-none bg-transparent text-sm font-semibold outline-none text-[#1F2937]"
            />
          </div>
          <div className="flex items-center gap-4 text-xs text-[#6B7280] flex-wrap">
            <span>Revenue: <span className="font-bold text-[#114B36]">KSh {totalDailyRevenue}</span></span>
            <span>Collected: <span className="font-bold text-[#15803D]">KSh {totalDailyCollected}</span></span>
            <span>Orders: <span className="font-bold text-[#1F2937]">{orders.length}</span></span>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-sm text-[#6B7280]">
            <div className="w-8 h-8 border-4 border-[#E5E7EB] border-t-[#114B36] rounded-full animate-spin mx-auto mb-3" />
            Loading daily orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-sm text-[#6B7280] bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
            <DollarSign size={32} className="mx-auto mb-2 text-[#D1D5DB]" />
            No orders found for this date.
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((ord, idx) => {
              const payBadge = PAYMENT_BADGE[ord.paymentStatus as PaymentStatus] ?? PAYMENT_BADGE.UNPAID;
              const statusBadge = STATUS_BADGE[ord.status] ?? STATUS_BADGE.NEW!;
              const edit = editingPayment[ord.id] || {};
              const balance = Number(ord.totalAmount) - Number(edit.amount ?? ord.amountPaid ?? 0);

              return (
                <motion.div
                  key={ord.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(17,75,54,0.06)]"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-extrabold text-base text-[#114B36]">#{ord.orderNumber}</span>
                      <span className="text-[0.65rem] text-[#6B7280] ml-2">
                        {new Date(ord.orderedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <span
                      className="text-[0.6rem] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap"
                      style={{ background: statusBadge.bg, color: statusBadge.color }}
                    >
                      {ord.status.replace(/_/g, " ")}
                    </span>
                  </div>

                  <p className="text-xs text-[#4B5563] mb-2.5">
                    {ord.customer?.firstName} ({ord.customer?.phone}) &mdash; {ord.orderItems?.map((it: any) => `${it.quantity}x ${it.name}`).join(", ")}
                  </p>

                  <div className="flex justify-between items-center flex-wrap gap-2 border-t border-[#F3F4F6] pt-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#1F2937]">KSh {ord.totalAmount}</span>
                      <span className="text-[#D1D5DB]">|</span>
                      <span
                        className="text-[0.65rem] font-bold px-2.5 py-1 rounded-full"
                        style={{ background: payBadge.bg, color: payBadge.color }}
                      >
                        {payBadge.label}
                      </span>
                      {balance > 0 && ord.paymentStatus !== "CANCELLED" && (
                        <span className="text-[0.65rem] font-semibold text-[#DC2626]">
                          Balance: KSh {balance.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <select
                        value={edit.status ?? ord.paymentStatus ?? "UNPAID"}
                        onChange={(e) => setEditingPayment((prev) => ({
                          ...prev,
                          [ord.id]: { ...prev[ord.id], status: e.target.value as PaymentStatus },
                        }))}
                        className="px-2 py-1.5 rounded-lg border border-[#D1D5DB] text-[0.65rem] font-semibold outline-none bg-white"
                      >
                        <option value="UNPAID">Unpaid</option>
                        <option value="PARTIAL">Partial</option>
                        <option value="PAID">Paid</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={String(ord.amountPaid ?? 0)}
                        value={edit.amount ?? ""}
                        onChange={(e) => setEditingPayment((prev) => ({
                          ...prev,
                          [ord.id]: { ...prev[ord.id], amount: e.target.value },
                        }))}
                        className="w-16 px-2 py-1.5 rounded-lg border border-[#D1D5DB] text-[0.65rem] font-semibold text-center outline-none"
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleSavePayment(ord.id)}
                      >
                        <CheckCircle2 size={12} /> Save
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
