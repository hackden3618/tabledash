import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, apiPost } from "../../lib/api";
import { useWebSocket } from "../../lib/websocket";
import { useNotifications } from "../../context/NotificationsContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { Truck, XCircle } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Header } from "../../components/ui/Header";
import { Button } from "../../components/ui/Button";
import { PageTransition } from "../../components/ui/PageTransition";

interface OrderTrackingPageProps {
  orderId: string;
  onBackToHome: () => void;
}

const STATUSES = [
  { key: "NEW", label: "Order Placed" },
  { key: "ACCEPTED", label: "Accepted by Kitchen" },
  { key: "PREPARING", label: "Preparing Meal" },
  { key: "READY_FOR_DELIVERY", label: "Ready for Delivery" },
  { key: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
  { key: "DELIVERED", label: "Delivered" },
];

export const OrderTrackingPage: React.FC<OrderTrackingPageProps> = ({
  orderId,
  onBackToHome,
}) => {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const { pushNotification } = useNotifications();
  const { token: customerToken, isLoggedIn } = useCustomerAuth();

  const fetchOrder = async () => {
    const res = await apiGet<any>(`/orders/${orderId}`);
    if (res.success && res.data) {
      setOrder(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  useWebSocket("customer", orderId, (event) => {
    if (event.type === "ORDER_STATUS_UPDATED" && (event.payload as any)?.id === orderId) {
      const updated = event.payload as any;
      setOrder(updated);

      if (updated.status === "OUT_FOR_DELIVERY") {
        pushNotification("delivery", "🚀 Order Out for Delivery!", "Your meal is on its way!", { duration: 7000 });
      } else if (updated.status === "DELIVERED") {
        pushNotification("success", "🎉 Delivered!", "Enjoy your meal!", { duration: 7000 });
      } else if (updated.status === "PREPARING") {
        pushNotification("info", "👨‍🍳 Preparing", "Kitchen is preparing your order.");
      } else if (updated.status === "CANCELLED") {
        pushNotification("danger", "⚠️ Cancelled", updated.cancelReason || "Order was cancelled.");
      }
    } else if (event.type === "ORDER_PAYMENT_UPDATED" && (event.payload as any)?.id === orderId) {
      const p = event.payload as any;
      pushNotification("success", "💰 Payment Updated",
        p.paymentStatus === "PAID" ? "Fully paid! ✅" : `Payment: ${p.paymentStatus} (KSh ${p.amountPaid})`,
        { duration: 5000 });
    } else if (event.type === "NOTIFICATION" && (event.payload as any)?.orderId === orderId) {
      const n = event.payload as any;
      pushNotification(n.category === "cancellation" ? "danger" : "info", n.title, n.message, { duration: 6000 });
    }
  });

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) return;
    setIsCancelling(true);
    const res = await apiPost<any>(`/orders/${orderId}/cancel`, { reason: cancelReason.trim() }, customerToken);
    setIsCancelling(false);
    setShowCancelModal(false);
    if (res.success) {
      pushNotification("info", "✅ Cancelled", "Your order has been cancelled.");
      setOrder(res.data);
    } else {
      pushNotification("danger", "Cancellation Failed", res.error || "Please try again.");
    }
  };

  const isCancelled = order?.status === "CANCELLED";

  const getStatusIndex = (status: string) => STATUSES.findIndex((s) => s.key === status);

  const cancelledAtIdx = isCancelled && order?.cancelledAtStatus
    ? getStatusIndex(order.cancelledAtStatus)
    : -1;
  const currentIndex = order && !isCancelled ? getStatusIndex(order.status) : cancelledAtIdx;

  if (loading) {
    return (
      <div className="app-container">
        <Header title="Live Order Tracker" onBack={onBackToHome} />
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-[#E5E7EB] border-t-[#114B36] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-[#6B7280]">Connecting live tracker...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="app-container">
        <Header title="Live Order Tracker" onBack={onBackToHome} />
        <div className="flex flex-col items-center justify-center py-24">
          <p className="text-sm text-[#6B7280] mb-4">Order not found.</p>
          <Button onClick={onBackToHome} variant="secondary" size="sm">Back to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header title="Live Order Tracker" onBack={onBackToHome} />

      <PageTransition>
        <div className="px-4 py-5">
          {isCancelled ? (
            <>
              {/* Cancelled Banner */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#FEE2E2] border-2 border-[#EF4444] rounded-2xl p-5 mb-5 text-center"
              >
                <div className="text-3xl mb-2">⚠️</div>
                <h2 className="text-lg font-extrabold text-[#DC2626]">Order Cancelled</h2>
                {order.cancelReason && (
                  <p className="text-sm text-[#991B1B] mt-1">Reason: {order.cancelReason}</p>
                )}
              </motion.div>

              <div className="bg-[#F3F4F6] rounded-2xl p-4 mb-6 text-center">
                <p className="text-xs font-bold text-[#114B36]">ORDER #{order.orderNumber}</p>
                <p className="text-xs text-[#6B7280] mt-1">
                  Location: {order.marketSection}{order.locationDescription ? ` — ${order.locationDescription}` : ""}
                </p>
              </div>

              {/* Cancelled Timeline */}
              <div className="space-y-4 pl-2">
                {STATUSES.map((step, idx) => {
                  const isCompleted = idx <= currentIndex;
                  const isCutoff = idx === currentIndex;
                  return (
                    <div key={step.key} className="flex items-center gap-4 relative">
                      <div
                        className={`
                          w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm z-10 shrink-0
                          ${isCompleted ? "bg-[#DC2626] text-white" : "bg-[#E5E7EB] text-[#9CA3AF]"}
                          ${isCutoff ? "shadow-[0_0_0_4px_rgba(239,68,68,0.2)]" : ""}
                        `}
                      >
                        {isCompleted ? "✕" : idx + 1}
                      </div>
                      <div>
                        <p className={`font-semibold text-sm ${isCompleted ? "text-[#DC2626]" : "text-[#9CA3AF]"}`}>
                          {step.label}
                        </p>
                        {isCutoff && (
                          <p className="text-xs font-bold text-[#DC2626] mt-0.5">✕ Cancelled at this stage</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* Active Order Banner */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#EBF5F0] rounded-2xl p-5 border-2 border-[#114B36] mb-6 text-center relative overflow-hidden"
              >
                {order.status === "OUT_FOR_DELIVERY" && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(17,75,54,0.03)] to-transparent animate-pulse" />
                )}
                <p className="text-xs font-bold text-[#114B36]">ORDER #{order.orderNumber}</p>
                <p className="text-xl font-extrabold text-[#1F2937] mt-1">
                  {STATUSES.find((s) => s.key === order.status)?.label || order.status}
                </p>
                <p className="text-xs text-[#6B7280] mt-1">
                  Location: {order.marketSection}{order.locationDescription ? ` — ${order.locationDescription}` : ""}
                </p>
              </motion.div>

              {/* Out for Delivery special banner */}
              {order.status === "OUT_FOR_DELIVERY" && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#EFF6FF] border-2 border-[#60A5FA] rounded-2xl p-4 mb-5 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#DBEAFE] flex items-center justify-center text-[#1D4ED8] shrink-0">
                    <Truck size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-[#1E40AF]">🚀 Out for Delivery!</p>
                    <p className="text-xs text-[#1D4ED8] mt-0.5">An SMS update was sent. Keep your phone handy!</p>
                  </div>
                </motion.div>
              )}

              {/* Timeline */}
              <div className="space-y-4 pl-2">
                {STATUSES.map((step, idx) => {
                  const isCompleted = idx <= currentIndex;
                  const isCurrent = idx === currentIndex;
                  return (
                    <div key={step.key} className="flex items-center gap-4 relative">
                      <motion.div
                        initial={isCurrent ? { scale: 0 } : undefined}
                        animate={isCurrent ? { scale: 1 } : undefined}
                        transition={{ type: "spring", damping: 10, stiffness: 200 }}
                        className={`
                          w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm z-10 shrink-0
                          ${isCompleted ? "bg-[#114B36] text-white" : "bg-[#E5E7EB] text-[#9CA3AF]"}
                          ${isCurrent ? "shadow-[0_0_0_4px_rgba(17,75,54,0.15)]" : ""}
                        `}
                      >
                        {isCompleted ? "✓" : idx + 1}
                      </motion.div>
                      <div>
                        <p className={`font-semibold text-sm ${isCompleted ? "text-[#1F2937]" : "text-[#9CA3AF]"}`}>
                          {step.label}
                        </p>
                        {isCurrent && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-xs font-bold text-[#22C55E] mt-0.5 flex items-center gap-1"
                          >
                            <span className="w-1.5 h-1.5 bg-[#22C55E] rounded-full inline-block animate-pulse" />
                            Current Status
                          </motion.p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Cancel Button */}
              {(order.status === "NEW" || order.status === "ACCEPTED" || order.status === "PREPARING") && isLoggedIn && (
                <Button
                  onClick={() => setShowCancelModal(true)}
                  variant="danger"
                  fullWidth
                  size="md"
                  icon={<XCircle size={18} />}
                  className="mt-6"
                >
                  Cancel Order
                </Button>
              )}
            </>
          )}

          <Button onClick={onBackToHome} variant="secondary" fullWidth size="md" className="mt-3">
            Back to Menu
          </Button>
        </div>
      </PageTransition>

      {/* Cancel Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        type="danger"
        title="Cancel Order?"
        message="Please tell us why you'd like to cancel so we can improve."
        primaryAction={{
          label: isCancelling ? "Cancelling..." : "Yes, Cancel Order",
          onClick: handleCancelOrder,
          variant: "danger",
          loading: isCancelling,
        }}
        secondaryAction={{
          label: "Keep Order",
          onClick: () => setShowCancelModal(false),
          variant: "secondary",
        }}
      >
        <div className="mb-4">
          <textarea
            placeholder="e.g. Changed my mind, wrong items..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="w-full bg-[#F3F4F6] rounded-xl px-4 py-3 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] outline-none resize-none border-2 border-transparent focus:border-[#EF4444] focus:bg-white transition-all"
            rows={3}
          />
        </div>
      </Modal>
    </div>
  );
};
