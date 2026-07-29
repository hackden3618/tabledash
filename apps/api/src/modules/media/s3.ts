import { createHash, createHmac } from "node:crypto";
import { MEDIA_STORAGE_CONFIG } from "./types";
import type { MediaStorageProvider } from "./interface";
import type { MediaUploadOptions, MediaUploadResult } from "./types";

const AWS_ALGORITHM = "AWS4-HMAC-SHA256";
const AWS_SERVICE = "s3";

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function awsDate(now: Date) {
  const timestamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { dateStamp: timestamp.slice(0, 8), amzDate: timestamp };
}

function encodeObjectKey(key: string): string {
  return key.split("/").map((part) => encodeURIComponent(part)).join("/");
}

/**
 * Standards-compliant S3-compatible storage provider. It works with AWS S3,
 * Tigris and other SigV4 endpoints; credentials remain server-only env vars.
 */
export class S3StorageProvider implements MediaStorageProvider {
  private readonly endpoint: URL;
  private readonly bucket: string;
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly publicBaseUrl: string;

  constructor() {
    if (!MEDIA_STORAGE_CONFIG.endpoint || !MEDIA_STORAGE_CONFIG.bucket || !MEDIA_STORAGE_CONFIG.accessKeyId || !MEDIA_STORAGE_CONFIG.secretAccessKey) {
      throw new Error("S3 storage is not configured. Set MEDIA_ENDPOINT/ S3_ENDPOINT, MEDIA_BUCKET/ S3_BUCKET, MEDIA_ACCESS_KEY_ID/ S3_ACCESS_KEY_ID, and MEDIA_SECRET_ACCESS_KEY/ S3_SECRET_ACCESS_KEY.");
    }
    this.endpoint = new URL(MEDIA_STORAGE_CONFIG.endpoint);
    this.bucket = MEDIA_STORAGE_CONFIG.bucket;
    this.region = MEDIA_STORAGE_CONFIG.region || "auto";
    this.accessKeyId = MEDIA_STORAGE_CONFIG.accessKeyId;
    this.secretAccessKey = MEDIA_STORAGE_CONFIG.secretAccessKey;
    this.publicBaseUrl = (MEDIA_STORAGE_CONFIG.publicBaseUrl || `${this.endpoint.toString().replace(/\/$/, "")}/${this.bucket}`).replace(/\/$/, "");
  }

  private objectUrl(filename: string): URL {
    // Path-style works with S3-compatible custom endpoints and avoids relying
    // on wildcard DNS for a bucket name.
    return new URL(`${this.endpoint.toString().replace(/\/$/, "")}/${this.bucket}/${encodeObjectKey(filename)}`);
  }

  private async signedFetch(method: "GET" | "PUT" | "DELETE", filename: string, body?: Buffer, mimeType?: string): Promise<Response> {
    const url = this.objectUrl(filename);
    const now = new Date();
    const { dateStamp, amzDate } = awsDate(now);
    const payloadHash = sha256(body ?? "");
    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (mimeType) headers["content-type"] = mimeType;
    const sortedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join("");
    const signedHeaders = sortedHeaderNames.join(";");
    const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const credentialScope = `${dateStamp}/${this.region}/${AWS_SERVICE}/aws4_request`;
    const stringToSign = [AWS_ALGORITHM, amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.secretAccessKey}`, dateStamp), this.region), AWS_SERVICE), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authorization = `${AWS_ALGORITHM} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(url, {
      method,
      headers: { ...headers, Authorization: authorization },
      ...(body ? { body: body as unknown as BodyInit } : {}),
    });
  }

  async upload(buffer: Buffer, filename: string, mimeType: string, _options?: MediaUploadOptions): Promise<MediaUploadResult> {
    const response = await this.signedFetch("PUT", filename, buffer, mimeType);
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`S3 upload failed (${response.status}): ${detail || response.statusText}`);
    }
    return { id: filename, url: this.getUrl(filename), mimeType, sizeBytes: buffer.length };
  }

  async delete(filename: string): Promise<void> {
    const response = await this.signedFetch("DELETE", filename);
    if (!response.ok && response.status !== 404) throw new Error(`S3 delete failed (${response.status})`);
  }

  async download(filename: string): Promise<Response> {
    return this.signedFetch("GET", filename);
  }

  getUrl(filename: string): string {
    const publicBaseUrl = (process.env.MEDIA_BASE_URL || process.env.PUBLIC_URL || "").replace(/\/$/, "");
    return `${publicBaseUrl}/api/v1/media/${encodeURIComponent(filename)}`;
  }
}
