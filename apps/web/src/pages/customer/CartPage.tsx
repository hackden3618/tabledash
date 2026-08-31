import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useCart } from "../../context/CartContext";
import { apiGet } from "../../lib/api";
import { AlertTriangle, Building2, X, Trash2, ShoppingBag } from "lucide-react";
import { Header } from "../../components/ui/Header";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { PageTransition } from "../../components/ui/PageTransition";

interface CartPageProps {
  onBackToMenu: () => void;
  onContinueToDelivery: () => void;
}

export const CartPage: React.FC<CartPageProps> = ({ onBackToMenu, onContinueToDelivery }) => {
  const { cart, updateQuantity, clearCart, totalAmount, updateItemSnapshot, closedHotelIds, setClosedHotelIds } = useCart();
  const [whatsappPhone, setWhatsappPhone] = useState<string | null>(null);
  const [whatsappStaffName, setWhatsappStaffName] = useState<string | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);

  const cartHotelIds = [...new Set(cart.map((item) => item.hotelId).filter((id): id is string => Boolean(id)))];
  // Delivery prices are configured against a town's final delivery area, not
  // the town itself. Keep the cart quote aligned with checkout/order placement.
  const deliveryAreaId = localStorage.getItem("ladha_town_region_id");
  useEffect(() => {
    if (!cartHotelIds.length) { setDeliveryFee(0); return; }
    setDeliveryFeeLoading(true);
    const query = new URLSearchParams({ hotelIds: cartHotelIds.join(",") });
    if (deliveryAreaId) query.set("zoneId", deliveryAreaId);
    void apiGet<Array<{ deliveryFee: number }>>(`/orders/delivery-fees?${query}`)
      .then((res) => setDeliveryFee(res.success && res.data ? res.data.reduce((sum, row) => sum + Number(row.deliveryFee), 0) : null))
      .finally(() => setDeliveryFeeLoading(false));
  }, [cartHotelIds.join(","), deliveryAreaId]);

  useEffect(() => {
    const hotelIds = [...new Set(cart.map((item) => item.hotelId).filter((id): id is string => Boolean(id)))];
    if (hotelIds.length === 0) return;

    void Promise.all([
      apiGet<{ id: string; isOpen: boolean }[]>("/hotels"),
      ...hotelIds.map((hotelId) => apiGet<Array<{ id: string; available: boolean; stockQty: number; price: number; name: string; imageUrl: string }>>(`/menu?hotelId=${encodeURIComponent(hotelId)}`)),
    ]).then(([hotelResponse, ...menuResponses]) => {
      if (hotelResponse.success && hotelResponse.data) {
        setClosedHotelIds(hotelResponse.data.filter((hotel) => !hotel.isOpen).map((hotel) => hotel.id));
      }
      menuResponses.forEach((response) => {
        if (!response.success || !response.data) return;
        response.data.forEach((product) => updateItemSnapshot(product.id, product));
      });
    }).catch(() => {});
  }, [cart.length]);

  useEffect(() => {
    // Hotel-scoped, resolved to that hotel's actual first admin — never a
    // hardcoded number. A cart with items from more than one hotel talks to
    // the first hotel present; each hotel's items still show that hotel's
    // name in the cart list so it's clear which conversation this opens.
    const primaryHotelId = cartHotelIds[0];
    if (!primaryHotelId) { setWhatsappPhone(null); return; }
    apiGet<{ phone: string; name: string | null }>(`/hotels/${primaryHotelId}/whatsapp-contact`).then((res) => {
      if (res.success && res.data) {
        setWhatsappPhone(res.data.phone);
        setWhatsappStaffName(res.data.name);
      } else {
        setWhatsappPhone(null);
      }
    }).catch(() => setWhatsappPhone(null));
  }, [cartHotelIds.join(",")]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.type === "MENU_AVAILABILITY_UPDATED") {
        const updated = detail.payload as { id: string; available: boolean; stockQty: number; price?: number; name?: string; imageUrl?: string };
        updateItemSnapshot(updated.id, updated);
      } else if (detail.type === "HOTEL_CLOSING") {
        const data = detail.payload as { hotelId?: string };
        if (data.hotelId) {
          setClosedHotelIds((prev) => prev.includes(data.hotelId!) ? prev : [...prev, data.hotelId!]);
        }
      } else if (detail.type === "HOTEL_STATUS_UPDATED") {
        const status = detail.payload as { isOpen: boolean; hotelId?: string };
        if (status.hotelId) {
          setClosedHotelIds((prev) =>
            status.isOpen
              ? prev.filter((id) => id !== status.hotelId)
              : prev.includes(status.hotelId!) ? prev : [...prev, status.hotelId!]
          );
        }
      }
    };
    window.addEventListener("ladha:realtime", handler);
    return () => window.removeEventListener("ladha:realtime", handler);
  }, []);

  const groupedCart = useMemo(() => {
    const groups = new Map<string, { hotelName: string; availableItems: typeof cart; unavailableItems: typeof cart }>();
    for (const item of cart) {
      const key = item.hotelId || "default";
      if (!groups.has(key)) {
        groups.set(key, { hotelName: item.hotelName || "Ladha", availableItems: [], unavailableItems: [] });
      }
      const group = groups.get(key)!;
      if (item.available && !(item.stockQty !== undefined && item.stockQty < item.quantity) && !(item.hotelId && closedHotelIds.includes(item.hotelId))) {
        group.availableItems.push(item);
      } else {
        group.unavailableItems.push(item);
      }
    }
    return Array.from(groups.entries());
  }, [cart, closedHotelIds]);

  const isOrderable = (item: typeof cart[number]) =>
    item.available && !(item.stockQty !== undefined && item.stockQty < item.quantity) && !(item.hotelId && closedHotelIds.includes(item.hotelId));

  const handleWhatsAppOrder = () => {
    if (!whatsappPhone) return;
    const availableOnly = cart.filter(isOrderable);
    const text = availableOnly
      .map((item) => `${item.quantity}x ${item.name} (KSh ${item.price * item.quantity})`)
      .join("\n");

    const message = encodeURIComponent(
      `Hello! I would like to order:\n\n${text}\n\nTotal: KSh ${totalAmount}`
    );

    window.open(`https://wa.me/${whatsappPhone.replace(/\D/g, "")}?text=${message}`, "_blank");
  };

  const unavailableItems = cart.filter((item) => !isOrderable(item));
  const anyHotelClosed = cart.some((item) => item.hotelId && closedHotelIds.includes(item.hotelId));

  return (
    <div className="app-container">
      <Header
        title="Your Cart"
        onBack={onBackToMenu}
        rightAction={
          cart.length > 0 ? (
            <button
              onClick={clearCart}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors bg-none border-none cursor-pointer text-white/70 hover:text-white"
              aria-label="Clear cart"
            >
              <Trash2 size={18} />
            </button>
          ) : undefined
        }
      />

      <PageTransition>
        <div className="px-4 py-5">
          {cart.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag size={36} />}
              title="Your cart is empty"
              description="Explore today's fresh menu items to place an order."
              action={{ label: "Browse Menu", onClick: onBackToMenu }}
            />
          ) : (
            <div className="space-y-5">
              {groupedCart.map(([hotelId, group]) => (
                <div key={hotelId}>
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 size={16} className="text-[#114B36]" />
                    <h3 className="font-bold text-sm text-[#114B36] flex items-center gap-2">
                      {group.hotelName}
                      {closedHotelIds.includes(hotelId) && (
                        <Badge variant="danger" size="sm">Closed</Badge>
                      )}
                    </h3>
                  </div>

                  {/* Available Items */}
                  {group.availableItems.length > 0 && (
                    <div className="space-y-3">
                      {group.availableItems.map((item) => (
                        <motion.div
                          key={item.id}
                          layout
                          className="flex gap-4 items-center p-4 bg-white rounded-2xl shadow-[0_2px_8px_rgba(17,75,54,0.06)]"
                        >
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-16 h-16 rounded-xl object-cover shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm text-[#1F2937]">{item.name}</h4>
                            <p className="text-xs text-[#6B7280]">KSh {item.price} each · {item.stockQty ?? "—"} available</p>
                            <p className="font-bold text-sm text-[#114B36] mt-0.5">
                              KSh {item.price * item.quantity}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 bg-[#EBF5F0] rounded-xl border-2 border-[#114B36] shrink-0">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="flex items-center justify-center w-8 h-8 text-[#114B36] font-bold bg-none border-none cursor-pointer hover:bg-[#C2E2D3] transition-colors rounded-l-lg"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={item.stockQty}
                              value={item.quantity}
                              onChange={(event) => updateQuantity(item.id, Number(event.target.value))}
                              className="w-12 h-8 text-center font-bold text-xs text-[#114B36] bg-transparent border-x border-[#C2E2D3] outline-none"
                              aria-label={`Quantity for ${item.name}`}
                            />
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="flex items-center justify-center w-8 h-8 text-[#114B36] font-bold bg-none border-none cursor-pointer hover:bg-[#C2E2D3] transition-colors rounded-r-lg"
                            >
                              +
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Unavailable Items */}
                  {group.unavailableItems.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle size={13} className="text-[#DC2626]" />
                        <span className="text-xs font-bold text-[#DC2626]">Sold Out</span>
                      </div>
                      {group.unavailableItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex gap-4 items-center p-3 bg-[#FEF2F2] rounded-xl border border-dashed border-[#FCA5A5] opacity-60"
                        >
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-12 h-12 rounded-lg object-cover shrink-0 grayscale-[60%]"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm text-[#6B7280]">{item.name}</h4>
                            <Badge variant="danger" size="sm">{item.stockQty && item.stockQty > 0 ? `Only ${item.stockQty} left` : "Sold Out"}</Badge>
                          </div>
                          <button
                            onClick={() => updateQuantity(item.id, 0)}
                            className="p-2 bg-[#FEE2E2] rounded-lg text-[#DC2626] bg-none border-none cursor-pointer"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Total Summary */}
              <motion.div
                layout
                className="bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(17,75,54,0.06)] border border-[#E5E7EB]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#6B7280]">Subtotal</span>
                  <span className="font-semibold text-[#1F2937]">KSh {totalAmount}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#6B7280]">Delivery</span>
                  <span className="text-sm font-semibold text-[#1F2937]">{deliveryFeeLoading ? "Calculating…" : deliveryFee === null ? "Confirmed at checkout" : `KSh ${deliveryFee.toFixed(2)}`}</span>
                </div>
                <div className="border-t border-[#E5E7EB] pt-3 mt-3 flex items-center justify-between">
                  <span className="font-bold text-[#1F2937]">Total</span>
                  <span className="text-xl font-extrabold text-[#114B36]">{deliveryFee === null ? `KSh ${totalAmount}` : `KSh ${(totalAmount + deliveryFee).toFixed(2)}`}</span>
                </div>
              </motion.div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                {anyHotelClosed && (
                  <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-2xl p-4 text-center">
                    <p className="font-bold text-sm text-[#DC2626] mb-1">Hotel is Currently Closed</p>
                    <p className="text-xs text-[#991B1B]">Not accepting orders right now.</p>
                  </div>
                )}

                {unavailableItems.length > 0 && (
                  <div className="bg-[#FFF7ED] border border-[#FED7AA] rounded-2xl p-4 text-center">
                    <p className="font-bold text-sm text-[#C2410C] mb-1">Review your cart</p>
                    <p className="text-xs text-[#9A3412]">Some items are unavailable or have less stock than requested. Adjust or remove them to continue.</p>
                  </div>
                )}

                <Button
                  onClick={onContinueToDelivery}
                  disabled={anyHotelClosed || unavailableItems.length > 0}
                  fullWidth
                  size="lg"
                  variant="primary"
                >
                  {anyHotelClosed ? "Hotel Closed" : unavailableItems.length > 0 ? "Resolve Cart Items" : "Continue to Delivery"}
                </Button>

                {whatsappPhone && (
                  <Button
                    onClick={handleWhatsAppOrder}
                    fullWidth
                    size="md"
                    variant="whatsapp"
                  >
                    💬 Order via WhatsApp{whatsappStaffName ? ` with ${whatsappStaffName}` : ""}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </PageTransition>
    </div>
  );
};
