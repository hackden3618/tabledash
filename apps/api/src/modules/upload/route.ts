/**
 * Purpose: File & Image Upload Management Route for tableDash backend.
 * Responsibilities: Handles multipart image uploads for menu items, saves them to local disk storage,
 *   and serves static upload URLs (/uploads/:filename).
 * Dependencies: Elysia, Bun.file, node:fs/promises, node:path.
 * When to modify: When changing upload file size limits, allowed extensions, or storage providers.
 */

import { Elysia, t } from "elysia";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Ensure uploads directory exists inside apps/api/uploads
const UPLOAD_DIR = join(process.cwd(), "apps", "api", "uploads");
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const uploadRoute = new Elysia({ prefix: "/api/v1" })
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

  // POST /api/v1/upload — upload an image file
  .post(
    "/upload",
    async ({ body, set }) => {
      const file = body.file as File;

      if (!file) {
        set.status = 400;
        return { success: false, error: "No image file uploaded" };
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

      const imageUrl = `http://localhost:3000/api/v1/uploads/${filename}`;

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
