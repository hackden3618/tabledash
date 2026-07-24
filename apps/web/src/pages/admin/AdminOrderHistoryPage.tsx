import React, { useEffect, useState } from "react";
import { apiGet, apiPatch } from "../../lib/api";
import { ArrowLeft, Calendar, CheckCircle2 } from "lucide-react";

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
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button onClick={onBackToOrders} style={{ background: "none", border: "none", color: "white", fontSize: "1.2rem", cursor: "pointer", display: "flex" }}>
            <ArrowLeft size={20} />
          </button>
          <div className="header-title">Daily Order History</div>
        </div>
      </header>

      <div style={{ padding: "20px" }}>
        {/* Date Picker + Summary */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#F3F4F6", padding: "8px 12px", borderRadius: "10px" }}>
            <Calendar size={18} color="#6B7280" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ border: "none", background: "transparent", fontSize: "0.95rem", fontWeight: 600, outline: "none" }}
            />
          </div>
          <div style={{ fontSize: "0.85rem", color: "#6B7280", display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <span>Revenue: <strong style={{ color: "#1E4D36" }}>KSh {totalDailyRevenue}</strong></span>
            <span>Collected: <strong style={{ color: "#15803D" }}>KSh {totalDailyCollected}</strong></span>
            <span>Orders: <strong>{orders.length}</strong></span>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>Loading daily orders...</div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280" }}>
            No orders found for this date.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {orders.map((ord) => {
              const payBadge = PAYMENT_BADGE[ord.paymentStatus as PaymentStatus] ?? PAYMENT_BADGE.UNPAID;
              const statusBadge = STATUS_BADGE[ord.status] ?? STATUS_BADGE.NEW!;
              const edit = editingPayment[ord.id] || {};
              const balance = Number(ord.totalAmount) - Number(edit.amount ?? ord.amountPaid ?? 0);

              return (
                <div key={ord.id} className="card" style={{ padding: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: "1rem", color: "#1E4D36" }}>#{ord.orderNumber}</span>
                      <span style={{ fontSize: "0.75rem", color: "#6B7280", marginLeft: "8px" }}>
                        {new Date(ord.orderedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <span style={{ background: statusBadge.bg, color: statusBadge.color, borderRadius: "8px", padding: "2px 8px", fontWeight: 700, fontSize: "0.7rem" }}>
                        {ord.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: "0.85rem", color: "#4B5563", marginBottom: "10px" }}>
                    {ord.customer?.firstName} ({ord.customer?.phone}) — {ord.orderItems?.map((it: any) => `${it.quantity}x ${it.name}`).join(", ")}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", borderTop: "1px solid #F3F4F6", paddingTop: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontWeight: 700, color: "#1F2937" }}>KSh {ord.totalAmount}</span>
                      <span style={{ color: "#9CA3AF" }}>|</span>
                      <span style={{ background: payBadge.bg, color: payBadge.color, padding: "3px 10px", borderRadius: "999px", fontWeight: 700, fontSize: "0.75rem" }}>
                        {payBadge.label}
                      </span>
                      {balance > 0 && ord.paymentStatus !== "CANCELLED" && (
                        <span style={{ fontSize: "0.75rem", color: "#DC2626", fontWeight: 600 }}>
                          Balance: KSh {balance.toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <select
                        value={edit.status ?? ord.paymentStatus ?? "UNPAID"}
                        onChange={(e) => setEditingPayment((prev) => ({
                          ...prev,
                          [ord.id]: { ...prev[ord.id], status: e.target.value as PaymentStatus },
                        }))}
                        style={{ padding: "6px 8px", borderRadius: "6px", border: "1px solid #D1D5DB", fontSize: "0.78rem", fontWeight: 600 }}
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
                        style={{ width: "80px", padding: "6px 8px", borderRadius: "6px", border: "1px solid #D1D5DB", fontSize: "0.78rem", fontWeight: 600, textAlign: "center" }}
                      />
                      <button
                        onClick={() => handleSavePayment(ord.id)}
                        className="btn btn-primary"
                        style={{ padding: "6px 10px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px" }}
                      >
                        <CheckCircle2 size={14} /> Save
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
