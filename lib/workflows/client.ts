import "server-only";
import { Inngest } from "inngest";
import { localJobsOnly } from "./execution-policy";

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
  fetch: async (input, init) => {
    if (localJobsOnly()) throw new Error("WORKFLOW_EXECUTION_DISABLED");
    return fetch(input, {
      ...init,
      cache: "no-store",
      signal: init?.signal ?? AbortSignal.timeout(10_000),
    });
  },
});
