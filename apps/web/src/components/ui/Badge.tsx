import React from "react";

type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  size?: "sm" | "md";
  pill?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-[#DCFCE7] text-[#15803D]",
  warning: "bg-[#FEF3C7] text-[#D97706]",
  danger: "bg-[#FEE2E2] text-[#DC2626]",
  info: "bg-[#DBEAFE] text-[#1D4ED8]",
  neutral: "bg-[#F3F4F6] text-[#6B7280]",
  brand: "bg-[#EBF5F0] text-[#114B36]",
};

export const Badge: React.FC<BadgeProps> = ({
  variant = "neutral",
  children,
  size = "sm",
  pill = true,
}) => {
  return (
    <span
      className={`
        inline-flex items-center font-bold leading-none
        ${pill ? "rounded-full" : "rounded-lg"}
        ${size === "sm" ? "text-[0.65rem] px-2.5 py-1" : "text-[0.75rem] px-3 py-1.5"}
        ${variantStyles[variant]}
      `}
    >
      {children}
    </span>
  );
};

interface StatusBadgeProps {
  status: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  NEW: { label: "New", variant: "danger" },
  ACCEPTED: { label: "Accepted", variant: "warning" },
  PREPARING: { label: "Preparing", variant: "info" },
  READY_FOR_DELIVERY: { label: "Ready", variant: "info" },
  OUT_FOR_DELIVERY: { label: "Out for Delivery", variant: "warning" },
  DELIVERED: { label: "Delivered", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "danger" },
  PAID: { label: "Paid", variant: "success" },
  UNPAID: { label: "Unpaid", variant: "warning" },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || { label: status, variant: "neutral" as BadgeVariant };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};
