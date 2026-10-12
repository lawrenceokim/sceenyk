import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { compositionPlanSchema } from "@/lib/composition/contract";
import { inspectR2Object, putR2FinalOutput } from "@/lib/storage/r2";
import { renderRequestSchema, renderConfiguration, outputMetadataSchema, RenderError } from "./contract";
import { downloadPrivateMedia, fileSha256, muxNarration, runRenderer, serveLocalMedia, validateFinalFile } from "./media";

const assetSchema=z.object({kind:z.enum(["scene_asset","prepared_segment","project_asset","narration_asset"]),id:z.uuid(),storage_key:z.string().min(1),verified_etag:z.string().min(1),size_bytes:z.number().int().positive().max(renderConfiguration.maximumInputBytes),mime_type:z.string()});
const unavailable=()=>new RenderError("RENDER_UNAVAILABLE",true);

export async function executeRender(renderJobId: string,leaseId: string) {
  const db=createDatabaseClient(),ref={p_render_id:renderJobId,p_lease_id:leaseId};
  let directory:string|undefined,local:Awaited<ReturnType<typeof serveLocalMedia>>|undefined;
  let stage="dispatched",verifiedRemote=false,attempt=0;
  const abort=new AbortController();
  const advance=async(next:string)=>{const r=await db.rpc("advance_render_job",{...ref,p_status:next});if(r.error||!r.data)throw unavailable();stage=next;};
  const heartbeat=setInterval(()=>{void advance(stage).catch(()=>abort.abort());},20_000);
  try {
    const r=await db.from("render_jobs").select("*").eq("id",renderJobId).eq("lease_id",leaseId).single();
    if(r.error||!r.data)throw unavailable();const job=r.data;attempt=job.worker_attempts;
    const c=await db.from("composition_plans").select("*").eq("job_id",job.composition_plan_id).eq("owner_user_id",job.owner_user_id).eq("project_id",job.project_id).single();
    if(c.error)throw unavailable();const parsed=compositionPlanSchema.safeParse(c.data?.plan);
    if(!parsed.success||parsed.data.status!=="ready"||c.data?.input_digest!==job.composition_digest||parsed.data.generation_job_id!==job.generation_job_id)throw new RenderError("SOURCE_UNAVAILABLE");
    const plan=parsed.data,key=`users/${job.owner_user_id}/generations/${job.generation_job_id}/result.mp4`;
    directory=await fs.mkdtemp(path.join(tmpdir(),"sceenyk-final-render-"));
    const output=path.join(directory,"output.mp4"),persisted=path.join(directory,"persisted.mp4");
    const existing=await inspectR2Object(key);
    let renderDurationMs=0,observedRssBytes=process.memoryUsage().rss,createdOutput=false;
    if(!existing){
      if(job.worker_attempts>renderConfiguration.maximumAttempts)throw new RenderError("RENDER_FAILED");
      await advance("rendering");
      const files=new Map<string,string>();let inputBytes=0;
      for(const scene of plan.scenes)for(const track of ["visual","narration"] as const){
        const selected=scene[track];if(!selected)continue;
        const resolved=await db.rpc("composition_asset_ref",{p_scene_id:scene.scene_execution_id,p_track:track});
        if(resolved.error)throw unavailable();const a=assetSchema.safeParse(resolved.data);
        if(!a.success||a.data.id!==selected.asset_id||(track==="visual"&&a.data.kind!==scene.visual?.asset_kind)||!a.data.storage_key.startsWith(`users/${job.owner_user_id}/projects/${job.project_id}/`))throw new RenderError("SOURCE_UNAVAILABLE");
        if(files.has(a.data.id))continue;inputBytes+=a.data.size_bytes;if(inputBytes>renderConfiguration.maximumInputBytes)throw new RenderError("SOURCE_UNAVAILABLE");
        const file=path.join(directory,a.data.id);await downloadPrivateMedia(a.data,file);files.set(a.data.id,file);
      }
      local=await serveLocalMedia(files);
      await fs.writeFile(path.join(directory,"input.json"),JSON.stringify({plan,sources:local.sources}),{flag:"wx"});
      const start=Date.now();await runRenderer(directory,abort.signal);await muxNarration(directory,files,plan);renderDurationMs=Date.now()-start;
      const metrics=JSON.parse(await fs.readFile(path.join(directory,"metrics.json"),"utf8"));
      observedRssBytes=Math.max(observedRssBytes,Number(metrics.observedRssBytes)||0);
      const generated=await validateFinalFile(output,plan);
      await advance("uploading");
      createdOutput=await putR2FinalOutput(key,output,generated.sizeBytes);
    }
    await advance("verifying");
    const head=await inspectR2Object(key);
    if(!head?.etag||!head.sizeBytes||head.mimeType!=="video/mp4")throw new RenderError("INVALID_OUTPUT");
    await downloadPrivateMedia({storage_key:key,verified_etag:head.etag,size_bytes:head.sizeBytes,mime_type:"video/mp4"},persisted,renderConfiguration.maximumOutputBytes);
    const final=await validateFinalFile(persisted,plan);
    verifiedRemote=true;
    if(createdOutput&&await fileSha256(output)!==final.sha256)throw unavailable();
    if(abort.signal.aborted)throw unavailable();
    const metadata=outputMetadataSchema.parse({...final,etag:head.etag,renderDurationMs,observedRssBytes});
    const complete=await db.rpc("complete_render_job",{...ref,p_metadata:metadata});
    if(complete.error||!complete.data)throw unavailable();
    console.info(JSON.stringify({stage:"final_render_verified",renderJobId,sceneCount:plan.scenes.length,totalDurationMs:plan.total_duration_ms,renderDurationMs,outputBytes:final.sizeBytes,width:final.width,height:final.height,fps:final.fps,observedNodeRssBytes:observedRssBytes,recovered:!!existing}));
  } catch(error) {
    // Unknown R2/network/DB/upload responses are recoverable. In particular an
    // uploaded/verified result is never refunded because acknowledgement failed.
    if(error instanceof RenderError&&!error.temporary&&!verifiedRemote&&!(error.code==="RENDER_TIMEOUT"&&attempt<renderConfiguration.maximumAttempts)){
      const failed=await db.rpc("fail_render_job",{...ref,p_error:error.code});if(failed.error)throw unavailable();
    }else{const released=await db.rpc("release_render_lease",ref);if(released.error)throw unavailable();}
  } finally {
    clearInterval(heartbeat);abort.abort();await local?.close();
    if(directory){const safe=path.resolve(directory);if(path.dirname(safe)!==path.resolve(tmpdir())||!path.basename(safe).startsWith("sceenyk-final-render-"))throw new Error("UNSAFE_RENDER_CLEANUP");await fs.rm(safe,{recursive:true,force:true});}
  }
}

// Per-process capacity only; persisted leases are the cross-process authority.
let active:Promise<void>|undefined;
let dispatching=false;
export async function dispatchRender(input:unknown){
  const ref=renderRequestSchema.parse(input);if(active||dispatching)return{ready:false};
  dispatching=true;
  try {
  const leaseId=randomUUID(),db=createDatabaseClient();
  const claim=await db.rpc("claim_render_job",{p_render_id:ref.renderJobId,p_lease_id:leaseId});
  if(claim.error)throw unavailable();
  if(claim.data!=="claimed")return{ready:claim.data==="completed"};
  // This promise is disposable. The committed lease/attempt plus cron recovery
  // make shutdown/lost HTTP replies safe independently of this process.
  active=executeRender(ref.renderJobId,leaseId).catch(()=>console.error("FINAL_RENDER_RECOVERY_REQUIRED")).finally(()=>{active=undefined;});
  return{ready:false};
  }finally{dispatching=false;}
}
export async function drainRenderer(){await active;}
