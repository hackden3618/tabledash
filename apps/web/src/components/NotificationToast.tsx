import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, CheckCircle2, Info, Truck, X,
} from "lucide-react";

export type ToastType = "info" | "success" | "warning" | "danger" | "delivery";

export interface ToastNotification {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration?: number;
}

interface ToastItemProps {
  toast: ToastNotification;
  onDismiss: (id: string) => void;
}

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  info:     <Info size={18} />,
  success:  <CheckCircle2 size={18} />,
  warning:  <AlertTriangle size={18} />,
  danger:   <AlertTriangle size={18} />,
  delivery: <Truck size={18} />,
};

const TOAST_COLORS: Record<ToastType, { color: string; iconBg: string }> = {
  info:     { color: "#1D4ED8", iconBg: "#DBEAFE" },
  success:  { color: "#15803D", iconBg: "#DCFCE7" },
  warning:  { color: "#92400E", iconBg: "#FEF3C7" },
  danger:   { color: "#B91C1C", iconBg: "#FEE2E2" },
  delivery: { color: "#1D4ED8", iconBg: "#DBEAFE" },
};

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  React.useEffect(() => {
    const duration = toast.duration ?? 4500;
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const colors = TOAST_COLORS[toast.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.96 }}
      transition={{ type: "spring", damping: 20, stiffness: 300 }}
      className="bg-white border border-[#E5E7EB] rounded-2xl p-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)] flex items-start gap-3 w-[calc(100vw-40px)] max-w-md pointer-events-auto"
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: colors.iconBg, color: colors.color }}
      >
        {TOAST_ICONS[toast.type]}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm" style={{ color: colors.color }}>{toast.title}</p>
        <p className="text-xs text-[#6B7280] mt-0.5 leading-relaxed">{toast.message}</p>
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="p-1 rounded-lg hover:bg-[#F3F4F6] transition-colors text-[#9CA3AF] bg-none border-none cursor-pointer shrink-0"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
};

interface NotificationToastContainerProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

export const NotificationToastContainer: React.FC<NotificationToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9998] flex flex-col-reverse gap-2 items-center pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
};
