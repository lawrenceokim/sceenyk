export type ReferenceDiagnostics = {
  provider: "openai"; model: string | null; taskId: string; stage: string; httpStatus: number | null; requestId: string | null;
  errorCode: string | null; responseSaved: boolean; imageSaved: boolean; imageOutputAvailable: boolean;
  providerCode?: string | null;
  recoveryAvailable: boolean; canStartNew: boolean; category: "ready" | "saved" | "storage" | "validation" | "provider_failed" | "unknown" | "unusable" | "stale" | "pending" | "source" | "response_save";
};
export function referenceFailureLabel(kind: string, diagnostics?: ReferenceDiagnostics | null) {
  const subject = kind === "product" ? "Product Sheet" : kind === "character" ? "Character Sheet" : "Location";
  switch (diagnostics?.category) {
    case "saved": return `${subject} response saved — recovery required`;
    case "storage": return `${subject} storage failed`;
    case "validation": return `${subject} validation failed`;
    case "provider_failed": return `OpenAI ${subject} request failed`;
    case "source": return `${subject} source processing failed`;
    case "response_save": return `${subject} response could not be saved`;
    case "unknown": return `OpenAI ${subject} outcome unknown — no saved response`;
    case "unusable": return `Saved ${kind === "product" ? "Product" : kind === "character" ? "Character" : "Location"} response is unusable`;
    case "stale": return `${subject} saved output is outdated`;
    default: return `${subject} response unavailable`;
  }
}
