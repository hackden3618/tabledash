import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Something went wrong",
  message = "We couldn't load this content. Please try again.",
  onRetry,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center px-6 py-16 text-center"
    >
      <div className="w-20 h-20 rounded-2xl bg-[#FEF2F2] flex items-center justify-center text-[#EF4444] mb-5">
        <AlertTriangle size={32} />
      </div>
      <h3 className="text-xl font-bold text-[#1F2937] mb-2">{title}</h3>
      <p className="text-sm text-[#6B7280] max-w-xs leading-relaxed mb-6">
        {message}
      </p>
      {onRetry && (
        <Button onClick={onRetry} icon={<RefreshCw size={18} />}>
          Try Again
        </Button>
      )}
    </motion.div>
  );
};
