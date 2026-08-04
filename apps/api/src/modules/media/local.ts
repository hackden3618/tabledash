import { MEDIA_STORAGE_CONFIG } from "./types";
import type { MediaStorageProvider } from "./interface";
import type { MediaUploadOptions, MediaUploadResult } from "./types";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCAL_UPLOAD_DIR = join(process.cwd(), "apps", "api", "uploads");
if (!existsSync(LOCAL_UPLOAD_DIR)) {
  mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
}

export class LocalStorageProvider implements MediaStorageProvider {
  async upload(buffer: Buffer, filename: string, _mimeType: string, _options?: MediaUploadOptions): Promise<MediaUploadResult> {
    const destination = join(LOCAL_UPLOAD_DIR, filename);
    writeFileSync(destination, buffer);
    const publicBase = MEDIA_STORAGE_CONFIG.baseUrl;
    return {
      id: filename,
      url: `${publicBase}/api/v1/uploads/${filename}`,
      mimeType: _mimeType,
      sizeBytes: buffer.length,
    };
  }

  async delete(filename: string): Promise<void> {
    const filePath = join(LOCAL_UPLOAD_DIR, filename);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  getUrl(filename: string): string {
    return `${MEDIA_STORAGE_CONFIG.baseUrl}/api/v1/uploads/${filename}`;
  }
}

/** Used only by the authenticated upload route's local-development file handler. */
export function getLocalUploadPath(filename: string): string {
  return join(LOCAL_UPLOAD_DIR, filename);
}
