/**
 * Purpose: Customer Cart View for tableDash ("Mama's Hotel").
 * Responsibilities: Renders cart items breakdown, item quantity adjustments, total pricing, and action triggers for proceeding to delivery or WhatsApp ordering.
 * Dependencies: React, useCart context.
 * When to modify: When altering cart line item summaries or WhatsApp message formats.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useCart } from "../../context/CartContext";
import { useWebSocket } from "../../lib/websocket";
import { apiGet } from "../../lib/api";
import { AlertTriangle, Building2, X } from "lucide-react";

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

    // Listen for out-of-stock and hotel-status events
    useWebSocket("customer", undefined, (event) => {
        if (event.type === "MENU_AVAILABILITY_UPDATED") {
            const updated = event.payload as { id: string; available: boolean; stockQty: number };
            if (!updated.available || updated.stockQty <= 0) {
                markItemAvailability(updated.id, false);
            }
        } else if (event.type === "HOTEL_CLOSING") {
            const data = event.payload as { hotelId?: string };
            if (data.hotelId) {
                setClosedHotelIds((prev) => prev.includes(data.hotelId!) ? prev : [...prev, data.hotelId!]);
            }
        } else if (event.type === "HOTEL_STATUS_UPDATED") {
            const status = event.payload as { isOpen: boolean; hotelId?: string };
            if (status.hotelId) {
                setClosedHotelIds((prev) =>
                    status.isOpen
                        ? prev.filter((id) => id !== status.hotelId)
                        : prev.includes(status.hotelId!) ? prev : [...prev, status.hotelId!]
                );
            }
        }
    });

    const groupedCart = useMemo(() => {
        const groups = new Map<string, { hotelName: string; availableItems: typeof cart; unavailableItems: typeof cart }>();
        for (const item of cart) {
            const key = item.hotelId || "default";
            if (!groups.has(key)) {
                groups.set(key, { hotelName: item.hotelName || "TableDash Deliveries", availableItems: [], unavailableItems: [] });
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

    return (
        <div className="app-container">
            {/* Header Bar */}
            <header className="header-bar">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <button
                        onClick={onBackToMenu}
                        style={{
                            background: "none",
                            border: "none",
                            color: "white",
                            fontSize: "1.2rem",
                            cursor: "pointer",
                        }}
                    >
                        ←
                    </button>
                    <div className="header-title">Your Cart</div>
                </div>
                {cart.length > 0 && (
                    <button
                        onClick={clearCart}
                        title="Clear Cart"
                        style={{
                            background: "none",
                            border: "none",
                            color: "#FCA5A5",
                            fontSize: "1.2rem",
                            cursor: "pointer",
                        }}
                    >
                        🗑
                    </button>
                )}
            </header>

            {/* Main Content */}
            <div style={{ padding: "20px" }}>
                {cart.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 0", color: "#6B7280" }}>
                        <div style={{ fontSize: "3rem", marginBottom: "12px" }}>🛒</div>
                        <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#1F2937" }}>Your cart is empty</h2>
                        <p style={{ fontSize: "0.875rem", marginTop: "4px", marginBottom: "20px" }}>
                            Explore today's fresh menu items to place an order.
                        </p>
                        <button onClick={onBackToMenu} className="btn btn-primary" style={{ maxWidth: "200px" }}>
                            Browse Menu
                        </button>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                        {groupedCart.map(([hotelId, group]) => (
                            <div key={hotelId}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                                    <Building2 size={16} color="#1E4D36" />
                                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1E4D36", display: "flex", alignItems: "center", gap: "6px" }}>
                                        {group.hotelName}
                                        {closedHotelIds.includes(hotelId) && (
                                            <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#DC2626", background: "#FEE2E2", padding: "2px 8px", borderRadius: "999px", textTransform: "uppercase" }}>
                                                Closed
                                            </span>
                                        )}
                                    </h3>
                                </div>

                                {/* Available Items */}
                                {group.availableItems.length > 0 && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "12px" }}>
                                        {group.availableItems.map((item) => (
                                            <div key={item.id} className="card" style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                                                <img src={item.imageUrl} alt={item.name} style={{ width: "64px", height: "64px", borderRadius: "10px", objectFit: "cover" }} />
                                                <div style={{ flex: 1 }}>
                                                    <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#1F2937" }}>{item.name}</h3>
                                                    <div style={{ fontSize: "0.875rem", color: "#6B7280" }}>KSh {item.price} each</div>
                                                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1E4D36", marginTop: "2px" }}>
                                                        Subtotal: KSh {item.price * item.quantity}
                                                    </div>
                                                </div>

                                                <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#EBF4F0", padding: "4px 8px", borderRadius: "8px", border: "1px solid #1E4D36" }}>
                                                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                                        style={{ border: "none", background: "none", fontWeight: 700, fontSize: "1.1rem", color: "#1E4D36", cursor: "pointer", padding: "0 4px" }}>-</button>
                                                    <input type="number" min={1} value={item.quantity}
                                                        onChange={(e) => { const val = parseInt(e.target.value, 10); if (!isNaN(val) && val >= 1) updateQuantity(item.id, val); }}
                                                        style={{ width: "48px", textAlign: "center", fontWeight: 700, fontSize: "0.95rem", border: "1px solid #D1D5DB", borderRadius: "6px", padding: "4px 2px", background: "white", outline: "none" }} />
                                                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                                        style={{ border: "none", background: "none", fontWeight: 700, fontSize: "1.1rem", color: "#1E4D36", cursor: "pointer", padding: "0 4px" }}>+</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Unavailable Items */}
                                {group.unavailableItems.length > 0 && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", borderTop: "1px solid #FEE2E2", paddingTop: "12px", marginTop: "4px" }}>
                                            <AlertTriangle size={14} color="#DC2626" />
                                            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#DC2626" }}>
                                                Sold Out / Unavailable
                                            </span>
                                        </div>
                                        {group.unavailableItems.map((item) => (
                                            <div key={item.id} className="card"
                                                style={{ display: "flex", gap: "14px", alignItems: "center", opacity: 0.6, background: "#FEF2F2", border: "1.5px dashed #FCA5A5" }}>
                                                <img src={item.imageUrl} alt={item.name}
                                                    style={{ width: "64px", height: "64px", borderRadius: "10px", objectFit: "cover", filter: "grayscale(60%)" }} />
                                                <div style={{ flex: 1 }}>
                                                    <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#6B7280" }}>{item.name}</h3>
                                                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#DC2626", background: "#FEE2E2", padding: "2px 8px", borderRadius: "20px" }}>
                                                        Sold Out
                                                    </span>
                                                </div>
                                                <button onClick={() => updateQuantity(item.id, 0)}
                                                    style={{ border: "none", background: "#FEE2E2", color: "#DC2626", cursor: "pointer", padding: "6px", borderRadius: "8px", display: "flex" }}>
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Total summary box */}
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "16px",
                                borderRadius: "12px",
                                background: "#F9FAFB",
                                border: "1.5px solid #E5E7EB",
                                marginTop: "12px",
                            }}
                        >
                            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1F2937" }}>Total</span>
                            <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "#1E4D36" }}>
                                KSh {totalAmount}
                            </span>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
                            {(() => {
                                const anyHotelClosed = cart.some((item) => item.hotelId && closedHotelIds.includes(item.hotelId));
                                return anyHotelClosed ? (
                                    <div style={{ background: "#FEF2F2", border: "1.5px solid #FCA5A5", borderRadius: "12px", padding: "14px", textAlign: "center" }}>
                                        <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#DC2626", marginBottom: "4px" }}>
                                            Hotel is Currently Closed
                                        </div>
                                        <div style={{ fontSize: "0.8rem", color: "#991B1B" }}>
                                            This hotel is not accepting orders right now. Please check back later.
                                        </div>
                                    </div>
                                ) : null;
                            })()}
                            <button onClick={onContinueToDelivery}
                                disabled={cart.some((item) => item.hotelId && closedHotelIds.includes(item.hotelId))}
                                className="btn btn-primary"
                                style={{ opacity: cart.some((item) => item.hotelId && closedHotelIds.includes(item.hotelId)) ? 0.5 : 1 }}>
                                Continue to Delivery
                            </button>

                            <button onClick={handleWhatsAppOrder} className="btn btn-whatsapp">
                                💬 Order via WhatsApp
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
