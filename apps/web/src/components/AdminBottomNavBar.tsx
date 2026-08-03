import React from "react";
import { motion } from "framer-motion";
import { LayoutDashboard, ShoppingBag, Utensils, Settings, Calendar, Inbox, Wallet } from "lucide-react";
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
  const [hotelMenuOpen, setHotelMenuOpen] = React.useState(false);
  const [switchError, setSwitchError] = React.useState("");
  const refreshMessageCount = React.useCallback(async () => {
    if (!token) { setMessageCount(0); return; }
    const result = await apiGet<{ unreadCount: number }>("/messaging/unread-count", token);
    if (result.success) setMessageCount(result.data?.unreadCount || 0);
  }, [token]);
  React.useEffect(() => { void refreshMessageCount(); }, [refreshMessageCount]);
  React.useEffect(() => {
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ type: string; payload?: { senderIdentityKey?: string } }>).detail;
      const currentIdentityKey = user?.id ? `admin:${user.id}` : "";
      if ((detail.type === "MESSAGE_CREATED" || detail.type === "ANNOUNCEMENT_PUBLISHED") && detail.payload?.senderIdentityKey !== currentIdentityKey) setMessageCount((count) => count + 1);
      if (detail.type === "CONVERSATION_CREATED") void refreshMessageCount();
      if (detail.type === "CONVERSATION_READ") void refreshMessageCount();
    };
    window.addEventListener("tabledash:realtime", handleRealtime);
    return () => window.removeEventListener("tabledash:realtime", handleRealtime);
  }, [refreshMessageCount, user?.id]);

  const currentHotel = hotels.find((h) => h.id === user?.hotelId);
  const showHotelBar = hotels.length > 1;
  const otherHotels = hotels.filter((h) => h.id !== user?.hotelId);

  const handleSwitchHotel = async (hotelId: string) => {
    setHotelMenuOpen(false);
    setSwitchError("");
    try {
      await switchHotel(hotelId);
    } catch (err: any) {
      setSwitchError(err?.message || "Unable to switch hotel");
    }
  };

  return (
    <nav className="glass-nav safe-area-bottom fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] border-t z-40">
      {showHotelBar && (
        <div className="relative px-3 pt-1">
          <button
            onClick={() => setHotelMenuOpen((open) => !open)}
            className="w-full flex items-center justify-between gap-2 rounded-xl bg-[#F3F4F6] hover:bg-[#E5E7EB] px-3 py-1.5 text-left transition-colors cursor-pointer"
          >
            <span className="text-xs font-bold text-[#114B36] truncate">{currentHotel?.name ?? "Select hotel"}</span>
            <span className="text-[0.6rem] text-[#6B7280] shrink-0">Switch ▾</span>
          </button>
          {hotelMenuOpen && (
            <div className="absolute left-3 right-3 bottom-full mb-1 rounded-xl bg-white border border-[#E5E7EB] shadow-lg overflow-hidden">
              {otherHotels.map((hotel) => (
                <button
                  key={hotel.id}
                  onClick={() => handleSwitchHotel(hotel.id)}
                  className="w-full text-left px-3 py-2.5 text-sm font-semibold text-[#374151] hover:bg-[#F3F4F6] cursor-pointer"
                >
                  {hotel.name}
                </button>
              ))}
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
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                )}
                <span className={`text-[0.6rem] ${isActive ? "font-bold" : "font-semibold"} ${!isOrders ? "mt-0.5" : "mt-1"}`}>
                {label}
              </span>
              {key === "messages" && messageCount > 0 && <span className="absolute -top-2 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-[#22C55E] text-white text-[0.55rem] font-bold flex items-center justify-center shadow-md">{messageCount > 99 ? "99+" : messageCount}</span>}
              {isActive && !isOrders && (
                <motion.div
                  layoutId="admin-nav-indicator"
                  className="absolute -bottom-0.5 w-6 h-0.5 rounded-full bg-[#114B36]"
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
