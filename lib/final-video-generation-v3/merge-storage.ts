import "server-only";
import { ServiceOperationError } from "@/lib/diagnostics/service-failure";

export async function mergeStorageOperation<T>(operation: string, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof ServiceOperationError) throw error;
    // Integrity/scope failures keep their existing safety contract. Upstream
    // failures get classified without retaining raw URLs/keys/messages in logs.
    if (error instanceof Error && /^V3_/.test(error.message) && !error.cause) throw error;
    throw new ServiceOperationError(error, "storage", operation, "V3_STORAGE");
  }
}
