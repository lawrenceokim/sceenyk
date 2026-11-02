import { serve } from "inngest/next";
import type { NextRequest } from "next/server";
import { inngestExecutionPaused, localJobsOnly } from "@/lib/workflows/execution-policy";
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

// TEMPORARILY disconnected from app/api/inngest/route.ts (2026-11-02).
// Keep the full signed implementation and all ten functions for restoration.
// Nothing in the deployed route imports this module while paused.
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
  return inngestExecutionPaused() || localJobsOnly() ? disabledResponse() : handlers.GET(request, context);
}

export async function POST(request: NextRequest, context: unknown) {
  return inngestExecutionPaused() || localJobsOnly() ? disabledResponse() : handlers.POST(request, context);
}

export async function PUT(request: NextRequest, context: unknown) {
  return inngestExecutionPaused() || localJobsOnly() ? disabledResponse() : handlers.PUT(request, context);
}
