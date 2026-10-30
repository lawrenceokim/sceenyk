import "server-only";
import { z } from "zod";

export function v3LocalEnabled() { return process.env.NODE_ENV === "development" && process.env.UGC_V3_ENABLED === "1"; }
export function assertV3Operator(ownerId: string) {
  if (!v3LocalEnabled() || process.env.UGC_V3_OPERATOR_USER_ID !== ownerId) throw new Error("V3_LOCAL_OPERATOR_REQUIRED");
}
export function v3TransportConfig() {
  return { enabled: v3LocalEnabled() && process.env.UGC_V3_HIGGSFIELD_ENABLED === "1",
    projectId: process.env.UGC_V3_ACTIVATION_PROJECT_ID ?? "", packageId: process.env.UGC_V3_ACTIVATION_PACKAGE_ID ?? "",
    credentials: process.env.UGC_V3_HIGGSFIELD_CREDENTIALS ?? "", accountScope: process.env.UGC_V3_HIGGSFIELD_ACCOUNT_SCOPE ?? "",
    outputHosts: (process.env.UGC_V3_HIGGSFIELD_OUTPUT_HOSTS ?? "").split(",").map(s => s.trim()).filter(Boolean) };
}
export function assertV3Transport(config: ReturnType<typeof v3TransportConfig>, scope: { projectId: string; packageId: string }) {
  if (!config.enabled) throw new Error("PAID_V3_EXECUTION_DISABLED");
  if (config.projectId !== scope.projectId || config.packageId !== scope.packageId || !z.uuid().safeParse(scope.projectId).success ||
    !z.uuid().safeParse(scope.packageId).success || !/^[^\s:]+:[^\s:]+$/.test(config.credentials)) throw new Error("V3_ACTIVATION_SCOPE_MISMATCH");
}
export function v3OpenAIConfig() {
  const config = { apiKey: process.env.OPENAI_API_KEY?.trim() ?? "", imageModel: process.env.OPENAI_V3_IMAGE_MODEL?.trim() ?? "",
    directorModel: process.env.OPENAI_V3_DIRECTOR_MODEL?.trim() ?? "" };
  if (!v3LocalEnabled() || process.env.UGC_V3_OPENAI_ENABLED !== "1" || !config.apiKey ||
    ![config.imageModel, config.directorModel].every(m => /^[a-zA-Z0-9._:-]{1,200}$/.test(m))) throw new Error("V3_OPENAI_DISABLED_OR_UNCONFIGURED");
  return config;
}
