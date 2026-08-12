import { smsService } from "../sms.service";
import { buildSetupLink } from "../../auth/password-setup.service";
import { staffWelcome } from "../templates";

interface HotelAdminCreatedPayload {
  adminName: string;
  adminUsername: string;
  adminPhone: string;
  hotelName: string;
  setupToken: string;
}

export async function handleHotelAdminCreated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as HotelAdminCreatedPayload;

  if (!data.adminPhone) return true;

  const message = staffWelcome({
    staffName: data.adminName,
    role: "hotel admin",
    hotelName: data.hotelName,
    username: data.adminUsername,
    setupLink: buildSetupLink(data.setupToken),
  });

  const result = await smsService.sendSms(data.adminPhone, message);
  return result;
}