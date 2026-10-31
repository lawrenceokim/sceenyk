import "server-only";
import { z } from "zod";
import type { V3Store, RuntimeWorkspace } from "./runtime-store";
import { privateAssetSchema } from "./runtime-contract";
import { latestArtifact } from "./generation-context";
import { deleteReferencePrivate, purgeReferenceSpool } from "./runtime-media";
import { locationRequestId } from "./location-contract";

export function discardableReferences(w:RuntimeWorkspace) {
  return w.artifacts.filter(a=>["character","product","location"].includes(a.kind)&&!a.approved_at&&
    (a.rejected_at||latestArtifact(w,a.kind)?.id!==a.id||w.referenceDeletions.some(d=>d.id===a.id&&d.state==="prepared"&&d.mode!=="regenerate")));
}
const operation=z.object({id:z.uuid(),kind:z.enum(["character","product","location"]),state:z.enum(["prepared","completed"]),
  lease_token:z.uuid().nullable(),source_task_id:z.uuid().nullable(),asset:privateAssetSchema.nullable()});
export async function discardReference(store:V3Store,owner:string,project:string,target:{id:string;version:number},signal:AbortSignal,explicit:boolean) {
  const op=operation.parse(await store.rpc("ugc_v3_discard_reference_prepare",{p_owner:owner,p_project:project,p_id:target.id,p_version:target.version,p_current:explicit}));
  if(op.state==="completed")return;
  if(!op.asset||!op.source_task_id||!op.lease_token||op.asset.id!==target.id)throw new Error("V3_REFERENCE_DELETE_SCOPE");
  let phase="storage";
  try{
    await deleteReferencePrivate(owner,project,op.asset,signal);
    phase="spool";
    // Remove both PNGs and raw JSON that embeds their base64 bytes. IDs are derived, never browser paths.
    const ids=[op.source_task_id,...(op.kind==="location"?["plan","sheet","check","repair","recheck"].map(key=>locationRequestId(op.source_task_id!,key)):[])];
    for(const id of ids)await purgeReferenceSpool(id);
    phase="database";
    if(await store.rpc("ugc_v3_discard_reference_finish",{p_owner:owner,p_project:project,p_id:op.id,p_token:op.lease_token,p_error:null})!==true)throw new Error("V3_REFERENCE_CLEANUP_PENDING");
  }catch{
    const code=phase==="storage"?"V3_REFERENCE_DISCARD_STORAGE_FAILED":phase==="spool"?"V3_REFERENCE_DISCARD_LOCAL_FAILED":"V3_REFERENCE_DISCARD_FINALIZE_FAILED";
    try{await store.rpc("ugc_v3_discard_reference_finish",{p_owner:owner,p_project:project,p_id:op.id,p_token:op.lease_token,p_error:code});}catch{/* The durable cleanup lease allows a later retry. */}
    throw new Error(code);
  }
}
