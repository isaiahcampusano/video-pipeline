import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config } from "../config.js";

export const s3Client = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  forcePathStyle: config.s3.forcePathStyle,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
});

export async function ensureBucket(): Promise<void> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
  } catch {
    await s3Client.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
  }
}

export async function checkStorage(): Promise<void> {
  await s3Client.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
}

export async function uploadFile(
  key: string,
  filePath: string,
  contentType = "application/octet-stream",
): Promise<number> {
  const fileStat = await stat(filePath);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: fileStat.size,
      ContentType: contentType,
    }),
  );
  return fileStat.size;
}

export async function downloadFile(key: string, destination: string): Promise<void> {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }),
  );
  if (!response.Body) throw new Error(`S3 object has no body: ${key}`);
  await pipeline(response.Body.transformToWebStream(), createWriteStream(destination));
}

export async function deleteObject(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }),
  );
}
