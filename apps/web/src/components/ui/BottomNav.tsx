import React from "react";
import { motion } from "framer-motion";
import { useCart } from "../../context/CartContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { MapPin, ShoppingBag, Utensils, UserCircle2, Inbox } from "lucide-react";
import { apiGet } from "../../lib/api";

export type CustomerTab = "menu" | "cart" | "tracking" | "conversations" | "account";

interface BottomNavProps {
  activeTab: CustomerTab;
  onSelectTab: (tab: CustomerTab) => void;
  hasActiveOrder: boolean;
}

const tabs: { key: CustomerTab; label: string; icon: React.ElementType }[] = [
  { key: "menu", label: "Menu", icon: Utensils },
  { key: "cart", label: "Cart", icon: ShoppingBag },
  { key: "tracking", label: "Tracker", icon: MapPin },
  { key: "conversations", label: "Inbox", icon: Inbox },
  { key: "account", label: "Account", icon: UserCircle2 },
];

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  hasActiveOrder,
}) => {
  const { totalCount } = useCart();
  const { isLoggedIn, token, customer } = useCustomerAuth();
  const [unreadCount, setUnreadCount] = React.useState(0);

  const refreshUnread = React.useCallback(async () => {
    const result = await apiGet<{ unreadCount: number }>("/messaging/unread-count", token);
    if (result.success) setUnreadCount(result.data?.unreadCount || 0);
  }, [token]);

  React.useEffect(() => { void refreshUnread(); }, [refreshUnread]);
  React.useEffect(() => {
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ type: string; payload?: { senderIdentityKey?: string } }>).detail;
      const payload = detail.payload;
      const currentIdentityKey = customer?.id ? `customer:${customer.id}` : `guest:${localStorage.getItem("ladha_guest_id") || ""}`;
      if ((detail.type === "MESSAGE_CREATED" || detail.type === "ANNOUNCEMENT_PUBLISHED") && payload?.senderIdentityKey !== currentIdentityKey && activeTab !== "conversations") setUnreadCount((count) => count + 1);
      if (detail.type === "CONVERSATION_READ") void refreshUnread();
    };
    window.addEventListener("ladha:realtime", handleRealtime);
    return () => window.removeEventListener("ladha:realtime", handleRealtime);
  }, [activeTab, refreshUnread, customer?.id]);

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40 safe-area-bottom border-t border-[#E8DED2]/80 bg-white/92 backdrop-blur-xl shadow-[0_-4px_24px_rgba(17,75,54,0.06)]">
      <div className="flex items-center justify-around py-1.5">
        {tabs.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          const isCart = key === "cart";
          const isTracker = key === "tracking";
          const isAccount = key === "account";

          const href = key === "menu" ? "/" : key === "cart" ? "/cart" : key === "tracking" ? "/orders" : key === "conversations" ? "/inbox" : "/account";

          const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
            // Allow default browser behavior for modifier/new-tab clicks
            if (e.metaKey || e.ctrlKey || e.shiftKey || (e.nativeEvent && (e.nativeEvent as any).button === 1)) return;
            e.preventDefault();
            onSelectTab(key);
          };

          return (
            <motion.a
              key={key}
              whileTap={{ scale: 0.9 }}
              href={href}
              onClick={handleClick}
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
                {key === "conversations" && unreadCount > 0 && (
                  <motion.span key={unreadCount} initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-2 -right-2.5 min-w-4 h-4 px-1 bg-[#22C55E] text-white text-[0.55rem] font-bold rounded-full flex items-center justify-center shadow-md">{unreadCount > 99 ? "99+" : unreadCount}</motion.span>
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
            </motion.a>
          );
        })}
      </div>
    </nav>
  );
};
