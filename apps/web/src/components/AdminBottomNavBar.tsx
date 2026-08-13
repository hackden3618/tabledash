import React from "react";
import { motion } from "framer-motion";
import { LayoutDashboard, ShoppingBag, Utensils, Settings, Calendar, Inbox, Wallet, Building2, ChevronUp, Check } from "lucide-react";
import { apiGet } from "../lib/api";
import { useAdminAuth } from "../context/AdminAuthContext";

export type AdminTab = "orders" | "dashboard" | "menu" | "settings" | "history" | "messages" | "finance";

interface AdminBottomNavBarProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
}

const tabs: { key: AdminTab; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "menu", label: "Menu", icon: Utensils },
  { key: "finance", label: "Finance", icon: Wallet },
  { key: "orders", label: "Orders", icon: ShoppingBag },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "history", label: "History", icon: Calendar },
  { key: "messages", label: "Inbox", icon: Inbox },
];

export const AdminBottomNavBar: React.FC<AdminBottomNavBarProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const { token, user, hotels, switchHotel } = useAdminAuth();
  const [messageCount, setMessageCount] = React.useState(0);
  const [pendingOrderCount, setPendingOrderCount] = React.useState(0);
  const [hotelMenuOpen, setHotelMenuOpen] = React.useState(false);
  const [switchError, setSwitchError] = React.useState("");
  const refreshMessageCount = React.useCallback(async () => {
    if (!token) { setMessageCount(0); return; }
    const result = await apiGet<{ unreadCount: number }>("/messaging/unread-count", token);
    if (result.success) setMessageCount(result.data?.unreadCount || 0);
  }, [token]);
  const refreshPendingCount = React.useCallback(async () => {
    if (!token) { setPendingOrderCount(0); return; }
    const result = await apiGet<{ count: number }>("/orders/pending-count", token);
    if (result.success) setPendingOrderCount(result.data?.count || 0);
  }, [token]);
  React.useEffect(() => { void refreshMessageCount(); }, [refreshMessageCount]);
  React.useEffect(() => { void refreshPendingCount(); }, [refreshPendingCount]);
  React.useEffect(() => {
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ type: string; payload?: { senderIdentityKey?: string } }>).detail;
      const currentIdentityKey = user?.id ? `admin:${user.id}` : "";
      if ((detail.type === "MESSAGE_CREATED" || detail.type === "ANNOUNCEMENT_PUBLISHED") && detail.payload?.senderIdentityKey !== currentIdentityKey) setMessageCount((count) => count + 1);
      if (detail.type === "CONVERSATION_CREATED") void refreshMessageCount();
      if (detail.type === "CONVERSATION_READ") void refreshMessageCount();
      if (detail.type === "ORDER_CREATED" || detail.type === "ORDER_STATUS_UPDATED") void refreshPendingCount();
    };
    window.addEventListener("ladha:realtime", handleRealtime);
    return () => window.removeEventListener("ladha:realtime", handleRealtime);
  }, [refreshMessageCount, refreshPendingCount, user?.id]);

  const currentHotel = hotels.find((h) => h.id === user?.hotelId);
  const showHotelBar = hotels.length > 1;

  const navRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const publishHeight = () => {
      document.documentElement.style.setProperty("--admin-nav-height", `${nav.offsetHeight}px`);
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--admin-nav-height");
    };
  }, []);

  const handleSwitchHotel = async (hotelId: string) => {
    setHotelMenuOpen(false);
    setSwitchError("");
    try {
      await switchHotel(hotelId);
      // Client-side navigation (no full reload) so the in-memory hotels list
      // — which the backend now returns on switch — survives the transition.
      onSelectTab("dashboard");
    } catch (err: any) {
      setSwitchError(err?.message || "Unable to switch hotel");
    }
  };

  return (
    <>
      {hotelMenuOpen && (
        <div
          onClick={() => setHotelMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            backdropFilter: "blur(2px)",
            zIndex: 39,
          }}
        />
      )}
      <nav ref={navRef} className="glass-nav safe-area-bottom fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] border-t z-40">
      {showHotelBar && (
        <div className="relative px-3 pt-1.5">
          <button
            onClick={() => setHotelMenuOpen((open) => !open)}
            aria-expanded={hotelMenuOpen}
            aria-label="Switch hotel"
            className="w-full flex items-center justify-between gap-2 rounded-xl bg-[#FFF0E5] hover:bg-[#FED7AA] border border-[#FED7AA] px-3 py-2 text-left transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Building2 size={14} className="text-[#9A3412] shrink-0" />
              <span className="min-w-0">
                <span className="block text-[0.55rem] uppercase tracking-wide font-bold text-[#6B7280] leading-none mb-0.5">Working at</span>
                <span className="block text-xs font-bold text-[#9A3412] truncate">{currentHotel?.name ?? "Select hotel"}</span>
              </span>
            </span>
            <ChevronUp size={16} className={`text-[#9A3412] shrink-0 transition-transform ${hotelMenuOpen ? "" : "rotate-180"}`} />
          </button>
          {hotelMenuOpen && (
            <div className="absolute left-3 right-3 bottom-full mb-1 rounded-xl bg-white border border-[#E5E7EB] shadow-lg overflow-hidden">
              <div className="px-3 pt-2.5 pb-1 text-[0.6rem] uppercase tracking-wide font-bold text-[#9CA3AF]">Switch hotel</div>
              {hotels.map((hotel) => {
                const isCurrent = hotel.id === user?.hotelId;
                return (
                  <button
                    key={hotel.id}
                    onClick={() => handleSwitchHotel(hotel.id)}
                    disabled={isCurrent}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-left cursor-pointer ${isCurrent ? "text-[#059669] disabled:cursor-default" : "text-[#374151] hover:bg-[#F3F4F6]"}`}
                  >
                    <span className="truncate">{hotel.name}</span>
                    {isCurrent && <Check size={16} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
          {switchError && (
            <div className="text-[0.6rem] text-[#DC2626] font-semibold px-1 pt-0.5">{switchError}</div>
          )}
        </div>
      )}
      <div className="flex items-center justify-around py-1 px-2">
        {tabs.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          const isOrders = key === "orders";

          return (
            <button
              key={key}
              onClick={() => { setHotelMenuOpen(false); onSelectTab(key); }}
              className={`
                relative flex flex-col items-center justify-center gap-0.5 px-2 py-1.5
                rounded-xl transition-colors bg-none border-none cursor-pointer min-w-[56px]
                ${isActive ? "text-[#9A3412]" : "text-[#6B7280]"}
              `}
            >
              {isOrders ? (
                <div className={`
                  relative flex items-center justify-center w-12 h-12 rounded-full -mt-3
                  transition-all duration-200 shadow-[0_4px_14px_rgba(154,52,18,0.35)]
                  ${isActive ? "bg-[#7C2D12] shadow-[0_4px_18px_rgba(124,45,18,0.45)]" : "bg-[#9A3412]"}
                  text-white
                `}>
                  <Icon size={22} strokeWidth={2.5} />
                  {pendingOrderCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 rounded-full bg-[#EF4444] text-white text-[0.6rem] font-bold flex items-center justify-center shadow-md">
                      {pendingOrderCount > 99 ? "99+" : pendingOrderCount}
                    </span>
                  )}
                </div>
              ) : (
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                )}
                <span className={`text-[0.6rem] ${isActive ? "font-bold" : "font-semibold"} ${!isOrders ? "mt-0.5" : "mt-1"}`}>
                {label}
              </span>
              {key === "messages" && messageCount > 0 && <span className="absolute -top-2 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-[#22C55E] text-white text-[0.55rem] font-bold flex items-center justify-center shadow-md">{messageCount > 99 ? "99+" : messageCount}</span>}
              {isActive && !isOrders && (
                <motion.div
                  layoutId="admin-nav-indicator"
                  className="absolute -bottom-0.5 w-6 h-0.5 rounded-full bg-[#9A3412]"
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
    </>
  );
};
