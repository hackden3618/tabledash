import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Button } from "./Button";

export type ModalType = "info" | "warning" | "danger" | "success" | "confirm";

interface ModalAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
}

interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title: string;
  message?: string;
  children?: React.ReactNode;
  type?: ModalType;
  primaryAction?: ModalAction;
  secondaryAction?: ModalAction;
  /** When false the modal cannot be dismissed (no close button, backdrop click is ignored). */
  dismissible?: boolean;
}

const typeIcons: Record<ModalType, React.ReactNode> = {
  info: <Info size={24} />,
  warning: <AlertTriangle size={24} />,
  danger: <AlertTriangle size={24} />,
  success: <CheckCircle2 size={24} />,
  confirm: <Info size={24} />,
};

const typeIconBg: Record<ModalType, string> = {
  info: "bg-[#DBEAFE] text-[#1D4ED8]",
  warning: "bg-[#FEF3C7] text-[#D97706]",
  danger: "bg-[#FEE2E2] text-[#DC2626]",
  success: "bg-[#DCFCE7] text-[#15803D]",
  confirm: "bg-[#EBF5F0] text-[#114B36]",
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  children,
  type = "info",
  primaryAction,
  secondaryAction,
  dismissible = true,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#10271e]/55 p-4 backdrop-blur-sm"
          onClick={dismissible && onClose ? onClose : undefined}
        >
          <motion.div
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-[0_18px_46px_rgba(0,0,0,0.22)] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${typeIconBg[type]}`}>
                {typeIcons[type]}
              </div>
              {onClose && dismissible && (
                <button
                  onClick={onClose}
                  className="p-1 text-[#9CA3AF] hover:text-[#6B7280] transition-colors bg-none border-none cursor-pointer rounded-lg hover:bg-[#F3F4F6]"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            <h3 className="mb-2 text-lg font-black tracking-[-0.01em] text-[#1F2937]">{title}</h3>
            {message && (
              <p className="text-sm text-[#6B7280] leading-relaxed mb-6">{message}</p>
            )}
            {children}

            {(primaryAction || secondaryAction) && (
              <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row">
                {secondaryAction && (
                  <div className="min-w-0 flex-1"><Button variant="secondary" onClick={secondaryAction.onClick} loading={secondaryAction.loading} disabled={secondaryAction.disabled} fullWidth size="md">{secondaryAction.label}</Button></div>
                )}
                {primaryAction && (
                  <div className="min-w-0 flex-1"><Button variant={primaryAction.variant === "danger" ? "danger" : "primary"} onClick={primaryAction.onClick} loading={primaryAction.loading} disabled={primaryAction.disabled} fullWidth size="md">{primaryAction.label}</Button></div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
