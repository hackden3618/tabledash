import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useCart } from "../../context/CartContext";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { useNotifications } from "../../context/NotificationsContext";
import { apiGet, apiPost } from "../../lib/api";
import {
    Utensils, UserCircle2, Moon, Building2,
    Search, Sparkles, MessageCircle, HelpCircle, X, Send,
    MapPin, ShieldCheck, Leaf, Route, LockKeyhole, ArrowRight, SlidersHorizontal, ChevronDown, Check
} from "lucide-react";
import { CustomerNotificationPanel } from "../../components/CustomerNotificationPanel";
import { Header } from "../../components/ui/Header";
import { ProductCard } from "../../components/ui/ProductCard";
import { RatingStars } from "../../components/ui/RatingStars";
import { Modal } from "../../components/ui/Modal";

import { PageTransition } from "../../components/ui/PageTransition";

export interface ProductItem {
    id: string;
    name: string;
    category: string;
    mealCategories?: string[];
    imageUrl: string;
    price: number;
    available: boolean;
    stockQty: number;
    hotelId?: string;
    lastRestockedAt?: string | null;
    outOfStockSince?: string | null;
    rating?: number | null;
    ratingCount?: number;
}

interface HotelItem {
    id: string;
    name: string;
    slug: string;
    isOpen: boolean;
    imageUrl?: string | null;
    productCount: number;
    completedSales?: number;
    isLocal?: boolean;
    locationName?: string;
    locationType?: string;
    rating?: number | null;
    ratingCount?: number;
}

interface RootSearchItem { id: string; name: string; hotelId: string; category: string; imageUrl: string; price: number; available: boolean; stockQty: number; }
interface RootSearchGroup { hotel: { id: string; name: string; imageUrl?: string | null; isOpen: boolean }; items: RootSearchItem[]; }

interface DiscoveryProduct extends ProductItem {
    hotelName: string;
    hotelImageUrl?: string | null;
    hotelIsOpen: boolean;
    salesCount: number;
    recentSalesCount: number;
    rating?: number | null;
    ratingCount?: number;
}

interface DiscoveryHome {
    greeting: string;
    hero: { title: string; description: string; imageUrl?: string | null };
    restaurants: HotelItem[];
    popularMeals: DiscoveryProduct[];
    trendingMeals: DiscoveryProduct[];
    trustIndicators: { label: string; icon: string }[];
}

interface ZoneItem {
    id: string;
    name: string;
    type: string;
    locationLabel: string;
    locationPlaceholder: string;
}

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
    const [talkToStaffOpen, setTalkToStaffOpen] = useState(false);
    const [talkBody, setTalkBody] = useState("");
    const [talkSending, setTalkSending] = useState(false);
    const [talkSent, setTalkSent] = useState(false);
    const userSearchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const rootSearchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const { cart, addToCart, updateQuantity, totalCount, totalAmount, setClosedHotelIds } = useCart();
    const { isLoggedIn, customer, token } = useCustomerAuth();
    const { unreadCount } = useNotifications();
    const [persuasionShown, setPersuasionShown] = useState(false);
    const [closingCountdown, setClosingCountdown] = useState<number | null>(null);
    const [discovery, setDiscovery] = useState<DiscoveryHome | null>(null);
    const [platformHeroImage, setPlatformHeroImage] = useState("");
    const [mealRanking, setMealRanking] = useState<"popular" | "trending">("popular");
    const [zones, setZones] = useState<ZoneItem[]>([]);
    const [zonesLoading, setZonesLoading] = useState(true);
    const [zoneError, setZoneError] = useState(false);
    const [viewAllHotels, setViewAllHotels] = useState(false);
    const [locationPickerOpen, setLocationPickerOpen] = useState(false);
    const [activeZoneId, setActiveZoneId] = useState(() => localStorage.getItem("ladha_zone_id") || "");

    const fetchHotels = async (zoneId: string | null = activeZoneId || null, includeAll = viewAllHotels) => {
        setLoading(true);
        const params = new URLSearchParams();
        if (zoneId) params.set("zoneId", zoneId);
        if (includeAll && zoneId) params.set("includeAll", "true");
        const query = params.toString();
        const res = await apiGet<DiscoveryHome>(`/discovery/home${query ? `?${query}` : ""}`);
        if (res.success && res.data) {
            setDiscovery(res.data);
            setHotels(res.data.restaurants);
            setClosedHotelIds(res.data.restaurants.filter((h) => !h.isOpen).map((h) => h.id));
            if (res.data.restaurants.length === 1) {
                selectHotel(res.data.restaurants[0]!);
                return;
            }
        } else {
            const fallback = await apiGet<HotelItem[]>(`/hotels${zoneId && !includeAll ? `?zoneId=${encodeURIComponent(zoneId)}` : ""}`);
            if (fallback.success && fallback.data) {
                setHotels(fallback.data);
                setClosedHotelIds(fallback.data.filter((hotel) => !hotel.isOpen).map((hotel) => hotel.id));
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
        const loadLocations = async () => {
            const heroResult = await apiGet<{ imageUrl: string }>("/discovery/hero");
            if (heroResult.success && heroResult.data?.imageUrl) setPlatformHeroImage(heroResult.data.imageUrl);
            const zonesResult = await apiGet<ZoneItem[]>("/discovery/zones");
            if (!zonesResult.success || !zonesResult.data?.length) {
                setZonesLoading(false);
                setZoneError(true);
                await fetchHotels("");
                return;
            }
            setZones(zonesResult.data);
            setZonesLoading(false);
            setZoneError(false);
            const savedZone = zonesResult.data.some((zone) => zone.id === activeZoneId) ? activeZoneId : zonesResult.data[0]!.id;
            setActiveZoneId(savedZone);
            localStorage.setItem("ladha_zone_id", savedZone);
            await fetchHotels(savedZone);
        };
        void loadLocations();
    }, []);

    const handleZoneChange = (zoneId: string) => {
        if (!zoneId) return;
        setLocationPickerOpen(false);
        setViewAllHotels(false);
        setActiveZoneId(zoneId);
        localStorage.setItem("ladha_zone_id", zoneId);
        void fetchHotels(zoneId, false);
    };

    const handleViewAllHotels = () => {
        if (viewAllHotels) {
            setViewAllHotels(false);
            void fetchHotels(activeZoneId || null, false);
            return;
        }
        setViewAllHotels(true);
        void fetchHotels(activeZoneId || null, true);
    };

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
        window.addEventListener("ladha:realtime", handleRealtime);
        return () => window.removeEventListener("ladha:realtime", handleRealtime);
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
            const zoneQuery = activeZoneId ? `&zoneId=${encodeURIComponent(activeZoneId)}` : "";
            const result = await apiGet<{ groups?: RootSearchGroup[] }>(`/hotels/search?q=${encodeURIComponent(searchQuery.trim())}${zoneQuery}`);
            setRootSearchGroups(result.success && result.data?.groups ? result.data.groups : []);
            setRootSearchLoading(false);
        }, 250);
        return () => { if (rootSearchTimerRef.current) clearTimeout(rootSearchTimerRef.current); };
    }, [searchQuery, selectedHotel, activeZoneId]);

    const getQuantityInCart = (productId: string) => {
        const item = cart.find((c) => c.id === productId);
        return item ? item.quantity : 0;
    };

    const isEffectivelyClosed = !selectedHotel?.isOpen || closingCountdown !== null;

    const handleAddToCart = (item: ProductItem) => {
        if (isEffectivelyClosed) return;
        addToCart({ id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl, hotelId: selectedHotel!.id, hotelName: selectedHotel!.name, stockQty: item.stockQty });
        if (!isLoggedIn && !persuasionShown) {
            setPersuasionShown(true);
            setShowLoginModal(true);
        }
    };

    const discoveryMeals = mealRanking === "trending" ? (discovery?.trendingMeals ?? []) : (discovery?.popularMeals ?? []);
    const heroImage = platformHeroImage || discovery?.hero.imageUrl || discovery?.restaurants.find((hotel) => hotel.imageUrl)?.imageUrl || discovery?.popularMeals[0]?.imageUrl || discovery?.trendingMeals[0]?.imageUrl;

    // ── Discovery Screen ──
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
                    <div className="px-4 py-6 space-y-8">
                        <section className="relative -mx-4 -mt-6 min-h-[19rem] overflow-hidden bg-[#114B36] px-5 pb-12 pt-5 text-white">
                            {heroImage && <><img src={heroImage} alt="Homepage food discovery" loading="eager" className="absolute inset-0 z-0 h-full w-full object-cover opacity-100" /><div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[68%] bg-gradient-to-r from-[#063522]/80 via-[#114B36]/45 to-transparent backdrop-blur-[10px] [mask-image:linear-gradient(to_right,black_0%,black_52%,transparent_100%)]" /></>}
                            <div className="relative z-10 max-w-[76%]">
                                <button type="button" onClick={() => setLocationPickerOpen(true)} disabled={zonesLoading || zones.length === 0} className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/15 px-3 py-2 text-left text-xs font-bold text-white backdrop-blur-sm transition hover:bg-black/25 disabled:opacity-70" aria-label="Choose delivery area"><MapPin size={16} /><span>{zonesLoading ? "Loading areas…" : zoneError ? "Delivery area unavailable" : zones.find((zone) => zone.id === activeZoneId)?.name ?? "Choose delivery area"}</span><ChevronDown size={14} /></button>
                                <p className="mt-7 text-sm font-semibold text-white/75">{discovery?.greeting ?? "Good food, close to you."}</p>
                                <h2 className="mt-2 text-[2.35rem] leading-[1.02] text-white font-black tracking-tight">{discovery?.hero.title ?? "Taste moments that matter."}</h2>
                                <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/75">{discovery?.hero.description ?? "Fresh meals from trusted local kitchens."}</p>
                            </div>
                            {heroImage && <span className="absolute bottom-4 right-5 z-10 rounded-full bg-white/90 px-3 py-1 text-[0.62rem] font-bold text-[#114B36]">Fresh from a local kitchen</span>}
                        </section>

                        {locationPickerOpen && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#10271E]/55 p-3 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true" aria-labelledby="location-picker-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setLocationPickerOpen(false); }}><div className="w-full max-w-md overflow-hidden rounded-[1.75rem] bg-[#FFFDF9] shadow-2xl"><div className="flex items-start justify-between border-b border-[#E8DED2] px-5 py-4"><div><p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-[#789083]">Delivery location</p><h2 id="location-picker-title" className="mt-1 text-xl font-black text-[#1F2937]">Where should we deliver?</h2><p className="mt-1 text-xs text-[#6B7280]">Nearby kitchens appear first for this area.</p></div><button type="button" onClick={() => setLocationPickerOpen(false)} className="rounded-full border-none bg-[#EBF5F0] p-2 text-[#114B36]" aria-label="Close location picker"><span className="text-lg leading-none">×</span></button></div><div className="max-h-[55vh] overflow-y-auto p-3">{zones.map((zone) => { const selected = zone.id === activeZoneId; return <button type="button" key={zone.id} onClick={() => handleZoneChange(zone.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? "border-[#114B36] bg-[#EBF5F0]" : "border-transparent bg-white hover:border-[#D1E4D8] hover:bg-[#F7FBF8]"}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-[#114B36] text-white" : "bg-[#F1EAE1] text-[#114B36]"}`}><MapPin size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black text-[#1F2937]">{zone.name}</span><span className="mt-0.5 block text-xs text-[#6B7280]">{zone.locationLabel} · {zone.type.replaceAll("_", " ").toLowerCase()}</span></span>{selected && <Check size={19} className="text-[#114B36]" />}</button>; })}</div><div className="border-t border-[#E8DED2] px-5 py-4"><p className="text-[0.7rem] leading-relaxed text-[#6B7280]">You can change this anytime. Hotels outside your selected area may have additional delivery charges.</p></div></div></div>}

                        <section className="relative z-20 -mt-16">
                            <Search size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#114B36]" />
                            <input type="search" aria-label="Search meals and restaurants" placeholder="Search meals, hotels or cravings..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-2xl border border-[#E8DED2] bg-white py-4 pl-12 pr-12 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] outline-none shadow-[0_8px_24px_rgba(17,75,54,0.08)] transition-shadow focus:shadow-[0_10px_30px_rgba(17,75,54,0.14)]" />
                            <button aria-label="Open search filters" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-[#114B36] p-2.5 text-white border-none cursor-pointer"><SlidersHorizontal size={16} /></button>
                            {!selectedHotel && searchQuery.trim().length >= 2 && (rootSearchLoading || rootSearchGroups.length > 0 || userSearchResults.length > 0) && <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-[min(28rem,65vh)] overflow-y-auto rounded-2xl bg-white p-2 text-left shadow-xl">
                                {rootSearchLoading && <p className="px-3 py-3 text-xs text-[#6B7280]">Searching meals and hotels...</p>}
                                {!rootSearchLoading && rootSearchGroups.map((group) => <section key={group.hotel.id} className="mb-3 last:mb-0"><button onClick={() => { const hotel = hotels.find((item) => item.id === group.hotel.id); if (hotel) selectHotel(hotel); }} className="w-full flex items-center gap-2 px-3 py-2 border-none bg-transparent cursor-pointer text-left"><div className="w-8 h-8 rounded-lg overflow-hidden bg-[#EBF5F0] flex items-center justify-center shrink-0">{group.hotel.imageUrl ? <img src={group.hotel.imageUrl} alt="" className="w-full h-full object-cover" /> : <Building2 size={14} className="text-[#114B36]" />}</div><span className="font-bold text-xs text-[#1F2937] truncate flex-1">{group.hotel.name}</span><span className={`text-[0.6rem] font-bold ${group.hotel.isOpen ? "text-[#15803D]" : "text-[#B45309]"}`}>{group.hotel.isOpen ? "Open" : "Closed"}</span></button>{group.items.slice(0, 4).map((item) => <button key={item.id} onClick={() => { const hotel = hotels.find((entry) => entry.id === item.hotelId); if (hotel) selectHotel(hotel); }} className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left border-none bg-transparent hover:bg-[#EBF5F0] cursor-pointer"><div className="w-10 h-10 rounded-lg overflow-hidden bg-[#F3F4F6] shrink-0">{item.imageUrl ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" /> : <Utensils size={15} className="m-auto mt-3 text-[#9CA3AF]" />}</div><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#1F2937] truncate">{item.name}</span><span className="block text-[0.65rem] text-[#6B7280] truncate">{item.category} · KSh {item.price}</span></span><ArrowRight size={14} className="text-[#114B36]" /></button>)}</section>)}
                            </div>}
                        </section>

                        <section className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1" aria-label="Meal categories">
                            <MealCategoryChips onSelect={(label) => setSearchQuery(label === "All" ? "" : label)} />
                        </section>

                        {(discovery?.trustIndicators?.length ?? 0) > 0 && <section aria-label="Ladha trust indicators"><p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#789083]">Why customers choose Ladha</p><div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#E5E9E1] bg-[#F5F7F1] p-3 sm:grid-cols-4">
                            {discovery!.trustIndicators.map((item) => { const Icon = item.icon === "shield" ? ShieldCheck : item.icon === "leaf" ? Leaf : item.icon === "route" ? Route : LockKeyhole; return <div key={item.label} className="flex items-center gap-2 text-[0.65rem] font-semibold leading-tight text-[#3B4A42]"><Icon size={15} className="shrink-0 text-[#114B36]" />{item.label}</div>; })}
                        </div></section>}

                        {/* TODO - and if in general delivery area, have all local hotels in the selected location... e.g Naivasha town, Kiambu town, Luanda town */}

                        <section>
                            <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#789083]">Discover</p><h2 className="mt-1 text-xl font-black text-[#1F2937]">{viewAllHotels ? "All kitchens" : "Nearby kitchens"}</h2></div><button type="button" onClick={handleViewAllHotels} className="shrink-0 border-none bg-transparent text-xs font-bold text-[#114B36] underline underline-offset-2">{viewAllHotels ? "Nearby only" : "View all hotels"}</button></div>
                            {viewAllHotels && <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#F0D9A8] bg-[#FFF8E8] px-3 py-3 text-xs leading-relaxed text-[#805B18]"><ShieldCheck size={15} className="mt-0.5 shrink-0" />Some hotels are outside your selected delivery area. Delivery charges may apply.</div>}
                            {loading ? <div className="grid grid-cols-2 gap-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-48 animate-pulse rounded-2xl bg-[#E9E5DE]" />)}</div> : hotels.length === 0 ? <DiscoverEmptyState viewAll={viewAllHotels} onExploreOtherOptions={handleViewAllHotels} /> : <div className="grid grid-cols-2 gap-3">{hotels.map((hotel) => <button key={hotel.id} onClick={() => selectHotel(hotel)} className="group overflow-hidden rounded-2xl border border-[#E8DED2] bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="relative h-28 bg-[#EBF5F0]">{hotel.imageUrl ? <img src={hotel.imageUrl} alt={hotel.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <Building2 size={30} className="absolute inset-0 m-auto text-[#114B36]" />}<span className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[0.58rem] font-bold ${hotel.isOpen ? "bg-[#E7F5EA] text-[#18733C]" : "bg-[#FFF3D6] text-[#9A6500]"}`}>{hotel.isOpen ? "OPEN" : "CLOSED"}</span></div><div className="p-3"><h3 className="truncate text-sm font-black text-[#1F2937]">{hotel.name}</h3><div className="mt-1 flex flex-wrap gap-1"><span className="rounded-full bg-[#EBF5F0] px-2 py-1 text-[0.58rem] font-bold text-[#114B36]"><MapPin size={10} className="mr-1 inline" />{hotel.locationName ?? "Serving area"}</span>{viewAllHotels && !hotel.isLocal && <span className="rounded-full bg-[#FFF3D6] px-2 py-1 text-[0.58rem] font-bold text-[#9A6500]">Delivery charges may apply</span>}</div><p className="mt-1 text-[0.68rem] text-[#6B7280]">{hotel.productCount} available items</p><RatingStars rating={hotel.rating} count={hotel.ratingCount} className="mt-2" /></div></button>)}</div>}
                        </section>

                        {discoveryMeals.length > 0 && <section><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#789083]">Based on completed paid orders</p><h2 className="mt-1 text-xl font-black text-[#1F2937]">{mealRanking === "trending" ? "Trending meals" : "Popular meals"}</h2></div><div className="flex gap-1.5" aria-label="Meal ranking"><button onClick={() => setMealRanking("popular")} className={`rounded-full px-3 py-1.5 text-[0.65rem] font-bold transition ${mealRanking === "popular" ? "bg-[#114B36] text-white" : "border border-[#DCE5DE] bg-white text-[#6B7280]"}`}>Popular</button><button onClick={() => setMealRanking("trending")} className={`rounded-full px-3 py-1.5 text-[0.65rem] font-bold transition ${mealRanking === "trending" ? "bg-[#114B36] text-white" : "border border-[#DCE5DE] bg-white text-[#6B7280]"}`}>Trending</button><Sparkles size={17} className="ml-1 self-center text-[#C58A1A]" /></div></div><div className="flex gap-3 overflow-x-auto scrollbar-hide">{discoveryMeals.slice(0, 6).map((meal) => <button key={meal.id} onClick={() => { const hotel = hotels.find((entry) => entry.id === meal.hotelId); if (hotel) selectHotel(hotel); }} className="min-w-[152px] overflow-hidden rounded-2xl border border-[#E8DED2] bg-white text-left shadow-sm transition hover:shadow-md"><div className="h-28 bg-[#F3F0E9]">{meal.imageUrl ? <img src={meal.imageUrl} alt={meal.name} loading="lazy" className="h-full w-full object-cover" /> : <Utensils size={24} className="mx-auto pt-10 text-[#9CA3AF]" />}</div><div className="p-3"><h3 className="truncate text-sm font-black text-[#1F2937]">{meal.name}</h3><p className="mt-1 truncate text-[0.65rem] text-[#6B7280]">{meal.hotelName}</p>{meal.rating ? <p className="mt-1 text-[0.65rem] font-bold text-[#A16207]">★ {meal.rating.toFixed(1)} ({meal.ratingCount})</p> : <p className="mt-1 text-[0.62rem] text-[#9CA3AF]">No ratings yet</p>}<p className="mt-2 text-sm font-black text-[#114B36]">KSh {meal.price}</p></div></button>)}</div></section>}

                        <section className="rounded-2xl bg-[#114B36] p-5 text-white"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#BDE0CB]">How ordering works</p><h2 className="mt-2 text-xl font-black">Simple from choice to doorstep.</h2><div className="mt-5 grid grid-cols-4 gap-2 text-center">{["Choose food", "Kitchen confirms", "Prepared fresh", "Track delivery"].map((step, index) => <div key={step}><span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-black">{index + 1}</span><span className="mt-2 block text-[0.62rem] font-semibold leading-tight text-white/80">{step}</span></div>)}</div><p className="mt-5 border-t border-white/15 pt-4 text-xs leading-relaxed text-white/70">You’ll see clear order updates after checkout. Payment on delivery is available where supported.</p></section>
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
            p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.mealCategories || []).some((mc) => mc.toLowerCase().includes(searchQuery.toLowerCase()))
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
                    <div className="mb-4 flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#EBF5F0] px-3 py-1.5 text-xs font-bold text-[#114B36]"><MapPin size={13} className="mr-1 inline" />{selectedHotel.locationName ?? "Serving area"}</span>{viewAllHotels && !selectedHotel.isLocal && <span className="rounded-full bg-[#FFF3D6] px-3 py-1.5 text-xs font-bold text-[#9A6500]">Delivery charges may apply</span>}</div>
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
                                            onQuantityChange={(quantity) => updateQuantity(item.id, quantity)}
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
                                                onAdd={() => { }}
                                                onIncrement={() => { }}
                                                onDecrement={() => { }}
                                                onQuantityChange={() => { }}
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

            {/* Talk to Staff floating button */}
            {selectedHotel && !(totalCount > 0) && (
                <button onClick={() => { setTalkToStaffOpen(true); setTalkSent(false); setTalkBody(""); }} className="fixed bottom-20 right-4 w-12 h-12 rounded-full bg-[#114B36] text-white shadow-lg flex items-center justify-center border-none cursor-pointer hover:bg-[#0D3D2B] transition-colors z-40" aria-label="Talk to staff">
                    <HelpCircle size={22} />
                </button>
            )}

            {/* Talk to Staff overlay */}
            {talkToStaffOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#FFF8F0] pt-5 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl max-h-[60vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-[#114B36]">Talk to Staff</p>
                                <h3 className="text-lg font-black text-[#1F2937]">{selectedHotel?.name}</h3>
                            </div>
                            <button onClick={() => setTalkToStaffOpen(false)} className="w-9 h-9 rounded-full border-none bg-white text-[#6B7280] flex items-center justify-center cursor-pointer"><X size={18} /></button>
                        </div>
                        {talkSent ? (
                            <div className="text-center py-8">
                                <div className="w-16 h-16 rounded-full bg-[#D1FAE5] flex items-center justify-center mx-auto mb-4"><Send size={28} className="text-[#065F46]" /></div>
                                <p className="font-bold text-[#1F2937]">Message sent!</p>
                                <p className="text-sm text-[#6B7280] mt-1">A staff member will respond shortly.</p>
                                <button onClick={() => setTalkToStaffOpen(false)} className="mt-4 w-full rounded-xl bg-[#114B36] text-white py-3 font-bold border-none cursor-pointer">Done</button>
                            </div>
                        ) : (
                            <>
                                <p className="text-sm text-[#6B7280] mb-4">Send a message to the {selectedHotel?.name} team. The first available staff member will respond.</p>
                                <textarea value={talkBody} onChange={(e) => setTalkBody(e.target.value)} placeholder="Type your message…" rows={4} className="w-full resize-none rounded-2xl border-2 border-[#E5E7EB] bg-white px-4 py-3 text-sm outline-none focus:border-[#114B36]" />
                                {talkSending && <p className="text-xs text-[#6B7280] mt-2">Sending…</p>}
                                <div className="flex gap-2 mt-4">
                                    <button onClick={() => setTalkToStaffOpen(false)} className="flex-1 rounded-xl bg-white border-2 border-[#E5E7EB] text-[#6B7280] py-3 font-bold text-sm border-none cursor-pointer">Cancel</button>
                                    <button onClick={async () => { if (!talkBody.trim() || talkSending) return; setTalkSending(true); const res = await apiPost("/messaging/talk-to-staff", { hotelId: selectedHotel!.id, body: talkBody.trim() }, token || undefined); setTalkSending(false); if (res.success) setTalkSent(true); }} disabled={!talkBody.trim()} className="flex-1 rounded-xl bg-[#114B36] text-white py-3 font-bold text-sm border-none cursor-pointer disabled:opacity-50">Send message</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const MEAL_CATEGORIES = [
    { label: "Breakfast", icon: "☀️" },
    { label: "Lunch", icon: "🍲" },
    { label: "Drinks", icon: "🥤" },
    { label: "Desserts", icon: "🍰" },
    { label: "Dinner", icon: "🍛" },
    { label: "All", icon: "•••" },
];

function MealCategoryChips({ onSelect }: { onSelect: (label: string) => void }) {
    return (
        <>
            {MEAL_CATEGORIES.map((category) => (
                <button
                    key={category.label}
                    onClick={() => onSelect(category.label)}
                    className="min-w-[74px] rounded-2xl border border-[#E8DED2] bg-white px-3 py-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                    <span className="flex h-9 items-center justify-center text-lg">{category.icon}</span>
                    <span className="mt-1 block text-[0.68rem] font-bold text-[#3B4A42]">{category.label}</span>
                </button>
            ))}
        </>
    );
}

/**
 * Shown when the selected delivery area has zero kitchens. Framed as
 * expansion-in-progress rather than "nothing found", with the existing
 * "View all hotels" toggle surfaced as the explicit next step.
 */
function DiscoverEmptyState({ viewAll, onExploreOtherOptions }: { viewAll: boolean; onExploreOtherOptions: () => void }) {
    return (
        <div className="rounded-2xl border border-[#E8DED2] bg-white px-5 py-12 text-center shadow-sm">
            <MapPin size={36} className="mx-auto mb-3 text-[#B7C5BD]" />
            {viewAll ? (
                <>
                    <h3 className="font-bold text-[#1F2937]">No kitchens found yet</h3>
                    <p className="mt-1 text-sm text-[#9CA3AF]">We couldn&rsquo;t find any hotels anywhere yet. Check back soon.</p>
                </>
            ) : (
                <>
                    <h3 className="font-bold text-[#1F2937]">We&rsquo;re expanding here soon</h3>
                    <p className="mt-1 text-sm text-[#6B7280]">
                        There are no kitchens in this delivery area yet, but we&rsquo;re working on it. In the meantime, you can explore hotels in other locations.
                    </p>
                    <button
                        type="button"
                        onClick={onExploreOtherOptions}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#114B36] px-4 py-2.5 text-sm font-bold text-white border-none cursor-pointer hover:bg-[#0D3D2B] transition-colors"
                    >
                        Explore other options <ArrowRight size={15} />
                    </button>
                </>
            )}
        </div>
    );
}
