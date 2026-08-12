import { smsService } from "../sms.service";
import { buildSetupLink } from "../../auth/password-setup.service";
import { hotelWelcome } from "../templates";

interface HotelCreatedPayload {
  hotelId: string;
  hotelName: string;
  adminName: string;
  adminUsername: string;
  adminPhone: string;
  setupToken: string;
}

export async function handleHotelCreated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as HotelCreatedPayload;

  if (!data.adminPhone) return true;

  const message = hotelWelcome({
    hotelName: data.hotelName,
    adminUsername: data.adminUsername,
    setupLink: buildSetupLink(data.setupToken),
  });

  const result = await smsService.sendSms(data.adminPhone, message);
  return result;
}