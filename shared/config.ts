/**
 * Purpose: Centralized environment configuration management for tableDash.
 * Responsibilities: Reads, parses, and exposes environment variables with safe defaults for local development.
 * Dependencies: Node/Bun process.env context.
 * When to modify: When adding new system configuration parameters (e.g. new API keys, ports, secrets).
 */

export class Environment {
  /** API prefix for all REST endpoints (leading slash, no trailing slash) */
  public readonly apiPrefix: string = process.env.API_PREFIX ?? "/api/v1";

  /** Database connection string for PostgreSQL */
  public readonly databaseUrl: string = process.env.DATABASE_URL ?? "postgres://development@localhost:5432/tabledash?schema=public&connection_limit=5";

  /** Port for the Elysia backend server */
  public readonly backendPort: number = Number(process.env.PORT ?? 3000);

  /** JWT Secret used for signing JWT authentication tokens via @elysiajs/jwt */
  public readonly jwtSecret: string = (() => {
    const val = process.env.JWT_SECRET;
    if (!val) throw new Error("JWT_SECRET environment variable is required — set it in Railway or .env");
    return val;
  })();

  /** SMS Provider selection: 'textsms' | 'console' */
  public readonly smsProvider: string = process.env.SMS_PROVIDER ?? "textsms";

  /** TextSMS.co.ke API Key */
  public readonly textSmsApiKey: string = process.env.TEXTSMS_API_KEY ?? "";

  /** TextSMS.co.ke Partner ID */
  public readonly textSmsPartnerId: string = process.env.TEXTSMS_PARTNER_ID ?? "";

  /** TextSMS.co.ke Sender Shortcode / SenderID */
  public readonly textSmsShortcode: string = process.env.TEXTSMS_SENDER_ID ?? process.env.TEXTSMS_SenderID ?? "TextSMS";

  /** Admin username for database seeding (used only by seed.ts) */
  public readonly seedAdminUsername: string = process.env.SEED_ADMIN_USERNAME ?? "admin";

  /** Admin password for database seeding (used only by seed.ts) */
  public readonly seedAdminPassword: string = process.env.SEED_ADMIN_PASSWORD ?? "adminpass";

  /** Public URL for generating absolute URLs (upload URLs, etc.) */
  public readonly publicUrl: string = process.env.PUBLIC_URL ?? "http://localhost:3000";

  /** Allowed CORS origin (set to frontend URL in production, * for development) */
  public readonly corsOrigin: string = process.env.CORS_ORIGIN ?? "*";
}

export const env = new Environment();
