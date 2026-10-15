// Safe UI copy only. Provider codes, references and private schemas stay server-side.
export const payoutCheckMessages = {
  paid: "Provider confirms Paid.",
  processing: "Still Processing. The same payout remains unresolved.",
  definitive_failure: "Definitive Failure. Existing accounting handles valid fund restoration once.",
  needs_review: "Needs Review. Financial state was preserved for investigation.",
  provider_unavailable: "Provider unavailable. Financial state was preserved.",
  not_submitted: "This withdrawal has not been submitted. Automatic payout processing remains authoritative.",
} as const;
export type PayoutCheckOutcome = keyof typeof payoutCheckMessages;
export const missingPayoutReferenceMessage = "Provider reference missing. Manual provider investigation required.";
