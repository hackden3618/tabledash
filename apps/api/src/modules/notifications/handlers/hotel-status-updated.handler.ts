import { prisma } from "../../../../../../infrastructure/database/prisma";
import { smsService } from "../sms.service";

interface HotelStatusUpdatedPayload {
  hotelId: string;
  hotelName: string;
  newStatus: string;
  previousStatus: string;
  changedBy: string;
}

export async function handleHotelStatusUpdated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as HotelStatusUpdatedPayload;
  const action = data.newStatus === "open" ? "reactivated" : "suspended";

  const staff = await prisma.staffUser.findMany({
    where: { hotelId: data.hotelId, receiveSms: true },
    select: { phone: true, name: true },
  });

  if (staff.length === 0) return true;

  const msg = `[Ladha Deliveries] ${data.hotelName} has been ${action} by ${data.changedBy}. Please check the kitchen dashboard.`;

  const results = await Promise.allSettled(
    staff.map((s) => smsService.sendSms(s.phone, msg))
  );

  // Keep the outbox row retryable when the gateway rejects every delivery.
  // If at least one recipient succeeds, the event has still been delivered.
  return results.some((result) => result.status === "fulfilled" && result.value);
}
