/**
 * Purpose: One-off idempotent backfill of SalesRecord ledger history for orders
 *   that predate the financial module (v1.3.0).
 * Responsibilities: For every order without an existing ORDER_CHARGE, write one
 *   ORDER_CHARGE (amount = totalAmount, CREDIT). If the order was already
 *   PAID/PARTIAL, write a matching ORDER_PAYMENT for the recorded amountPaid.
 *   Upsert the per-hotel CustomerAccount in the same transaction.
 * Dependencies: Prisma client.
 * When to run: Once, before shipping v1.3.0. Safe to re-run — skips orders that
 *   already have an ORDER_CHARGE.
 */

import { prisma } from "../infrastructure/database/prisma";

async function backfill() {
  const orders = await prisma.order.findMany({
    where: {
      salesRecords: { none: { type: "ORDER_CHARGE" } },
    },
    include: { salesRecords: true },
    orderBy: { orderedAt: "asc" },
  });

  console.log(`[Backfill] Found ${orders.length} order(s) missing an ORDER_CHARGE.`);

  let charged = 0;
  let paid = 0;
  let skipped = 0;

  for (const order of orders) {
    const { hotelId, customerId, totalAmount, paymentStatus, amountPaid, id } = order;
    if (!hotelId || !customerId) {
      console.log(`[Backfill] Skipping order ${id}: missing hotelId/customerId`);
      skipped++;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.salesRecord.create({
          data: {
            hotelId,
            orderId: id,
            type: "ORDER_CHARGE",
            paymentMethod: "CREDIT",
            amount: Number(totalAmount),
          },
        });

        await tx.customerAccount.upsert({
          where: { hotelId_customerId: { hotelId, customerId } },
          create: {
            hotelId,
            customerId,
            totalOwed: Number(totalAmount),
            totalPaid: 0,
          },
          update: { totalOwed: { increment: Number(totalAmount) } },
        });

        const alreadyPaid =
          (paymentStatus === "PAID" || paymentStatus === "PARTIAL") &&
          Number(amountPaid) > 0;

        if (alreadyPaid) {
          await tx.salesRecord.create({
            data: {
              hotelId,
              orderId: id,
              type: "ORDER_PAYMENT",
              paymentMethod: "CASH",
              amount: Number(amountPaid),
            },
          });
          await tx.customerAccount.update({
            where: { hotelId_customerId: { hotelId, customerId } },
            data: { totalPaid: { increment: Number(amountPaid) } },
          });
          paid++;
        }
      });

      charged++;
    } catch (err: any) {
      console.error(`[Backfill] Failed for order ${id}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`[Backfill] Done. Charges written: ${charged}, payments written: ${paid}, skipped: ${skipped}`);
}

backfill()
  .catch((err) => {
    console.error("[Backfill] Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
