import type { GenerationStatus } from "@/lib/generation/contract";

// Presentation state only; final approval never rewrites a generation job.
export type ProjectCardStatus = GenerationStatus | "final_approved" | "unavailable" | null;
