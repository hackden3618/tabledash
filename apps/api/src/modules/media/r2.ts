import { MEDIA_STORAGE_CONFIG } from "./types";
import type { MediaStorageProvider } from "./interface";
import type { MediaUploadOptions, MediaUploadResult } from "./types";

export class R2StorageProvider implements MediaStorageProvider {
  private baseUrl: string;
  private bucketName: string;
  private accountId: string;
  private accessKeyId: string;
  private secretAccessKey: string;

  constructor() {
    this.baseUrl = MEDIA_STORAGE_CONFIG.baseUrl;
    this.bucketName = MEDIA_STORAGE_CONFIG.bucket || "ladha-media";
    this.accountId = MEDIA_STORAGE_CONFIG.r2AccountId || MEDIA_STORAGE_CONFIG.accessKeyId || "";
    this.accessKeyId = MEDIA_STORAGE_CONFIG.accessKeyId || "";
    this.secretAccessKey = MEDIA_STORAGE_CONFIG.secretAccessKey || "";
  }

  private getR2Endpoint(): string {
    return `https://${this.accountId}.r2.cloudflarestorage.com`;
  }

  async upload(buffer: Buffer, filename: string, mimeType: string, options?: MediaUploadOptions): Promise<MediaUploadResult> {
    const url = `${this.getR2Endpoint()}/${this.bucketName}/${filename}`;
    let putHeaders: Record<string, string> = {
      "Content-Type": mimeType,
      "x-amz-acl": "public-read",
    };

    const presignedUrl = await this.getPresignedUrl(filename, putHeaders);
    const uploadResponse = await fetch(presignedUrl, {
      method: "PUT",
      headers: putHeaders,
      body: buffer as unknown as BodyInit,
    });
    if (!uploadResponse.ok) throw new Error(`R2 upload failed with status ${uploadResponse.status}`);

    const publicUrl = `${this.baseUrl}/media/${filename}`;
    return {
      id: filename,
      url: publicUrl,
      mimeType,
      sizeBytes: buffer.length,
    };
  }

  private async getPresignedUrl(filename: string, headers: Record<string, string>): Promise<string> {
    const tokenResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/r2/bucket/${this.bucketName}/upload-url`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.secretAccessKey}`,
        },
        body: JSON.stringify({ key: filename, httpMethod: "PUT", expiresIn: 300 }),
      }
    );
    if (!tokenResponse.ok) throw new Error("Failed to get R2 presigned URL");
    const data = await tokenResponse.json();
    return data.result.uploadUrl;
  }

  async delete(filename: string): Promise<void> {
    await fetch(`${this.getR2Endpoint()}/${this.bucketName}/${filename}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.secretAccessKey}`,
      },
    });
  }

  getUrl(filename: string): string {
    return `${this.baseUrl}/media/${filename}`;
  }
}
