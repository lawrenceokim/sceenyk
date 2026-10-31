import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { V3Store, type RuntimeWorkspace } from "./runtime-store";
import type { Task } from "./runtime-contract";
import { privateAssetSchema } from "./runtime-contract";
import { bytesHash, readPrivate, saveSpool, publishPrivate } from "./runtime-media";
import { v3OpenAIConfig } from "./runtime-config";
import { referenceStageError, recordReferenceStage, safeReferenceRequestId } from "./reference-diagnostics";
import { LOCATION_VERSION, locationInstructionSchema, locationInstructionHash, locationRequestId } from "./location-contract";
import { locationInputs, readLocationEnvelope, locationImageBytes, savedLocationState, savedLocationImage,
  savedLocationInstruction, parseLocationInstruction } from "./location-runtime";
import { inspectLocationSheet } from "./location-media";
import { locationDirectorInstructions, locationPlanInput, locationSheetPrompt } from "./location-prompts";

const imageInput=(bytes:Buffer)=>({type:"input_image" as const,image_url:`data:image/png;base64,${bytes.toString("base64")}`,detail:"high" as const});
const usageSummary=(body:Record<string,unknown>)=>Object.fromEntries(Object.entries(body.usage&&typeof body.usage==="object"?body.usage:{}).filter(([key,value])=>
  ["input_tokens","output_tokens","total_tokens","input_images","output_images"].includes(key)&&typeof value==="number"&&Number.isSafeInteger(value)&&value>=0));
async function checkpoint(store:V3Store,task:Task,action:string,document:unknown) {
  if(await store.rpc("ugc_v3_location_checkpoint",{p_task:task.id,p_token:task.lease_token,p_action:action,p_document:document})!==true)throw new Error("V3_LEASE_LOST");
}
async function receipt(store:V3Store,task:Task,key:string,id:string,imageBytes?:Buffer) {
  const envelope=await readLocationEnvelope(id).catch(()=>null);
  let body:Record<string,unknown>={};try{body=z.record(z.string(),z.unknown()).parse(JSON.parse(envelope?.responseText??"{}"));}catch{/* Preserve known HTTP output even if content parsing fails. */}
  await checkpoint(store,task,"receipt",{key,status:"saved",httpStatus:envelope?.httpStatus??null,requestId:envelope?.requestId??null,
    responseId:safeReferenceRequestId(body.id),responseHash:envelope?bytesHash(envelope.raw):imageBytes?bytesHash(imageBytes):null,usage:usageSummary(body)});
}
async function publish(store:V3Store,task:Task,w:RuntimeWorkspace,saved:NonNullable<Awaited<ReturnType<typeof savedLocationImage>>>,signal:AbortSignal) {
  const refreshed=await store.read(w.project.owner_user_id,task.project_id),current=refreshed.tasks.find(t=>t.id===task.id)!;
  const state=savedLocationState(current),instruction=savedLocationInstruction(state);
  const asset=await publishPrivate(w.project.owner_user_id,task.project_id,task.id,saved.image.bytes,saved.image.metadata,signal);
  await store.checkpoint(task,"artifact",{id:task.id,document:{provider:"openai",model:task.input.model,input:task.input,asset,instruction,
    instructionHash:instruction?locationInstructionHash(instruction):null,promptVersion:LOCATION_VERSION,
    location:{...state,phase:"complete",sheetId:saved.id,instruction,instructionHash:instruction?locationInstructionHash(instruction):null,
      blueprint:null,blueprintHash:null,quality:null,errorCode:null}}});
}
// One ChatGPT prompt call, one image call, then user review. There is no AI image-assessment branch.
export async function runLocationTask(store:V3Store,task:Task,w:RuntimeWorkspace,signal:AbortSignal) {
  let phase="source",httpStatus:number|null=null,requestId:string|null=null;
  try{
    const state=savedLocationState(task);
    // Publish any readable already-generated image, including legacy QA failures and stale input snapshots.
    // Approval remains current-input fenced; publishing never makes another provider call.
    const cached=await savedLocationImage(task);
    if(cached){
      const request=state.requests.find(r=>r.id===cached.id);
      if(request?.status==="intent")await receipt(store,task,request.key,cached.id,cached.image.bytes);
      phase="publish";await publish(store,task,w,cached,signal);return;
    }
    const inputs=await locationInputs(w,task.input),key=state.phase;
    phase=key;
    if(key!=="plan"&&key!=="sheet")throw new Error("V3_LOCATION_SAVED_RESPONSE_UNUSABLE");
    const refs=inputs.refs.map(a=>({artifact:a,asset:privateAssetSchema.parse(a.document.asset)}));
    const bindings=z.array(z.object({id:z.uuid(),version:z.number().int(),sha256:z.string(),role:z.string()})).parse(task.input.referenceBindings);
    if(bindings.length!==refs.length||refs.some((r,i)=>bindings[i].id!==r.artifact.id||bindings[i].version!==r.artifact.version||bindings[i].sha256!==r.asset.sha256||bindings[i].role!==r.artifact.kind))throw new Error("V3_LOCATION_INPUT_MISMATCH");
    const id=locationRequestId(task.id,key),existing=state.requests.find(r=>r.key===key);
    let envelope=await readLocationEnvelope(id);
    if(!envelope){
      if(existing)throw new Error(existing.status==="rejected"?"V3_LOCATION_PROVIDER_REJECTED":existing.status==="saved"?"V3_LOCATION_SAVED_RESPONSE_UNUSABLE":"V3_LOCATION_OUTCOME_UNKNOWN");
      if(state.recoveryOnly)throw new Error("V3_LOCATION_CONTINUE_REQUIRED");
      const config=v3OpenAIConfig();
      if(config.imageModel!==task.input.model||config.directorModel!==task.input.directorModel)throw new Error("V3_LOCATION_MODEL_CHANGED");
      const client=new OpenAI({apiKey:config.apiKey,maxRetries:0,timeout:600000,logLevel:"off"});
      let invoke:()=>Promise<Response>;
      if(key==="plan"){
        const bytes=await Promise.all(refs.map(r=>readPrivate(r.asset.storageKey,r.asset.etag,r.asset.sizeBytes,signal,r.asset.sha256)));
        const body={model:config.directorModel,store:false,max_output_tokens:3000,instructions:locationDirectorInstructions,
          input:[{role:"user" as const,content:[{type:"input_text" as const,text:locationPlanInput(inputs.context,refs.map(r=>r.artifact.kind),task.input.names,inputs.brief.duration,inputs.brief.aspect_ratio)},...bytes.map(imageInput)]}],
          text:{format:zodTextFormat(locationInstructionSchema,"location_prompt_v2")}};
        invoke=()=>client.responses.create(body,{signal,headers:{"X-Client-Request-Id":id}}).asResponse();
      }else{
        const instruction=savedLocationInstruction(state);if(!instruction)throw new Error("V3_LOCATION_INSTRUCTION_INVALID");
        const body={model:config.imageModel,prompt:locationSheetPrompt(instruction,inputs.context),n:1,size:"1024x1024" as const,
          quality:"high" as const,output_format:"png" as const,background:"opaque" as const};
        invoke=()=>client.images.generate(body,{signal,headers:{"X-Client-Request-Id":id}}).asResponse();
      }
      await checkpoint(store,task,"intent",{key,id});
      try{
        const response=await invoke();httpStatus=response.status;requestId=safeReferenceRequestId(response.headers.get("x-request-id"));
        const responseText=await response.text();
        await saveSpool(id,"openai-response.json",Buffer.from(JSON.stringify({responseText,httpStatus,requestId})));
      }catch(error){
        const failure=referenceStageError(error,"provider",httpStatus,requestId);
        if(failure.knownRejected)await checkpoint(store,task,"receipt",{key,status:"rejected",httpStatus:failure.metadata.httpStatus,requestId:failure.metadata.requestId,responseId:null,responseHash:null});
        throw failure;
      }
      envelope=await readLocationEnvelope(id);
    }
    if(!envelope)throw new Error("V3_LOCATION_SAVED_RESPONSE_UNUSABLE");
    httpStatus=envelope.httpStatus;requestId=envelope.requestId;
    await receipt(store,task,key,id);
    let body:Record<string,unknown>;try{body=JSON.parse(envelope.responseText);}catch{throw new Error("V3_LOCATION_SAVED_RESPONSE_UNUSABLE");}
    if(key==="plan"){
      const instruction=parseLocationInstruction(task,body);
      await checkpoint(store,task,"advance",{phase:"sheet",instruction,instructionHash:locationInstructionHash(instruction)});
    }else{
      const image=await inspectLocationSheet(locationImageBytes(body));
      await saveSpool(id,"image.png",image.bytes);
      phase="publish";
      await publish(store,task,w,{id,image},signal);
    }
  }catch(error){
    const failure=referenceStageError(error,phase,httpStatus,requestId);
    const explicit=error instanceof Error&&/^(V3_[A-Z0-9_]{1,97}|APPROVE_CURRENT_REFERENCES_FIRST)$/.test(error.message)?error.message:null;
    let code=failure.knownRejected?"V3_LOCATION_PROVIDER_REJECTED":explicit??(phase==="plan"?"V3_LOCATION_INSTRUCTION_INVALID":phase==="publish"?"V3_LOCATION_STORAGE_FAILED":"V3_LOCATION_IMAGE_FAILED");
    if(code==="V3_PRIVATE_SAVE_FAILED")code="V3_LOCATION_STORAGE_FAILED";
    if(code==="V3_DATABASE_UNAVAILABLE")code="V3_LOCATION_CHECKPOINT_FAILED";
    const latest=await store.read(w.project.owner_user_id,task.project_id),current=latest.tasks.find(t=>t.id===task.id);
    if(!current||current.status!=="running"||current.lease_token!==task.lease_token)return;
    const state=savedLocationState(current);
    const unknown=state.requests.some(r=>["plan","sheet","repair"].includes(r.key)&&r.status==="intent");
    if(unknown)code="V3_LOCATION_OUTCOME_UNKNOWN";
    await recordReferenceStage(task.id,{...failure.metadata,stage:phase,errorCode:code});
    try{await store.rpc("ugc_v3_record_reference_diagnostic",{p_task:task.id,p_token:task.lease_token,p_document:{...failure.metadata,stage:phase,errorCode:code}});}catch{/* Fenced task failure still records the code. */}
    await checkpoint(store,task,"failure",{code,unknown,stage:phase,httpStatus:failure.metadata.httpStatus,requestId:failure.metadata.requestId});
  }
}
