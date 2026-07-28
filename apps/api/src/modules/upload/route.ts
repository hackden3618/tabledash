/**
 * Purpose: File & Image Upload Management Route for tableDash backend.
 * Responsibilities: Handles multipart image uploads for menu items, saves them to local disk storage,
 *   and serves static upload URLs (/uploads/:filename).
 * Dependencies: Elysia, Bun.file, node:fs/promises, node:path.
 * When to modify: When changing upload file size limits, allowed extensions, or storage providers.
 */

import { jwt } from "@elysiajs/jwt";
import { Elysia, t } from "elysia";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { env } from "../../../../../shared/config";
import { verifyAdminToken } from "../auth/service";

// Ensure uploads directory exists inside apps/api/uploads
const UPLOAD_DIR = join(process.cwd(), "apps", "api", "uploads");
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const uploadRoute = new Elysia({ prefix: "/api/v1" })
  .use(
    jwt({
      name: "jwt",
      secret: env.jwtSecret,
    })
  )
  // Serve static files from /uploads/:filename
  .get("/uploads/:filename", async ({ params: { filename }, set }) => {
    const filePath = join(UPLOAD_DIR, filename);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      set.status = 404;
      return { success: false, error: "File not found" };
    }

    return file;
  })

  // POST /api/v1/upload — upload an image file (admin only)
  .post(
    "/upload",
    async ({ body, set, headers, jwt }) => {
      const authHeader = headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        set.status = 401;
        return { success: false, error: "Missing or invalid authorization header" };
      }
      const token = authHeader.split(" ")[1] ?? "";
      try { await verifyAdminToken(token, (t) => jwt.verify(t)); }
      catch { set.status = 401; return { success: false, error: "Invalid or expired session token" }; }
      const file = body.file as File;
      const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

      if (!file) {
        set.status = 400;
        return { success: false, error: "No image file uploaded" };
      }

      if (file.size > MAX_SIZE) {
        set.status = 400;
        return { success: false, error: "File size exceeds 5 MB limit" };
      }

      // Validate mime type
      if (!file.type.startsWith("image/")) {
        set.status = 400;
        return { success: false, error: "Only image files (PNG, JPG, WEBP) are allowed" };
      }

      // Generate unique file name
      const ext = file.name.split(".").pop() || "png";
      const filename = `img-${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`;
      const destination = join(UPLOAD_DIR, filename);

      const arrayBuffer = await file.arrayBuffer();
      await Bun.write(destination, arrayBuffer);

      const publicUrl = process.env.PUBLIC_URL ?? "http://localhost:3000";
      const imageUrl = `${publicUrl}/api/v1/uploads/${filename}`;

      return {
        success: true,
        data: {
          url: imageUrl,
          filename: filename,
        },
      };
    },
    {
      body: t.Object({
        file: t.File({
          description: "Menu item image file",
        }),
      }),
      detail: {
        tags: ["Menu"],
        summary: "Upload image file for menu items",
      },
    }
  );
