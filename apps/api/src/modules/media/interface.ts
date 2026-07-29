import type { MediaUploadOptions, MediaUploadResult } from "./types";

export interface MediaStorageProvider {
  upload(buffer: Buffer, filename: string, mimeType: string, options?: MediaUploadOptions): Promise<MediaUploadResult>;
  delete(filename: string): Promise<void>;
  getUrl(filename: string): string;
}