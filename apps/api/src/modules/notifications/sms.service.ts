/**
 * Purpose: SMS Notification Service for tableDash online ordering system.
 * Responsibilities: Handles dispatching SMS text messages for order placement and updates.
 * Dependencies: textsms.co.ke REST API, Environment configuration from shared/config.ts.
 * When to modify: When switching SMS provider gateways, updating message templates, or adjusting API credentials.
 */

import { env } from "../../../../../shared/config";

/**
 * Interface defining the contract for SMS dispatch drivers.
 */
export interface ISmsDriver {
  /**
   * Dispatches an SMS message to a mobile number.
   * @param recipientPhone Destination mobile phone number (e.g. 0712345678 or 254712345678).
   * @param message Text message body.
   */
  sendSms(recipientPhone: string, message: string): Promise<boolean>;
}

/**
 * Production driver utilizing TextSMS.co.ke REST API.
 */
export class TextSmsDriver implements ISmsDriver {
  private readonly apiUrl = "https://textsms.co.ke/api/services/sendsms/";

  /**
   * Formats Kenyan phone numbers into international format (2547XXXXXXXX).
   * WHY: Local numbers starting with '07' or '01' must be converted to '254...' for textSMS gateway compatibility.
   */
  private formatPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("0") && cleaned.length === 10) {
      return `254${cleaned.slice(1)}`;
    }
    if (cleaned.startsWith("7") || cleaned.startsWith("1")) {
      return `254${cleaned}`;
    }
    return cleaned;
  }

  public async sendSms(recipientPhone: string, message: string): Promise<boolean> {
    const formattedPhone = this.formatPhoneNumber(recipientPhone);

    if (!env.textSmsApiKey || !env.textSmsPartnerId) {
      console.warn(
        "[SMS Driver Warning] TEXTSMS_API_KEY or TEXTSMS_PARTNER_ID missing. Falling back to log print."
      );
      console.log(`[SMS OUTBOUND to ${formattedPhone}]: ${message}`);
      return true;
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apikey: env.textSmsApiKey,
          partnerID: env.textSmsPartnerId,
          mobile: formattedPhone,
          message: message,
          shortcode: env.textSmsShortcode,
          pass_type: "plain",
        }),
      });

      const data = await response.json();
      console.log("[SMS Dispatched successfully via TextSMS.co.ke]:", data);
      return response.ok;
    } catch (error) {
      console.error("[SMS Dispatch Error via TextSMS.co.ke]:", error);
      return false;
    }
  }
}

/**
 * Local development driver printing SMS to stdout console without sending real SMS messages.
 */
export class ConsoleSmsDriver implements ISmsDriver {
  public async sendSms(recipientPhone: string, message: string): Promise<boolean> {
    console.log(`\n========================================`);
    console.log(`[DEV SMS SIMULATION] To: ${recipientPhone}`);
    console.log(`[Message]: ${message}`);
    console.log(`========================================\n`);
    return true;
  }
}

/**
 * Active SMS Service singleton instance based on environment configuration.
 */
export const smsService: ISmsDriver =
  env.smsProvider === "textsms" ? new TextSmsDriver() : new ConsoleSmsDriver();
