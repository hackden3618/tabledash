import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { apiGet, apiPost } from "../../lib/api";
import { useNotifications } from "../../context/NotificationsContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { Truck, XCircle, Send } from "lucide-react";
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
    window.addEventListener("tabledash:realtime", handler);
    return () => window.removeEventListener("tabledash:realtime", handler);
  }, [orderId, convId, pushNotification]);

  const sendChat = async () => {
    if (!chatBody.trim() || sending) return;
    setSending(true);
    // The order-level endpoint lazily creates the conversation on the first
    // message from either side; after that we reuse the existing thread.
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

  if (loading) return <div className="app-container"><Header title="Order Tracking" onBack={onBackToHome} /><div className="flex-1 flex items-center justify-center"><p className="text-sm text-[#6B7280]">Loading order...</p></div></div>;
  if (!order) return <div className="app-container"><Header title="Order Tracking" onBack={onBackToHome} /><div className="flex-1 flex items-center justify-center"><p className="text-sm text-[#6B7280]">Order not found</p></div></div>;

  const currentIndex = STATUSES.findIndex((s) => s.key === order.status);
  const isTerminal = order.status === "DELIVERED" || order.status === "CANCELLED";

  return (
    <div className="app-container">
      <Header title={order.status === "CANCELLED" ? "Order Cancelled" : "Order Tracking"} subtitle={`Order #${order.orderNumber}`} onBack={onBackToHome} />
      <PageTransition className="flex-1 px-4 py-5 overflow-y-auto" style={{ height: `calc(100dvh - 64px - 56px)` }}>
        {order.status === "CANCELLED" ? (
          <div className="rounded-2xl bg-[#FEF2F2] border-2 border-[#FCA5A5] p-5 mb-5">
            <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-full bg-[#FEE2E2] flex items-center justify-center text-[#EF4444]"><XCircle size={20} /></div><div><p className="font-bold text-[#991B1B]">Order Cancelled</p><p className="text-xs text-[#B91C1C]">This order has been cancelled.</p></div></div>
            {order.cancelReason && <div className="bg-white rounded-xl p-3 mt-3"><p className="text-xs font-bold text-[#6B7280]">Reason</p><p className="text-sm text-[#1F2937] mt-1">{order.cancelReason}</p></div>}
          </div>
        ) : (
          <>
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#EBF5F0] rounded-2xl p-5 border-2 border-[#114B36] mb-6 text-center relative overflow-hidden">
              {order.status === "OUT_FOR_DELIVERY" && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(17,75,54,0.03)] to-transparent animate-pulse" />}
              <p className="text-xs font-bold text-[#114B36]">ORDER #{order.orderNumber}</p>
              <p className="text-xl font-extrabold text-[#1F2937] mt-1">{STATUSES.find((s) => s.key === order.status)?.label || order.status}</p>
              <p className="text-xs text-[#6B7280] mt-1">Location: {order.marketSection}{order.locationDescription ? ` — ${order.locationDescription}` : ""}</p>
            </motion.div>

            {order.status === "OUT_FOR_DELIVERY" && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#EFF6FF] border-2 border-[#60A5FA] rounded-2xl p-4 mb-5 flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-[#DBEAFE] flex items-center justify-center text-[#1D4ED8] shrink-0"><Truck size={20} /></div><div><p className="font-bold text-sm text-[#1E40AF]">🚀 Out for Delivery!</p><p className="text-xs text-[#1D4ED8] mt-0.5">An SMS update was sent. Keep your phone handy!</p></div></motion.div>}

            <div className="space-y-4 pl-2">
              {STATUSES.map((step, idx) => {
                const isCompleted = idx <= currentIndex;
                const isCurrent = idx === currentIndex;
                return <div key={step.key} className="flex items-center gap-4 relative"><motion.div initial={isCurrent ? { scale: 0 } : undefined} animate={isCurrent ? { scale: 1 } : undefined} transition={{ type: "spring", damping: 10, stiffness: 200 }} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm z-10 shrink-0 ${isCompleted ? "bg-[#114B36] text-white" : "bg-[#E5E7EB] text-[#9CA3AF]"} ${isCurrent ? "shadow-[0_0_0_4px_rgba(17,75,54,0.15)]" : ""}`}>{isCompleted ? "✓" : idx + 1}</motion.div><div><p className={`font-semibold text-sm ${isCompleted ? "text-[#1F2937]" : "text-[#9CA3AF]"}`}>{step.label}</p>{isCurrent && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs font-bold text-[#22C55E] mt-0.5 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-[#22C55E] rounded-full inline-block animate-pulse" /> Current Status</motion.p>}</div></div>;
              })}
            </div>

            {(order.status === "NEW" || order.status === "ACCEPTED" || order.status === "PREPARING") && isLoggedIn && (
              <Button onClick={() => setShowCancelModal(true)} variant="danger" fullWidth size="md" icon={<XCircle size={18} />} className="mt-6">Cancel Order</Button>
            )}
          </>
        )}

        {/* Inline order chat */}
        {!isTerminal && <div className="mt-6 border border-[#E5E7EB] rounded-2xl overflow-hidden"><div className="bg-[#EBF5F0] px-4 py-2.5 border-b border-[#D1E4D8]"><p className="text-[0.6rem] font-bold text-[#114B36]">ORDER CHAT</p><p className="text-xs text-[#6B7280]">Chat with the kitchen about this order</p></div><div className="max-h-48 overflow-y-auto px-4 py-3 space-y-2 bg-white">{chatMessages.length === 0 ? <p className="text-xs text-[#9CA3AF] text-center py-4">No messages yet. Send a note to the kitchen.</p> : chatMessages.map((msg) => <div key={msg.id} className="text-xs"><span className="text-[#9CA3AF]">{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><p className="text-sm text-[#1F2937] mt-0.5">{msg.body}</p></div>)}<div ref={chatEndRef} /></div><div className="flex gap-2 p-3 bg-[#FFF8F0] border-t border-[#E5E7EB]"><input value={chatBody} onChange={(e) => setChatBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void sendChat(); } }} placeholder="Type a message..." className="flex-1 rounded-xl border-2 border-[#E5E7EB] bg-white px-3 py-2 text-sm outline-none focus:border-[#114B36]" /><Button size="sm" onClick={() => void sendChat()} loading={sending} disabled={!chatBody.trim()} icon={<Send size={14} />}>Send</Button></div></div>}

        <Button onClick={onBackToHome} variant="secondary" fullWidth size="md" className="mt-3">Back to Menu</Button>
      </PageTransition>

      <Modal isOpen={showCancelModal} onClose={() => setShowCancelModal(false)} type="danger" title="Cancel Order?" message="Please tell us why you'd like to cancel so we can improve." primaryAction={{ label: isCancelling ? "Cancelling..." : "Yes, Cancel Order", onClick: handleCancelOrder, variant: "danger", loading: isCancelling }} secondaryAction={{ label: "Keep Order", onClick: () => setShowCancelModal(false), variant: "secondary" }}>
        <div className="mb-4"><textarea placeholder="e.g. Changed my mind, wrong items..." value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="w-full bg-[#F3F4F6] rounded-xl px-4 py-3 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] outline-none resize-none border-2 border-transparent focus:border-[#EF4444] focus:bg-white transition-all" rows={3} /></div>
      </Modal>
    </div>
  );
};
