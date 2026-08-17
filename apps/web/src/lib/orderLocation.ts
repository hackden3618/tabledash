/**
 * Composes the full staff-facing delivery location for an order. Every part the
 * customer entered is shown — delivery zone (area), stall/delivery point, market
 * section and directions — so kitchen staff and runners collecting utensils can
 * find the exact spot without guessing.
 */
export function formatOrderLocation(order: {
    deliveryZoneName?: string | null;
    stallNumber?: string | null;
    marketSection?: string | null;
    locationDescription?: string | null;
}): string {
    const parts = [
        order.deliveryZoneName || null,
        order.stallNumber || null,
        order.marketSection || null,
        order.locationDescription || null,
    ].filter(Boolean);
    return parts.join(" — ") || "Location not recorded";
}