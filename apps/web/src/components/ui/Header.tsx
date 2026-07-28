import React from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Bell, ShoppingBag } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  cartBadge?: number;
  onCartClick?: () => void;
  onNotificationClick?: () => void;
  notificationCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onBack,
  rightAction,
  cartBadge,
  onCartClick,
  onNotificationClick,
  notificationCount = 0,
}) => {
  return (
    <header className="bg-[#114B36] text-white px-4 py-3 sticky top-0 z-40 shadow-[0_2px_8px_rgba(17,75,54,0.15)]">
      <div className="flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {onBack && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onBack}
              className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white"
              aria-label="Go back"
            >
              <ChevronLeft size={22} strokeWidth={2.5} />
            </motion.button>
          )}
          <div className="min-w-0">
            <h1 className="font-bold text-base truncate leading-tight">{title}</h1>
            {subtitle && (
              <p className="text-[0.7rem] text-white/70 truncate">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onNotificationClick && (
            <button
              onClick={onNotificationClick}
              className="relative p-2 rounded-xl hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white"
              aria-label="Notifications"
            >
              <Bell size={20} />
              {notificationCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#EF4444] text-white text-[0.6rem] font-bold rounded-full flex items-center justify-center shadow-lg">
                  {notificationCount > 9 ? "9+" : notificationCount}
                </span>
              )}
            </button>
          )}
          {onCartClick && (
            <button
              onClick={onCartClick}
              className="relative p-2 rounded-xl hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white"
              aria-label="View cart"
            >
              <ShoppingBag size={20} />
              {cartBadge !== undefined && cartBadge > 0 && (
                <motion.span
                  key={cartBadge}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#22C55E] text-white text-[0.6rem] font-bold rounded-full flex items-center justify-center shadow-lg"
                >
                  {cartBadge}
                </motion.span>
              )}
            </button>
          )}
          {rightAction}
        </div>
      </div>
    </header>
  );
};
