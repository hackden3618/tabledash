import React, { useState } from "react";
import { apiPatch } from "../../lib/api";
import { CheckCircle, Circle, Lock, AlertTriangle, ChevronLeft, Phone, MapPin } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";

interface AdminOrderDetailsPageProps {
  order: any;
  token: string;
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

export const AdminOrderDetailsPage: React.FC<AdminOrderDetailsPageProps> = ({
  order,
  token,
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

  const currentRank = STATUS_RANK[currentStatus] ?? 0;
  const isTerminal  = currentStatus === "DELIVERED" || currentStatus === "CANCELLED";

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

        {/* Customer card */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(17,75,54,0.06)] flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg text-[#1F2937]">
              {order.customer?.firstName}
            </h2>
            <p className="text-sm text-[#6B7280] mt-0.5">
              {order.customer?.phone}
            </p>
          </div>
          <a
            href={`tel:${order.customer?.phone}`}
            className="w-11 h-11 rounded-full bg-[#22C55E] text-white flex items-center justify-center no-underline shadow-[0_4px_12px_rgba(34,197,94,0.3)] hover:bg-[#16A34A] transition-colors"
          >
            <Phone size={18} />
          </a>
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

          {error && (
            <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-4 py-3 mb-4 text-sm font-semibold text-[#DC2626] flex items-center gap-2">
              <AlertTriangle size={15} /> {error}
            </div>
          )}

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
                      ) : isFuture ? (
                        <Circle size={15} className="text-[#D1D5DB]" />
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
    </div>
  );
};
