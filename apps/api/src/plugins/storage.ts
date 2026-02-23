import fp from "fastify-plugin";
import { Client as MinioClient } from "minio";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    minio: MinioClient;
    minioBucket: string;
  }
}

const PUBLIC_READ_POLICY = (bucket: string) =>
  JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });

const plugin: FastifyPluginAsync = async (app) => {
  const endPoint = process.env.MINIO_ENDPOINT ?? "localhost";
  const port = Number(process.env.MINIO_PORT ?? 9000);
  const useSSL = process.env.MINIO_USE_SSL === "true";
  const accessKey = process.env.MINIO_ACCESS_KEY ?? "minioadmin";
  const secretKey = process.env.MINIO_SECRET_KEY ?? "minioadmin";
  const bucket = process.env.MINIO_BUCKET ?? "tweets";

  const minio = new MinioClient({ endPoint, port, useSSL, accessKey, secretKey });

  // Auto-create bucket and set public-read policy on first run
  const exists = await minio.bucketExists(bucket);
  if (!exists) {
    await minio.makeBucket(bucket);
    await minio.setBucketPolicy(bucket, PUBLIC_READ_POLICY(bucket));
    app.log.info(`MinIO bucket "${bucket}" created`);
  }

  app.decorate("minio", minio);
  app.decorate("minioBucket", bucket);
};

export const storagePlugin = fp(plugin, { name: "storage" });
