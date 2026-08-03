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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm"
          onClick={dismissible && onClose ? onClose : undefined}
        >
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-white rounded-3xl rounded-b-none sm:rounded-3xl w-full max-w-md p-6 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] sm:mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
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

            <h3 className="text-lg font-bold text-[#1F2937] mb-2">{title}</h3>
            {message && (
              <p className="text-sm text-[#6B7280] leading-relaxed mb-6">{message}</p>
            )}
            {children}

            {(primaryAction || secondaryAction) && (
              <div className="flex gap-3 mt-2">
                {secondaryAction && (
                  <Button
                    variant="secondary"
                    onClick={secondaryAction.onClick}
                    loading={secondaryAction.loading}
                    fullWidth
                    size="md"
                  >
                    {secondaryAction.label}
                  </Button>
                )}
                {primaryAction && (
                  <Button
                    variant={primaryAction.variant === "danger" ? "danger" : "primary"}
                    onClick={primaryAction.onClick}
                    loading={primaryAction.loading}
                    fullWidth
                    size="md"
                  >
                    {primaryAction.label}
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
