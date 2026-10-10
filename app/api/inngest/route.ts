import { serve } from "inngest/next";
import { inngest } from "@/lib/workflows/client";
import {
  generationRecovery,
  generationWorkflow,
} from "@/lib/workflows/generation";

// Public to Clerk, authenticated by the official Inngest signing protocol.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generationWorkflow, generationRecovery],
});
