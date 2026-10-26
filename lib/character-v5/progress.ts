import type { V5Review } from "./contract";

const labels = { face: "Face", back: "Back", front_source: "Front source", front: "Headless Front", sheet: "Character Sheet" } as const;

// A review pause is a user decision, even while the final sheet is invalidated.
// Both the server DTO and client heading use this rule before legacy worker copy.
export function v5ManualReviewProgress(workflow?: Pick<V5Review, "state" | "slot" | "persistenceState">) {
  if (!workflow || !["review", "ready"].includes(workflow.state)) return null;
  const label = labels[workflow.slot];
  if (workflow.persistenceState !== "ready") return {
    title: `${label} image needs attention`,
    message: "Check image storage status in References before reviewing or approving.",
  };
  if (workflow.state === "ready") return {
    title: "Waiting for Character Sheet approval",
    message: "Open References to inspect and approve the Character Sheet.",
  };
  return { title: `Waiting for ${label} review`,
    message: `Open References to accept or reject the ${label}.${workflow.slot === "face" ? " Back starts only after Face acceptance." : " The next step waits for acceptance."}` };
}
