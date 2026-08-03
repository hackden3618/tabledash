export interface MediaUploadOptions {
  hotelId: string;
  maxWidth?: number;
  maxHeight?: number;
  thumbnail?: boolean;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
}

export interface MediaUploadResult {
  id: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  mimeType: string;
  sizeBytes: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface MediaStorageConfig {
  provider: "local" | "r2" | "s3" | "supabase";
  baseUrl: string;
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  /** Public/CDN origin for delivered images; defaults to endpoint/bucket. */
  publicBaseUrl?: string;
  r2AccountId?: string;
}
export const MEDIA_STORAGE_CONFIG: MediaStorageConfig = {
  provider: (process.env.MEDIA_STORAGE || "local") as MediaStorageConfig["provider"],
  baseUrl: process.env.MEDIA_BASE_URL || process.env.PUBLIC_URL || "http://localhost:3000",
  bucket: process.env.MEDIA_BUCKET || process.env.S3_BUCKET || process.env.R2_BUCKET_NAME || "",
  region: process.env.MEDIA_REGION || process.env.S3_REGION || "auto",
  accessKeyId: process.env.MEDIA_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.MEDIA_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || "",
  endpoint: process.env.MEDIA_ENDPOINT || process.env.S3_ENDPOINT || process.env.R2_ENDPOINT || "",
  publicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL || "",
  r2AccountId: process.env.MEDIA_R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || "",
};
