import React from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "whatsapp";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  className?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-[#114B36] text-white hover:bg-[#0D3D2B] shadow-[0_2px_8px_rgba(17,75,54,0.2)] active:shadow-none",
  secondary: "bg-white text-[#114B36] border-2 border-[#114B36] hover:bg-[#EBF5F0] active:bg-[#C2E2D3]",
  ghost: "bg-transparent text-[#6B7280] hover:bg-[#F3F4F6] active:bg-[#E5E7EB]",
  danger: "bg-[#EF4444] text-white hover:bg-[#DC2626] shadow-[0_2px_8px_rgba(239,68,68,0.2)] active:shadow-none",
  whatsapp: "bg-[#25D366] text-white hover:bg-[#20BA5A] shadow-[0_2px_8px_rgba(37,211,102,0.2)]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm rounded-xl gap-1.5",
  md: "px-6 py-3.5 text-base rounded-xl gap-2",
  lg: "px-8 py-4 text-lg rounded-2xl gap-2.5",
};

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  fullWidth = false,
  disabled,
  children,
  className = "",
  type = "button",
  onClick,
}) => {
  return (
    <motion.button
      whileHover={!disabled && !loading ? { scale: 1.02 } : undefined}
      whileTap={!disabled && !loading ? { scale: 0.97 } : undefined}
      disabled={disabled || loading}
      type={type}
      onClick={onClick}
      className={`
        inline-flex items-center justify-center font-semibold
        transition-all duration-200 ease-out cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale-[0.3]
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? "w-full" : ""}
        ${className}
      `}
    >
      {loading ? (
        <Loader2 className="animate-spin" size={size === "sm" ? 16 : 20} />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </motion.button>
  );
};
