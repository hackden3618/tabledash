import { env } from "../../../../../../shared/config";
import { smsService } from "../sms.service";

interface HotelCreatedPayload {
  hotelId: string;
  hotelName: string;
  adminName: string;
  adminUsername: string;
  adminPhone: string;
  tempPassword: string;
}

export async function handleHotelCreated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as HotelCreatedPayload;

  if (!data.adminPhone) return true;

  const message = `Welcome to Ladha Deliveries! You've been registered as admin for ${data.hotelName}. Login at the kitchen dashboard at ${env.publicUrl}/kitchen with username "${data.adminUsername}" and temporary password: ${data.tempPassword}. Please change your password on first login. - Ladha Deliveries`;

  const result = await smsService.sendSms(data.adminPhone, message);
  return result;
}
