import { smsService } from "../sms.service";
import { buildSetupLink } from "../../auth/password-setup.service";
import { platformAdminWelcome } from "../templates";

interface PlatformAdminCreatedPayload {
  platformAdminId: string;
  name: string;
  username: string;
  phone?: string;
  setupToken: string;
  createdBy: string;
}

export async function handlePlatformAdminCreated(payload: Record<string, unknown>): Promise<boolean> {
  const data = payload as unknown as PlatformAdminCreatedPayload;

  if (!data.phone) return true;

  const message = platformAdminWelcome({
    createdBy: data.createdBy,
    setupLink: buildSetupLink(data.setupToken),
  });

  const result = await smsService.sendSms(data.phone, message);
  return result;
}