import React from "react";
import { motion } from "framer-motion";
import { LayoutDashboard, ShoppingBag, Utensils, Settings, Calendar } from "lucide-react";

export type AdminTab = "orders" | "dashboard" | "menu" | "settings" | "history";

interface AdminBottomNavBarProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
}

const tabs: { key: AdminTab; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "menu", label: "Menu", icon: Utensils },
  { key: "orders", label: "Orders", icon: ShoppingBag },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "history", label: "History", icon: Calendar },
];

export const AdminBottomNavBar: React.FC<AdminBottomNavBarProps> = ({
  activeTab,
  onSelectTab,
}) => {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] bg-white/96 backdrop-blur-lg border-t border-[#E5E7EB] z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-around py-1 px-2">
        {tabs.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          const isOrders = key === "orders";

          return (
            <button
              key={key}
              onClick={() => onSelectTab(key)}
              className={`
                relative flex flex-col items-center justify-center gap-0.5 px-2 py-1.5
                rounded-xl transition-colors bg-none border-none cursor-pointer min-w-[56px]
                ${isActive ? "text-[#114B36]" : "text-[#6B7280]"}
              `}
            >
              {isOrders ? (
                <div className={`
                  flex items-center justify-center w-12 h-12 rounded-full -mt-3
                  transition-all duration-200 shadow-[0_4px_14px_rgba(17,75,54,0.35)]
                  ${isActive ? "bg-[#0D3D2B] shadow-[0_4px_18px_rgba(17,75,54,0.45)]" : "bg-[#114B36]"}
                  text-white
                `}>
                  <Icon size={22} strokeWidth={2.5} />
                </div>
              ) : (
                <Icon size={isActive ? 20 : 18} strokeWidth={isActive ? 2.5 : 1.5} />
              )}
              <span className={`text-[0.6rem] ${isActive ? "font-bold" : "font-semibold"} ${!isOrders ? "mt-0.5" : "mt-1"}`}>
                {label}
              </span>
              {isActive && !isOrders && (
                <motion.div
                  layoutId="admin-nav-indicator"
                  className="absolute -bottom-0.5 w-5 h-0.5 rounded-full bg-[#114B36]"
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
