/**
 * Purpose: Reconcile the financial ledger and CustomerAccount caches after the
 *   refund bug fix. Before the fix, recordRefund's CANCELLED branch reduced the
 *   cached totalOwed without writing the matching ADJUSTMENT ledger row, so some
 *   cancelled orders showed a phantom outstanding charge in the ledger that the
 *   cache could not explain.
 * Responsibilities:
 *   1. For every CANCELLED order with a residual outstanding charge (charges +
 *      existing adjustments − net paid > 0), write one ADJUSTMENT row reversing
 *      it — mirroring recordCancellationChargeTx so the ledger fully explains
 *      the order.
 *   2. Recompute every CustomerAccount cache from the full ledger and update
 *      only the rows that drifted (this is the source of truth by construction).
 * Dependencies: Prisma client.
 * When to run: Once, after deploying the fix. Default is a dry run — pass
 *   `--apply` to write. Safe to re-run: it is idempotent (recomputes from the
 *   ledger and only writes adjustments where a residual charge remains).
 */

import { prisma } from "../infrastructure/database/prisma";

const APPLY = process.argv.includes("--apply");

function sum(rows: { type: string; amount: unknown }[], type: string, abs = false): number {
  return rows
    .filter((r) => r.type === type)
    .reduce((s, r) => s + (abs ? Math.abs(Number(r.amount)) : Number(r.amount)), 0);
}

async function reconcile() {
  const orders = await prisma.order.findMany({
    where: { status: "CANCELLED" },
    include: { salesRecords: true },
    orderBy: { orderedAt: "asc" },
  });

  console.log(`[Reconcile] ${APPLY ? "APPLYING" : "DRY RUN"} — ${orders.length} cancelled order(s) to inspect.\n`);

  const plannedReversals: { orderId: string; amount: number }[] = [];
  for (const order of orders) {
    const { hotelId, customerId, salesRecords } = order;
    if (!hotelId || !customerId) continue;

    const charge = sum(salesRecords, "ORDER_CHARGE");
    const adjustments = sum(salesRecords, "ADJUSTMENT");
    const paid = sum(salesRecords, "ORDER_PAYMENT");
    const refunded = sum(salesRecords, "REFUND", true);
    const outstanding = charge + adjustments - (paid - refunded);

    if (outstanding > 0) {
      console.log(
        `  REVERSING ${String(outstanding).padStart(6)} on order ${order.orderNumber} (${order.id.slice(0, 8)}) ` +
          `— charge ${charge}, adjustments ${adjustments}, paid ${paid}, refunded ${refunded}`,
      );
      if (APPLY) {
        await prisma.salesRecord.create({
          data: {
            hotelId,
            orderId: order.id,
            type: "ADJUSTMENT",
            paymentMethod: "CREDIT",
            amount: -outstanding,
            note: "Reconcile: reversed residual charge on cancelled order",
          },
        });
      }
      plannedReversals.push({ orderId: order.id, amount: outstanding });
    } else if (outstanding < 0) {
      console.warn(
        `  SKIP order ${order.orderNumber} (${order.id.slice(0, 8)}): outstanding is negative (${outstanding}) — ` +
          `over-reversed; needs a manual review, not an automated fix.`,
      );
    }
  }
  console.log(`\n[Reconcile] Charge reversals: ${plannedReversals.length} written (${APPLY ? "applied" : "dry run"}).`);

  // ── Step 2: recompute every CustomerAccount cache from the ledger ──
  const allOrders = await prisma.order.findMany({
    select: { id: true, customerId: true, hotelId: true },
  });
  const orderCustomer = new Map(allOrders.map((o) => [o.id, o.customerId]));
  const orderHotel = new Map(allOrders.map((o) => [o.id, o.hotelId]));
  const records = await prisma.salesRecord.findMany();

  const ledgerTotals = new Map<string, { owed: number; paid: number }>();
  for (const r of records) {
    const customerId = orderCustomer.get(r.orderId);
    const hotelId = orderHotel.get(r.orderId);
    if (!customerId || !hotelId) continue;
    const key = `${hotelId}:${customerId}`;
    const t = ledgerTotals.get(key) ?? { owed: 0, paid: 0 };
    const amt = Number(r.amount);
    if (r.type === "ORDER_CHARGE") t.owed += amt;
    else if (r.type === "ORDER_PAYMENT") t.paid += amt;
    else if (r.type === "REFUND") t.paid -= Math.abs(amt);
    else if (r.type === "ADJUSTMENT") t.owed += amt;
    ledgerTotals.set(key, t);
  }

  // Fold the planned charge reversals into the ledger totals so the cache
  // comparison reflects the state after the fix, not the pre-fix ledger.
  // Only needed in dry-run mode — in apply mode the ADJUSTMENT rows are already
  // in the DB and included in `records` above.
  if (!APPLY) {
    for (const { orderId, amount } of plannedReversals) {
      const customerId = orderCustomer.get(orderId);
      const hotelId = orderHotel.get(orderId);
      if (!customerId || !hotelId) continue;
      const key = `${hotelId}:${customerId}`;
      const t = ledgerTotals.get(key) ?? { owed: 0, paid: 0 };
      t.owed -= amount;
      ledgerTotals.set(key, t);
    }
  }

  const accounts = await prisma.customerAccount.findMany();
  let accountsDrifted = 0;
  for (const account of accounts) {
    const key = `${account.hotelId}:${account.customerId}`;
    const ledger = ledgerTotals.get(key) ?? { owed: 0, paid: 0 };
    const cacheOwed = Number(account.totalOwed);
    const cachePaid = Number(account.totalPaid);
    if (cacheOwed === ledger.owed && cachePaid === ledger.paid) continue;

    const owedDelta = ledger.owed - cacheOwed;
    const paidDelta = ledger.paid - cachePaid;
    console.log(
      `  ACCOUNT ${account.customerId.slice(0, 8)} (hotel ${account.hotelId.slice(0, 8)}): ` +
        `cache owed ${cacheOwed} → ${ledger.owed}, paid ${cachePaid} → ${ledger.paid}`,
    );
    if (APPLY) {
      await prisma.customerAccount.update({
        where: { id: account.id },
        data: {
          totalOwed: { increment: owedDelta },
          totalPaid: { increment: paidDelta },
        },
      });
    }
    accountsDrifted++;
  }
  console.log(`[Reconcile] Account caches: ${accountsDrifted} drifted (${APPLY ? "corrected" : "dry run"}).`);

  if (!APPLY) {
    console.log("\n[Reconcile] Dry run only — re-run with `--apply` to write the changes.");
  }
}

reconcile()
  .catch((err) => {
    console.error("[Reconcile] Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
