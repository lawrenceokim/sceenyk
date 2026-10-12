import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { workerConnection } from "@/lib/media-preparation/config";
import { signWorkerRequest, workerTimestampHeader, workerNonceHeader, workerSignatureHeader } from "@/lib/media-preparation/auth";

export async function requestNarration(generationJobId: string, sceneExecutionId: string) {
  const worker = workerConnection(), url = new URL("/narrate", worker.url).toString();
  const body = JSON.stringify({ generationJobId, sceneExecutionId }), timestamp = String(Date.now()), nonce = randomUUID();
  try {
    const response = await fetch(url, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(240_000),
      headers: { "Content-Type": "application/json", [workerTimestampHeader]: timestamp, [workerNonceHeader]: nonce, [workerSignatureHeader]: signWorkerRequest(worker.secret, "POST", "/narrate", timestamp, nonce, body) }, body });
    if (!response.ok) { await response.body?.cancel(); throw new Error("NARRATION_WORKER_UNAVAILABLE"); }
    return z.strictObject({ ready: z.boolean() }).parse(await response.json());
  } catch { throw new Error("NARRATION_WORKER_UNAVAILABLE"); }
}
