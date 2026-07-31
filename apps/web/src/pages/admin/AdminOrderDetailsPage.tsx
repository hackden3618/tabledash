import React, { useState } from "react";
import { apiGet, apiPatch, apiPost } from "../../lib/api";
import { CheckCircle, Circle, Lock, AlertTriangle, ChevronLeft, Phone, MapPin, CreditCard, Undo2, UtensilsCrossed, User, Wallet } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";

interface AdminOrderDetailsPageProps {
  order: any;
  token: string;
  canRefund: boolean;
  onBack: () => void;
  onOpenMap: (order: any) => void;
  onOrderUpdated: (updatedOrder: any) => void;
}

const PIPELINE = [
  { key: "NEW",                label: "New",                emoji: "🛎" },
  { key: "ACCEPTED",           label: "Accepted",           emoji: "✅" },
  { key: "PREPARING",          label: "Preparing",          emoji: "🍳" },
  { key: "READY_FOR_DELIVERY", label: "Ready for Delivery", emoji: "📦" },
  { key: "OUT_FOR_DELIVERY",   label: "Out for Delivery",   emoji: "🛵" },
  { key: "DELIVERED",          label: "Delivered",          emoji: "🎉" },
];

const STATUS_RANK: Record<string, number> = {
  NEW: 1, ACCEPTED: 2, PREPARING: 3,
  READY_FOR_DELIVERY: 4, OUT_FOR_DELIVERY: 5, DELIVERED: 6, CANCELLED: 99,
};

const POLITE_REASONS = [
  { key: "sold_out", label: "Ingredients sold out / portion unavailable today" },
  { key: "kitchen_closed", label: "Kitchen closed or closing early for maintenance" },
  { key: "too_busy", label: "Delays due to high order volume at the hotel" },
  { key: "custom", label: "Other custom polite message..." },
];

const PAYMENT_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  UNPAID: { label: "Pending Payment", bg: "#FEE2E2", color: "#DC2626" },
  PARTIAL: { label: "Partially Paid", bg: "#FEF3C7", color: "#D97706" },
  PAID: { label: "Fully Paid", bg: "#DCFCE7", color: "#15803D" },
  REFUNDED: { label: "Refunded", bg: "#EDE9FE", color: "#7C3AED" },
};

export const AdminOrderDetailsPage: React.FC<AdminOrderDetailsPageProps> = ({
  order,
  token,
  canRefund,
  onBack,
  onOpenMap,
  onOrderUpdated,
}) => {
  const [currentStatus, setCurrentStatus] = useState<string>(order.status);
  const [cancelReason, setCancelReason] = useState<string | null>(order.cancelReason);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasonOption, setCancelReasonOption] = useState("sold_out");
  const [customCancelReason, setCustomCancelReason] = useState("");

  // ── Finance state ──
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "MPESA">("CASH");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);

  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustType, setAdjustType] = useState<"REFUND" | "ADJUSTMENT">("REFUND");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustBusy, setAdjustBusy] = useState(false);

  const [utensilBusy, setUtensilBusy] = useState(false);
  const [accountModal, setAccountModal] = useState<null | { loading: boolean; data: any }>(null);

  const currentRank = STATUS_RANK[currentStatus] ?? 0;
  const isTerminal  = currentStatus === "DELIVERED" || currentStatus === "CANCELLED";

  const totalAmount = Number(order.totalAmount);
  const amountPaid = Number(order.amountPaid ?? 0);
  const outstanding = Math.max(0, totalAmount - amountPaid);
  const paymentStatus = order.paymentStatus ?? (amountPaid >= totalAmount ? "PAID" : amountPaid > 0 ? "PARTIAL" : "UNPAID");
  const paymentMeta = PAYMENT_LABELS[paymentStatus] ?? PAYMENT_LABELS.UNPAID;

  const utensilsIssued = order.utensilsIssued === true;
  const utensilsReturnedAt = order.utensilsReturnedAt || null;

  const handleStatusChange = async (newStatus: string, reason?: string) => {
    if (updating || isTerminal) return;
    const newRank = STATUS_RANK[newStatus] ?? 0;
    if (newStatus !== "CANCELLED" && newRank <= currentRank) return;

    setError(null);
    setUpdating(true);
    const res = await apiPatch<any>(
      `/orders/${order.id}/status`, 
      { status: newStatus, cancelReason: reason }, 
      token
    );
    setUpdating(false);

    if (res.success && res.data) {
      setCurrentStatus(newStatus);
      if (newStatus === "CANCELLED") {
        setCancelReason(reason || "Staff unavailable to deliver at this time");
      }
      onOrderUpdated(res.data);
    } else {
      setError(res.error ?? "Status update failed. Please try again.");
    }
  };

  const handleConfirmCancel = () => {
    let finalReason = "";
    if (cancelReasonOption === "sold_out") {
      finalReason = "we have unfortunately sold out of the items you ordered for today";
    } else if (cancelReasonOption === "kitchen_closed") {
      finalReason = "the kitchen is closed or closing early for maintenance";
    } else if (cancelReasonOption === "too_busy") {
      finalReason = "we are experiencing an extremely high volume of orders today";
    } else {
      finalReason = customCancelReason.trim() || "we are unfortunately unable to fulfill your order at this time";
    }

    handleStatusChange("CANCELLED", finalReason);
    setShowCancelModal(false);
  };

  // ── Record payment (finance owns the ledger; the order cache is read-through) ──
  const handleRecordPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { setError("Enter a valid payment amount."); return; }
    setPaymentBusy(true);
    setError(null);
    const res = await apiPost<any>(`/finance/orders/${order.id}/payments`, {
      amount,
      method: paymentMethod,
      note: paymentNote.trim() || undefined,
    }, token);
    setPaymentBusy(false);
    if (res.success && res.data?.order) {
      onOrderUpdated(res.data.order);
      setShowPaymentModal(false);
      setPaymentNote("");
    } else {
      setError(res.error ?? "Failed to record payment.");
    }
  };

  // ── Refund / adjustment (always its own ledger row, reason required) ──
  const handleAdjustment = async () => {
    const amount = parseFloat(adjustAmount);
    if (!amount || amount === 0) { setError("Enter a valid amount (non-zero)."); return; }
    if (!adjustReason.trim()) { setError("A reason is required for a refund or adjustment."); return; }
    setAdjustBusy(true);
    setError(null);
    const res = await apiPost<any>(`/finance/orders/${order.id}/adjustments`, {
      type: adjustType,
      amount,
      reason: adjustReason.trim(),
    }, token);
    setAdjustBusy(false);
    if (res.success && res.data?.order) {
      onOrderUpdated(res.data.order);
      setShowAdjustModal(false);
      setAdjustReason("");
    } else {
      setError(res.error ?? "Failed to process adjustment.");
    }
  };

  // ── Utensil tracking (payment and utensils resolve independently) ──
  const handleUtensilsIssued = async (issued: boolean) => {
    setUtensilBusy(true);
    setError(null);
    const res = await apiPatch<any>(`/orders/${order.id}/utensils-issued`, { issued }, token);
    setUtensilBusy(false);
    if (res.success && res.data) onOrderUpdated(res.data);
    else setError(res.error ?? "Failed to update utensil status.");
  };

  const handleUtensilsReturned = async () => {
    setUtensilBusy(true);
    setError(null);
    const res = await apiPatch<any>(`/orders/${order.id}/utensils-returned`, {}, token);
    setUtensilBusy(false);
    if (res.success && res.data) onOrderUpdated(res.data);
    else setError(res.error ?? "Failed to confirm utensil return.");
  };

  // ── Customer account deep-link (tenant-scoped on the server) ──
  const openAccount = async () => {
    setAccountModal({ loading: true, data: null });
    const res = await apiGet<any>(`/finance/customers/${order.customer?.id}/account`, token);
    setAccountModal({ loading: false, data: res.success && res.data ? res.data : null });
  };

  const formatKsh = (amount: number) =>
    `KSh ${amount.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  return (
    <div className="admin-container">
      <header className="bg-[#114B36] text-white px-4 py-3 sticky top-0 z-40 shadow-[0_2px_8px_rgba(17,75,54,0.15)]">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <button
            onClick={onBack}
            className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="font-bold text-lg">Order #{order.orderNumber}</h1>
        </div>
      </header>

      <div className="p-4 max-w-4xl mx-auto space-y-4">

        {error && (
          <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-4 py-3 text-sm font-semibold text-[#DC2626] flex items-center gap-2">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {/* Customer card + account link */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(17,75,54,0.06)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-[#EBF5F0] flex items-center justify-center text-[#114B36] font-bold text-lg shrink-0">
              {order.customer?.firstName?.[0] || "?"}
            </div>
            <div>
              <h2 className="font-bold text-lg text-[#1F2937]">
                {order.customer?.knownName || order.customer?.firstName}
              </h2>
              <p className="text-sm text-[#6B7280] mt-0.5">
                {order.customer?.phone}
                {order.customer?.accountId ? <span className="text-[#9CA3AF]"> · {order.customer.accountId}</span> : null}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void openAccount()} disabled={!order.customer?.id}>
              <User size={14} className="mr-1" /> Account
            </Button>
            <a
              href={`tel:${order.customer?.phone}`}
              className="w-11 h-11 rounded-full bg-[#22C55E] text-white flex items-center justify-center no-underline shadow-[0_4px_12px_rgba(34,197,94,0.3)] hover:bg-[#16A34A] transition-colors"
            >
              <Phone size={18} />
            </a>
          </div>
        </div>

        {/* Payment status — read-through of the ledger; recording goes through finance */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-xs text-[#6B7280] uppercase tracking-wider flex items-center gap-1.5">
              <Wallet size={14} /> Payment
            </p>
            <span
              className="text-[0.65rem] font-bold px-2.5 py-1 rounded-full"
              style={{ background: paymentMeta.bg, color: paymentMeta.color }}
            >
              {paymentMeta.label}
            </span>
          </div>
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-2xl font-extrabold text-[#114B36]">{formatKsh(amountPaid)}</p>
              <p className="text-xs text-[#6B7280]">of {formatKsh(totalAmount)} collected</p>
            </div>
            {outstanding > 0 && (
              <div className="text-right">
                <p className="text-lg font-bold text-[#DC2626]">{formatKsh(outstanding)}</p>
                <p className="text-xs text-[#6B7280]">outstanding</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={paymentStatus === "PAID" || paymentStatus === "REFUNDED" || isTerminal && currentStatus === "CANCELLED"}
              onClick={() => { setPaymentAmount(outstanding ? String(outstanding) : ""); setShowPaymentModal(true); }}
            >
              <CreditCard size={14} className="mr-1" /> Record Payment
            </Button>
            {canRefund ? (
              <Button
                size="sm"
                variant="danger"
                disabled={paymentStatus === "REFUNDED" || (amountPaid <= 0 && outstanding <= 0)}
                onClick={() => setShowAdjustModal(true)}
              >
                <Undo2 size={14} className="mr-1" /> Refund / Adjust
              </Button>
            ) : (
              <span
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 text-xs font-semibold text-[#9CA3AF]"
                title="Only hotel administrators can issue refunds or adjustments."
              >
                <Lock size={14} /> Admin only
              </span>
            )}
          </div>
        </div>

        {/* Utensils — independent of payment */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
          <p className="font-bold text-xs text-[#6B7280] uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <UtensilsCrossed size={14} /> Utensils
          </p>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm">
              {!utensilsIssued ? (
                <span className="text-[#6B7280]">No reusable utensils recorded for this order.</span>
              ) : utensilsReturnedAt ? (
                <span className="text-[#15803D] font-semibold">
                  ✓ Utensils returned {new Date(utensilsReturnedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              ) : (
                <span className="text-[#D97706] font-semibold">
                  Utensils were issued at dispatch and not yet returned.
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {!utensilsIssued ? (
                <Button size="sm" variant="secondary" disabled={utensilBusy} onClick={() => void handleUtensilsIssued(true)}>
                  <UtensilsCrossed size={14} className="mr-1" /> Mark Issued
                </Button>
              ) : !utensilsReturnedAt ? (
                <>
                  <Button size="sm" variant="secondary" disabled={utensilBusy} onClick={() => void handleUtensilsIssued(false)}>
                    Mark Not Issued
                  </Button>
                  <Button size="sm" variant="primary" disabled={utensilBusy} onClick={() => void handleUtensilsReturned()}>
                    <CheckCircle size={14} className="mr-1" /> Confirm Returned
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
          <p className="font-bold text-xs text-[#6B7280] uppercase tracking-wider mb-3">Items</p>
          <div className="space-y-2 mb-3">
            {order.orderItems?.map((it: any) => (
              <div key={it.id} className="flex justify-between text-sm">
                <span className="text-[#1F2937]">{it.quantity} x {it.name}</span>
                <span className="font-semibold text-[#1F2937]">KSh {it.subtotal}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t border-[#F3F4F6] pt-3 font-bold text-base">
            <span className="text-[#1F2937]">Total</span>
            <span className="text-[#114B36]">KSh {order.totalAmount}</span>
          </div>
        </div>

        {/* Delivery Location */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
          <p className="font-bold text-xs text-[#6B7280] uppercase tracking-wider mb-1">Delivery Location</p>
          <p className="text-sm font-semibold text-[#1F2937] mb-3">
            <MapPin size={14} className="inline mr-1 text-[#EF4444]" />
            {order.marketSection} — {order.locationDescription}
          </p>
          <Button variant="secondary" size="sm" onClick={() => onOpenMap(order)}>
            <MapPin size={14} /> Open Map Inspector
          </Button>
        </div>

        {/* Status Timeline */}
        <div className={`bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(17,75,54,0.06)] transition-opacity ${updating ? "opacity-70" : ""}`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-sm text-[#1F2937]">Order Progress</h2>
            {updating && <span className="text-xs font-semibold text-[#114B36] animate-pulse">Updating...</span>}
          </div>

          <div className="space-y-0">
            {PIPELINE.map((step, idx) => {
              const stepRank  = STATUS_RANK[step.key] ?? 0;
              const isDone    = stepRank < currentRank;
              const isCurrent = step.key === currentStatus;
              const isNext    = !isTerminal && stepRank === currentRank + 1;
              const isFuture  = !isDone && !isCurrent && !isNext;
              const isLast    = idx === PIPELINE.length - 1;

              return (
                <div key={step.key} className="flex gap-3.5 items-start">
                  <div className="flex flex-col items-center shrink-0 w-8">
                    <button
                      onClick={() => isNext && handleStatusChange(step.key)}
                      disabled={!isNext || isTerminal || updating}
                      className={`
                        w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200
                        ${isDone ? "bg-[#22C55E] cursor-default" : ""}
                        ${isCurrent ? "bg-[#114B36] border-2 border-[#114B36] cursor-default" : ""}
                        ${isNext ? "bg-[#EBF5F0] border-2 border-dashed border-[#114B36] cursor-pointer hover:bg-[#C2E2D3]" : ""}
                        ${isFuture ? "bg-[#F3F4F6] cursor-default" : ""}
                        ${isTerminal && isCurrent ? "bg-[#22C55E]" : ""}
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                    >
                      {isDone || (isTerminal && isCurrent && currentStatus === "DELIVERED") ? (
                        <CheckCircle size={16} className="text-white" />
                      ) : isCurrent ? (
                        <span className="text-xs">{step.emoji}</span>
                      ) : isNext ? (
                        <Circle size={15} className="text-[#114B36]" />
                      ) : (
                        <Circle size={15} className="text-[#D1D5DB]" />
                      )}
                    </button>
                    {!isLast && (
                      <div className={`w-0.5 flex-1 min-h-[20px] my-0.5 ${isDone ? "bg-[#22C55E]" : "bg-[#E5E7EB]"}`} />
                    )}
                  </div>

                  <div className="pb-4 flex-1">
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`
                        text-sm font-semibold
                        ${isDone ? "text-[#15803D]" : ""}
                        ${isCurrent ? "text-[#114B36] font-bold" : ""}
                        ${isNext ? "text-[#1F2937]" : ""}
                        ${isFuture ? "text-[#9CA3AF]" : ""}
                      `}>
                        {step.label}
                      </span>
                      {isCurrent && !isTerminal && (
                        <span className="text-[0.6rem] font-bold bg-[#EBF5F0] text-[#114B36] px-2 py-0.5 rounded-full">
                          CURRENT
                        </span>
                      )}
                      {isDone && <span className="text-[0.65rem] text-[#15803D]">✓ Done</span>}
                    </div>
                    {isNext && !isTerminal && (
                      <button
                        onClick={() => handleStatusChange(step.key)}
                        disabled={updating}
                        className="mt-1.5 px-4 py-1.5 bg-[#114B36] text-white rounded-lg text-xs font-bold border-none cursor-pointer hover:bg-[#0D3D2B] transition-colors disabled:opacity-50"
                      >
                        Mark as {step.label} →
                      </button>
                    )}
                    {isFuture && (
                      <div className="text-[0.65rem] text-[#9CA3AF] mt-1 flex items-center gap-1">
                        <Lock size={9} /> Unlocks after previous step
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {isTerminal ? (
            <div className="mt-2 space-y-2">
              <div className={`rounded-xl px-4 py-3 flex items-center gap-2 text-sm font-bold ${
                currentStatus === "DELIVERED" ? "bg-[#DCFCE7] text-[#15803D]" : "bg-[#FEE2E2] text-[#DC2626]"
              }`}>
                <Lock size={15} />
                This order is {currentStatus === "DELIVERED" ? "completed ✓" : "cancelled"} and cannot be updated further.
              </div>
              {currentStatus === "CANCELLED" && cancelReason && (
                <div className="bg-[#FAFAFA] border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#4B5563]">
                  <strong>Cancellation Reason:</strong> &ldquo;{cancelReason}&rdquo;
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 border-t border-[#F3F4F6] pt-4">
              <Button variant="danger" size="sm" fullWidth onClick={() => setShowCancelModal(true)} disabled={updating}>
                ✕ Cancel This Order
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Cancellation Reason Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Order"
        type="danger"
      >
        <p className="text-sm text-[#6B7280] mb-4 leading-relaxed">
          Select a reason below. This will be sent to the customer via SMS to politely explain the cancellation.
        </p>

        <div className="space-y-2.5 mb-4">
          {POLITE_REASONS.map((reason) => (
            <label
              key={reason.key}
              className={`
                flex items-start gap-2.5 p-3 rounded-xl cursor-pointer transition-all duration-150
                ${cancelReasonOption === reason.key
                  ? "border-2 border-[#FCA5A5] bg-[#FFF5F5]"
                  : "border-2 border-[#E5E7EB] bg-white hover:border-[#D1D5DB]"
                }
              `}
            >
              <input
                type="radio"
                name="cancelReasonOption"
                value={reason.key}
                checked={cancelReasonOption === reason.key}
                onChange={() => setCancelReasonOption(reason.key)}
                className="mt-0.5 accent-[#DC2626]"
              />
              <span className="text-sm font-semibold text-[#374151]">{reason.label}</span>
            </label>
          ))}
        </div>

        {cancelReasonOption === "custom" && (
          <div className="mb-4">
            <textarea
              placeholder="Type a polite custom cancellation message here..."
              value={customCancelReason}
              onChange={(e) => setCustomCancelReason(e.target.value)}
              rows={3}
              required
              className="w-full px-3.5 py-3 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm resize-none focus:border-[#114B36] focus:ring-3 focus:ring-[rgba(17,75,54,0.1)]"
            />
          </div>
        )}

        <div className="flex gap-3 mt-2">
          <Button variant="secondary" fullWidth onClick={() => setShowCancelModal(false)}>
            Keep Order
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={handleConfirmCancel}
            disabled={cancelReasonOption === "custom" && !customCancelReason.trim()}
          >
            Confirm Cancel
          </Button>
        </div>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Record Payment"
        type="info"
      >
        <p className="text-sm text-[#6B7280] mb-4 leading-relaxed">
          Record the amount actually collected for order #{order.orderNumber}. The order&rsquo;s payment status updates automatically from the ledger.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Method</label>
            <div className="flex gap-2 mt-1.5">
              {(["CASH", "MPESA"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all cursor-pointer ${
                    paymentMethod === m ? "border-[#114B36] bg-[#EBF5F0] text-[#114B36]" : "border-[#E5E7EB] text-[#6B7280] hover:border-[#D1D5DB]"
                  }`}
                >
                  {m === "CASH" ? "Cash" : "M-PESA"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Amount</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder={`Outstanding: ${formatKsh(outstanding)}`}
              className="w-full mt-1.5 px-3.5 py-3 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm font-semibold focus:border-[#114B36]"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Note (optional)</label>
            <input
              type="text"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              maxLength={500}
              placeholder="e.g. Collected in person at the stall"
              className="w-full mt-1.5 px-3.5 py-3 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm focus:border-[#114B36]"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <Button variant="secondary" fullWidth onClick={() => setShowPaymentModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" fullWidth onClick={() => void handleRecordPayment()} disabled={paymentBusy}>
            {paymentBusy ? "Recording..." : "Record Payment"}
          </Button>
        </div>
      </Modal>

      {/* Refund / Adjustment Modal */}
      <Modal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        title="Refund / Adjust"
        type="danger"
      >
        <p className="text-sm text-[#6B7280] mb-4 leading-relaxed">
          Refunds return money that was paid. Adjustments correct the amount owed. Both write a permanent ledger row with your reason — they are never silent edits.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Type</label>
            <div className="flex gap-2 mt-1.5">
              {(["REFUND", "ADJUSTMENT"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setAdjustType(t)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all cursor-pointer ${
                    adjustType === t ? "border-[#DC2626] bg-[#FFF5F5] text-[#DC2626]" : "border-[#E5E7EB] text-[#6B7280] hover:border-[#D1D5DB]"
                  }`}
                >
                  {t === "REFUND" ? "Refund" : "Adjustment"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Amount</label>
            <input
              type="number"
              step="0.01"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              placeholder={adjustType === "REFUND" ? `Paid: ${formatKsh(amountPaid)}` : "Amount"}
              className="w-full mt-1.5 px-3.5 py-3 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm font-semibold focus:border-[#114B36]"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Reason (required)</label>
            <textarea
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Why is this refund or adjustment being made?"
              className="w-full mt-1.5 px-3.5 py-3 rounded-xl border-2 border-[#D1D5DB] outline-none text-sm resize-none focus:border-[#114B36]"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <Button variant="secondary" fullWidth onClick={() => setShowAdjustModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" fullWidth onClick={() => void handleAdjustment()} disabled={adjustBusy}>
            {adjustBusy ? "Processing..." : adjustType === "REFUND" ? "Issue Refund" : "Apply Adjustment"}
          </Button>
        </div>
      </Modal>

      {/* Customer Account Modal */}
      <Modal
        isOpen={accountModal !== null}
        onClose={() => setAccountModal(null)}
        title={`Customer Account${accountModal?.data?.customer?.accountId ? ` — ${accountModal.data.customer.accountId}` : ""}`}
      >
        {accountModal?.loading ? (
          <div className="text-center py-10 text-sm text-[#6B7280]">Loading account...</div>
        ) : !accountModal?.data ? (
          <div className="text-center py-10 text-sm text-[#DC2626]">Could not load the customer account.</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-[#F9FAFB] rounded-xl p-3">
                <p className="text-[0.6rem] font-bold text-[#6B7280] uppercase tracking-wide">Total Owed</p>
                <p className="text-sm font-extrabold text-[#1F2937] mt-0.5">{formatKsh(Number(accountModal.data.account?.totalOwed ?? 0))}</p>
              </div>
              <div className="bg-[#F9FAFB] rounded-xl p-3">
                <p className="text-[0.6rem] font-bold text-[#6B7280] uppercase tracking-wide">Total Paid</p>
                <p className="text-sm font-extrabold text-[#22C55E] mt-0.5">{formatKsh(Number(accountModal.data.account?.totalPaid ?? 0))}</p>
              </div>
              <div className="bg-[#F9FAFB] rounded-xl p-3">
                <p className="text-[0.6rem] font-bold text-[#6B7280] uppercase tracking-wide">Balance</p>
                <p className={`text-sm font-extrabold mt-0.5 ${(Number(accountModal.data.account?.totalOwed ?? 0) - Number(accountModal.data.account?.totalPaid ?? 0)) > 0 ? "text-[#DC2626]" : "text-[#22C55E]"}`}>
                  {formatKsh(Number(accountModal.data.account?.totalOwed ?? 0) - Number(accountModal.data.account?.totalPaid ?? 0))}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">Ledger — every row explains this account</h4>
              {accountModal.data.salesRecords?.length === 0 ? (
                <p className="text-sm text-[#9CA3AF] py-4 text-center">No ledger rows yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {accountModal.data.salesRecords?.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-[#F3F4F6] last:border-0 text-xs">
                      <div>
                        <p className="font-semibold text-[#1F2937]">
                          {r.type === "ORDER_CHARGE" ? "Order charged" : r.type === "ORDER_PAYMENT" ? "Payment received" : r.type === "REFUND" ? "Refund issued" : "Adjustment"}
                          {r.type === "ADJUSTMENT" && r.note ? ` — ${r.note}` : ""}
                        </p>
                        <p className="text-[#9CA3AF]">{new Date(r.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      <span className={`font-bold ${r.type === "ORDER_PAYMENT" ? "text-[#22C55E]" : r.type === "REFUND" ? "text-[#EF4444]" : "text-[#1F2937]"}`}>
                        {r.type === "ORDER_PAYMENT" ? "+" : r.type === "REFUND" ? "-" : ""}{formatKsh(Number(r.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
