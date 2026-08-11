import { smsService } from "../sms.service";
import { buildSetupLink } from "../../auth/password-setup.service";
import { staffWelcome } from "../templates";

interface HotelStaffCreatedPayload {
  staffName: string;
  staffPhone: string;
  hotelName: string;
  username?: string;
  setupToken?: string;
  role?: string;
}

export async function handleHotelStaffCreated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as HotelStaffCreatedPayload;

  if (!data.staffPhone) return true;

  const roleLabel = data.role === "HOTEL_STAFF" ? "hotel staff" : "staff";
  const message = staffWelcome({
    staffName: data.staffName,
    role: roleLabel,
    hotelName: data.hotelName,
    setupLink: data.setupToken ? buildSetupLink(data.setupToken) : undefined,
  });

  const result = await smsService.sendSms(data.staffPhone, message);
  return result;
}