import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, MapPin, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { PageTransition } from "../../components/ui/PageTransition";

interface ConfirmationPageProps {
  order: any;
  onTrackOrder: (orderId: string) => void;
  onBackToHome: () => void;
}

export const ConfirmationPage: React.FC<ConfirmationPageProps> = ({
  order,
  onTrackOrder,
  onBackToHome,
}) => {
  const [liveStatus, setLiveStatus] = useState<string>(order?.status ?? "NEW");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.type === "ORDER_STATUS_UPDATED") {
        const updated = detail.payload as { id: string; status: string };
        if (updated.id === order?.id) {
          setLiveStatus(updated.status);
          setLastUpdated(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
        }
      }
    };
    window.addEventListener("tabledash:realtime", handler);
    return () => window.removeEventListener("tabledash:realtime", handler);
  }, [order?.id]);

  const formattedDate = order?.orderedAt
    ? new Date(order.orderedAt).toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : new Date().toLocaleString();

  const statusLabel: Record<string, string> = {
    NEW: "Received", ACCEPTED: "Accepted", PREPARING: "Preparing",
    READY_FOR_DELIVERY: "Ready", OUT_FOR_DELIVERY: "Out for Delivery",
    DELIVERED: "Delivered", CANCELLED: "Cancelled",
  };

  const statusRank: Record<string, number> = {
    NEW: 1, ACCEPTED: 2, PREPARING: 3,
    READY_FOR_DELIVERY: 4, OUT_FOR_DELIVERY: 5,
    DELIVERED: 6, CANCELLED: 99,
  };

  const pipeline = ["NEW", "ACCEPTED", "PREPARING", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"];
  const currentRank = statusRank[liveStatus] ?? 0;

  return (
    <div className="app-container bg-[#FFF8F0]">
      <PageTransition>
        <div className="px-4 py-8">
          {/* Success Animation */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.1 }}
            className="text-center mb-6"
          >
              <div className="w-20 h-20 bg-[#22C55E] rounded-full flex items-center justify-center mx-auto mb-4 shadow-[0_8px_24px_rgba(34,197,94,0.3)]">
                <CheckCircle2 size={40} className="text-white" />
              </div>
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-bold text-[#1F2937]"
              >
                Order Received!
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-sm text-[#6B7280] mt-1"
              >
                Thank you for your order. We'll call you shortly to confirm.
                {lastUpdated && (
                  <span className="ml-1 text-[#114B36] font-semibold">
                    • Live: {statusLabel[liveStatus] ?? liveStatus}
                  </span>
                )}
              </motion.p>
          </motion.div>

          {/* Order Details Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-3xl p-5 shadow-[0_2px_8px_rgba(17,75,54,0.06)] mb-5"
          >
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#E5E7EB]">
                <div>
                  <p className="font-bold text-lg text-[#114B36]">Order #{order?.orderNumber ?? 1042}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">{formattedDate}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="success">{statusLabel[liveStatus] ?? liveStatus}</Badge>
                  {lastUpdated && (
                    <span className="text-[0.6rem] text-[#9CA3AF] flex items-center gap-0.5">
                      <RefreshCw size={8} className="animate-spin" /> Live
                    </span>
                  )}
                </div>
              </div>

            <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-3">Items</p>
            <div className="space-y-2 mb-4">
              {order?.orderItems?.map((item: any, i: number) => (
                <motion.div
                  key={item.id || i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  className="flex items-center justify-between py-1"
                >
                  <span className="text-sm text-[#1F2937]">
                    <span className="font-semibold text-[#114B36]">{item.quantity}x</span> {item.name}
                  </span>
                  <span className="text-sm font-semibold">KSh {item.subtotal}</span>
                </motion.div>
              ))}
            </div>

            <div className="border-t border-[#E5E7EB] pt-4 flex items-center justify-between">
              <span className="font-bold text-[#1F2937]">Total</span>
              <span className="text-xl font-extrabold text-[#114B36]">KSh {order?.totalAmount}</span>
            </div>

              {/* Status Pipeline */}
              <div className="mt-4 flex items-center gap-0 mb-4">
                {pipeline.map((status, idx) => {
                  const isActive = statusRank[status] <= currentRank;
                  const isCurrent = status === liveStatus;
                  return (
                    <React.Fragment key={status}>
                      {idx > 0 && (
                        <div className={`flex-1 h-1 rounded-full ${isActive ? "bg-[#114B36]" : "bg-[#E5E7EB]"}`} />
                      )}
                      <div
                        className={`w-3 h-3 rounded-full shrink-0 ${
                          isActive ? "bg-[#114B36]" : "bg-[#D1D5DB]"
                        } ${isCurrent ? "ring-4 ring-[#114B36]/20" : ""}`}
                        title={statusLabel[status]}
                      />
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Delivery Location */}
              <div className="mt-4 p-4 bg-[#FFF8F0] rounded-2xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EBF5F0] flex items-center justify-center shrink-0">
                  <MapPin size={20} className="text-[#114B36]" />
                </div>
              <div>
                <p className="text-xs font-bold text-[#6B7280]">Delivery Location</p>
                <p className="text-sm font-semibold text-[#1F2937]">
                  {order?.marketSection}{order?.locationDescription ? ` — ${order.locationDescription}` : ""}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-3"
          >
            <Button onClick={() => onTrackOrder(order?.id)} fullWidth size="lg" variant="primary">
              Track Order
            </Button>
            <Button onClick={onBackToHome} fullWidth size="md" variant="secondary">
              Back to Home
            </Button>
          </motion.div>
        </div>
      </PageTransition>
    </div>
  );
};
