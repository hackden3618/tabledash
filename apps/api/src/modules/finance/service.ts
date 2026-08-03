import { prisma } from "../../../../../infrastructure/database/prisma";
import type { SalesRecordType, PaymentMethod } from "../../../../../generated/prisma/client";
import { wsHub } from "../websocket/hub";

// ── CustomerAccount (incrementally-updated cache, never written independently) ──

async function upsertCustomerAccount(
  hotelId: string,
  customerId: string,
  owedDelta: number,
  paidDelta: number,
) {
  const existing = await prisma.customerAccount.findUnique({
    where: { hotelId_customerId: { hotelId, customerId } },
  });
  if (existing) {
    return prisma.customerAccount.update({
      where: { hotelId_customerId: { hotelId, customerId } },
      data: {
        totalOwed: { increment: owedDelta },
        totalPaid: { increment: paidDelta },
      },
    });
  }
  return prisma.customerAccount.create({
    data: {
      hotelId,
      customerId,
      totalOwed: Math.max(0, owedDelta),
      totalPaid: Math.max(0, paidDelta),
    },
  });
}

function computePaymentStatus(totalAmount: number, amountPaid: number): "UNPAID" | "PARTIAL" | "PAID" {
  if (amountPaid <= 0) return "UNPAID";
  if (amountPaid >= totalAmount) return "PAID";
  return "PARTIAL";
}

/**
 * Recomputes Order.paymentStatus / amountPaid from the sum of that order's
 * SalesRecords — the only writer of the read-through payment cache. Runs inside
 * the caller's transaction so cache + ledger stay atomic.
 */
async function recomputeOrderCacheTx(tx: any, orderId: string) {
  const records: { type: string; amount: unknown }[] = await tx.salesRecord.findMany({ where: { orderId } });
  const paid = records
    .filter((r) => r.type === "ORDER_PAYMENT")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const refunded = records
    .filter((r) => r.type === "REFUND")
    .reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);
  const amountPaid = Math.max(0, paid - refunded);
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const paymentStatus = computePaymentStatus(Number(order.totalAmount), amountPaid);
  return tx.order.update({
    where: { id: orderId },
    data: { amountPaid, paymentStatus },
    include: { customer: true, orderItems: true },
  });
}

/** Clamps a CustomerAccount update so neither totalOwed nor totalPaid goes negative. */
async function adjustAccountTx(tx: any, hotelId: string, customerId: string, owedDelta: number, paidDelta: number) {
  const account = await tx.customerAccount.findUnique({
    where: { hotelId_customerId: { hotelId, customerId } },
  });
  if (!account) {
    return tx.customerAccount.create({
      data: { hotelId, customerId, totalOwed: Math.max(0, owedDelta), totalPaid: Math.max(0, paidDelta) },
    });
  }
  const nextOwed = Math.max(0, Number(account.totalOwed) + owedDelta);
  const nextPaid = Math.max(0, Number(account.totalPaid) + paidDelta);
  return tx.customerAccount.update({
    where: { hotelId_customerId: { hotelId, customerId } },
    data: { totalOwed: nextOwed, totalPaid: nextPaid },
  });
}

function accountBalance(account: { totalOwed: unknown; totalPaid: unknown }): number {
  return Number(account.totalOwed) - Number(account.totalPaid);
}

// ── Recording operations ──

/**
 * Writes the single ORDER_CHARGE at order creation, inside the caller's
 * transaction. Upserts the CustomerAccount and returns the new balance so the
 * caller can include it in the outbox payload.
 */
export async function applyOrderChargeTx(
  tx: any,
  hotelId: string,
  customerId: string,
  orderId: string,
  totalAmount: number,
) {
  const record = await tx.salesRecord.create({
    data: {
      hotelId,
      orderId,
      type: "ORDER_CHARGE",
      paymentMethod: "CREDIT",
      amount: totalAmount,
    },
  });

  const account = await tx.customerAccount.upsert({
    where: { hotelId_customerId: { hotelId, customerId } },
    create: { hotelId, customerId, totalOwed: totalAmount, totalPaid: 0 },
    update: { totalOwed: { increment: totalAmount } },
  });

  return { record, balance: accountBalance(account) };
}

export async function recordOrderCharge(
  hotelId: string,
  customerId: string,
  orderId: string,
  totalAmount: number,
) {
  const [record, account] = await prisma.$transaction(async (tx: any) => {
    const { record, balance } = await applyOrderChargeTx(tx, hotelId, customerId, orderId, totalAmount);

    await tx.eventOutbox.create({
      data: {
        eventName: "customer_account_credited",
        hotelId,
        payload: JSON.stringify({
          customerId,
          orderId,
          recordId: record.id,
          amount: totalAmount,
          type: "ORDER_CHARGE",
          balance,
          hotelId,
        }),
        status: "initialized",
      },
    });

    return [record, balance];
  });

  return { record, account };
}

/**
 * Reverses an unpaid order's charge on cancellation — writes a negative
 * ADJUSTMENT row (so the ledger fully explains the order) and decrements owed.
 * Never touches the ledger when anything has been paid; those cancellations are
 * refunded manually by staff.
 */
export async function reverseUnpaidChargeTx(
  tx: any,
  hotelId: string,
  customerId: string,
  orderId: string,
  reason: string,
) {
  const records: { type: string; amount: unknown }[] = await tx.salesRecord.findMany({ where: { orderId } });
  const paid = records
    .filter((r) => r.type === "ORDER_PAYMENT")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const refunded = records
    .filter((r) => r.type === "REFUND")
    .reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);
  const outstanding = Number(records.find((r) => r.type === "ORDER_CHARGE")?.amount ?? 0) - (paid - refunded);
  if (outstanding <= 0) return null;

  const record = await tx.salesRecord.create({
    data: {
      hotelId,
      orderId,
      type: "ADJUSTMENT",
      paymentMethod: "CREDIT",
      amount: -outstanding,
      note: reason,
    },
  });

  const account = await adjustAccountTx(tx, hotelId, customerId, -outstanding, 0);

  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  await tx.eventOutbox.create({
    data: {
      eventName: "customer_account_adjusted",
      hotelId,
      payload: JSON.stringify({
        customerId,
        orderId,
        orderNumber: order.orderNumber,
        recordId: record.id,
        amount: -outstanding,
        type: "ADJUSTMENT",
        balance: accountBalance(account),
        hotelId,
        reason,
      }),
      status: "initialized",
    },
  });

  return { record, balance: accountBalance(account) };
}

export async function recordPayment(
  hotelId: string,
  customerId: string,
  orderId: string,
  paymentMethod: "CASH" | "MPESA",
  amount: number,
  adminUserId?: string,
  note?: string,
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  if (order.hotelId !== hotelId) throw new Error("Order not found in this hotel");

  const result = await prisma.$transaction(async (tx: any) => {
    const paymentRecord = await tx.salesRecord.create({
      data: {
        hotelId,
        orderId,
        type: "ORDER_PAYMENT",
        paymentMethod,
        amount,
        note,
        createdByAdminUserId: adminUserId,
      },
    });

    const updatedAccount = await adjustAccountTx(tx, hotelId, customerId, 0, amount);
    const updatedOrder = await recomputeOrderCacheTx(tx, orderId);

    await tx.eventOutbox.create({
      data: {
        eventName: "customer_account_payment_recorded",
        hotelId,
        payload: JSON.stringify({
          customerId,
          orderId,
          orderNumber: updatedOrder.orderNumber,
          recordId: paymentRecord.id,
          amount,
          type: "ORDER_PAYMENT",
          paymentMethod,
          balance: accountBalance(updatedAccount),
          hotelId,
        }),
        status: "initialized",
      },
    });

    return { paymentRecord, account: updatedAccount, order: updatedOrder };
  });

  broadcastPaymentUpdate(result.order);
  return result;
}

export async function recordRefund(
  hotelId: string,
  customerId: string,
  orderId: string,
  amount: number,
  reason: string,
  adminUserId?: string,
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  if (order.hotelId !== hotelId) throw new Error("Order not found in this hotel");
  if (amount <= 0) throw new Error("Refund amount must be greater than zero");
  if (!reason?.trim()) throw new Error("A reason is required for a refund");

  return prisma.$transaction(async (tx: any) => {
    const refundRecord = await tx.salesRecord.create({
      data: {
        hotelId,
        orderId,
        type: "REFUND",
        paymentMethod: "CASH",
        amount: -amount,
        note: reason,
        createdByAdminUserId: adminUserId,
      },
    });

    // A cancelled order is fully settled by reversing both sides of its
    // financial position: the charge and the payment are both removed from
    // the customer's running account. For a live order, a refund only reverses
    // money actually paid; the charge remains outstanding.
    const account = await tx.customerAccount.findUnique({
      where: { hotelId_customerId: { hotelId, customerId } },
    });
    const currentPaid = Number(account?.totalPaid ?? 0);
    const currentOwed = Number(account?.totalOwed ?? 0);
    const paidDelta = -Math.min(currentPaid, amount);
    const owedDelta = order.status === "CANCELLED"
      ? -Math.min(currentOwed, amount)
      : -Math.max(0, amount - currentPaid);
    const updatedAccount = await adjustAccountTx(tx, hotelId, customerId, owedDelta, paidDelta);

    const updatedOrder = await recomputeOrderCacheTx(tx, orderId);
    await tx.order.update({
      where: { id: orderId },
      data: { refundedAt: new Date() },
    });
    updatedOrder.refundedAt = new Date();

    await tx.eventOutbox.create({
      data: {
        eventName: "customer_account_refund_recorded",
        hotelId,
        payload: JSON.stringify({
          customerId,
          orderId,
          orderNumber: updatedOrder.orderNumber,
          recordId: refundRecord.id,
          amount,
          type: "REFUND",
          balance: accountBalance(updatedAccount),
          hotelId,
          reason,
        }),
        status: "initialized",
      },
    });

    return { refundRecord, account: updatedAccount, order: updatedOrder };
  }).then((result) => {
    broadcastPaymentUpdate(result.order);
    return result;
  });
}

export async function recordAdjustment(
  hotelId: string,
  customerId: string,
  orderId: string,
  amount: number,
  reason: string,
  adminUserId?: string,
) {
  if (amount === 0) throw new Error("Adjustment amount cannot be zero");
  if (!reason?.trim()) throw new Error("A reason is required for an adjustment");

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  if (order.hotelId !== hotelId) throw new Error("Order not found in this hotel");

  return prisma.$transaction(async (tx: any) => {
    const record = await tx.salesRecord.create({
      data: {
        hotelId,
        orderId,
        type: "ADJUSTMENT",
        paymentMethod: "CREDIT",
        amount,
        note: reason,
        createdByAdminUserId: adminUserId,
      },
    });

    // A positive adjustment adds to what is owed; a negative one reduces it.
    const updatedAccount = await adjustAccountTx(tx, hotelId, customerId, amount, 0);
    const updatedOrder = await recomputeOrderCacheTx(tx, orderId);

    await tx.eventOutbox.create({
      data: {
        eventName: "customer_account_adjusted",
        hotelId,
        payload: JSON.stringify({
          customerId,
          orderId,
          orderNumber: updatedOrder.orderNumber,
          recordId: record.id,
          amount,
          type: "ADJUSTMENT",
          balance: accountBalance(updatedAccount),
          hotelId,
          reason,
        }),
        status: "initialized",
      },
    });

    return { record, account: updatedAccount, order: updatedOrder };
  }).then((result) => {
    broadcastPaymentUpdate(result.order);
    return result;
  });
}

// ── Live-refresh WS broadcasts (convenience only — DB is the source of truth) ──

function broadcastPaymentUpdate(order: any) {
  if (!order) return;
  wsHub.broadcastToHotelAdmins(order.hotelId ?? undefined, {
    type: "ORDER_PAYMENT_UPDATED",
    payload: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
      amountPaid: Number(order.amountPaid),
      totalAmount: Number(order.totalAmount),
    },
  });
}

// ── Queries ──

export async function getFinanceDashboard(hotelId: string) {
  const records = await prisma.salesRecord.findMany({
    where: { hotelId },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const todayStr = new Date().toISOString().split("T")[0]!;
  const todayRecords = records.filter((r) => r.createdAt.toISOString().startsWith(todayStr));

  const todayRevenue = todayRecords
    .filter((r) => r.type === "ORDER_PAYMENT")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const cashRevenue = todayRecords
    .filter((r) => r.type === "ORDER_PAYMENT" && r.paymentMethod === "CASH")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const mpesaRevenue = todayRecords
    .filter((r) => r.type === "ORDER_PAYMENT" && r.paymentMethod === "MPESA")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const creditRevenue = todayRecords
    .filter((r) => r.type === "ORDER_CHARGE")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const refundsAmount = todayRecords
    .filter((r) => r.type === "REFUND")
    .reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);
  const refundsProcessed = todayRecords
    .filter((r) => r.type === "REFUND")
    .length;

  const orders = await prisma.order.findMany({
    where: { hotelId },
    select: { status: true, totalAmount: true, orderedAt: true },
  });

  const cancelledCount = orders.filter((o) => o.status === "CANCELLED").length;
  const dailyCashPosition = cashRevenue - refundsAmount;

  const accounts = await prisma.customerAccount.findMany({
    where: { hotelId },
    orderBy: { lastUpdated: "desc" },
    include: { customer: { select: { id: true, firstName: true, knownName: true } } },
  });

  const outstandingBalance = accounts.reduce((sum, a) => sum + Math.max(0, Number(a.totalOwed) - Number(a.totalPaid)), 0);

  const topCustomers = accounts
    .map((a) => ({
      id: a.customerId,
      name: a.customer?.knownName || a.customer?.firstName || "Unknown",
      totalSpent: Number(a.totalPaid),
      totalOwed: Number(a.totalOwed),
      outstandingBalance: Math.max(0, Number(a.totalOwed) - Number(a.totalPaid)),
      orderCount: orders.filter((o) => o.status !== "CANCELLED").length,
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 10);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weeklySummary: { date: string; revenue: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dayStr = d.toISOString().split("T")[0]!;
    const dayPayments = records
      .filter((r) => r.createdAt.toISOString().startsWith(dayStr) && r.type === "ORDER_PAYMENT")
      .reduce((sum, r) => sum + Number(r.amount), 0);
    weeklySummary.push({ date: dayStr, revenue: dayPayments });
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthlySummary: { week: string; revenue: number }[] = [];
  for (let w = 0; w < 4; w++) {
    const weekLabel = `Week ${w + 1}`;
    const weekStartD = new Date(monthStart);
    weekStartD.setDate(weekStartD.getDate() + w * 7);
    const weekEnd = new Date(weekStartD);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekPayments = records
      .filter((r) => {
        const d = r.createdAt;
        return d >= weekStartD && d <= weekEnd && r.type === "ORDER_PAYMENT";
      })
      .reduce((sum, r) => sum + Number(r.amount), 0);
    monthlySummary.push({ week: weekLabel, revenue: weekPayments });
  }

  return {
    todayRevenue,
    cashRevenue,
    mpesaRevenue,
    creditRevenue,
    dailyCashPosition,
    outstandingBalance: Math.max(0, outstandingBalance),
    refundsAmount,
    refundsProcessed,
    cancelledCount,
    topCustomers,
    totalAccounts: accounts.length,
    totalRecords: records.length,
    weeklySummary,
    monthlySummary,
  };
}

export async function getCustomerAccount(customerId: string, hotelId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, accountId: true, firstName: true, lastName: true, phone: true, knownName: true, createdAt: true },
  });
  if (!customer) throw new Error("Customer not found");

  const account = await prisma.customerAccount.findUnique({
    where: { hotelId_customerId: { hotelId, customerId } },
  });

  const orders = await prisma.order.findMany({
    where: { customerId, hotelId },
    include: { orderItems: true },
    orderBy: { orderedAt: "desc" },
  });

  const records = await prisma.salesRecord.findMany({
    where: { hotelId, orderId: { in: orders.map((o) => o.id) } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return {
    customer,
    account: account || { totalOwed: 0, totalPaid: 0, balance: 0 },
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      totalAmount: Number(o.totalAmount),
      amountPaid: Number(o.amountPaid),
      paymentStatus: o.paymentStatus,
      orderedAt: o.orderedAt,
    })),
    salesRecords: records.map((r) => ({
      id: r.id,
      type: r.type,
      paymentMethod: r.paymentMethod,
      amount: Number(r.amount),
      note: r.note,
      createdAt: r.createdAt,
    })),
  };
}

export async function getOrderPaymentHistory(orderId: string) {
  return prisma.salesRecord.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSalesRecords(hotelId: string, orderIds?: string[], limit = 100) {
  const where: any = { hotelId };
  if (orderIds?.length) where.orderId = { in: orderIds };
  return prisma.salesRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// ── Wallet (customer-side aggregation across hotels) ──

export async function getWallet(customerId: string) {
  const accounts = await prisma.customerAccount.findMany({
    where: { customerId },
    orderBy: { lastUpdated: "desc" },
    include: {
      hotel: { select: { id: true, name: true } },
    },
  });

  const result = accounts.map((a) => ({
    hotelId: a.hotel.id,
    hotelName: a.hotel.name,
    balance: Number(a.totalOwed) - Number(a.totalPaid),
    totalOwed: Number(a.totalOwed),
    totalPaid: Number(a.totalPaid),
    status: Number(a.totalOwed) - Number(a.totalPaid) > 0 ? "DUE" : Number(a.totalOwed) - Number(a.totalPaid) < 0 ? "CREDIT" : "SETTLED",
    lastUpdated: a.lastUpdated.toISOString(),
  }));

  const combinedBalance = result.reduce((sum, a) => sum + a.balance, 0);

  return {
    combinedBalance,
    accounts: result,
  };
}

// ── Notifications ──

export async function getNotifications(customerId: string) {
  return prisma.notification.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function markNotificationRead(id: string, customerId: string) {
  return prisma.notification.updateMany({
    where: { id, customerId },
    data: { read: true },
  });
}

export async function clearNotifications(customerId: string) {
  const { count } = await prisma.notification.deleteMany({ where: { customerId } });
  return { cleared: count };
}

export async function getHotelWalletDetail(customerId: string, hotelId: string) {
  const account = await prisma.customerAccount.findUnique({
    where: { hotelId_customerId: { hotelId, customerId } },
    include: { hotel: { select: { id: true, name: true } } },
  });

  const orders = await prisma.order.findMany({
    where: { customerId, hotelId },
    select: { id: true, orderNumber: true, status: true, orderedAt: true },
  });

  const orderIds = orders.map((o) => o.id);
  const records = await prisma.salesRecord.findMany({
    where: { hotelId, orderId: { in: orderIds } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const hotel = account?.hotel || await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true } });

  // Cancelled-but-unrefunded orders: the business owes this customer money the
  // ledger alone reads as "settled". Surface it explicitly so a 0 balance never
  // hides a pending refund.
  const pendingRefunds = orders
    .filter((o) => o.status === "CANCELLED")
    .map((o) => {
      const orderRecords = records.filter((r) => r.orderId === o.id);
      const paid = orderRecords
        .filter((r) => r.type === "ORDER_PAYMENT")
        .reduce((sum, r) => sum + Number(r.amount), 0);
      const refunded = orderRecords
        .filter((r) => r.type === "REFUND")
        .reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);
      const amount = Math.max(0, paid - refunded);
      return { orderId: o.id, orderNumber: o.orderNumber, amount, orderedAt: o.orderedAt };
    })
    .filter((r) => r.amount > 0);

  return {
    hotelId: hotel?.id || hotelId,
    hotelName: hotel?.name || "Unknown",
    account: account ? { ...account, status: Number(account.totalOwed) - Number(account.totalPaid) > 0 ? "DUE" : Number(account.totalOwed) - Number(account.totalPaid) < 0 ? "CREDIT" : "SETTLED" } : { totalOwed: 0, totalPaid: 0, status: "SETTLED" },
    pendingRefunds: pendingRefunds.map((r) => ({
      ...r,
      amount: Number(r.amount),
      orderedAt: r.orderedAt.toISOString(),
    })),
    salesRecords: records.map((r) => ({
      id: r.id,
      type: r.type,
      paymentMethod: r.paymentMethod,
      amount: Number(r.amount),
      note: r.note,
      orderNumber: orders.find((o) => o.id === r.orderId)?.orderNumber || null,
      createdAt: r.createdAt,
    })),
  };
}
