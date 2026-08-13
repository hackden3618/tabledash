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
  if (totalAmount <= 0) return "PAID";
  if (amountPaid <= 0) return "UNPAID";
  if (amountPaid >= totalAmount) return "PAID";
  return "PARTIAL";
}

/**
 * Recomputes Order.paymentStatus / amountPaid from the sum of that order's
 * SalesRecords — the only writer of the read-through payment cache. Runs inside
 * the caller's transaction so cache + ledger stay atomic.
 *
 * ADJUSTMENT rows are owed-side corrections: a price correction, a forgiven
 * credit, or the cancellation reversal. They are summed into the charge so the
 * order's cached financial state always matches the ledger — an order whose
 * charge was adjusted away reads as settled, not as still owing.
 */
async function recomputeOrderCacheTx(tx: any, orderId: string) {
  const records: { type: string; amount: unknown }[] = await tx.salesRecord.findMany({ where: { orderId } });
  const charge = records
    .filter((r) => r.type === "ORDER_CHARGE")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const adjustments = records
    .filter((r) => r.type === "ADJUSTMENT")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const paid = records
    .filter((r) => r.type === "ORDER_PAYMENT")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const refunded = records
    .filter((r) => r.type === "REFUND")
    .reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);
  const netCharge = charge + adjustments;
  const amountPaid = Math.max(0, paid - refunded);
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const paymentStatus = computePaymentStatus(netCharge, amountPaid);
  return tx.order.update({
    where: { id: orderId },
    data: { amountPaid, paymentStatus },
    include: { customer: true, orderItems: true },
  });
}

/**
 * Applies a delta to a CustomerAccount so the cache always equals the ledger.
 * The very first row a customer gets is the ORDER_CHARGE, so the create path
 * clamps harmlessly; the update path must NOT clamp, or a credit-bearing
 * adjustment larger than the outstanding balance would silently drop the
 * difference and leave the cache permanently out of step with sales_records.
 */
async function adjustAccountTx(tx: any, hotelId: string, customerId: string, owedDelta: number, paidDelta: number) {
  const account = await tx.customerAccount.findUnique({
    where: { hotelId_customerId: { hotelId, customerId } },
  });
  if (!account) {
    return tx.customerAccount.create({
      data: { hotelId, customerId, totalOwed: Math.max(0, owedDelta), totalPaid: Math.max(0, paidDelta) },
    });
  }
  const nextOwed = Number(account.totalOwed) + owedDelta;
  const nextPaid = Number(account.totalPaid) + paidDelta;
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
 * Reverses the residual charge of a cancelled order on the ledger — writes a
 * negative ADJUSTMENT row (so the ledger fully explains the order) and decrements
 * owed. The outstanding amount is recomputed from the whole ledger (charges +
 * existing adjustments), so the call is naturally idempotent: once the charge
 * reversal exists it becomes a no-op. Called by the cancellation workflow only.
 */
export async function recordCancellationChargeTx(
  tx: any,
  hotelId: string,
  customerId: string,
  orderId: string,
  reason: string,
) {
  const records: { type: string; amount: unknown; note?: string | null }[] = await tx.salesRecord.findMany({ where: { orderId } });
  const hasChargeReversal = records.some((record) => record.type === "ADJUSTMENT" && record.note?.startsWith("Order cancelled"));
  if (hasChargeReversal) return null;
  const charge = records
    .filter((r) => r.type === "ORDER_CHARGE")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const adjustments = records
    .filter((r) => r.type === "ADJUSTMENT")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const chargeToReverse = charge + adjustments;
  if (chargeToReverse <= 0) return null;

  const record = await tx.salesRecord.create({
    data: {
      hotelId,
      orderId,
      type: "ADJUSTMENT",
      paymentMethod: "CREDIT",
      amount: -chargeToReverse,
      note: reason,
    },
  });

  const account = await adjustAccountTx(tx, hotelId, customerId, -chargeToReverse, 0);

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
        amount: -chargeToReverse,
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
  return recordPayments(hotelId, customerId, orderId, [{ method: paymentMethod, amount }], adminUserId, note);
}

/** Records one or more tender lines atomically. Split cash/M-PESA payments are
 * separate immutable ledger events, while the order cache is recomputed once. */
export async function recordPayments(
  hotelId: string,
  customerId: string,
  orderId: string,
  payments: Array<{ method: "CASH" | "MPESA"; amount: number }>,
  adminUserId?: string,
  note?: string,
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Order not found");
  if (order.hotelId !== hotelId) throw new Error("Order not found in this hotel");
  if (!payments.length || payments.some((payment) => !Number.isFinite(payment.amount) || payment.amount <= 0)) {
    throw new Error("At least one payment amount greater than zero is required");
  }
  const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);

  const result = await prisma.$transaction(async (tx: any) => {
    const paymentRecords = await Promise.all(payments.map((payment) => tx.salesRecord.create({
      data: { hotelId, orderId, type: "ORDER_PAYMENT", paymentMethod: payment.method, amount: payment.amount, note, createdByAdminUserId: adminUserId },
    })));

    const updatedAccount = await adjustAccountTx(tx, hotelId, customerId, 0, totalAmount);
    const updatedOrder = await recomputeOrderCacheTx(tx, orderId);

    await Promise.all(paymentRecords.map((paymentRecord, index) => tx.eventOutbox.create({ data: {
      eventName: "customer_account_payment_recorded", hotelId,
      payload: JSON.stringify({ customerId, orderId, orderNumber: updatedOrder.orderNumber, recordId: paymentRecord.id, amount: payments[index]!.amount, type: "ORDER_PAYMENT", paymentMethod: payments[index]!.method, balance: accountBalance(updatedAccount), hotelId }),
      status: "initialized",
    } })));

    return { paymentRecord: paymentRecords[0], paymentRecords, account: updatedAccount, order: updatedOrder };
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

    // Refunds reverse money actually paid. Cancellation owns the charge
    // reversal and records it once in the ledger, so this path never derives
    // cancellation from the mutable order status.
    const records: { type: string; amount: unknown; note?: string | null }[] = await tx.salesRecord.findMany({ where: { orderId } });
    const hasChargeReversal = records.some((record) => record.type === "ADJUSTMENT" && record.note?.startsWith("Order cancelled"));
    const account = await tx.customerAccount.findUnique({
      where: { hotelId_customerId: { hotelId, customerId } },
    });
    const currentPaid = Number(account?.totalPaid ?? 0);
    const paidDelta = -Math.min(currentPaid, amount);
    const owedDelta = hasChargeReversal ? 0 : -Math.max(0, amount - currentPaid);
    await adjustAccountTx(tx, hotelId, customerId, owedDelta, paidDelta);

    if (!hasChargeReversal && owedDelta < 0) {
      await tx.salesRecord.create({
        data: {
          hotelId,
          orderId,
          type: "ADJUSTMENT",
          paymentMethod: "CREDIT",
          amount: owedDelta,
          note: reason,
          createdByAdminUserId: adminUserId,
        },
      });
    }

    const finalAccount = await tx.customerAccount.findUnique({
      where: { hotelId_customerId: { hotelId, customerId } },
    });
    const balance = finalAccount ? accountBalance(finalAccount) : 0;

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
          balance,
          hotelId,
          reason,
        }),
        status: "initialized",
      },
    });

    return { refundRecord, account: finalAccount ?? null, order: updatedOrder };
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

  const cashPayments = todayRecords
    .filter((r) => r.type === "ORDER_PAYMENT" && r.paymentMethod === "CASH")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const mpesaPayments = todayRecords
    .filter((r) => r.type === "ORDER_PAYMENT" && r.paymentMethod === "MPESA")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const cashRefunds = todayRecords
    .filter((r) => r.type === "REFUND" && r.paymentMethod === "CASH")
    .reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);
  const mpesaRefunds = todayRecords
    .filter((r) => r.type === "REFUND" && r.paymentMethod === "MPESA")
    .reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);
  const creditRevenue = todayRecords
    .filter((r) => r.type === "ORDER_CHARGE")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const refundsAmount = cashRefunds + mpesaRefunds;
  const refundsProcessed = todayRecords
    .filter((r) => r.type === "REFUND")
    .length;

  // Revenue is money actually kept: each method is net of its own refunds, so
  // Today's Revenue always equals Cash Revenue + M-Pesa Revenue and the cards
  // reconcile. A refund is cash taken back out of the hotel's till, so it must
  // reduce the method it was paid back in, not just the total.
  const cashRevenue = cashPayments - cashRefunds;
  const mpesaRevenue = mpesaPayments - mpesaRefunds;
  const todayRevenue = cashRevenue + mpesaRevenue;

  const orders = await prisma.order.findMany({
    where: { hotelId },
    select: { status: true, totalAmount: true, orderedAt: true },
  });

  const cancelledCount = orders.filter((o) => o.status === "CANCELLED").length;
  // Net cash in the till: cash collected minus cash refunds paid back out.
  const dailyCashPosition = cashRevenue;

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
    const dayRecords = records.filter((r) => r.createdAt.toISOString().startsWith(dayStr));
    const dayPayments = dayRecords
      .filter((r) => r.type === "ORDER_PAYMENT")
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const dayRefunds = dayRecords
      .filter((r) => r.type === "REFUND")
      .reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);
    weeklySummary.push({ date: dayStr, revenue: dayPayments - dayRefunds });
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
    const weekRecords = records.filter((r) => {
      const d = r.createdAt;
      return d >= weekStartD && d <= weekEnd;
    });
    const weekPayments = weekRecords
      .filter((r) => r.type === "ORDER_PAYMENT")
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const weekRefunds = weekRecords
      .filter((r) => r.type === "REFUND")
      .reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);
    monthlySummary.push({ week: weekLabel, revenue: weekPayments - weekRefunds });
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
