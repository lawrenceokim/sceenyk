import "server-only";
import { z } from "zod";
import { FinalVideoError } from "./contract";

// An operator identity is separate from the original immutable funding hash.
// The server's authenticated app-user identity must match; clients cannot set it.
export function isFinalOperator(ownerId: string) {
  const configured = z.uuid().safeParse(process.env.UGC_FINAL_OPERATOR_USER_ID);
  return configured.success && configured.data === ownerId;
}
export function assertFinalOperator(ownerId: string) {
  if (!isFinalOperator(ownerId)) throw new FinalVideoError("FINAL_OPERATOR_SETUP_REQUIRED", 403);
}
