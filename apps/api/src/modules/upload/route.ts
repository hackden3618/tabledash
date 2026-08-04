import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { env } from "../../../../../shared/config";
import { verifyAdminToken } from "../auth/service";
import { downloadMedia, uploadMedia } from "../media/service";
import { getLocalUploadPath } from "../media/local";
import { MEDIA_STORAGE_CONFIG } from "../media/types";
import { existsSync } from "node:fs";

export const uploadRoute = new Elysia({ prefix: "/api/v1" })
  .use(
    jwt({
      name: "jwt",
      secret: env.jwtSecret,
    })
  )
  // Local storage is intentionally development-only. Production serves images
  // directly from object storage/CDN rather than this application container.
  .get("/uploads/:filename", ({ params, set }) => {
    if (MEDIA_STORAGE_CONFIG.provider !== "local" || !/^[a-zA-Z0-9._-]+$/.test(params.filename)) {
      set.status = 404;
      return { success: false, error: "File not found" };
    }
    const filePath = getLocalUploadPath(params.filename);
    if (!existsSync(filePath)) {
      set.status = 404;
      return { success: false, error: "File not found" };
    }
    return new Response(Bun.file(filePath));
  }, { params: t.Object({ filename: t.String() }) })
  .get("/media/:filename", async ({ params, set }) => {
    if (MEDIA_STORAGE_CONFIG.provider !== "s3" || !/^[a-zA-Z0-9._-]+$/.test(params.filename)) {
      set.status = 404;
      return { success: false, error: "File not found" };
    }

    const upstream = await downloadMedia(params.filename);
    if (!upstream || !upstream.ok || !upstream.body) {
      set.status = upstream?.status === 404 ? 404 : 502;
      return { success: false, error: "File not found" };
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }, { params: t.Object({ filename: t.String() }) })
  .post(
    "/upload",
    async ({ body, set, headers, jwt }) => {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { success: false, error: "Missing or invalid authorization header" };
      }
      const token = authHeader.split(" ")[1] ?? "";
      let adminHotelId: string | undefined;
      try {
        const admin = await verifyAdminToken(token, (t) => jwt.verify(t));
        if (!admin.hotelId) throw new Error("This account is not assigned to a hotel");
        adminHotelId = admin.hotelId;
      } catch {
        set.status = 403;
        return { success: false, error: "Invalid session or hotel assignment" };
      }
      const file = body.file as File;
      const MAX_SIZE = 10 * 1024 * 1024;

      if (!file) {
        set.status = 400;
        return { success: false, error: "No image file uploaded" };
      }

      if (file.size > MAX_SIZE) {
        set.status = 400;
        return { success: false, error: "File size exceeds 10 MB limit" };
      }

      if (!file.type.startsWith("image/")) {
        set.status = 400;
        return { success: false, error: "Only image files (PNG, JPG, WEBP) are allowed" };
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      try {
        const result = await uploadMedia(buffer, file.name, {
          hotelId: adminHotelId,
        });
        return { success: true, data: result };
      } catch (err: any) {
        set.status = 500;
        return { success: false, error: err.message || "Upload failed" };
      }
    },
    {
      body: t.Object({
        file: t.File({ description: "Image file (PNG, JPG, WEBP, max 10 MB)" }),
      }),
      detail: {
        tags: ["Media"],
        summary: "Upload an image file to object storage",
      },
    }
  );
