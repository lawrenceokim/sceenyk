import "server-only";
import { inspectPreparedStoryboard, type StoryboardRow } from "./contract";
import { safeRequestId, safeResponseId, providerMetaSchema, type StoryboardRecoveryInfo } from "./recovery-contract";
import { readStoryboardRecovery, stageStoryboardResponse } from "./spool";
import { captureStoryboardResponse } from "./response-capture";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import type { StoryboardValidationReport } from "./validation-diagnostics";

// Pure candidate inspection uses the same normalization/validation as the worker.
// Reads never promote a response, write diagnostics, queue work or contact OpenAI.
export async function savedStoryboardValidations(row: StoryboardRow): Promise<StoryboardValidationReport[]> {
  const reports: StoryboardValidationReport[] = [];
  for (let index = row.requests.length - 1; index >= 0; index--) {
    // One unreadable local slot must not hide a different durable DB response.
    const saved = await localStoryboardRequest(row, index).catch(() => null);
    if (saved && saved.receipt.status === "completed" && saved.receipt.refused !== true) {
      reports.push({ ...inspectPreparedStoryboard(saved.output, row.input).report, requestIndex: index });
    }
  }
  return reports;
}

export async function storyboardRecoveryInfo(row: StoryboardRow): Promise<StoryboardRecoveryInfo> {
  if (!row.requests.length) return { availability: "unavailable", diagnostic: null, metadata: null };
  const index = row.requests.length - 1;
  const validations = await savedStoryboardValidations(row).catch(() => []);
  try {
    const local = await readStoryboardRecovery(row, index);
    const request = row.requests[index];
    const receipt: Record<string, unknown> | undefined = request.receipt ?? local.response?.receipt ?? (local.rawResponse ? { responseId: local.rawResponse.id, status: local.rawResponse.status } : undefined);
    const requestId = safeRequestId.safeParse(receipt?.requestId);
    const responseId = safeResponseId.safeParse(receipt?.responseId);
    const status = providerMetaSchema.shape.providerStatus.safeParse(receipt?.status);
    // Reflect a terminal receipt rather than an earlier response.created status.
    const metadata = local.metadata && receipt?.status ? { ...local.metadata,
      providerStatus: ["queued", "in_progress", "completed", "failed", "incomplete", "cancelled"].includes(String(receipt.status)) ? receipt.status as NonNullable<typeof local.metadata>["providerStatus"] : "unknown" as const } : local.metadata;
    return { availability: validations.length || request.output !== undefined || local.response || local.rawResponse ? "saved_response" :
      local.metadata?.stored && local.metadata.responseId ? "provider_retrievable" : "unavailable",
      diagnostic: local.diagnostic, metadata, validations, receipt: { requestId: requestId.success ? requestId.data : null,
        responseId: responseId.success ? responseId.data : null, status: status.success ? status.data : null } };
  } catch { return { availability: validations.length ? "saved_response" : "checking_failed", diagnostic: null, metadata: null, validations }; }
}

// Local-only by construction: no generation OR retrieval adapter import.
async function localStoryboardRequest(row: StoryboardRow, index: number) {
  const request = row.requests[index];
  if (request?.output !== undefined) return { output: request.output, receipt: request.receipt ?? {} };
  const local = await readStoryboardRecovery(row, index);
  if (local.response) return local.response;
  if (local.rawResponse) {
    const raw = local.rawResponse;
    const responseId = safeResponseId.safeParse(raw.id);
    if (!responseId.success || local.metadata?.responseId && raw.id !== local.metadata.responseId || !Array.isArray(raw.output)) throw new Error("STORYBOARD_RECOVERY_INVALID");
    const result = captureStoryboardResponse(raw as unknown as OpenAIResponse, { responseId: responseId.data,
      requestId: local.metadata?.requestId ?? null, clientRequestId: local.metadata?.clientRequestId ?? null, stored: local.metadata?.stored ?? null });
    return result;
  }
  return null;
}
export async function recoverStoryboardRequest(row: StoryboardRow, index: number) {
  const result = await localStoryboardRequest(row, index);
  if (result && row.requests[index]?.output === undefined) await stageStoryboardResponse(row, index, result);
  return result;
}
