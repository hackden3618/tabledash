import { smsService } from "../sms.service";

interface PlatformAdminCreatedPayload {
  platformAdminId: string;
  name: string;
  username: string;
  phone?: string;
  tempPassword: string;
  createdBy: string;
}

export async function handlePlatformAdminCreated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as PlatformAdminCreatedPayload;

  if (!data.phone) return true;

  const message = `Welcome to Ladha Deliveries! You've been assigned as a Platform Administrator by ${data.createdBy}. Your temporary password is ${data.tempPassword}. Please log in at https://tabledash.up.railway.app/platform and change it immediately.`;

  const result = await smsService.sendSms(data.phone, message);
  return result;
}
