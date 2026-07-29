import { prisma } from "../../../../../infrastructure/database/prisma";
import { MEDIA_STORAGE_CONFIG } from "./types";
import type { MediaUploadOptions, MediaUploadResult } from "./types";
import { LocalStorageProvider } from "./local";
import { R2StorageProvider } from "./r2";
import { S3StorageProvider } from "./s3";
import type { MediaStorageProvider } from "./interface";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function getProvider(): MediaStorageProvider {
  switch (MEDIA_STORAGE_CONFIG.provider) {
    case "r2":
      return new R2StorageProvider();
    case "s3":
      return new S3StorageProvider();
    case "local":
    default:
      return new LocalStorageProvider();
  }
}

function generateFilename(originalName: string): string {
  const ext = originalName.split(".").pop() || "png";
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

function validateImage(buffer: Buffer): { valid: boolean; mimeType: string; error?: string } {
  const header = buffer.slice(0, 8);
  const hex = Array.from(header).map((b) => b.toString(16).padStart(2, "0")).join("");

  if (hex.startsWith("89504e47")) return { valid: true, mimeType: "image/png" };
  if (hex.startsWith("ffd8ff")) return { valid: true, mimeType: "image/jpeg" };
  if (hex.startsWith("52494646")) return { valid: true, mimeType: "image/webp" };

  return { valid: false, mimeType: "", error: "Unsupported image format. Use PNG, JPEG, or WEBP." };
}

export async function uploadMedia(
  buffer: Buffer,
  originalName: string,
  options: MediaUploadOptions = {}
): Promise<MediaUploadResult> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size (${(buffer.length / 1024 / 1024).toFixed(1)} MB) exceeds the 10 MB limit`);
  }

  const validation = validateImage(buffer);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const filename = generateFilename(originalName);
  const provider = getProvider();

  const mediaRecord = await prisma.media.create({
    data: {
      originalName,
      mimeType: validation.mimeType,
      sizeBytes: buffer.length,
      url: "",
      status: "UPLOADING",
      hotelId: options.hotelId,
    },
  });

  try {
    const result = await provider.upload(buffer, filename, validation.mimeType, options);

    await prisma.media.update({
      where: { id: mediaRecord.id },
      data: {
        url: result.url,
        thumbnailUrl: result.thumbnailUrl,
        width: result.width ?? null,
        height: result.height ?? null,
        status: "READY",
        originalName,
        mimeType: validation.mimeType,
        sizeBytes: buffer.length,
      },
    });

    return result;
  } catch (err) {
    await prisma.media.update({
      where: { id: mediaRecord.id },
      data: { status: "FAILED" },
    });
    throw err;
  }
}

export async function deleteMedia(filename: string): Promise<void> {
  const provider = getProvider();
  await provider.delete(filename);

  await prisma.media.updateMany({
    where: { originalName: filename },
    data: { deletedAt: new Date() },
  });
}

export async function downloadMedia(filename: string): Promise<Response | null> {
  const provider = getProvider();
  if (!provider.download) return null;
  return provider.download(filename);
}

export function toPublicMediaUrl(url: string | null | undefined): string | null | undefined {
  if (!url || MEDIA_STORAGE_CONFIG.provider !== "s3" || url.includes("/api/v1/media/")) return url;

  try {
    const source = new URL(url);
    const endpoint = MEDIA_STORAGE_CONFIG.endpoint ? new URL(MEDIA_STORAGE_CONFIG.endpoint) : null;
    const bucket = MEDIA_STORAGE_CONFIG.bucket;
    if (!endpoint || !bucket || source.origin !== endpoint.origin) return url;

    const bucketPrefix = `/${bucket}/`;
    const prefixIndex = source.pathname.indexOf(bucketPrefix);
    if (prefixIndex === -1) return url;
    const objectKey = source.pathname.slice(prefixIndex + bucketPrefix.length);
    const publicBaseUrl = (process.env.MEDIA_BASE_URL || process.env.PUBLIC_URL || "").replace(/\/$/, "");
    return `${publicBaseUrl}/api/v1/media/${encodeURIComponent(decodeURIComponent(objectKey))}`;
  } catch {
    return url;
  }
}

export async function cleanupOrphanedMedia() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const failed = await prisma.media.findMany({
    where: { status: "FAILED", createdAt: { lt: thirtyDaysAgo } },
  });
  const stuckUploads = await prisma.media.findMany({
    where: { status: "UPLOADING", createdAt: { lt: oneHourAgo } },
  });
  const provider = getProvider();
  const orphaned = [...failed, ...stuckUploads];
  let deletedCount = 0;
  for (const m of orphaned) {
    try {
      const objectKey = getObjectKeyFromUrl(m.url);
      if (objectKey) await provider.delete(objectKey);
      await prisma.media.delete({ where: { id: m.id } });
      deletedCount++;
    } catch {
    }
  }
  return deletedCount;
}

function getObjectKeyFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    return segments.length > 0 ? decodeURIComponent(segments[segments.length - 1]!) : null;
  } catch {
    return null;
  }
}

export async function getMediaByUrl(url: string) {
  return prisma.media.findFirst({ where: { url } });
}
