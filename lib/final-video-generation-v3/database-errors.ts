import "server-only";
import { ServiceOperationError } from "@/lib/diagnostics/service-failure";

export class V3DatabaseError extends ServiceOperationError {
  constructor(error: unknown, operation: string, code?: string, status?: number) { super(error, "database", operation, "V3_DATABASE", code, status); this.name = "V3DatabaseError"; }
}
export function v3DatabaseFailure(error: unknown, operation: string, status?: number): never {
  if (error instanceof ServiceOperationError) throw error;
  throw new V3DatabaseError(error, operation, undefined, status);
}
