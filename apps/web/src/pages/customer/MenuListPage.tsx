import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useCart } from "../../context/CartContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useNotifications } from "../../context/NotificationsContext";
import { apiGet } from "../../lib/api";
import {
  Utensils, UserCircle2, Moon, ChevronLeft, Building2,
  Search, Sparkles, Clock, TrendingUp, MessageCircle
} from "lucide-react";
import { CustomerNotificationPanel } from "../../components/CustomerNotificationPanel";
import { Header } from "../../components/ui/Header";
import { ProductCard } from "../../components/ui/ProductCard";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";

import { PageTransition } from "../../components/ui/PageTransition";

export interface ProductItem {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  price: number;
  available: boolean;
  stockQty: number;
  hotelId?: string;
  lastRestockedAt?: string | null;
  outOfStockSince?: string | null;
}

interface HotelItem {
  id: string;
  name: string;
  slug: string;
  isOpen: boolean;
  imageUrl?: string | null;
  productCount: number;
}

interface RootSearchItem { id: string; name: string; hotelId: string; category: string; imageUrl: string; price: number; available: boolean; stockQty: number; }
interface RootSearchGroup { hotel: { id: string; name: string; imageUrl?: string | null; isOpen: boolean }; items: RootSearchItem[]; }

interface MenuListPageProps {
  onNavigateToCart: () => void;
  onNavigateToAccount: () => void;
  onNavigateToConversations: () => void;
}

export const MenuListPage: React.FC<MenuListPageProps> = ({
  onNavigateToCart,
  onNavigateToAccount,
  onNavigateToConversations,
}) => {
  const [hotels, setHotels] = useState<HotelItem[]>([]);
  const [selectedHotel, setSelectedHotel] = useState<HotelItem | null>(null);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuLoading, setMenuLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<{ id: string; firstName?: string; lastName?: string; knownName?: string; presence?: { online: boolean } }[]>([]);
  const [rootSearchGroups, setRootSearchGroups] = useState<RootSearchGroup[]>([]);
  const [rootSearchLoading, setRootSearchLoading] = useState(false);
  const userSearchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootSearchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const { cart, addToCart, updateQuantity, totalCount, totalAmount, setClosedHotelIds } = useCart();
  const { isLoggedIn, customer, token } = useCustomerAuth();
  const { unreadCount } = useNotifications();
  const [persuasionShown, setPersuasionShown] = useState(false);
  const [closingCountdown, setClosingCountdown] = useState<number | null>(null);

  const fetchHotels = async () => {
    setLoading(true);
    const res = await apiGet<HotelItem[]>("/hotels");
    if (res.success && res.data) {
      setHotels(res.data);
      setClosedHotelIds(res.data.filter((h) => !h.isOpen).map((h) => h.id));
      if (res.data.length === 1) {
        selectHotel(res.data[0]!);
        return;
      }
    }
    setLoading(false);
  };

  const selectHotel = async (hotel: HotelItem) => {
    setSelectedHotel(hotel);
    setMenuLoading(true);
    setSearchQuery("");
    const res = await apiGet<ProductItem[]>(`/menu?hotelId=${hotel.id}`);
    if (res.success && res.data) {
      setProducts(res.data);
    }
    setMenuLoading(false);
    setLoading(false);
  };

  const backToHotels = () => {
    setSelectedHotel(null);
    setProducts([]);
    if (closingTimerRef.current) {
      clearInterval(closingTimerRef.current);
      closingTimerRef.current = null;
    }
    setClosingCountdown(null);
  };

  useEffect(() => {
    fetchHotels();
  }, []);

  const closingTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ type: string; payload: any }>).detail;
      if (detail.type === "MENU_AVAILABILITY_UPDATED") {
      const updated = detail.payload as ProductItem;
      setProducts((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      );
    } else if (detail.type === "HOTEL_CLOSING") {
      const data = detail.payload as { closingIn: number; isOpen: boolean; hotelId?: string };
      if (data.hotelId) {
        setClosedHotelIds((prev) => prev.includes(data.hotelId!) ? prev : [...prev, data.hotelId!]);
        setHotels((prev) => prev.map((h) => h.id === data.hotelId ? { ...h, isOpen: false } : h));
      }
      if (data.closingIn > 0) {
        if (closingTimerRef.current) clearInterval(closingTimerRef.current);
        let count = data.closingIn;
        setClosingCountdown(count);
        closingTimerRef.current = setInterval(() => {
          count--;
          if (count <= 0) {
            if (closingTimerRef.current) clearInterval(closingTimerRef.current);
            closingTimerRef.current = null;
            setClosingCountdown(null);
            setSelectedHotel((prev) => prev ? { ...prev, isOpen: false } : null);
          } else {
            setClosingCountdown(count);
          }
        }, 1000);
      } else {
        setSelectedHotel((prev) => prev ? { ...prev, isOpen: false } : null);
      }
    } else if (detail.type === "HOTEL_STATUS_UPDATED") {
      const status = detail.payload as { isOpen: boolean; hotelId?: string };
      if (status.hotelId) {
        setHotels((prev) => prev.map((h) => h.id === status.hotelId ? { ...h, isOpen: status.isOpen } : h));
        setClosedHotelIds((prev) =>
          status.isOpen
            ? prev.filter((id) => id !== status.hotelId)
            : prev.includes(status.hotelId!) ? prev : [...prev, status.hotelId!]
        );
      }
      if (selectedHotel) {
        setSelectedHotel((prev) => prev ? { ...prev, isOpen: status.isOpen } : null);
      }
      if (status.isOpen && closingTimerRef.current) {
        clearInterval(closingTimerRef.current);
        closingTimerRef.current = null;
        setClosingCountdown(null);
      }
      }
    };
    window.addEventListener("tabledash:realtime", handleRealtime);
    return () => window.removeEventListener("tabledash:realtime", handleRealtime);
  }, [selectedHotel]);

  useEffect(() => {
    if (selectedHotel || searchQuery.trim().length < 2) { setUserSearchResults([]); return; }
    if (userSearchTimerRef.current) clearTimeout(userSearchTimerRef.current);
    userSearchTimerRef.current = setTimeout(async () => {
      const result = await apiGet<typeof userSearchResults>(`/messaging/directory?q=${encodeURIComponent(searchQuery.trim())}`, token);
      setUserSearchResults(result.success && result.data ? result.data : []);
    }, 250);
    return () => { if (userSearchTimerRef.current) clearTimeout(userSearchTimerRef.current); };
  }, [searchQuery, selectedHotel, token]);

  useEffect(() => {
    if (selectedHotel || searchQuery.trim().length < 2) { setRootSearchGroups([]); setRootSearchLoading(false); return; }
    if (rootSearchTimerRef.current) clearTimeout(rootSearchTimerRef.current);
    rootSearchTimerRef.current = setTimeout(async () => {
      setRootSearchLoading(true);
      const result = await apiGet<{ groups?: RootSearchGroup[] }>(`/hotels/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setRootSearchGroups(result.success && result.data?.groups ? result.data.groups : []);
      setRootSearchLoading(false);
    }, 250);
    return () => { if (rootSearchTimerRef.current) clearTimeout(rootSearchTimerRef.current); };
  }, [searchQuery, selectedHotel]);

  const getQuantityInCart = (productId: string) => {
    const item = cart.find((c) => c.id === productId);
    return item ? item.quantity : 0;
  };

  const isEffectivelyClosed = !selectedHotel?.isOpen || closingCountdown !== null;

  const handleAddToCart = (item: ProductItem) => {
    if (isEffectivelyClosed) return;
    addToCart({ id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl, hotelId: selectedHotel!.id, hotelName: selectedHotel!.name });
    if (!isLoggedIn && !persuasionShown) {
      setPersuasionShown(true);
      setShowLoginModal(true);
    }
  };

  // ── Hotel Selection Screen ──
  if (!selectedHotel) {
    return (
      <div className="app-container">
        <Header
          title="Ladha"
          subtitle="Taste the moment"
          onCartClick={onNavigateToCart}
          cartBadge={totalCount}
          onNotificationClick={() => setNotificationPanelOpen(true)}
          notificationCount={unreadCount}
          rightAction={<div className="flex items-center gap-1"><button onClick={onNavigateToConversations} className="p-2 rounded-xl hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white" aria-label="Conversations"><MessageCircle size={20} /></button><button onClick={onNavigateToAccount} className="relative p-2 rounded-xl hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white" aria-label={isLoggedIn ? `Hi, ${customer?.firstName}` : "Sign in"}><UserCircle2 size={20} />{isLoggedIn && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#22C55E] rounded-full border-[1.5px] border-[#114B36]" />}</button></div>}
        />

        <PageTransition>
          <div className="px-4 py-5">
            {/* Hero Section */}
            <div className="relative rounded-3xl overflow-hidden mb-6 bg-gradient-to-br from-[#114B36] to-[#0D3D2B]">
              <div className="relative z-10 px-6 py-8">
                <p className="text-white/70 text-xs font-semibold tracking-wider uppercase mb-2">
                  Uko online na uko njaa?
                </p>
                <h2 className="text-white text-2xl font-bold leading-tight mb-2">
                  Worry less.<br />Fresh meals are here.
                </h2>
                <p className="text-white/70 text-sm mb-5 max-w-xs leading-relaxed">
                  Ladha connects you with your favourite restaurants near you.
                </p>

                {/* Search */}
                <div className="relative">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#114B36]" />
                  <input
                    type="text"
                    placeholder="Search restaurants or dishes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white rounded-xl py-3 pl-11 pr-4 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] outline-none shadow-sm"
                  />
                </div>
                {!selectedHotel && searchQuery.trim().length >= 2 && (rootSearchLoading || rootSearchGroups.length > 0 || userSearchResults.length > 0) && <div className="mt-2 rounded-2xl bg-white p-2 shadow-xl text-left max-h-[min(28rem,65vh)] overflow-y-auto overscroll-contain">
                  {rootSearchLoading && <p className="px-3 py-3 text-xs text-[#6B7280]">Searching across all hotels...</p>}
                  {!rootSearchLoading && rootSearchGroups.map((group) => <section key={group.hotel.id} className="mb-3 last:mb-0">
                    <button onClick={() => { const hotel = hotels.find((item) => item.id === group.hotel.id); if (hotel) selectHotel(hotel); }} className="w-full flex items-center gap-2 px-3 py-2 border-none bg-transparent cursor-pointer text-left"><div className="w-7 h-7 rounded-lg overflow-hidden bg-[#EBF5F0] flex items-center justify-center shrink-0">{group.hotel.imageUrl ? <img src={group.hotel.imageUrl} alt="" className="w-full h-full object-cover" /> : <Building2 size={13} className="text-[#114B36]" />}</div><span className="font-bold text-xs text-[#1F2937] truncate flex-1">{group.hotel.name}</span><span className={`text-[0.6rem] font-bold ${group.hotel.isOpen ? "text-[#15803D]" : "text-[#B45309]"}`}>{group.hotel.isOpen ? "Open" : "Closed"}</span></button>
                    {group.items.slice(0, 4).map((item) => <button key={item.id} onClick={() => { const hotel = hotels.find((entry) => entry.id === item.hotelId); if (hotel) selectHotel(hotel); }} className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left border-none bg-transparent hover:bg-[#EBF5F0] cursor-pointer"><div className="w-8 h-8 rounded-lg overflow-hidden bg-[#F3F4F6] shrink-0">{item.imageUrl ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs">🍽</span>}</div><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#1F2937] truncate">{item.name}</span><span className="block text-[0.6rem] text-[#6B7280] truncate">{item.category} · KSh {item.price}</span></span><span className="text-[0.6rem] font-bold text-[#114B36]">View</span></button>)}
                  </section>)}
                  {!rootSearchLoading && userSearchResults.length > 0 && <section className="border-t border-[#F3F4F6] pt-2 mt-2"><p className="px-3 py-1 text-[0.6rem] font-bold uppercase tracking-wider text-[#6B7280]">Discoverable people</p>{userSearchResults.map((person) => <button key={person.id} onClick={onNavigateToConversations} className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left border-none bg-transparent hover:bg-[#EBF5F0] cursor-pointer"><span className={`w-2.5 h-2.5 rounded-full ${person.presence?.online ? "bg-[#22C55E]" : "bg-[#D1D5DB]"}`} /><span className="text-sm font-semibold text-[#1F2937] truncate">{person.knownName || `${person.firstName || ""} ${person.lastName || ""}`.trim()}</span><span className="ml-auto text-xs font-bold text-[#114B36]">Message</span></button>)}</section>}
                </div>}
              </div>
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-3 mb-6 pb-1">
              {[
                { icon: <Sparkles size={18} />, label: "Popular" },
                { icon: <Clock size={18} />, label: "Fast Delivery" },
                { icon: <TrendingUp size={18} />, label: "Trending" },
              ].map((filter) => (
                <button
                  key={filter.label}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl shadow-[0_2px_8px_rgba(17,75,54,0.06)] text-sm font-semibold text-[#6B7280] hover:text-[#114B36] hover:shadow-md transition-all whitespace-nowrap bg-none border-none cursor-pointer"
                >
                  {filter.icon}
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Restaurants Section */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#1F2937]">Restaurants Near You</h2>
                <span className="text-xs font-semibold text-[#114B36]">{hotels.length} available</span>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-4 items-center p-4 bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
                      <div className="w-14 h-14 rounded-xl bg-[#E5E7EB] animate-pulse shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-5 bg-[#E5E7EB] rounded-lg animate-pulse w-1/2" />
                        <div className="h-3 bg-[#E5E7EB] rounded-lg animate-pulse w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : hotels.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <Building2 size={48} className="text-[#D1D5DB] mb-4" />
                  <h3 className="text-lg font-bold text-[#6B7280] mb-1">No restaurants available</h3>
                  <p className="text-sm text-[#9CA3AF]">Check back soon — new vendors joining daily!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {hotels.map((hotel, idx) => (
                    <motion.div
                      key={hotel.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      whileHover={{ scale: 1.01, y: -2 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => selectHotel(hotel)}
                      className={`
                        relative flex items-center gap-4 p-4 bg-white rounded-2xl cursor-pointer
                        transition-shadow duration-200
                        ${hotel.isOpen
                          ? "shadow-[0_2px_8px_rgba(17,75,54,0.06)] hover:shadow-[0_8px_24px_rgba(17,75,54,0.1)]"
                          : "opacity-65 shadow-sm"
                        }
                      `}
                    >
                      <div className={`
                        w-14 h-14 rounded-xl overflow-hidden shrink-0 flex items-center justify-center
                        ${hotel.isOpen ? "bg-[#EBF5F0]" : "bg-[#F3F4F6]"}
                      `}>
                        {hotel.imageUrl ? (
                          <img src={hotel.imageUrl} alt={hotel.name} className="w-full h-full object-cover" />
                        ) : (
                          <Building2 size={24} color={hotel.isOpen ? "#114B36" : "#9CA3AF"} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-[#1F2937] truncate">{hotel.name}</h3>
                          {!hotel.isOpen && (
                            <Badge variant="danger" size="sm">Closed</Badge>
                          )}
                        </div>
                        <p className="text-xs text-[#6B7280] mt-0.5">
                          {hotel.isOpen
                            ? `${hotel.productCount} items available`
                            : "Currently closed — check back later"
                          }
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center text-[#9CA3AF] text-lg shrink-0">
                        <ChevronLeft size={16} className="rotate-180" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </PageTransition>

        <CustomerNotificationPanel isOpen={notificationPanelOpen} onClose={() => setNotificationPanelOpen(false)} />

        <Modal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          type="info"
          title="Save your stall location"
          message="Sign in so your delivery address is pre-filled every time. Track all your past orders too — it only takes 30 seconds!"
          primaryAction={{
            label: "Sign In / Create Account",
            onClick: () => { setShowLoginModal(false); onNavigateToAccount(); },
          }}
          secondaryAction={{
            label: "Continue without account",
            onClick: () => setShowLoginModal(false),
          }}
        />
      </div>
    );
  }

  // ── Menu Screen (per-hotel) ──
  const availableProducts = products.filter((p) => p.available && p.stockQty > 0);
  const outOfStockProducts = products.filter((p) => !p.available || p.stockQty <= 0);

  const filteredAvailable = searchQuery
    ? availableProducts.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availableProducts;

  return (
    <div className="app-container">
      <Header
        title={selectedHotel.name}
        subtitle={selectedHotel.isOpen ? "Fresh meals ready for delivery" : "Currently closed"}
        onBack={backToHotels}
        onCartClick={onNavigateToCart}
        cartBadge={totalCount}
        onNotificationClick={() => setNotificationPanelOpen(true)}
        notificationCount={unreadCount}
        rightAction={<div className="flex items-center gap-1"><button onClick={onNavigateToConversations} className="p-2 rounded-xl hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white" aria-label="Conversations"><MessageCircle size={20} /></button><button onClick={onNavigateToAccount} className="relative p-2 rounded-xl hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white" aria-label={isLoggedIn ? `Hi, ${customer?.firstName}` : "Sign in"}><UserCircle2 size={20} />{isLoggedIn && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#22C55E] rounded-full border-[1.5px] border-[#114B36]" />}</button></div>}
      />

      <PageTransition>
        <div className="px-4 py-5">
          {/* Hotel Closing Countdown Banner */}
          {closingCountdown !== null && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#FEF2F2] border-2 border-[#DC2626] rounded-2xl p-4 mb-5 text-center"
            >
              <p className="text-2xl font-extrabold text-[#DC2626] mb-1">⏳ Closing in {closingCountdown}s</p>
              <p className="text-sm text-[#991B1B]">{selectedHotel.name} is closing. No new orders after the timer ends.</p>
            </motion.div>
          )}

          {/* Hotel Closed Banner */}
          {!selectedHotel.isOpen && closingCountdown === null && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#FFFBEB] border border-[#F59E0B] rounded-2xl p-4 mb-5 flex items-center gap-3"
            >
              <Moon size={24} className="text-[#D97706] shrink-0" />
              <div>
                <p className="font-bold text-[#92400E]">{selectedHotel.name} is Closed</p>
                <p className="text-sm text-[#B45309]">We're closed for new orders. Please check back later!</p>
              </div>
            </motion.div>
          )}

          {/* Search */}
          {!isEffectivelyClosed && (
            <div className="relative mb-5">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="text"
                placeholder={`Search ${selectedHotel.name}'s menu...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#F3F4F6] rounded-xl py-3 pl-11 pr-4 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] outline-none focus:bg-white focus:ring-2 focus:ring-[#114B36]/20 transition-all"
              />
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#1F2937]">Today's Menu</h2>
            <span className="text-xs font-semibold text-[#6B7280]">
              {filteredAvailable.length} available
            </span>
          </div>

          {menuLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-4 items-center p-4 bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)]">
                  <div className="w-20 h-20 rounded-xl bg-[#E5E7EB] animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-[#E5E7EB] rounded-lg animate-pulse w-3/4" />
                    <div className="h-5 bg-[#E5E7EB] rounded-lg animate-pulse w-1/4" />
                    <div className="h-3 bg-[#E5E7EB] rounded-lg animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Utensils size={40} className="text-[#D1D5DB] mb-4" />
              <h3 className="text-lg font-bold text-[#6B7280] mb-1">No menu items yet</h3>
              <p className="text-sm text-[#9CA3AF]">Check back shortly for fresh meals!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Available Items */}
              {filteredAvailable.length > 0 && (
                <div className="space-y-3">
                  {filteredAvailable.map((item) => (
                    <ProductCard
                      key={item.id}
                      item={item}
                      quantity={getQuantityInCart(item.id)}
                      onAdd={() => handleAddToCart(item)}
                      onIncrement={() => {
                        const qty = getQuantityInCart(item.id);
                        if (qty < item.stockQty) updateQuantity(item.id, qty + 1);
                      }}
                      onDecrement={() => updateQuantity(item.id, getQuantityInCart(item.id) - 1)}
                      disabled={isEffectivelyClosed}
                    />
                  ))}
                </div>
              )}

              {searchQuery && filteredAvailable.length === 0 && availableProducts.length > 0 && (
                <div className="flex flex-col items-center py-12 text-center">
                  <Search size={32} className="text-[#D1D5DB] mb-3" />
                  <p className="text-sm font-semibold text-[#6B7280]">
                    No items match "{searchQuery}"
                  </p>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-sm font-semibold text-[#114B36] mt-2 bg-none border-none cursor-pointer"
                  >
                    Clear search
                  </button>
                </div>
              )}

              {/* Out of Stock Section */}
              {!searchQuery && outOfStockProducts.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-3 pt-4 border-t border-[#F3F4F6]">
                    <span className="text-sm font-bold text-[#6B7280]">Sold Out</span>
                    <span className="text-xs text-[#9CA3AF]">({outOfStockProducts.length} items)</span>
                  </div>
                  <div className="space-y-2">
                    {outOfStockProducts.map((item) => (
                      <ProductCard
                        key={item.id}
                        item={item}
                        quantity={0}
                        onAdd={() => {}}
                        onIncrement={() => {}}
                        onDecrement={() => {}}
                        disabled={true}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </PageTransition>

      {/* Sticky Bottom Cart Bar */}
      {totalCount > 0 && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-40"
        >
          <button
            onClick={onNavigateToCart}
            disabled={isEffectivelyClosed}
            className={`
              w-full py-4 rounded-2xl font-bold text-base transition-all duration-200
              flex items-center justify-between px-5
              ${isEffectivelyClosed
                ? "bg-[#9CA3AF] text-white cursor-not-allowed opacity-60"
                : "bg-[#114B36] text-white shadow-[0_4px_16px_rgba(17,75,54,0.3)] hover:shadow-[0_6px_24px_rgba(17,75,54,0.4)] hover:bg-[#0D3D2B]"
              }
            `}
          >
            <span className="flex items-center gap-2">
              🛒 {totalCount} item{totalCount > 1 ? "s" : ""}
            </span>
            <span className="font-extrabold">
              {isEffectivelyClosed ? "Closed" : `KSh ${totalAmount}`}
            </span>
          </button>
        </motion.div>
      )}

      <CustomerNotificationPanel isOpen={notificationPanelOpen} onClose={() => setNotificationPanelOpen(false)} />

      <Modal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        type="info"
        title="Save your stall location"
        message="Sign in so your delivery address is pre-filled every time. Track all your past orders too — it only takes 30 seconds!"
        primaryAction={{
          label: "Sign In / Create Account",
          onClick: () => { setShowLoginModal(false); onNavigateToAccount(); },
        }}
        secondaryAction={{
          label: "Continue without account",
          onClick: () => setShowLoginModal(false),
        }}
      />
    </div>
  );
};
