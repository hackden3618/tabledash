/**
 * Purpose: Order Processing & Status Lifecycle Service for tableDash.
 * Responsibilities: Handles transactional order placement, status state transitions, metric aggregation for admin dashboard, SMS dispatching, and real-time WebSocket broadcasting.
 * Dependencies: Prisma database client, SMS notification service, WebSocket Hub.
 * When to modify: When adding order workflow steps, altering dashboard calculation metrics, or customizing SMS alert messages.
 */

import { prisma } from "../../../../../infrastructure/database/prisma";
import type { DashboardMetrics, OrderStatus, PaymentStatus } from "../../../../../shared/types";
import type { ParticipantKind } from "../../../../../generated/prisma/client";
import { smsService } from "../notifications/sms.service";
import { getDefaultHotel } from "../hotels/service";
import { getSmsRecipients } from "../settings/service";
import { wsHub } from "../websocket/hub";
import { formatPhone } from "../../../../../shared/phone";
import { calculateDashboardMetrics, normalizeOrderItems } from "./logic";

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
}

interface OrderItemDraft {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

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
  const hotelGroups = new Map<string, { hotelId: string; hotelName: string; items: typeof input.items; orderItemData: OrderItemDraft[]; totalAmount: number }>();
  for (const [productId, quantity] of normalizedItems) {
    const product = productMap.get(productId)!;
    const hId = product.hotelId || "default";
    if (!hotelGroups.has(hId)) {
      hotelGroups.set(hId, { hotelId: hId, hotelName: product.hotel?.name || "Ladha Deliveries", items: [], orderItemData: [], totalAmount: 0 });
    }
    const group = hotelGroups.get(hId)!;
    group.items.push({ productId, quantity });
    const unitPrice = Number(product.price);
    const subtotal = unitPrice * quantity;
    group.totalAmount += subtotal;
    group.orderItemData.push({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice,
      subtotal,
    });
  }

  const formattedPhone = formatPhone(input.phone);

  // Execute database transaction — one Order per hotel group
  const result = await prisma.$transaction(async (tx) => {
    let customer = await tx.customer.findFirst({
      where: { phone: formattedPhone },
    });

    if (!customer) {
      customer = await tx.customer.create({
        data: {
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
          stallNumber: input.stallNumber ?? customer.stallNumber,
          marketSection: input.marketSection ?? customer.marketSection,
          locationDescription: input.locationDescription ?? customer.locationDescription,
        },
      });
    }

    if (input.guestId) {
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
      const order = await tx.order.create({
        data: {
          customerId: customer.id,
          status: "NEW",
          totalAmount: group.totalAmount,
          stallNumber: input.stallNumber,
          marketSection: input.marketSection,
          locationDescription: input.locationDescription,
          knownName: input.knownName,
          hotelId: group.hotelId === "default" ? undefined : group.hotelId,
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

      // Create an order conversation so customer and staff can chat
      const hotelStaff = await tx.adminUser.findMany({
        where: { hotelId: group.hotelId === "default" ? undefined : group.hotelId, role: { in: ["HOTEL_ADMIN", "HOTEL_STAFF"] } },
        select: { id: true },
      });
      await tx.conversation.create({
        data: {
          type: "ORDER",
          orderId: order.id,
          hotelId: group.hotelId === "default" ? undefined : group.hotelId,
          participants: {
            create: [
              { kind: "CUSTOMER" as ParticipantKind, customerId: customer.id, canReply: true },
              ...hotelStaff.map((admin) => ({ kind: "HOTEL_STAFF" as ParticipantKind, adminUserId: admin.id, canReply: true })),
            ],
          },
        },
      });

      const itemsSummary = group.orderItemData.map((it) => `${it.quantity}x ${it.name}`).join(", ");
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
            itemsSummary,
            stallNumber: input.stallNumber,
            marketSection: input.marketSection,
            locationDescription: input.locationDescription,
            hotelId: group.hotelId === "default" ? undefined : group.hotelId,
            hotelName: group.hotelName,
          }),
          status: "initialized",
        },
      });

      orders.push(order);
      outboxIds.push(outbox.id);
    }

    return { orders, updatedProducts, outboxIds };
  });

  const formattedOrders = result.orders.map(formatOrderResponse);

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

  // Broadcast each order to admins
  for (let i = 0; i < result.orders.length; i++) {
    const order = result.orders[i]!;
    const formattedOrder = formattedOrders[i]!;
    const group = Array.from(hotelGroups.values())[i]!;

    wsHub.broadcastToHotelAdmins(group.hotelId === "default" ? undefined : group.hotelId, {
      type: "ORDER_CREATED",
      payload: formattedOrder,
    });

    const staffPhones = await getSmsRecipients(group.hotelId);
    if (staffPhones.length > 0) {
      const itemsSummary = formattedOrder.orderItems?.map((it: any) => `${it.quantity}x ${it.name}`).join(", ") || "";
      const stall = input.stallNumber || "N/A";
      const desc = input.locationDescription || "N/A";
      const displayName = buildCustomerDisplay(input.firstName, input.lastName, input.knownName);
      const msg = `[${group.hotelName}] NEW ORDER #${formattedOrder.orderNumber} from ${displayName} (${input.phone}). Total: KSh ${formattedOrder.totalAmount}. Stall: ${stall} — ${desc}. Items: ${itemsSummary}`;

      Promise.all(
        staffPhones.map((phone) =>
          smsService.sendSms(phone, msg).catch(() => false)
        )
      ).then((results) => {
        const allSent = results.every((r) => r !== false);
        if (allSent && result.outboxIds[i]) {
          prisma.eventOutbox.update({
            where: { id: result.outboxIds[i]! },
            data: { status: "done", completedAt: new Date() },
          }).catch(() => {});
        }
      }).catch(() => {});
    } else if (result.outboxIds[i]) {
      prisma.eventOutbox.update({
        where: { id: result.outboxIds[i]! },
        data: { status: "done", completedAt: new Date() },
      }).catch(() => {});
    }
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
    include: { customer: true, orderItems: true },
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
  NEW:                ["ACCEPTED", "PREPARING", "CANCELLED"],
  ACCEPTED:           ["PREPARING", "READY_FOR_DELIVERY", "CANCELLED"],
  PREPARING:          ["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "CANCELLED"],
  READY_FOR_DELIVERY: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY:   ["DELIVERED", "CANCELLED"],
  DELIVERED:          [],
  CANCELLED:          [],
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

    if (newStatus === "CANCELLED") await restoreStockFromCancellation(tx, existing.orderItems);

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

  if (newStatus === "OUT_FOR_DELIVERY" && formattedOrder.customer?.phone) {
    const stallInfo = formattedOrder.stallNumber ? ` at Stall ${formattedOrder.stallNumber}` : " at your stall";
    const displayName = buildCustomerDisplay(formattedOrder.customer.firstName, formattedOrder.customer.lastName, formattedOrder.knownName);
    const customerSmsMessage = `Hello ${displayName}, your order #${formattedOrder.orderNumber} from ${hotelName} is OUT FOR DELIVERY! Be ready to receive your delivery${stallInfo}. Our rider is on the way. Total: KSh ${formattedOrder.totalAmount}.`;
    (async () => {
      try {
        await smsService.sendSms(formattedOrder.customer.phone, customerSmsMessage);
        if (updated.outboxId) {
          await prisma.eventOutbox.update({
            where: { id: updated.outboxId },
            data: { status: "done", completedAt: new Date() },
          });
        }
      } catch (err) {
        console.error("[Customer Out-For-Delivery SMS Error]:", err);
      }
    })();
  }

  if (newStatus === "CANCELLED") {
    const isCustomerCancel = (cancelReason || "").toLowerCase().includes("customer");

    // Customer SMS: apology if staff-cancelled, confirmation if self-cancelled
    if (formattedOrder.customer?.phone) {
      const displayName = buildCustomerDisplay(formattedOrder.customer.firstName, formattedOrder.customer.lastName, formattedOrder.knownName);
      const msg = isCustomerCancel
        ? `Hello ${displayName}, order #${formattedOrder.orderNumber} from ${hotelName} has been CANCELLED as you requested. Track your orders: https://tabledash.up.railway.app`
        : `Hello ${displayName}, we are sorry to inform you that order #${formattedOrder.orderNumber} from ${hotelName} has been cancelled. Reason: ${cancelReason || "Staff unavailable"}. We appreciate your understanding. Track your orders: https://tabledash.up.railway.app`;
      (async () => {
        try {
          await smsService.sendSms(formattedOrder.customer.phone, msg);
        } catch (err) {
          console.error("[Customer Cancel SMS Error]:", err);
        }
      })();
    }

    // Staff abort SMS — notify staff to abort delivery
    const staffPhones = await getSmsRecipients(existing.hotelId || undefined).catch(() => []);
    if (staffPhones.length > 0) {
      const stallTag = formattedOrder.stallNumber ? ` (Stall ${formattedOrder.stallNumber})` : "";
      const staffAbortMessage = `[${hotelName}] ABORT: Order #${formattedOrder.orderNumber}${stallTag} has been CANCELLED. Reason: ${cancelReason || "Staff unavailable"}. No delivery needed.`;
      Promise.all(
        staffPhones.map((phone) =>
          smsService.sendSms(phone, staffAbortMessage).catch(() => false)
        )
      ).catch(() => {});
    }

    // Mark outbox as done to prevent duplicate SMS from the outbox handler
    if (updated.outboxId) {
      prisma.eventOutbox.update({
        where: { id: updated.outboxId },
        data: { status: "done", completedAt: new Date() },
      }).catch(() => {});
    }
  }

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
 * Guards:
 *  - REFUNDED orders cannot be changed further (terminal payment state).
 *  - CANCELLED orders: only REFUNDED or UNPAID is allowed (refund processed or write-off).
 *  - Non-cancelled orders: standard UNPAID → PARTIAL → PAID flow.
 * When marked PAID, auto-sets amountPaid = totalAmount.
 * When marked UNPAID, sets amountPaid = 0.
 * Broadcasts ORDER_PAYMENT_UPDATED via WS and writes outbox event.
 */
export const updateOrderPayment = async (id: string, data: { paymentStatus?: PaymentStatus; amountPaid?: number }, hotelId?: string) => {
  const existing = await prisma.order.findFirst({
    where: { id, ...(hotelId ? { hotelId } : {}) },
    include: { customer: true, orderItems: true },
  });
  if (!existing) {
    throw new Error("Order not found");
  }
  if (hotelId && existing.hotelId !== hotelId) throw new Error("Order does not belong to your hotel");

  if (existing.paymentStatus === "REFUNDED") {
    throw new Error("Payment is already marked as REFUNDED and cannot be changed.");
  }

  const total = Number(existing.totalAmount);
  let paymentStatus = data.paymentStatus ?? existing.paymentStatus;
  let amountPaid = data.amountPaid ?? Number(existing.amountPaid);
  let refundedAt: Date | null = null;

  // CANCELLED order payment constraints
  if (existing.status === "CANCELLED") {
    if (data.paymentStatus === "REFUNDED") {
      if (Number(existing.amountPaid) <= 0) {
        throw new Error("Cannot mark as REFUNDED — no payment was collected on this order.");
      }
      amountPaid = 0;
      refundedAt = new Date();
    } else if (data.paymentStatus === "PAID" || data.paymentStatus === "PARTIAL") {
      throw new Error("Cannot collect payment on a cancelled order. Process a refund instead.");
    } else if (data.paymentStatus === "UNPAID" || !data.paymentStatus) {
      paymentStatus = "UNPAID";
      amountPaid = 0;
    }
  } else {
    if (data.paymentStatus === "REFUNDED") {
      throw new Error("Cannot mark a non-cancelled order as REFUNDED. You must cancel the order first.");
    }
    if (data.paymentStatus === "PAID") {
      amountPaid = total;
    } else if (data.paymentStatus === "UNPAID") {
      amountPaid = 0;
    }
  }

  const hotel = existing.hotelId ? await prisma.hotel.findUnique({ where: { id: existing.hotelId } }) : await getDefaultHotel();
  const hotelName = hotel?.name ?? "Ladha Deliveries";

  const updated = await prisma.$transaction(async (tx) => {
    const updatedOrder = await tx.order.update({
      where: { id },
      data: { paymentStatus, amountPaid, ...(refundedAt ? { refundedAt } : {}) },
      include: { customer: true, orderItems: true },
    });
    await tx.eventOutbox.create({
      data: {
        eventName: "order_payment_updated",
        hotelId: updatedOrder.hotelId,
        payload: JSON.stringify({
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          customerName: buildCustomerDisplay(updatedOrder.customer.firstName, updatedOrder.customer.lastName, updatedOrder.customer.knownName),
          firstName: updatedOrder.customer.firstName,
          lastName: updatedOrder.customer.lastName,
          customerPhone: updatedOrder.customer.phone,
          paymentStatus,
          amountPaid,
          totalAmount: total,
          hotelName,
        }),
        status: "initialized",
      },
    });
    return updatedOrder;
  });

  const formatted = formatOrderResponse(updated);

  wsHub.broadcastToHotelAdmins(existing.hotelId || undefined, {
    type: "ORDER_PAYMENT_UPDATED",
    payload: {
      ...formatted,
      paymentStatus,
      amountPaid,
    },
  });
  wsHub.broadcastToIdentities(await getOrderOwnerIdentityKeys(existing.customerId), {
    type: "ORDER_PAYMENT_UPDATED",
    payload: {
      ...formatted,
      paymentStatus,
      amountPaid,
    },
  });

  return formatted;
};

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
 * Aggregates analytical metrics for the admin dashboard.
 * Revenue excludes cancelled orders; pending uses an explicit allow-list.
 */
export const getDashboardMetrics = async (hotelId?: string): Promise<DashboardMetrics> => {
  const where = hotelId ? { hotelId } : {};
  const allOrders = await prisma.order.findMany({
    where,
    include: {
      orderItems: true,
    },
  });

  return calculateDashboardMetrics(allOrders);
};

function formatOrderResponse(order: any) {
  return {
    ...order,
    totalAmount: Number(order.totalAmount),
    amountPaid: Number(order.amountPaid),
    refundedAt: order.refundedAt ? order.refundedAt.toISOString() : null,
    orderItems: order.orderItems?.map((item: any) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
    })),
  };
}
