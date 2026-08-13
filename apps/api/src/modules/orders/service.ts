/**
 * Purpose: Order Processing & Status Lifecycle Service for ladha.
 * Responsibilities: Handles transactional order placement, status state transitions, metric aggregation for admin dashboard, and real-time WebSocket broadcasting. SMS dispatching is owned by the outbox dispatcher via handlers in the notifications module.
 * Dependencies: Prisma database client, WebSocket Hub.
 * When to modify: When adding order workflow steps, altering dashboard calculation metrics, or changing WS event payloads.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import type { DashboardMetrics, OrderStatus } from "../../../../../shared/types";
import { getDefaultHotel } from "../hotels/service";
import { wsHub } from "../websocket/hub";
import { formatPhone } from "../../../../../shared/phone";
import { calculateDashboardMetrics, normalizeOrderItems, PENDING_STATUSES } from "./logic";
import { applyOrderChargeTx, recordCancellationChargeTx } from "../finance/service";
import { generateAccountId } from "../customers/account-id";
import { getCustomerProfile } from "../customers/auth.service";

export interface CreateOrderInputItem {
    productId: string;
    quantity: number;
}

export interface CreateOrderInput {
    firstName: string;
    lastName?: string;
    phone: string;
    knownName?: string;
    stallNumber?: string;
    marketSection?: string;
    locationDescription?: string;
    items: CreateOrderInputItem[];
    guestId?: string;
    paymentMethod?: "PAY_LATER" | "PAY_ON_DELIVERY";
    deliveryZoneId?: string;
    /**
     * True when the caller is placing the order for someone else. The order is
     * still attributed to the customer resolved by `phone` (the recipient), but
     * the caller's device guest identity must NOT be linked to the recipient's
     * account — that would leak the recipient's order history into the caller's
     * guest session.
     */
    orderingForOther?: boolean;
}

interface OrderItemDraft {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
}

export interface DeliveryFeeQuote {
    hotelId: string;
    deliveryFee: number;
}

/** Server-side delivery pricing. Every hotel charges its configured price for
 * the selected platform region, falling back to its general-area fee (KSh 50
 * by default). The hotel's home region is not silently exempt. */
export async function getDeliveryFeeQuote(hotelIds: string[], deliveryZoneId?: string): Promise<DeliveryFeeQuote[]> {
    const uniqueHotelIds = [...new Set(hotelIds)];
    if (!uniqueHotelIds.length) return [];
    const hotels = await prisma.hotel.findMany({
        where: { id: { in: uniqueHotelIds }, deletedAt: null },
        select: { id: true, zoneId: true, genericDeliveryFee: true, deliveryFees: { select: { zoneId: true, amount: true } } },
    });
    if (hotels.length !== uniqueHotelIds.length) throw new Error("One or more hotels are unavailable");
    return hotels.map((hotel) => {
        const configured = deliveryZoneId ? hotel.deliveryFees.find((fee) => fee.zoneId === deliveryZoneId) : undefined;
        return { hotelId: hotel.id, deliveryFee: Number(configured?.amount ?? hotel.genericDeliveryFee) };
    });
}

// On-behalf orders require the recipient's number to be OTP-verified, and the
// verification must be recent (OTP itself lives 10 minutes) so a stale confirm
// can't be reused. This is enforced here, server-side, not in the UI.
const RECIPIENT_VERIFY_FRESH_MS = 15 * 60 * 1000;

function buildCustomerDisplay(firstName: string, lastName?: string | null, knownName?: string | null): string {
    const name = lastName ? `${firstName} ${lastName}` : firstName;
    return knownName ? `${name} (${knownName})` : name;
}

/** Resolves every live identity that is allowed to receive a customer's order events. */
async function getOrderOwnerIdentityKeys(customerId: string): Promise<string[]> {
    const guestSessions = await prisma.guestIdentity.findMany({
        where: { customerId },
        select: { id: true },
    });
    return [`customer:${customerId}`, ...guestSessions.map((session) => `guest:${session.id}`)];
}

/**
 * Places a new customer order transactionally.
 * Groups items by product.hotelId, creates one Order per hotel atomically.
 * WHY: Supports multi-hotel cart — items from different hotels are partitioned
 * into separate orders within a single transaction. All orders share one customer.
 */
export const placeOrder = async (input: CreateOrderInput) => {
    const normalizedItems = new Map(normalizeOrderItems(input.items).map((item) => [item.productId, item.quantity]));
    if (!input.firstName?.trim() || !input.phone?.trim()) {
        throw new Error("Customer name and phone are required");
    }

    // Fetch requested products to calculate authoritative unit prices and totals
    const productIds = [...normalizedItems.keys()];
    const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { hotel: true },
    });

    // Check each hotel in the cart is open
    const hotelIdsInCart = products.map((p) => p.hotelId).filter((id): id is string => !!id);
    const uniqueHotelIds = [...new Set(hotelIdsInCart)];
    if (uniqueHotelIds.length > 0) {
        const hotels = await prisma.hotel.findMany({
            where: { id: { in: uniqueHotelIds } },
        });
        const closedHotel = hotels.find((h) => !h.isOpen);
        if (closedHotel) {
            throw new Error(`${closedHotel.name} is currently closed for new orders. Please check back later!`);
        }
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validate all items are available and in stock
    for (const [productId, quantity] of normalizedItems) {
        const product = productMap.get(productId);
        if (!product) {
            throw new Error(`Product with ID ${productId} not found`);
        }
        if (!product.available) {
            wsHub.broadcastOrderBounced({
                type: "ORDER_BOUNCED",
                payload: {
                    reason: "unavailable",
                    productName: product.name,
                    customerPhone: input.phone,
                    customerName: buildCustomerDisplay(input.firstName, input.lastName, input.knownName),
                    requestedQty: quantity,
                },
            }, product.hotelId || undefined);
            throw new Error(`"${product.name}" is currently unavailable`);
        }
        if (product.stockQty < quantity) {
            wsHub.broadcastOrderBounced({
                type: "ORDER_BOUNCED",
                payload: {
                    reason: "out_of_stock",
                    productName: product.name,
                    customerPhone: input.phone,
                    customerName: buildCustomerDisplay(input.firstName, input.lastName, input.knownName),
                    requestedQty: quantity,
                    availableQty: product.stockQty,
                },
            }, product.hotelId || undefined);
            throw new Error(
                `Only ${product.stockQty} portion(s) of "${product.name}" left in stock (you requested ${quantity})`
            );
        }
    }

    // Group items by hotelId
    const hotelGroups = new Map<string, { hotelId: string; hotelName: string; items: typeof input.items; orderItemData: OrderItemDraft[]; subtotal: number; deliveryFee: number; totalAmount: number }>();
    for (const [productId, quantity] of normalizedItems) {
        const product = productMap.get(productId)!;
        const hId = product.hotelId;
        if (!hotelGroups.has(hId)) {
            hotelGroups.set(hId, { hotelId: hId, hotelName: product.hotel?.name || "Ladha Deliveries", items: [], orderItemData: [], subtotal: 0, deliveryFee: 0, totalAmount: 0 });
        }
        const group = hotelGroups.get(hId)!;
        group.items.push({ productId, quantity });
        const unitPrice = Number(product.price);
        const subtotal = unitPrice * quantity;
        group.subtotal += subtotal;
        group.orderItemData.push({
            productId: product.id,
            name: product.name,
            quantity,
            unitPrice,
            subtotal,
        });
    }

    const deliveryFees = await getDeliveryFeeQuote([...hotelGroups.keys()], input.deliveryZoneId);
    for (const quote of deliveryFees) {
        const group = hotelGroups.get(quote.hotelId)!;
        group.deliveryFee = quote.deliveryFee;
        group.totalAmount = group.subtotal + quote.deliveryFee;
    }

    const formattedPhone = formatPhone(input.phone);

    // Execute database transaction — one Order per hotel group
    const result = await prisma.$transaction(async (tx) => {
        let customer = await tx.customer.findFirst({
            where: { phone: formattedPhone },
        });

        if (!customer) {
            const accountId = await generateAccountId();
            customer = await tx.customer.create({
                data: {
                    accountId,
                    firstName: input.firstName,
                    lastName: input.lastName,
                    phone: formattedPhone,
                    knownName: input.knownName,
                    stallNumber: input.stallNumber,
                    marketSection: input.marketSection,
                    locationDescription: input.locationDescription,
                },
            });
        } else {
            customer = await tx.customer.update({
                where: { id: customer.id },
                data: {
                    firstName: input.firstName,
                    lastName: input.lastName ?? customer.lastName,
                    knownName: input.knownName ?? customer.knownName,
                    // `||` (not `??`) so a blank form field can never silently
                    // wipe a previously-saved value — location details persist
                    // across orders unless a real value replaces them.
                    stallNumber: input.stallNumber || customer.stallNumber,
                    marketSection: input.marketSection || customer.marketSection,
                    locationDescription: input.locationDescription || customer.locationDescription,
                },
            });
        }

        // Pay Later is a deliberate, upfront credit arrangement — verified accounts
        // only. Enforced once, server-side, at order-creation time. This says nothing
        // about Payment-on-Delivery settlement speed, which is operational lag.
        if (input.paymentMethod === "PAY_LATER" && !customer.verifiedAt) {
            throw new Error("Pay Later requires a verified account (PIN + OTP verification). Please verify your account first.");
        }

        // On-behalf orders must not be attributed to a number whose owner never
        // confirmed it. A valid, recent OTP verification proves the recipient (or
        // the orderer, with the recipient's code) was involved.
        if (input.orderingForOther) {
            const verifiedFresh =
                customer.recipientVerifiedAt &&
                Date.now() - new Date(customer.recipientVerifiedAt).getTime() <= RECIPIENT_VERIFY_FRESH_MS;
            if (!verifiedFresh) {
                throw new Error("The recipient's phone number must be verified before placing this order. Please verify the recipient's number.");
            }
        }

        // On-behalf orders never link the caller's guest identity to the recipient
        // (the customer resolved by phone). The recipient keeps their own account;
        // the caller keeps their own device identity.
        if (input.guestId && !input.orderingForOther) {
            await tx.guestIdentity.upsert({
                where: { id: input.guestId },
                create: { id: input.guestId, customerId: customer.id },
                update: { customerId: customer.id },
            });
        }

        // Decrement stock once per product (deduplicated across groups)
        const updatedProducts: any[] = [];
        const seenProductIds = new Set<string>();
        for (const [, group] of hotelGroups) {
            for (const item of group.orderItemData) {
                if (seenProductIds.has(item.productId)) continue;
                seenProductIds.add(item.productId);
                const reserved = await tx.product.updateMany({
                    where: { id: item.productId, available: true, stockQty: { gte: item.quantity } },
                    data: { stockQty: { decrement: item.quantity } },
                });
                if (reserved.count !== 1) {
                    throw new Error("One or more items became unavailable. Please review your cart and try again.");
                }
                const updated = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
                if (updated.stockQty <= 0) {
                    const markedUnavailable = await tx.product.update({
                        where: { id: item.productId },
                        data: { available: false, stockQty: 0, outOfStockSince: updated.outOfStockSince ?? new Date() },
                    });
                    updatedProducts.push(markedUnavailable);
                } else {
                    updatedProducts.push(updated);
                }
            }
        }

        // Create one Order per hotel group
        const orders: any[] = [];
        const outboxIds: string[] = [];
        for (const [, group] of hotelGroups) {
            // paymentStatus/amountPaid are intentionally left at their DB defaults
            // (UNPAID/0) here. They have no direct writer; they are only ever updated
            // as a side-effect of a SalesRecord write in the same transaction.
            const order = await tx.order.create({
                data: {
                    customerId: customer.id,
                    status: "NEW",
                    totalAmount: group.totalAmount,
                    deliveryFee: group.deliveryFee,
                    deliveryZoneId: input.deliveryZoneId,
                    stallNumber: input.stallNumber,
                    marketSection: input.marketSection,
                    locationDescription: input.locationDescription,
                    knownName: input.knownName,
                    hotelId: group.hotelId,
                    orderItems: {
                        create: group.orderItemData.map((item) => ({
                            productId: item.productId,
                            name: item.name,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            subtotal: item.subtotal,
                        })),
                    },
                },
                include: {
                    customer: true,
                    orderItems: true,
                },
            });

            // Order conversations are NOT created here — most orders never need a
            // thread. The messaging module creates one lazily on the first message
            // from either the customer or the kitchen, so an inbox stays quiet unless
            // someone actually has something to say.

            const itemsSummary = group.orderItemData.map((it) => `${it.quantity}x ${it.name}`).join("\n");
            const outbox = await tx.eventOutbox.create({
                data: {
                    eventName: "order_created",
                    payload: JSON.stringify({
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        customerName: buildCustomerDisplay(customer.firstName, customer.lastName, customer.knownName),
                        firstName: customer.firstName,
                        lastName: customer.lastName,
                        knownName: customer.knownName,
                        customerPhone: formattedPhone,
                        totalAmount: group.totalAmount,
                        deliveryFee: group.deliveryFee,
                        itemsSummary,
                        stallNumber: input.stallNumber,
                        marketSection: input.marketSection,
                        locationDescription: input.locationDescription,
                        hotelId: group.hotelId,
                        hotelName: group.hotelName,
                    }),
                    status: "initialized",
                },
            });

            // Write the ORDER_CHARGE sales record and increment CustomerAccount in the
            // same transaction. The payment is recorded separately, by staff, when it
            // is actually collected — the ledger reflects reality, not the checkout
            // intent. (A cash-on-delivery handover is simply step 2 done immediately.)
            if (group.hotelId) {
                const charge = await applyOrderChargeTx(tx, group.hotelId, customer.id, order.id, group.totalAmount);

                await tx.eventOutbox.create({
                    data: {
                        eventName: "customer_account_credited",
                        hotelId: group.hotelId,
                        payload: JSON.stringify({
                            customerId: customer.id,
                            orderId: order.id,
                            recordId: charge.record.id,
                            amount: group.totalAmount,
                            type: "ORDER_CHARGE",
                            balance: charge.balance,
                            hotelId: group.hotelId,
                        }),
                        status: "initialized",
                    },
                });
            }

            orders.push(order);
            outboxIds.push(outbox.id);
        }

        return { orders, updatedProducts, outboxIds };
    });

    const formattedOrders = result.orders.map(formatOrderResponse);

    // Attach the updated customer profile (incl. recentOrders) so the client can
    // sync its context from the order response without a second /customers/me call.
    const customerProfile = await getCustomerProfile(result.orders[0]!.customerId);
    for (const order of formattedOrders) {
        (order as any).customerProfile = customerProfile;
    }

    // Broadcast menu updates
    for (const prod of result.updatedProducts) {
        wsHub.broadcastMenuUpdate({
            type: "MENU_AVAILABILITY_UPDATED",
            payload: {
                ...prod,
                price: Number(prod.price),
            },
        }, prod.hotelId ?? undefined);
    }

    // Broadcast each order to admins via WebSocket.
    // SMS notification is handled by the outbox dispatcher via handleOrderCreated
    // → orderAlertToHotel, using the centralized template. Do not send SMS here.
    for (let i = 0; i < result.orders.length; i++) {
        const formattedOrder = formattedOrders[i]!;
        const group = Array.from(hotelGroups.values())[i]!;

        wsHub.broadcastToHotelAdmins(group.hotelId, {
            type: "ORDER_CREATED",
            payload: formattedOrder,
        });
    }

    // Return first order for backward compatibility with single-order consumers.
    // Multi-order responses will be surfaced via the checkout concept in a future phase.
    return formattedOrders.length === 1 ? formattedOrders[0]! : formattedOrders;
};

/**
 * Retrieves all orders for a given hotel with optional status filter.
 */
export const getOrders = async (statusFilter?: OrderStatus, hotelId?: string) => {
    const where: any = {};
    if (statusFilter) where.status = statusFilter;
    if (hotelId) where.hotelId = hotelId;

    const orders = await prisma.order.findMany({
        where,
        include: {
            customer: true,
            orderItems: true,
        },
        orderBy: { orderedAt: "desc" },
    });

    return orders.map(formatOrderResponse);
};

/**
 * Retrieves a single order by ID.
 */
export const getOrderById = async (id: string, hotelId?: string) => {
    const order = await prisma.order.findFirst({
        where: { id, ...(hotelId ? { hotelId } : {}) },
        include: {
            customer: true,
            orderItems: true,
            hotel: { select: { id: true, name: true, slug: true } },
        },
    });

    if (!order) {
        throw new Error("Order not found");
    }

    return formatOrderResponse(order);
};

/** Customer/guest tracking must be scoped to the order owner, never only to a UUID. */
export const getOrderForCustomer = async (id: string, customerId: string) => {
    const order = await prisma.order.findFirst({
        where: { id, customerId },
        include: {
            customer: true,
            orderItems: true,
            hotel: { select: { id: true, name: true, slug: true } },
        },
    });
    if (!order) throw new Error("Order not found");
    return formatOrderResponse(order);
};

/**
 * Explicitly enumerated valid order status transitions.
 * WHY: A transition matrix is safer than a rank-based check because it
 * prevents impossible transitions at the design level (e.g. DELIVERED → PREPARING).
 * CANCELLED is a terminal state: no transitions out, reachable from any
 * non-terminal state (NEW, ACCEPTED, PREPARING, READY_FOR_DELIVERY, OUT_FOR_DELIVERY).
 * DELIVERED is also terminal.
 */
const ALLOWED_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
    NEW: ["ACCEPTED", "PREPARING", "CANCELLED"],
    ACCEPTED: ["PREPARING", "READY_FOR_DELIVERY", "CANCELLED"],
    PREPARING: ["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "CANCELLED"],
    READY_FOR_DELIVERY: ["OUT_FOR_DELIVERY", "CANCELLED"],
    OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
    DELIVERED: [],
    CANCELLED: [],
};

/**
 * Restores product stock from a cancelled order.
 * This uses a distinct code path that does NOT touch freshness timestamps
 * (lastRestockedAt / outOfStockSince), since cancellation is not a real restock.
 */
async function restoreStockFromCancellation(tx: any, orderItems: any[]) {
    for (const item of orderItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        const newStockQty = product.stockQty + item.quantity;
        const wasOutOfStock = product.stockQty <= 0;

        await tx.product.update({
            where: { id: item.productId },
            data: {
                stockQty: newStockQty,
                available: wasOutOfStock && newStockQty > 0 ? true : product.available,
                outOfStockSince: wasOutOfStock && newStockQty > 0 ? null : product.outOfStockSince,
            },
        });
    }
}

/**
 * Updates an order status and broadcasts the update via WebSockets to customer and admin.
 * Sends SMS notification to customer when status changes to OUT_FOR_DELIVERY.
 * Enforces an explicit transition matrix: only enumerated (from→to) pairs are allowed.
 * Terminal states (DELIVERED, CANCELLED) cannot transition to any state.
 * On CANCELLED, atomically restores stock quantities via restoreStockFromCancellation.
 */
export const updateOrderStatus = async (id: string, newStatus: OrderStatus, cancelReason?: string, hotelId?: string) => {
    const existing = await prisma.order.findFirst({
        where: { id, ...(hotelId ? { hotelId } : {}) },
        include: { orderItems: true },
    });
    if (!existing) {
        throw new Error("Order not found");
    }
    if (hotelId && existing.hotelId !== hotelId) throw new Error("Order does not belong to your hotel");

    const hotel = hotelId ? await prisma.hotel.findUnique({ where: { id: hotelId } }) : existing.hotelId ? await prisma.hotel.findUnique({ where: { id: existing.hotelId } }) : await getDefaultHotel();
    const hotelName = hotel?.name ?? "Ladha Deliveries";

    const allowed = ALLOWED_TRANSITIONS[existing.status];
    if (!allowed || !allowed.includes(newStatus)) {
        if (existing.status === "DELIVERED" || existing.status === "CANCELLED") {
            throw new Error(`Order is already "${existing.status}" and cannot be changed further.`);
        }
        throw new Error(
            `Cannot move order from "${existing.status}" to "${newStatus}". Allowed: ${(allowed || []).join(", ") || "(none)"}`
        );
    }

    // Utensil confirmations must never gate order completion: utensils are
    // returned *after* delivery, so a DELIVERED-side check would deadlock every
    // order that went out on reusable plates. The return is tracked via the
    // Pending Collection worklist instead. The one guard that belongs here is
    // that the dispatch-time question was actually answered (defense-in-depth
    // for direct API calls — the frontend dispatch modal already records this
    // before transitioning, so this only fires when the API is called directly).
    if (newStatus === "OUT_FOR_DELIVERY" && existing.utensilsRequired === null) {
        throw new Error("Confirm whether utensils are being sent before dispatching this order.");
    }

    const updated = await prisma.$transaction(async (tx) => {
        const updateData: any = {
            status: newStatus,
            completedAt: newStatus === "DELIVERED" ? new Date() : existing.completedAt,
            cancelReason: newStatus === "CANCELLED" ? (cancelReason || "Staff unavailable to deliver at this time") : existing.cancelReason,
        };

        if (newStatus === "CANCELLED") {
            updateData.cancelledAtStatus = existing.status;
        }

        // Claim the transition atomically. This prevents two concurrent cancellation
        // requests from both restoring the same stock.
        const transition = await tx.order.updateMany({
            where: { id, status: existing.status },
            data: updateData,
        });
        if (transition.count !== 1) throw new Error("Order was updated by another request. Please refresh and try again.");

        if (newStatus === "CANCELLED") {
            await restoreStockFromCancellation(tx, existing.orderItems);
            // Reverse the residual outstanding charge on the ledger (ADJUSTMENT
            // row + outbox event) so a cancelled order never leaves a phantom
            // balance. Unpaid and partially-paid cancellations are fully reversed
            // here; the refund path later reverses the paid portion.
            await recordCancellationChargeTx(tx, existing.hotelId, existing.customerId, existing.id, "Order cancelled");
        }

        const updatedOrder = await tx.order.findUniqueOrThrow({
            where: { id },
            include: { customer: true, orderItems: true },
        });

        const outbox = await tx.eventOutbox.create({
            data: {
                eventName: "order_status_updated",
                hotelId: updatedOrder.hotelId,
                payload: JSON.stringify({
                    orderId: updatedOrder.id,
                    hotelId: updatedOrder.hotelId,
                    customerId: updatedOrder.customerId,
                    orderNumber: updatedOrder.orderNumber,
                    customerName: buildCustomerDisplay(updatedOrder.customer.firstName, updatedOrder.customer.lastName, updatedOrder.customer.knownName),
                    firstName: updatedOrder.customer.firstName,
                    lastName: updatedOrder.customer.lastName,
                    knownName: updatedOrder.knownName,
                    customerPhone: updatedOrder.customer.phone,
                    stallNumber: updatedOrder.stallNumber,
                    totalAmount: Number(updatedOrder.totalAmount),
                    newStatus,
                    hotelName,
                    cancelReason: newStatus === "CANCELLED" ? (cancelReason || "Staff unavailable to deliver at this time") : undefined,
                }),
                status: "initialized",
            },
        });

        return { updatedOrder, outboxId: outbox.id };
    });

    const formattedOrder = formatOrderResponse(updated.updatedOrder);

    if (newStatus === "CANCELLED") {
        for (const item of existing.orderItems) {
            const prod = await prisma.product.findUnique({ where: { id: item.productId } });
            if (prod) {
                wsHub.broadcastMenuUpdate({
                    type: "MENU_AVAILABILITY_UPDATED",
                    payload: { ...prod, price: Number(prod.price) },
                }, prod.hotelId ?? undefined);
            }
        }
    }

    const orderHotelId = existing.hotelId || undefined;
    const customerRecipientIdentityKeys = await getOrderOwnerIdentityKeys(existing.customerId);

    wsHub.notifyOrderStatusUpdate(id, {
        type: "ORDER_STATUS_UPDATED",
        payload: formattedOrder,
    }, orderHotelId, customerRecipientIdentityKeys);

    if (newStatus === "OUT_FOR_DELIVERY") {
        const dispatchNotification = {
            type: "NOTIFICATION" as const,
            payload: {
                category: "dispatch",
                title: "🚀 Order Dispatched",
                message: `Order #${formattedOrder.orderNumber} is out for delivery!`,
                orderId: id,
            },
        };
        wsHub.broadcastToHotelAdmins(orderHotelId, dispatchNotification);
        wsHub.broadcastToIdentities(customerRecipientIdentityKeys, dispatchNotification);
    }

    if (newStatus === "CANCELLED") {
        const cancelNotification = {
            type: "NOTIFICATION" as const,
            payload: {
                category: "cancellation",
                title: "⚠️ Order Cancelled",
                message: `Order #${formattedOrder.orderNumber} has been cancelled. Reason: ${cancelReason || "N/A"}`,
                orderId: id,
            },
        };
        wsHub.broadcastToHotelAdmins(orderHotelId, cancelNotification);
        wsHub.broadcastToIdentities(customerRecipientIdentityKeys, cancelNotification);
    }

    // WS: dispatch and cancellation in-app notifications are sent above.
    // SMS for all statuses (OUT_FOR_DELIVERY, CANCELLED, etc.) is handled by
    // the outbox dispatcher via handleOrderStatusUpdated → templates.ts.

    return formattedOrder;
};

/**
 * Cancels an order by the customer themselves.
 * Validates the order belongs to the customer before cancelling.
 */
export const cancelOrderByCustomer = async (id: string, customerId: string, reason?: string) => {
    const order = await prisma.order.findUnique({
        where: { id },
        include: { orderItems: true },
    });
    if (!order) {
        throw new Error("Order not found");
    }
    if (order.customerId !== customerId) {
        throw new Error("This order does not belong to you");
    }
    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
        throw new Error(`Order is already "${order.status}" and cannot be cancelled`);
    }
    if (order.status === "OUT_FOR_DELIVERY") {
        throw new Error("Order is already out for delivery and cannot be cancelled. Please contact the hotel directly.");
    }

    const cancelReason = reason ? `Cancelled by customer: ${reason}` : "Cancelled by customer";
    return updateOrderStatus(id, "CANCELLED", cancelReason, order.hotelId || undefined);
};

/**
 * Updates payment status and amount paid for an order.
 * Delegates to the finance module's SalesRecord-backed functions.
 * Broadcasts ORDER_PAYMENT_UPDATED via WS.
 */
/**
 * Retrieves orders for a specific date with payment info surfaced.
 */
export const getDailyOrders = async (dateStr: string, hotelId?: string) => {
    const startDate = new Date(dateStr + "T00:00:00.000Z");
    const endDate = new Date(dateStr + "T23:59:59.999Z");

    const where: any = {
        orderedAt: {
            gte: startDate,
            lte: endDate,
        },
    };
    if (hotelId) where.hotelId = hotelId;

    const orders = await prisma.order.findMany({
        where,
        include: {
            customer: true,
            orderItems: true,
        },
        orderBy: { orderedAt: "desc" },
    });

    return orders.map(formatOrderResponse);
};

/**
 * Marks an order's reusable utensils as issued at dispatch (staff-only).
 * Not every order goes out on reusable plates — this only records when staff
 * actually handed any out. Independent of payment status.
 */
export const markUtensilsIssued = async (id: string, hotelId: string, issued: boolean) => {
    const order = await prisma.order.findFirst({ where: { id, hotelId } });
    if (!order) throw new Error("Order not found");
    return formatOrderResponse(await prisma.order.update({
        where: { id },
        data: { utensilsIssued: issued, utensilsRequired: issued ? true : false },
        include: { customer: true, orderItems: true },
    }));
};

/**
 * Records that a deliverer confirmed utensil collection — independent of, and at
 * a possibly completely different time from, whoever records the payment.
 */
export const markUtensilsReturned = async (id: string, hotelId: string, adminUserId: string) => {
    const order = await prisma.order.findFirst({ where: { id, hotelId } });
    if (!order) throw new Error("Order not found");
    return formatOrderResponse(await prisma.order.update({
        where: { id },
        data: { utensilsReturnedAt: new Date(), utensilsReturnedByAdminUserId: adminUserId },
        include: { customer: true, orderItems: true },
    }));
};

/**
 * The Pending Collection worklist: every DELIVERED order that still owes payment
 * OR still has issued-but-unreturned utensils. The two conditions resolve
 * independently — a row tells staff which of the two is still outstanding.
 */
export const getPendingCollection = async (hotelId: string) => {
    const orders = await prisma.order.findMany({
        where: {
            hotelId,
            status: "DELIVERED",
            OR: [
                { paymentStatus: { not: "PAID" } },
                { utensilsIssued: true, utensilsReturnedAt: null },
            ],
        },
        include: { customer: true, orderItems: true },
        orderBy: { orderedAt: "desc" },
    });

    return orders.map((order) => {
        const amountPaid = Number(order.amountPaid);
        const totalAmount = Number(order.totalAmount);
        const paymentOutstanding = order.paymentStatus !== "PAID";
        const utensilsOutstanding = order.utensilsIssued === true && order.utensilsReturnedAt === null;
        return {
            id: order.id,
            orderNumber: order.orderNumber,
            totalAmount,
            amountPaid,
            paymentStatus: order.paymentStatus,
            paymentOutstanding,
            utensilsOutstanding,
            outstandingAmount: Math.max(0, totalAmount - amountPaid),
            utensilsIssued: order.utensilsIssued,
            utensilsRequired: order.utensilsRequired,
            utensilsReturnedAt: order.utensilsReturnedAt,
            customer: order.customer
                ? {
                    id: order.customer.id,
                    accountId: order.customer.accountId,
                    firstName: order.customer.firstName,
                    lastName: order.customer.lastName,
                    knownName: order.customer.knownName,
                    phone: order.customer.phone,
                }
                : null,
            orderedAt: order.orderedAt,
            marketSection: order.marketSection,
            locationDescription: order.locationDescription,
            stallNumber: order.stallNumber,
        };
    });
};

/**
 * The Refunds Owed worklist: every CANCELLED order that was paid but has not
 * been fully refunded. A cancellation writes no REFUND row automatically
 * (partial/paid cancellations are refunded by staff), so without this list
 * money the business owes is invisible — the ledger would just sit with a
 * net-zero CustomerAccount and nobody would notice. refundOwed is computed from
 * the ledger (paid minus refunded) so it always matches what the balance says.
 */
export const getRefundsOwed = async (hotelId: string) => {
    const orders = await prisma.order.findMany({
        where: { hotelId, status: "CANCELLED" },
        include: {
            customer: true,
            orderItems: true,
            salesRecords: { select: { type: true, amount: true } },
        },
        orderBy: { orderedAt: "desc" },
    });

    return orders
        .map((order) => {
            const paid = order.salesRecords
                .filter((r) => r.type === "ORDER_PAYMENT")
                .reduce((sum, r) => sum + Number(r.amount), 0);
            const refunded = order.salesRecords
                .filter((r) => r.type === "REFUND")
                .reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);
            return { order, paid, refunded, refundOwed: Math.max(0, paid - refunded) };
        })
        .filter(({ refundOwed }) => refundOwed > 0)
        .map(({ order, paid, refunded, refundOwed }) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            hotelId: order.hotelId,
            totalAmount: Number(order.totalAmount),
            amountPaid: Number(order.amountPaid),
            paymentStatus: order.paymentStatus,
            paid,
            refunded,
            refundOwed,
            cancelledAtStatus: order.cancelledAtStatus,
            cancelReason: order.cancelReason,
            refundedAt: order.refundedAt ? order.refundedAt.toISOString() : null,
            utensilsIssued: order.utensilsIssued,
            utensilsRequired: order.utensilsRequired,
            utensilsReturnedAt: order.utensilsReturnedAt,
            customer: order.customer
                ? {
                    id: order.customer.id,
                    accountId: order.customer.accountId,
                    firstName: order.customer.firstName,
                    lastName: order.customer.lastName,
                    knownName: order.customer.knownName,
                    phone: order.customer.phone,
                }
                : null,
            orderItems: order.orderItems?.map((item: any) => ({
                ...item,
                unitPrice: Number(item.unitPrice),
                subtotal: Number(item.subtotal),
            })),
            orderedAt: order.orderedAt,
            marketSection: order.marketSection,
            locationDescription: order.locationDescription,
            stallNumber: order.stallNumber,
        }));
};

/**
 * Aggregates analytical metrics for the admin dashboard.
 * Revenue excludes cancelled orders and nets out refunded amounts; pending uses
 * an explicit allow-list.
 */
export interface DashboardMetricsRange {
    startDate?: string;
    endDate?: string;
}

function parseDashboardDate(value: string, endOfDay = false): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Dates must use YYYY-MM-DD format");
    const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+03:00`);
    if (Number.isNaN(date.getTime())) throw new Error("Invalid dashboard date");
    return date;
}

export const getDashboardMetrics = async (hotelId?: string, range: DashboardMetricsRange = {}): Promise<DashboardMetrics> => {
    const start = range.startDate ? parseDashboardDate(range.startDate) : undefined;
    const end = range.endDate ? parseDashboardDate(range.endDate, true) : undefined;
    if (start && end && start > end) throw new Error("Start date must be on or before end date");
    const where: any = {
        ...(hotelId ? { hotelId } : {}),
        ...((start || end) ? { orderedAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
    };
    const allOrders = await prisma.order.findMany({
        where,
        include: {
            orderItems: true,
        },
    });

    const orderIds = allOrders.map((order) => order.id);
    const refundGroups = orderIds.length
        ? await prisma.salesRecord.groupBy({
              by: ["orderId"],
              where: { orderId: { in: orderIds }, type: "REFUND" },
              _sum: { amount: true },
          })
        : [];
    const refundByOrder = new Map(refundGroups.map((g) => [g.orderId, Math.abs(Number(g._sum.amount))]));

    const ordersWithRefunds = allOrders.map((order) => ({
        ...order,
        refundedAmount: refundByOrder.get(order.id) ?? 0,
    }));

    return calculateDashboardMetrics(ordersWithRefunds);
};

/**
 * Counts orders currently in a pending (in-progress) state for a hotel.
 * Used by the admin nav/orders surfaces to show a live badge.
 */
export const getPendingOrdersCount = async (hotelId?: string): Promise<number> => {
    const where: any = { status: { in: PENDING_STATUSES } };
    if (hotelId) where.hotelId = hotelId;
    return prisma.order.count({ where });
};

function formatOrderResponse(order: any) {
    return {
        ...order,
        totalAmount: Number(order.totalAmount),
        deliveryFee: Number(order.deliveryFee ?? 0),
        amountPaid: Number(order.amountPaid),
        refundedAt: order.refundedAt ? order.refundedAt.toISOString() : null,
        orderItems: order.orderItems?.map((item: any) => ({
            ...item,
            unitPrice: Number(item.unitPrice),
            subtotal: Number(item.subtotal),
        })),
    };
}
