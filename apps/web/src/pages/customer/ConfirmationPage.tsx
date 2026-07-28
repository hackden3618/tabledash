import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, MapPin } from "lucide-react";
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
  const formattedDate = order?.orderedAt
    ? new Date(order.orderedAt).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleString();

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
              <Badge variant="danger">Received</Badge>
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
