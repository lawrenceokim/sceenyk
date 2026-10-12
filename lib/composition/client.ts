import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { workerConnection } from "@/lib/media-preparation/config";
import { signWorkerRequest, workerTimestampHeader, workerNonceHeader, workerSignatureHeader } from "@/lib/media-preparation/auth";

export async function requestCompositionInspection(generationJobId: string, sceneExecutionId: string) {
  const worker = workerConnection(), body = JSON.stringify({ generationJobId, sceneExecutionId });
  const timestamp = String(Date.now()), nonce = randomUUID();
  try {
    const response = await fetch(new URL("/inspect", worker.url), { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(240_000),
      headers: { "Content-Type": "application/json", [workerTimestampHeader]: timestamp, [workerNonceHeader]: nonce, [workerSignatureHeader]: signWorkerRequest(worker.secret, "POST", "/inspect", timestamp, nonce, body) }, body });
    if (!response.ok) { await response.body?.cancel(); throw new Error("COMPOSITION_WORKER_UNAVAILABLE"); }
    return z.strictObject({ ready: z.boolean() }).parse(await response.json());
  } catch { throw new Error("COMPOSITION_WORKER_UNAVAILABLE"); }
}
