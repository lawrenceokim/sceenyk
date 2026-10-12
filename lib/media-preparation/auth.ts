import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const workerAuthWindowMs = 5 * 60_000;
export const workerTimestampHeader = "x-worker-timestamp";
export const workerSignatureHeader = "x-worker-signature";

export function workerSharedSecret() {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (process.env.NEXT_PUBLIC_WORKER_SHARED_SECRET || !secret || secret.length < 32 || secret !== secret.trim()) {
    throw new Error("WORKER_SECRET_REQUIRED");
  }
  return secret;
}

// UTF-8 metadata separated by newlines, followed by the unmodified body bytes.
// Timestamp: Unix milliseconds. Signature: lowercase hexadecimal SHA-256 HMAC.
export function signWorkerRequest(secret: string, method: string, path: string, timestamp: string, body: string | Buffer) {
  return createHmac("sha256", secret).update(`${method}\n${path}\n${timestamp}\n`).update(body).digest("hex");
}

export function verifyWorkerRequest(secret: string, method: string, path: string, timestamp: string | undefined, signature: string | undefined, body: Buffer, now = Date.now()) {
  if (!timestamp || !/^\d{13}$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const time = Number(timestamp);
  if (!Number.isSafeInteger(time) || Math.abs(now - time) > workerAuthWindowMs) return false;
  const expected = Buffer.from(signWorkerRequest(secret, method, path, timestamp, body), "hex");
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
