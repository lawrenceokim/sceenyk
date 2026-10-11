export type GenerationQuote = {
  id: string;
  eligibleFreeGeneration: boolean;
  requiredCredits: number | null;
  availableCredits: number;
  freeGenerationsRemaining: number;
  pricingVersion: string;
  pricingMode: "unconfigured" | "test";
  status: "ready" | "insufficient_credits" | "pricing_unavailable";
  expiresAt: string;
  breakdown: {
    durationSeconds: number;
    creationType: string;
    operation: "transformation" | "new_generation";
  };
};
