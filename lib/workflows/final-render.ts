import "server-only";
import { NonRetriableError } from "inngest";
import { createDatabaseClient } from "@/lib/db/server";
import { generationEventSchema } from "@/lib/generation/dispatch-contract";
import { requestFinalRender } from "@/lib/final-render/client";
import { inngest } from "./client";

export const finalRenderRequested="sceenyk/generation.render.requested";
export const finalRenderWorkflow=inngest.createFunction({id:"generation-final-render",triggers:{event:finalRenderRequested},retries:4},async({event,step})=>{
  const parsed=generationEventSchema.safeParse(event.data);if(!parsed.success)throw new NonRetriableError("INVALID_RENDER_EVENT");
  const renderJobId=await step.run("create-or-reuse-render-job",async()=>{const r=await createDatabaseClient().rpc("ensure_render_job",{p_job_id:parsed.data.generationJobId});if(r.error)throw new Error("RENDER_DATABASE_UNAVAILABLE");return r.data;});
  if(!renderJobId)return{handoff:"not_ready"};
  for(let poll=0;poll<60;poll++){
    const status=await step.run(`dispatch-inspect-render-${poll}`,async()=>{
      const db=createDatabaseClient();
      const r=await db.from("render_jobs").select("status,lease_expires_at").eq("id",renderJobId).single();if(r.error||!r.data)throw new Error("RENDER_DATABASE_UNAVAILABLE");
      if(r.data.status==='completed'||r.data.status==='failed')return r.data.status;
      if(!r.data.lease_expires_at||Date.parse(r.data.lease_expires_at)<=Date.now())await requestFinalRender(renderJobId);
      return 'pending';
    });
    if(status==='failed')return{handoff:"render_failed"};
    if(status==='completed'){
      const completed=await step.run("finalize-verified-output",async()=>{const r=await createDatabaseClient().rpc("finalize_render_generation",{p_render_id:renderJobId});if(r.error||!r.data)throw new Error("RENDER_FINALIZATION_UNAVAILABLE");return true;});
      return{handoff:"generation_completed",completed};
    }
    await step.sleep(`render-poll-wait-${poll}`,"30s");
  }
  // No automatic refund on workflow timeout: worker or persisted bytes may
  // still exist. Minute reconciliation resumes from the durable render state.
  return{handoff:"render_recovery_pending"};
});
