import React from "react";
import { motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";

interface QuantitySelectorProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  max?: number;
  disabled?: boolean;
}

export const QuantitySelector: React.FC<QuantitySelectorProps> = ({
  quantity,
  onIncrement,
  onDecrement,
  max = 99,
  disabled = false,
}) => {
  if (quantity === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-1 bg-[#EBF5F0] rounded-xl border-2 border-[#114B36] overflow-hidden"
    >
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onDecrement}
        disabled={disabled}
        className="flex items-center justify-center w-9 h-9 text-[#114B36] font-bold bg-none border-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#C2E2D3] transition-colors"
        aria-label="Decrease quantity"
      >
        <Minus size={16} strokeWidth={3} />
      </motion.button>

      <span className="w-10 text-center font-bold text-sm text-[#114B36] tabular-nums">
        {quantity}
      </span>

      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onIncrement}
        disabled={disabled || quantity >= max}
        className="flex items-center justify-center w-9 h-9 text-[#114B36] font-bold bg-none border-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#C2E2D3] transition-colors"
        aria-label="Increase quantity"
      >
        <Plus size={16} strokeWidth={3} />
      </motion.button>
    </motion.div>
  );
};

interface AddToCartButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

export const AddToCartButton: React.FC<AddToCartButtonProps> = ({
  onClick,
  disabled = false,
  label = "Add",
}) => {
  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.05 } : undefined}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`
        px-4 py-2 rounded-xl font-bold text-sm border-2 transition-all duration-200
        ${disabled
          ? "bg-[#F3F4F6] text-[#9CA3AF] border-[#E5E7EB] cursor-not-allowed"
          : "bg-[#EBF5F0] text-[#114B36] border-[#114B36] cursor-pointer hover:bg-[#114B36] hover:text-white"
        }
      `}
    >
      {disabled ? "Closed" : label === "Add" ? "+ Add" : label}
    </motion.button>
  );
};
