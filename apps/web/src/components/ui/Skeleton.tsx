import React from "react";

interface SkeletonProps {
  className?: string;
  variant?: "rect" | "circle" | "text";
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = "",
  variant = "rect",
}) => {
  return (
    <div
      className={`
        bg-[#E5E7EB] animate-pulse
        ${variant === "circle" ? "rounded-full" : "rounded-xl"}
        ${className}
      `}
    />
  );
};

export const MenuCardSkeleton: React.FC = () => (
  <div className="flex gap-4 items-center p-4 bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
    <Skeleton className="w-20 h-20 shrink-0" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-5 w-1/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  </div>
);

export const HotelCardSkeleton: React.FC = () => (
  <div className="flex gap-4 items-center p-4 bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
    <Skeleton className="w-12 h-12 shrink-0" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  </div>
);

export const OrderCardSkeleton: React.FC = () => (
  <div className="p-4 bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)] space-y-3">
    <div className="flex justify-between">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-5 w-20 rounded-full" />
    </div>
    <Skeleton className="h-3 w-1/4" />
    <div className="flex justify-between items-center pt-2 border-t border-[#F3F4F6]">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-5 w-20" />
    </div>
  </div>
);
