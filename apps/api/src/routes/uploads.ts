import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import path from "path";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/uploads/presign
  // Body: { filename, contentType, size }
  // Returns: { uploadUrl, publicUrl } — browser PUTs directly to uploadUrl
  app.post<{
    Body: { filename: string; contentType: string; size: number };
  }>(
    "/presign",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { filename, contentType, size } = req.body ?? {};

      if (!ALLOWED_TYPES.has(contentType)) {
        return reply.code(400).send({
          error: "InvalidFileType",
          message: "Only jpg, png, gif, webp are accepted",
          statusCode: 400,
        });
      }

      if (!Number.isFinite(size) || size > MAX_BYTES) {
        return reply.code(400).send({
          error: "FileTooLarge",
          message: "File must be under 5 MB",
          statusCode: 400,
        });
      }

      const ext = path.extname(filename).toLowerCase() || ".jpg";
      const objectKey = `uploads/${req.user.sub}/${randomUUID()}${ext}`;

      // Presigned PUT URL valid for 5 minutes
      const uploadUrl = await app.minio.presignedPutObject(
        app.minioBucket,
        objectKey,
        5 * 60
      );

      // Public URL for reading the object after upload
      const publicBase = process.env.MINIO_PUBLIC_URL ?? "http://localhost:9000";
      const publicUrl = `${publicBase}/${app.minioBucket}/${objectKey}`;

      return reply.send({ data: { uploadUrl, publicUrl } });
    }
  );
};
