import React from "react";
import { motion } from "framer-motion";
import { useCart } from "../../context/CartContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { MapPin, ShoppingBag, Utensils, UserCircle2 } from "lucide-react";

export type CustomerTab = "menu" | "cart" | "tracking" | "account";

interface BottomNavProps {
  activeTab: CustomerTab;
  onSelectTab: (tab: CustomerTab) => void;
  hasActiveOrder: boolean;
}

const tabs: { key: CustomerTab; label: string; icon: React.ElementType }[] = [
  { key: "menu", label: "Menu", icon: Utensils },
  { key: "cart", label: "Cart", icon: ShoppingBag },
  { key: "tracking", label: "Tracker", icon: MapPin },
  { key: "account", label: "Account", icon: UserCircle2 },
];

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  hasActiveOrder,
}) => {
  const { totalCount } = useCart();
  const { isLoggedIn } = useCustomerAuth();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/95 backdrop-blur-lg border-t border-[#E5E7EB] z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] safe-area-bottom">
      <div className="flex items-center justify-around py-1.5">
        {tabs.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          const isCart = key === "cart";
          const isTracker = key === "tracking";
          const isAccount = key === "account";

          return (
            <motion.button
              key={key}
              whileTap={{ scale: 0.9 }}
              onClick={() => onSelectTab(key)}
              className={`
                relative flex flex-col items-center justify-center gap-0.5 px-4 py-1.5
                rounded-xl transition-colors bg-none border-none cursor-pointer
                ${isActive ? "text-[#114B36]" : "text-[#6B7280]"}
              `}
            >
              <div className="relative">
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  className="transition-all"
                />
                {isCart && totalCount > 0 && (
                  <motion.span
                    key={totalCount}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-2 -right-2.5 w-4 h-4 bg-[#22C55E] text-white text-[0.55rem] font-bold rounded-full flex items-center justify-center shadow-md"
                  >
                    {totalCount}
                  </motion.span>
                )}
                {isTracker && hasActiveOrder && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-[#22C55E] rounded-full shadow-[0_0_0_2px_rgba(34,197,94,0.3)]" />
                )}
                {isAccount && isLoggedIn && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-[#22C55E] rounded-full border-[1.5px] border-white" />
                )}
              </div>
              <span className={`text-[0.6rem] font-semibold ${isActive ? "font-bold" : ""}`}>
                {isAccount ? (isLoggedIn ? "Account" : "Sign In") : label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -bottom-1 w-6 h-0.5 rounded-full bg-[#114B36]"
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};
