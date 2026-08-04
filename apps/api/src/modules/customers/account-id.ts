import { prisma } from "../../../../../infrastructure/database/prisma";

const PREFIX = "LD-CUST-";

// PostgreSQL sequence created by
// The restore_customer_account_id_sequence migration creates and backfills the
// sequence for both baseline and existing production databases. nextval() is
// atomic, so concurrent registrations can never receive the same account ID.
export async function generateAccountId(): Promise<string> {
    const [row] = await prisma.$queryRaw<{ nextval: bigint }[]>`
        SELECT nextval('customer_account_id_seq') AS nextval
    `;
    const next = row ? Number(row.nextval) : 1;
    return `${PREFIX}${String(next).padStart(6, "0")}`;
}
