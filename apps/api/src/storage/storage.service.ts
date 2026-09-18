import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import type { EnvConfig } from "../config/env.validation";

export interface PutObjectResult {
  key: string;
  url: string;
}

/**
 * Thin abstraction over S3-compatible object storage (§6). Everything else
 * in the app talks to this service, never to @aws-sdk directly — swapping
 * MinIO for AWS S3/Cloudflare R2/Backblaze later means changing the env
 * vars this reads, not any calling code.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase: string;

  constructor(configService: ConfigService<EnvConfig, true>) {
    const endpoint = configService.get("S3_ENDPOINT", { infer: true });
    const accessKeyId = configService.get("S3_ACCESS_KEY", { infer: true });
    const secretAccessKey = configService.get("S3_SECRET_KEY", { infer: true });
    this.bucket = configService.get("S3_BUCKET", { infer: true });
    this.publicUrlBase = (configService.get("S3_PUBLIC_URL", { infer: true }) || "").replace(/\/$/, "");

    this.client = new S3Client({
      endpoint,
      region: configService.get("S3_REGION", { infer: true }),
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
      forcePathStyle: true, // required for MinIO / most non-AWS S3-compatible providers
    });
  }

  /** Builds a collision-proof key under a folder, keeping the original extension. */
  buildKey(folder: string, originalName: string): string {
    const ext = originalName.includes(".") ? originalName.split(".").pop() : undefined;
    const filename = ext ? `${randomUUID()}.${ext.toLowerCase()}` : randomUUID();
    return `${folder}/${filename}`;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<PutObjectResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return { key, url: this.publicUrl(key) };
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      // Deletion failures here shouldn't block the DB-side cleanup that
      // triggered them — log and move on; an orphaned object costs storage,
      // not correctness.
      this.logger.warn(`Failed to delete object ${key}: ${(error as Error).message}`);
    }
  }

  publicUrl(key: string): string {
    return `${this.publicUrlBase}/${key}`;
  }

  /** Used by /health/ready (Phase 1+ TODO wiring — see health.controller.ts). */
  async isHealthy(): Promise<boolean> {
    try {
      // A lightweight call that requires valid credentials + reachability,
      // without needing any object to exist.
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: `.health/${randomUUID()}`,
          Body: Buffer.from("ok"),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
