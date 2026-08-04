import React from "react";
import { motion } from "framer-motion";
import { Button } from "./Button";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  secondaryAction,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center px-6 py-16 text-center"
    >
      <div className="w-20 h-20 rounded-2xl bg-[#EBF5F0] flex items-center justify-center text-[#114B36] mb-5">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-[#1F2937] mb-2">{title}</h3>
      <p className="text-sm text-[#6B7280] max-w-xs leading-relaxed mb-6">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick} size="md">
          {action.label}
        </Button>
      )}
      {secondaryAction && (
        <button
          onClick={secondaryAction.onClick}
          className="mt-3 text-sm font-semibold text-[#6B7280] hover:text-[#1F2937] transition-colors cursor-pointer bg-none border-none"
        >
          {secondaryAction.label}
        </button>
      )}
    </motion.div>
  );
};
