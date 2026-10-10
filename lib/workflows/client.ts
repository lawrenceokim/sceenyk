import "server-only";
import { Inngest } from "inngest";

// Explicit local opt-in. NODE_ENV=production always keeps SDK verification on,
// including when someone accidentally deploys INNGEST_DEV=1.
export function workflowDevelopmentMode() {
  return (
    process.env.NODE_ENV !== "production" && process.env.INNGEST_DEV === "1"
  );
}

export const inngest = new Inngest({
  id: "sceenyk",
  isDev: workflowDevelopmentMode(),
  // SDK errors can contain upstream response details; retain only safe codes.
  logger: {
    debug: () => {},
    info: () => {},
    warn: () =>
      console.warn("Workflow SDK warning.", { code: "WORKFLOW_WARNING" }),
    error: () =>
      console.error("Workflow SDK error.", { code: "WORKFLOW_ERROR" }),
  },
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      cache: "no-store",
      signal: init?.signal ?? AbortSignal.timeout(10_000),
    }),
});
