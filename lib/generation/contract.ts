// Shared application contract; migration 004 mirrors and enforces these rules.
export const generationStatuses = [
  "queued",
  "processing",
  "completed",
  "failed",
] as const;
export const generationStages = [
  "preparing",
  "analyzing",
  "planning",
  "generating",
  "voice",
  "rendering",
] as const;
export type GenerationStatus = (typeof generationStatuses)[number];
export type GenerationStage = (typeof generationStages)[number];
export const generationTransitions: Record<
  GenerationStatus,
  readonly GenerationStatus[]
> = {
  queued: ["processing", "failed"],
  processing: ["completed", "failed"],
  completed: [],
  failed: [],
};
export const generationStatusLabels: Record<GenerationStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};
export const generationStageLabels: Record<GenerationStage, string> = {
  preparing: "Preparing",
  analyzing: "Analyzing your media",
  planning: "Planning your content",
  generating: "Generating",
  voice: "Creating voice",
  rendering: "Rendering",
};
export const generationFailures = {
  PROCESSING_FAILED:
    "This generation couldn’t be completed. Your saved project is still available.",
} as const;
export type GenerationFailureCode = keyof typeof generationFailures;
export function canTransition(from: GenerationStatus, to: GenerationStatus) {
  return generationTransitions[from].includes(to);
}
export function canAdvanceStage(from: GenerationStage, to: GenerationStage) {
  return generationStages.indexOf(to) > generationStages.indexOf(from);
}
