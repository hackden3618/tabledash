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

let cachedWhatsAppPhone = "+254757030743";

export const CartPage: React.FC<CartPageProps> = ({ onBackToMenu, onContinueToDelivery }) => {
  const { cart, updateQuantity, clearCart, totalAmount, markItemAvailability, closedHotelIds, setClosedHotelIds } = useCart();
  const [whatsappPhone, setWhatsappPhone] = useState(cachedWhatsAppPhone);

  useEffect(() => {
    apiGet<{ staffPhone?: string }>("/settings").then((res) => {
      if (res.success && res.data?.staffPhone) {
        const formatted = res.data.staffPhone.replace(/\D/g, "");
        const num = formatted.startsWith("254") ? `+${formatted}` : `+254${formatted.replace(/^0/, "")}`;
        cachedWhatsAppPhone = num;
        setWhatsappPhone(num);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.type === "MENU_AVAILABILITY_UPDATED") {
        const updated = detail.payload as { id: string; available: boolean; stockQty: number };
        if (!updated.available || updated.stockQty <= 0) {
          markItemAvailability(updated.id, false);
        }
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
    window.addEventListener("tabledash:realtime", handler);
    return () => window.removeEventListener("tabledash:realtime", handler);
  }, [markItemAvailability, setClosedHotelIds]);

  const groupedCart = useMemo(() => {
    const groups = new Map<string, { hotelName: string; availableItems: typeof cart; unavailableItems: typeof cart }>();
    for (const item of cart) {
      const key = item.hotelId || "default";
      if (!groups.has(key)) {
        groups.set(key, { hotelName: item.hotelName || "Ladha", availableItems: [], unavailableItems: [] });
      }
      const group = groups.get(key)!;
      if (item.available) {
        group.availableItems.push(item);
      } else {
        group.unavailableItems.push(item);
      }
    }
    return Array.from(groups.entries());
  }, [cart]);

  const handleWhatsAppOrder = () => {
    const availableOnly = cart.filter((i) => i.available);
    const text = availableOnly
      .map((item) => `${item.quantity}x ${item.name} (KSh ${item.price * item.quantity})`)
      .join("\n");

    const message = encodeURIComponent(
      `Hello! I would like to order:\n\n${text}\n\nTotal: KSh ${totalAmount}`
    );

    window.open(`https://wa.me/${whatsappPhone}?text=${message}`, "_blank");
  };

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
                            <p className="text-xs text-[#6B7280]">KSh {item.price} each</p>
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
                            <span className="w-8 text-center font-bold text-xs text-[#114B36]">
                              {item.quantity}
                            </span>
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
                            <Badge variant="danger" size="sm">Sold Out</Badge>
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
                  <span className="text-sm font-semibold text-[#22C55E]">Free</span>
                </div>
                <div className="border-t border-[#E5E7EB] pt-3 mt-3 flex items-center justify-between">
                  <span className="font-bold text-[#1F2937]">Total</span>
                  <span className="text-xl font-extrabold text-[#114B36]">KSh {totalAmount}</span>
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

                <Button
                  onClick={onContinueToDelivery}
                  disabled={anyHotelClosed}
                  fullWidth
                  size="lg"
                  variant="primary"
                >
                  {anyHotelClosed ? "Hotel Closed" : "Continue to Delivery"}
                </Button>

                <Button
                  onClick={handleWhatsAppOrder}
                  fullWidth
                  size="md"
                  variant="whatsapp"
                >
                  💬 Order via WhatsApp
                </Button>
              </div>
            </div>
          )}
        </div>
      </PageTransition>
    </div>
  );
};
