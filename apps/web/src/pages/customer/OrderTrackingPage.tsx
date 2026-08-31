import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, apiPost } from "../../lib/api";
import { useNotifications } from "../../context/NotificationsContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { Truck, XCircle, Send, Star, Share2, Check, ChefHat, ShoppingBag, Clock, CheckCircle2 } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Header } from "../../components/ui/Header";
import { Button } from "../../components/ui/Button";
import { PageTransition } from "../../components/ui/PageTransition";

interface OrderTrackingPageProps {
  orderId: string;
  onBackToHome: () => void;
}

const STATUS_STEPS = [
  { key: "NEW", label: "Order Placed", desc: "Sent to kitchen", icon: ShoppingBag },
  { key: "ACCEPTED", label: "Accepted", desc: "Kitchen confirmed", icon: CheckCircle2 },
  { key: "PREPARING", label: "Cooking Fresh", desc: "Meal is in preparation", icon: ChefHat },
  { key: "READY_FOR_DELIVERY", label: "Ready", desc: "Packed & awaiting rider", icon: Clock },
  { key: "OUT_FOR_DELIVERY", label: "Out for Delivery", desc: "Rider is on the way", icon: Truck },
  { key: "DELIVERED", label: "Delivered", desc: "Enjoy your meal!", icon: Check },
];

interface ChatMessage { id: string; body: string; createdAt: string; senderParticipantId: string; }

export const OrderTrackingPage: React.FC<OrderTrackingPageProps> = ({ orderId, onBackToHome }) => {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBody, setChatBody] = useState("");
  const [sending, setSending] = useState(false);
  const [rating, setRating] = useState(0);
  const [mealRatings, setMealRatings] = useState<Record<string, number>>({});
  const [ratingSaving, setRatingSaving] = useState(false);
  const [rated, setRated] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const { pushNotification } = useNotifications();
  const { token: customerToken, isLoggedIn } = useCustomerAuth();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchOrder = async () => {
    const res = await apiGet<any>(`/orders/${orderId}`, customerToken || undefined);
    if (res.success && res.data) setOrder(res.data);
    setLoading(false);
  };

  const fetchConversation = async () => {
    const res = await apiGet<{ id: string }>(`/messaging/orders/${orderId}/conversation`, customerToken || undefined);
    if (res.success && res.data) {
      setConvId(res.data.id);
      const msgs = await apiGet<{ messages: ChatMessage[] }>(`/messaging/conversations/${res.data.id}/messages`, customerToken || undefined);
      if (msgs.success && msgs.data) setChatMessages(msgs.data.messages);
    }
  };

  useEffect(() => { fetchOrder(); }, [orderId, customerToken]);
  useEffect(() => { if (customerToken || isLoggedIn) fetchConversation(); }, [orderId, customerToken, isLoggedIn]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.type === "ORDER_STATUS_UPDATED" && detail.payload?.id === orderId) {
        setOrder(detail.payload);
        const status = detail.payload.status;
        if (status === "OUT_FOR_DELIVERY") pushNotification("delivery", "🚀 Order Out for Delivery!", "Your meal is on its way!", { duration: 7000 });
        else if (status === "DELIVERED") pushNotification("success", "🎉 Delivered!", "Enjoy your meal!", { duration: 7000 });
        else if (status === "PREPARING") pushNotification("info", "👨‍🍳 Cooking!", "Your meal is being prepared.", { duration: 5000 });
      }
      if (detail.type === "MESSAGE_CREATED" && convId && detail.payload?.conversationId === convId) {
        setChatMessages((prev) => prev.some((m) => m.id === detail.payload.id) ? prev : [...prev, detail.payload as ChatMessage]);
      }
    };
    window.addEventListener("ladha:realtime", handler);
    return () => window.removeEventListener("ladha:realtime", handler);
  }, [orderId, convId, pushNotification]);

  const sendChat = async () => {
    if (!chatBody.trim() || sending) return;
    setSending(true);
    const result = convId
      ? await apiPost<ChatMessage>(`/messaging/conversations/${convId}/messages`, { body: chatBody.trim() }, customerToken || undefined)
      : await apiPost<ChatMessage>(`/messaging/orders/${orderId}/messages`, { body: chatBody.trim() }, customerToken || undefined);
    if (result.success && result.data) {
      setChatMessages((prev) => prev.some((m) => m.id === result.data!.id) ? prev : [...prev, result.data!]);
      setChatBody("");
      if (!convId) fetchConversation();
    }
    setSending(false);
  };

  const handleCancelOrder = async () => {
    setIsCancelling(true);
    const res = await apiPost(`/orders/${orderId}/cancel`, { reason: cancelReason || undefined }, customerToken || undefined);
    setIsCancelling(false);
    if (res.success) { setShowCancelModal(false); pushNotification("info", "Order Cancelled", "Your order has been cancelled."); fetchOrder(); }
    else pushNotification("danger", "Error", res.error || "Unable to cancel order");
  };

  const submitRating = async () => {
    if ((!rating && Object.keys(mealRatings).length === 0) || !customerToken || ratingSaving) return;
    setRatingSaving(true);
    const results = await Promise.all([
      rating ? apiPost(`/hotels/rating/${order.hotelId}`, { orderId: order.id, rating }, customerToken) : Promise.resolve({ success: true, error: undefined }),
      ...Object.entries(mealRatings).map(([productId, mealRating]) => apiPost(`/hotels/rating/${order.hotelId}/items/${productId}`, { orderId: order.id, rating: mealRating }, customerToken)),
    ]);
    setRatingSaving(false);
    const failed = results.find((result) => !result.success);
    if (!failed) { setRated(true); pushNotification("success", "Thanks for rating", "Your feedback helps customers choose with confidence."); }
    else pushNotification("danger", "Rating not saved", failed.error || "Unable to save your rating");
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Track Order #${order?.orderNumber} on Ladha`,
          text: `Follow the live delivery status of order #${order?.orderNumber}`,
          url,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (loading) return <div className="app-container"><Header title="Order Tracking" onBack={onBackToHome} /><div className="flex-1 flex items-center justify-center"><p className="text-sm text-[#6B7280]">Loading order...</p></div></div>;
  if (!order) return <div className="app-container"><Header title="Order Tracking" onBack={onBackToHome} /><div className="flex-1 flex items-center justify-center"><p className="text-sm text-[#6B7280]">Order not found</p></div></div>;

  const currentIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);
  const isTerminal = order.status === "DELIVERED" || order.status === "CANCELLED";
  const activeStep = STATUS_STEPS[currentIndex] ?? { label: order.status, desc: "" };

  return (
    <div className="app-container">
      <Header
        title={order.status === "CANCELLED" ? "Order Cancelled" : "Live Order Status"}
        subtitle={`${order.hotel?.name ? `${order.hotel.name} · ` : ""}Order #${order.orderNumber}`}
        onBack={onBackToHome}
        rightAction={
          <button
            onClick={handleShare}
            className="p-2 rounded-xl text-white hover:bg-white/10 transition-colors border-none bg-transparent cursor-pointer"
            title="Share Tracking Link"
          >
            {copiedLink ? <Check size={18} className="text-[#86EFAC]" /> : <Share2 size={18} />}
          </button>
        }
      />
      <PageTransition className="flex-1 px-4 py-5 overflow-y-auto" style={{ height: `calc(100dvh - 64px - 56px)`, overscrollBehaviorY: "contain" }}>
        {order.status === "CANCELLED" ? (
          <div className="rounded-2xl bg-[#FEF2F2] border-2 border-[#FCA5A5] p-5 mb-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#FEE2E2] flex items-center justify-center text-[#EF4444] shrink-0">
                <XCircle size={22} />
              </div>
              <div>
                <p className="font-bold text-[#991B1B]">Order Cancelled</p>
                <p className="text-xs text-[#B91C1C]">This order has been cancelled.</p>
              </div>
            </div>
            {order.cancelReason && (
              <div className="bg-white rounded-xl p-3 mt-3 border border-[#FECACA]">
                <p className="text-xs font-bold text-[#6B7280]">Reason</p>
                <p className="text-sm text-[#1F2937] mt-1">{order.cancelReason}</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Top Live Hero Card */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-[#114B36] to-[#0A3022] rounded-3xl p-5 mb-6 text-white shadow-lg relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-[#86EFAC] bg-white/10 px-2.5 py-1 rounded-full backdrop-blur-sm">
                  ORDER #{order.orderNumber}
                </span>
                <span className="text-xs font-semibold text-white/75">
                  {order.hotel?.name}
                </span>
              </div>
              <h2 className="text-2xl font-black mt-2.5 tracking-tight">{activeStep.label}</h2>
              <p className="text-xs text-white/80 mt-1">{activeStep.desc}</p>

              <div className="mt-4 pt-3.5 border-t border-white/15 flex items-center justify-between text-xs">
                <span className="text-white/70">Delivery to:</span>
                <span className="font-bold text-white truncate max-w-[200px]">
                  {order.marketSection || order.stallNumber || "Specified location"}
                </span>
              </div>
            </motion.div>

            {order.status === "OUT_FOR_DELIVERY" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#EFF6FF] border border-[#93C5FD] rounded-2xl p-4 mb-6 flex items-center gap-3.5 shadow-sm"
              >
                <div className="w-11 h-11 rounded-2xl bg-[#DBEAFE] flex items-center justify-center text-[#1D4ED8] shrink-0">
                  <Truck size={22} className="animate-bounce" />
                </div>
                <div>
                  <p className="font-bold text-sm text-[#1E40AF]">🚀 Rider is on the way!</p>
                  <p className="text-xs text-[#3B82F6] mt-0.5">Keep your phone nearby. The rider will contact you upon arrival.</p>
                </div>
              </motion.div>
            )}

            {/* Stepper Timeline */}
            <div className="bg-white rounded-3xl border border-[#E8DED2] p-5 shadow-sm mb-6">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#789083] mb-4">Order Progress</p>
              <div className="space-y-5 relative">
                {STATUS_STEPS.map((step, idx) => {
                  const isCompleted = idx <= currentIndex;
                  const isCurrent = idx === currentIndex;
                  const StepIcon = step.icon;
                  return (
                    <div key={step.key} className="flex items-start gap-3.5 relative">
                      {idx < STATUS_STEPS.length - 1 && (
                        <div
                          className={`absolute left-4 top-8 -bottom-5 w-0.5 transition-colors ${
                            idx < currentIndex ? "bg-[#114B36]" : "bg-[#E5E7EB]"
                          }`}
                        />
                      )}
                      <motion.div
                        animate={isCurrent ? { scale: [1, 1.1, 1] } : {}}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs z-10 shrink-0 shadow-sm ${
                          isCompleted
                            ? "bg-[#114B36] text-white"
                            : "bg-[#F3F4F6] text-[#9CA3AF] border border-[#E5E7EB]"
                        } ${isCurrent ? "ring-4 ring-[#86EFAC]/40" : ""}`}
                      >
                        <StepIcon size={14} />
                      </motion.div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={`font-bold text-sm ${isCompleted ? "text-[#1F2937]" : "text-[#9CA3AF]"}`}>
                            {step.label}
                          </p>
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 text-[0.62rem] font-extrabold text-[#15803D] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-[#15803D] rounded-full animate-pulse" /> Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#6B7280] mt-0.5">{step.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Order Items Card */}
            <div className="bg-white rounded-3xl border border-[#E8DED2] p-5 shadow-sm mb-6">
              <div className="flex items-center justify-between pb-3 border-b border-[#F3F4F6]">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#789083]">Order Items</p>
                <span className="text-xs font-bold text-[#114B36]">KSh {order.totalAmount}</span>
              </div>
              <div className="divide-y divide-[#F9FAFB] mt-2">
                {(order.orderItems ?? []).map((item: any) => {
                  const lineTotal = Number(item.subtotal ?? (Number(item.unitPrice ?? item.price ?? 0) * (item.quantity ?? 1)));
                  return (
                    <div key={item.productId || item.id} className="py-2.5 flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#1F2937]">
                        {item.quantity}× {item.name}
                      </span>
                      <span className="font-bold text-[#6B7280]">KSh {Number.isFinite(lineTotal) ? lineTotal.toFixed(0) : "0"}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rating Section */}
            {order.status === "DELIVERED" && isLoggedIn && !rated && (
              <div className="rounded-3xl border border-[#E8DED2] bg-white p-5 shadow-sm mb-6">
                <p className="text-sm font-black text-[#1F2937]">How was your food?</p>
                <p className="mt-1 text-xs text-[#6B7280]">Your feedback helps improve food quality and speed.</p>
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#789083]">Rate {order.hotel?.name}</p>
                  <div className="mt-1 flex items-center gap-1" role="radiogroup" aria-label="Rate hotel experience">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRating(value)}
                        className={`rounded-lg border-none bg-transparent p-1 cursor-pointer ${value <= rating ? "text-[#C58A1A]" : "text-[#D1D5DB]"}`}
                      >
                        <Star size={24} fill="currentColor" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {(order.orderItems ?? []).map((item: any) => (
                    <div key={item.productId} className="flex items-center justify-between gap-2 rounded-xl bg-[#FFFDF9] px-3 py-2 border border-[#F3E8D6]">
                      <span className="min-w-0 truncate text-xs font-bold text-[#1F2937]">{item.name}</span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setMealRatings((current) => ({ ...current, [item.productId]: value }))}
                            className={`border-none bg-transparent p-0.5 cursor-pointer ${value <= (mealRatings[item.productId] ?? 0) ? "text-[#C58A1A]" : "text-[#D1D5DB]"}`}
                          >
                            <Star size={16} fill="currentColor" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Button size="sm" className="mt-4" onClick={() => void submitRating()} disabled={!rating && Object.keys(mealRatings).length === 0} loading={ratingSaving}>
                  Submit feedback
                </Button>
              </div>
            )}
            {order.status === "DELIVERED" && (rated || order.review) && (
              <div className="rounded-3xl bg-[#EBF5F0] p-4 text-sm font-bold text-[#114B36] text-center mb-6">
                🎉 Thanks — your experience has been rated!
              </div>
            )}

            {(order.status === "NEW" || order.status === "ACCEPTED" || order.status === "PREPARING") && isLoggedIn && (
              <Button onClick={() => setShowCancelModal(true)} variant="danger" fullWidth size="md" icon={<XCircle size={18} />} className="mb-4">
                Cancel Order
              </Button>
            )}
          </>
        )}

        {/* Inline order chat */}
        {!isTerminal && (
          <div className="border border-[#E5E7EB] rounded-3xl overflow-hidden shadow-sm mb-6 bg-white">
            <div className="bg-[#EBF5F0] px-4 py-3 border-b border-[#D1E4D8] flex items-center justify-between">
              <div>
                <p className="text-[0.65rem] font-black tracking-wider text-[#114B36]">ORDER CHAT</p>
                <p className="text-xs text-[#6B7280]">Direct message with the kitchen</p>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto px-4 py-3 space-y-2.5 bg-white">
              {chatMessages.length === 0 ? (
                <p className="text-xs text-[#9CA3AF] text-center py-4">No messages yet. Send instructions or questions to the kitchen.</p>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="text-xs">
                    <span className="text-[#9CA3AF] text-[0.65rem]">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <p className="text-sm text-[#1F2937] mt-0.5 bg-[#F9FAFB] rounded-xl px-3 py-2 inline-block max-w-[85%] border border-[#E5E7EB]">
                      {msg.body}
                    </p>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2 p-3 bg-[#FFFDF9] border-t border-[#E5E7EB]">
              <input
                value={chatBody}
                onChange={(e) => setChatBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void sendChat(); } }}
                placeholder="Type a note to the kitchen..."
                className="flex-1 rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-sm outline-none focus:border-[#114B36]"
              />
              <Button size="sm" onClick={() => void sendChat()} loading={sending} disabled={!chatBody.trim()} icon={<Send size={14} />}>
                Send
              </Button>
            </div>
          </div>
        )}

        <Button onClick={onBackToHome} variant="secondary" fullWidth size="md" className="mb-4">
          Back to Menu
        </Button>
      </PageTransition>

      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        type="danger"
        title="Cancel Order?"
        message="Please tell us why you'd like to cancel so we can improve."
        primaryAction={{ label: isCancelling ? "Cancelling..." : "Yes, Cancel Order", onClick: handleCancelOrder, variant: "danger", loading: isCancelling }}
        secondaryAction={{ label: "Keep Order", onClick: () => setShowCancelModal(false), variant: "secondary" }}
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
