/**
 * Purpose: SMS Notification Service for tableDash online ordering system.
 * Responsibilities: Handles dispatching SMS text messages for order placement and updates.
 * Dependencies: textsms.co.ke REST API, Environment configuration from shared/config.ts.
 * When to modify: When switching SMS provider gateways, updating message templates, or adjusting API credentials.
 */

import { env } from "../../../../../shared/config";
import { formatPhone } from "../../../../../shared/phone";

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
  private readonly apiUrl = "https://sms.textsms.co.ke/api/services/sendsms/";

  constructor() {
    console.log("[SMS Driver Loaded] TextSMS.co.ke credentials check:");
    console.log(`  → Partner ID : ${env.textSmsPartnerId ? env.textSmsPartnerId : "❌ MISSING"}`);
    console.log(`  → API Key    : ${env.textSmsApiKey ? env.textSmsApiKey.slice(0, 8) + "..." : "❌ MISSING"}`);
    console.log(`  → Sender ID  : ${env.textSmsShortcode}`);
  }

  public async sendSms(recipientPhone: string, message: string): Promise<boolean> {
    const formattedPhone = formatPhone(recipientPhone);

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

      // Read the raw text first — TextSMS.co.ke may return plain text or JSON
      const rawText = await response.text();
      console.log(`[SMS Gateway Response] HTTP ${response.status} to ${formattedPhone}:`, rawText);

      // Try parsing JSON; if it fails, treat raw text as the result payload
      let data: unknown;
      try {
        data = JSON.parse(rawText);
      } catch {
        data = rawText;
      }

      if (response.ok) {
        console.log("[SMS Dispatched successfully via TextSMS.co.ke]:", data);
        return true;
      } else {
        console.error(`[SMS Dispatch Failed] HTTP ${response.status}:`, data);
        return false;
      }
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
