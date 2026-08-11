/**
 * Purpose: Centralized environment configuration management for ladha.
 * Responsibilities: Reads, parses, and exposes environment variables with safe defaults for local development.
 * Dependencies: Node/Bun process.env context.
 * When to modify: When adding new system configuration parameters (e.g. new API keys, ports, secrets).
 */

export class Environment {
  /** API prefix for all REST endpoints (leading slash, no trailing slash) */
  public readonly apiPrefix: string = process.env.API_PREFIX ?? "/api/v1";

  /** Database connection string for PostgreSQL */
  public readonly databaseUrl: string = process.env.DATABASE_URL ?? "postgres://development@localhost:5432/ladha?schema=public&connection_limit=5";

  /** Port for the Elysia backend server */
  public readonly backendPort: number = Number(process.env.PORT ?? 3000);

  /** JWT Secret used for signing JWT authentication tokens via @elysiajs/jwt */
  public get jwtSecret(): string {
    const val = process.env.JWT_SECRET;
    if (!val) throw new Error("JWT_SECRET environment variable is required — set it in Railway or .env");
    return val;
  }

  /** SMS Provider selection: 'textsms' | 'console' */
  public readonly smsProvider: string = process.env.SMS_PROVIDER ?? "textsms";

  /** Development-only SMS diagnostics; never enabled by default in production. */
  public readonly smsLogMessages: boolean = process.env.SMS_LOG_MESSAGES === "true" || (process.env.NODE_ENV !== "production" && process.env.SMS_LOG_MESSAGES !== "false");

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

  /** Fails fast on unsafe production defaults before accepting traffic. */
  public assertProductionSafety(): void {
    if (process.env.NODE_ENV !== "production") return;

    const errors: string[] = [];
    const jwtSecret = process.env.JWT_SECRET ?? "";
    if (jwtSecret.length < 32) errors.push("JWT_SECRET must be at least 32 characters");
    if (!this.corsOrigin || this.corsOrigin === "*") errors.push("CORS_ORIGIN must be an explicit frontend origin");
    if (this.seedAdminUsername === "admin" || this.seedAdminPassword === "adminpass") errors.push("SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD must not use defaults");
    if (!(["s3", "r2"] as const).includes(process.env.MEDIA_STORAGE as "s3" | "r2")) {
      errors.push("MEDIA_STORAGE must be s3 or r2 in production");
    }
    if (process.env.MEDIA_STORAGE === "r2" && (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME || !process.env.MEDIA_BASE_URL)) {
      errors.push("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and MEDIA_BASE_URL are required for R2 storage");
    }
    if (process.env.MEDIA_STORAGE === "s3" && (!process.env.S3_ENDPOINT || !process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY)) {
      errors.push("S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are required for S3 storage");
    }
    if (this.smsProvider === "textsms" && (!this.textSmsApiKey || !this.textSmsPartnerId)) errors.push("TextSMS credentials are required when SMS_PROVIDER=textsms");
    if (this.smsProvider === "console") errors.push("SMS_PROVIDER=console is not allowed in production");

    if (errors.length > 0) throw new Error(`Unsafe production configuration: ${errors.join("; ")}`);
  }
}

export const env = new Environment();
