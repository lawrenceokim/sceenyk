import { serve } from "inngest/next";
import type { NextRequest } from "next/server";
import { localJobsOnly } from "@/lib/workflows/execution-policy";
import { inngest } from "@/lib/workflows/client";
import { visualWorkflow } from "@/lib/workflows/visuals";
import { narrationWorkflow } from "@/lib/workflows/narration";
import { compositionWorkflow } from "@/lib/workflows/composition";
import { finalRenderWorkflow } from "@/lib/workflows/final-render";
import { captionsWorkflow, captionsRecovery } from "@/lib/workflows/captions";
import { marketplaceEarningsReconciliation } from "@/lib/workflows/marketplace-earnings";
import { creatorPayoutReconciliation } from "@/lib/workflows/creator-payouts";
import {
  generationRecovery,
  generationWorkflow,
} from "@/lib/workflows/generation";

// Public to Clerk, authenticated by the official Inngest signing protocol.
export const maxDuration = 300;
const handlers = serve({
  client: inngest,
  functions: [generationWorkflow, generationRecovery, visualWorkflow, narrationWorkflow, compositionWorkflow, finalRenderWorkflow, captionsWorkflow, captionsRecovery, marketplaceEarningsReconciliation, creatorPayoutReconciliation],
});

function disabledResponse() {
  return Response.json({ error: "WORKFLOW_EXECUTION_DISABLED" }, {
    status: 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: NextRequest, context: unknown) {
  return localJobsOnly() ? disabledResponse() : handlers.GET(request, context);
}

export async function POST(request: NextRequest, context: unknown) {
  return localJobsOnly() ? disabledResponse() : handlers.POST(request, context);
}

export async function PUT(request: NextRequest, context: unknown) {
  return localJobsOnly() ? disabledResponse() : handlers.PUT(request, context);
}
