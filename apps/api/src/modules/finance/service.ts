import { prisma } from "../../../../../infrastructure/database/prisma";

export interface FinanceDashboardMetrics {
  todayRevenue: number;
  cashRevenue: number;
  creditRevenue: number;
  outstandingBalance: number;
  refundsProcessed: number;
  refundsAmount: number;
  cancelledCount: number;
  dailyCashPosition: number;
  weeklySummary: { date: string; revenue: number }[];
  monthlySummary: { week: string; revenue: number }[];
  topCustomers: { id: string; name: string; totalSpent: number; orderCount: number }[];
}

export async function getFinanceDashboard(hotelId: string): Promise<FinanceDashboardMetrics> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const weekAgo = new Date(todayStart.getTime() - 6 * 86400000);
  const monthAgo = new Date(todayStart.getTime() - 29 * 86400000);

  const allOrders = await prisma.order.findMany({
    where: { hotelId },
    include: { orderItems: true },
  });

  const todayOrders = allOrders.filter((o) => o.orderedAt >= todayStart && o.orderedAt < todayEnd);
  const todayRevenue = todayOrders.filter((o) => o.status !== "CANCELLED").reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const todayCash = todayOrders.filter((o) => o.paymentStatus === "PAID").reduce((sum, o) => sum + Number(o.amountPaid), 0);
  const todayCredit = todayOrders.filter((o) => o.paymentStatus === "PARTIAL" || o.paymentStatus === "UNPAID").reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const outstandingBalance = allOrders.filter((o) => o.status !== "CANCELLED" && (o.paymentStatus === "PARTIAL" || o.paymentStatus === "UNPAID")).reduce((sum, o) => sum + (Number(o.totalAmount) - Number(o.amountPaid)), 0);
  const refundsProcessed = allOrders.filter((o) => o.paymentStatus === "REFUNDED").length;
  const refundsAmount = allOrders.filter((o) => o.paymentStatus === "REFUNDED").reduce((sum, o) => sum + Number(o.amountPaid), 0);
  const cancelledCount = allOrders.filter((o) => o.status === "CANCELLED").length;

  const weekOrders = allOrders.filter((o) => o.orderedAt >= weekAgo && o.orderedAt < todayEnd && o.status !== "CANCELLED");
  const weeklySummary: { date: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(todayStart.getTime() - i * 86400000);
    const dayEnd = new Date(day.getTime() + 86400000);
    const dayOrders = weekOrders.filter((o) => o.orderedAt >= day && o.orderedAt < dayEnd);
    weeklySummary.push({ date: day.toISOString().split("T")[0]!, revenue: dayOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0) });
  }

  const monthOrders = allOrders.filter((o) => o.orderedAt >= monthAgo && o.orderedAt < todayEnd && o.status !== "CANCELLED");
  const monthlySummary: { week: string; revenue: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const weekStart = new Date(monthAgo.getTime() + i * 7 * 86400000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const weekOrdersSlice = monthOrders.filter((o) => o.orderedAt >= weekStart && o.orderedAt < weekEnd);
    monthlySummary.push({ week: `Week ${i + 1}`, revenue: weekOrdersSlice.reduce((sum, o) => sum + Number(o.totalAmount), 0) });
  }

  const customerTotals = new Map<string, { name: string; totalSpent: number; orderCount: number }>();
  for (const order of allOrders.filter((o) => o.status !== "CANCELLED")) {
    const customer = await prisma.customer.findUnique({ where: { id: order.customerId }, select: { firstName: true, knownName: true } });
    const name = customer?.knownName || customer?.firstName || "Unknown";
    const existing = customerTotals.get(order.customerId) || { name, totalSpent: 0, orderCount: 0 };
    existing.totalSpent += Number(order.totalAmount);
    existing.orderCount += 1;
    customerTotals.set(order.customerId, existing);
  }
  const topCustomers = [...customerTotals.entries()].sort((a, b) => b[1].totalSpent - a[1].totalSpent).slice(0, 10).map(([id, data]) => ({ id, ...data }));

  return { todayRevenue, cashRevenue: todayCash, creditRevenue: todayCredit, outstandingBalance, refundsProcessed, refundsAmount, cancelledCount, dailyCashPosition: todayCash - refundsAmount, weeklySummary, monthlySummary, topCustomers };
}

export async function getCustomerAccount(customerId: string, hotelId?: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, firstName: true, lastName: true, phone: true, knownName: true, createdAt: true },
  });
  if (!customer) throw new Error("Customer not found");

  const where: any = { customerId };
  if (hotelId) where.hotelId = hotelId;

  const orders = await prisma.order.findMany({
    where,
    include: { orderItems: true },
    orderBy: { orderedAt: "desc" },
  });

  const totalSpent = orders.filter((o) => o.status !== "CANCELLED").reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const totalPaid = orders.reduce((sum, o) => sum + Number(o.amountPaid), 0);
  const outstandingBalance = totalSpent - totalPaid;
  const completedOrders = orders.filter((o) => o.status === "DELIVERED").length;
  const pendingOrders = orders.filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED").length;

  return {
    customer: { ...customer, totalSpent, totalPaid, outstandingBalance, completedOrders, pendingOrders, orderCount: orders.length },
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      totalAmount: Number(o.totalAmount),
      amountPaid: Number(o.amountPaid),
      paymentStatus: o.paymentStatus,
      orderedAt: o.orderedAt,
      items: o.orderItems.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: Number(i.unitPrice), subtotal: Number(i.subtotal) })),
    })),
  };
}

export async function getLedgerEntries(hotelId: string, customerId?: string, limit = 100) {
  const where: any = { hotelId };
  if (customerId) where.customerId = customerId;
  return prisma.ledgerEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      customer: { select: { id: true, firstName: true, knownName: true } },
      order: { select: { orderNumber: true } },
    },
  });
}

export async function createLedgerEntry(data: {
  hotelId: string;
  customerId: string;
  orderId?: string;
  type: "ORDER_CHARGE" | "CASH_PAYMENT" | "PARTIAL_PAYMENT" | "REFUND" | "CREDIT_ADJUSTMENT" | "MANUAL_ADJUSTMENT" | "FUTURE_ONLINE_PAYMENT";
  amount: number;
  description?: string;
  reference?: string;
  createdBy?: string;
}) {
  const previousEntries = await prisma.ledgerEntry.findMany({
    where: { hotelId: data.hotelId, customerId: data.customerId },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  const last = previousEntries[0];
  const currentBalance = last ? Number(last.balance) : 0;
  const balance = currentBalance + data.amount;

  return prisma.ledgerEntry.create({
    data: {
      hotelId: data.hotelId,
      customerId: data.customerId,
      orderId: data.orderId,
      type: data.type,
      amount: data.amount,
      balance,
      description: data.description,
      reference: data.reference,
      createdBy: data.createdBy,
    },
  });
}

export async function getDailyLedgers(hotelId: string, dateStr: string) {
  const startDate = new Date(dateStr + "T00:00:00.000Z");
  const endDate = new Date(dateStr + "T23:59:59.999Z");
  return prisma.ledgerEntry.findMany({
    where: { hotelId, createdAt: { gte: startDate, lte: endDate } },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, firstName: true, knownName: true } },
      order: { select: { orderNumber: true } },
    },
  });
}

export async function reconcileCash(hotelId: string, dateStr: string, expectedCash: number, countedCash: number, varianceReason?: string, reconciledBy?: string) {
  const startDate = new Date(dateStr + "T00:00:00.000Z");
  const endDate = new Date(dateStr + "T23:59:59.999Z");

  const dayOrders = await prisma.order.findMany({
    where: { hotelId, orderedAt: { gte: startDate, lte: endDate } },
  });

  const revenue = dayOrders.filter((o) => o.status !== "CANCELLED").reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const collected = dayOrders.reduce((sum, o) => sum + Number(o.amountPaid), 0);
  const variance = countedCash - expectedCash;

  const entry = await createLedgerEntry({
    hotelId,
    customerId: await getOrCreateSystemCustomer(hotelId),
    type: "MANUAL_ADJUSTMENT",
    amount: variance,
    description: `Cash reconciliation for ${dateStr}. Expected: KSh ${expectedCash}, Counted: KSh ${countedCash}, Variance: KSh ${variance}.${varianceReason ? ` Reason: ${varianceReason}` : ""}`,
    reference: `recon-${dateStr}`,
    createdBy: reconciledBy,
  });

  return { entry, date: dateStr, revenue, collected, expectedCash, countedCash, variance, varianceReason };
}

async function getOrCreateSystemCustomer(hotelId: string) {
  const existing = await prisma.customer.findFirst({ where: { phone: "0000000000" } });
  if (existing) return existing.id;
  const created = await prisma.customer.create({
    data: { firstName: "System", phone: "0000000000" },
  });
  return created.id;
}

export async function getReports(hotelId: string, dateFrom: string, dateTo: string) {
  const startDate = new Date(dateFrom + "T00:00:00.000Z");
  const endDate = new Date(dateTo + "T23:59:59.999Z");

  const orders = await prisma.order.findMany({
    where: { hotelId, orderedAt: { gte: startDate, lte: endDate } },
    include: { customer: true, orderItems: true },
    orderBy: { orderedAt: "desc" },
  });

  const allCustomers = [...new Set(orders.map((o) => o.customerId))];
  const customers = allCustomers.length;

  const validOrders = orders.filter((o) => o.status !== "CANCELLED");
  const totalRevenue = validOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const totalCollected = orders.reduce((sum, o) => sum + Number(o.amountPaid), 0);
  const cashRevenue = validOrders.filter((o) => o.paymentStatus === "PAID").reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const creditRevenue = validOrders.filter((o) => o.paymentStatus === "PARTIAL" || o.paymentStatus === "UNPAID").reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const refundedAmount = orders.filter((o) => o.paymentStatus === "REFUNDED").reduce((sum, o) => sum + Number(o.amountPaid), 0);
  const cancelledTotal = orders.filter((o) => o.status === "CANCELLED").reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const averageOrderValue = validOrders.length > 0 ? totalRevenue / validOrders.length : 0;

  const itemSales = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const order of validOrders) {
    for (const item of order.orderItems) {
      const existing = itemSales.get(item.productId) || { name: item.name, quantity: 0, revenue: 0 };
      existing.quantity += item.quantity;
      existing.revenue += Number(item.subtotal);
      itemSales.set(item.productId, existing);
    }
  }
  const topItems = [...itemSales.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 20);

  const dailyRevenue: { date: string; orders: number; revenue: number; collected: number }[] = [];
  const dayMap = new Map<string, { orders: number; revenue: number; collected: number }>();
  for (const order of orders) {
    const day = order.orderedAt.toISOString().split("T")[0]!;
    const existing = dayMap.get(day) || { orders: 0, revenue: 0, collected: 0 };
    existing.orders += 1;
    existing.revenue += Number(order.totalAmount);
    existing.collected += Number(order.amountPaid);
    dayMap.set(day, existing);
  }
  for (const [date, data] of dayMap) {
    dailyRevenue.push({ date, ...data });
  }
  dailyRevenue.sort((a, b) => a.date.localeCompare(b.date));

  return {
    period: { from: dateFrom, to: dateTo },
    summary: { totalOrders: orders.length, completedOrders: validOrders.length, cancelledOrders: orders.length - validOrders.length, uniqueCustomers: customers, totalRevenue, totalCollected, cashRevenue, creditRevenue, refundedAmount, cancelledTotal, averageOrderValue: Number(averageOrderValue.toFixed(2)), outstandingBalance: totalRevenue - totalCollected },
    dailyRevenue,
    topItems,
  };
}
