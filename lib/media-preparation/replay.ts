import "server-only";
import { createDatabaseClient } from "@/lib/db/server";

export type WorkerRequestRegistration = "accepted" | "replay" | "unauthorized";

// Supabase is the shared authority across processes, deployments and restarts.
// Never fall back to process memory if this RPC is unavailable.
export async function registerWorkerRequest(nonce: string, timestamp: string): Promise<WorkerRequestRegistration> {
  const { data, error } = await createDatabaseClient().rpc("register_media_worker_request", {
    p_nonce: nonce,
    p_timestamp_ms: Number(timestamp),
  });
  if (error || !["accepted", "replay", "unauthorized"].includes(data ?? "")) throw new Error("WORKER_REPLAY_DATABASE_UNAVAILABLE");
  return data as WorkerRequestRegistration;
}
