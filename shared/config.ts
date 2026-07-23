/**
 * Purpose: Centralized environment configuration management for tableDash.
 * Responsibilities: Reads, parses, and exposes environment variables with safe defaults for local development.
 * Dependencies: Node/Bun process.env context.
 * When to modify: When adding new system configuration parameters (e.g. new API keys, ports, secrets).
 */

export class Environment {
  /** API prefix for all REST endpoints */
  public readonly apiPrefix: string = process.env.API_PREFIX ?? "api/v1/";

  /** Database connection string for PostgreSQL */
  public readonly databaseUrl: string = process.env.DATABASE_URL ?? "postgres://development@localhost:5432/tabledash?schema=public";

  /** Port for the Elysia backend server */
  public readonly backendPort: number = Number(process.env.PORT ?? 3000);

  /** JWT Secret for Admin authentication */
  public readonly jwtSecret: string = process.env.JWT_SECRET ?? "tableDash_secret_key_change_in_production_2026";

  /** SMS Provider selection: 'textsms' | 'console' */
  public readonly smsProvider: string = process.env.SMS_PROVIDER ?? "textsms";

  /** TextSMS.co.ke API Key */
  public readonly textSmsApiKey: string = process.env.TEXTSMS_API_KEY ?? "";

  /** TextSMS.co.ke Partner ID */
  public readonly textSmsPartnerId: string = process.env.TEXTSMS_PARTNER_ID ?? "";

  /** TextSMS.co.ke Sender Shortcode / SenderID */
  public readonly textSmsShortcode: string = process.env.TEXTSMS_SHORTCODE ?? "TextSMS";
}

export const env = new Environment();
