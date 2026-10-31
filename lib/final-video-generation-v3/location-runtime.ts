import "server-only";
import { z } from "zod";
import type { Artifact, Task } from "./runtime-contract";
import { privateAssetSchema } from "./runtime-contract";
import { artifactCurrent, generationContext, latestArtifact, referenceDeletedVersion } from "./generation-context";
import { projectBrief, referenceOriginals, creativeBriefHash } from "./creative-inputs";
import { V3Store, type RuntimeWorkspace } from "./runtime-store";
import { v3OpenAIConfig } from "./runtime-config";
import { v3Digest } from "./identity";
import { readSpool } from "./runtime-media";
import { LOCATION_VERSION, LEGACY_LOCATION_VERSION, locationState, locationStateSchema, locationStageLabel,
  locationInstructionSchema, locationInstructionHash, legacyLocationInstruction, locationRequestId } from "./location-contract";
import { inspectLocationSheet } from "./location-media";

export const isLocationDirectorTask = (task: Pick<Task,"kind"|"input">) => task.kind === "location" &&
  z.object({ version:z.enum([LOCATION_VERSION,LEGACY_LOCATION_VERSION]) }).safeParse(task.input.locationDirector).success;
export function savedLocationState(task: Task) {
  const completed=z.object({document:z.object({location:locationStateSchema})}).safeParse(task.output);
  return locationState(task.status==="done"&&completed.success?completed.data.document.location:task.output);
}
export function savedLocationInstruction(state: ReturnType<typeof locationState>) {
  if(state.instruction)return state.instruction;
  try{return state.blueprint?legacyLocationInstruction(state.blueprint):null;}catch{return null;}
}
export function locationDocument(a: Artifact | undefined) {
  if(!a||a.kind!=="location"||!isLocationDirectorTask({kind:"location",input:(a.document.input??{}) as Task["input"]}))return null;
  const state=locationStateSchema.parse(a.document.location),instruction=savedLocationInstruction(state);
  if(state.instruction&&state.instructionHash!==locationInstructionHash(state.instruction))throw new Error("V3_LOCATION_INSTRUCTION_INVALID");
  return {schema:state.schema,artifactId:a.id,version:a.version,instruction,instructionHash:instruction?locationInstructionHash(instruction):null,
    sheetHash:privateAssetSchema.parse(a.document.asset).sha256};
}
export async function locationInputs(w: RuntimeWorkspace,input?:Task["input"]) {
  const brief=await projectBrief(w.project.owner_user_id,w.project.project_id),originals=await referenceOriginals(w.project.owner_user_id,w.project.project_id);
  const context=generationContext(brief),hash=creativeBriefHash(brief);
  if(w.tasks.some(t=>["character","product"].includes(t.kind)&&["queued","running","reconciliation_required"].includes(t.status)))throw new Error("APPROVE_CURRENT_REFERENCES_FIRST");
  const refs=[latestArtifact(w,"character"),...(originals.product?[latestArtifact(w,"product")]:[])];
  if(refs.some(a=>!a?.approved_at||!artifactCurrent(a,w.artifacts,context,originals,hash,w.referenceDeletions)))throw new Error("APPROVE_CURRENT_REFERENCES_FIRST");
  const artifacts=refs as Artifact[];
  if(input&&(input.briefHash!==hash||v3Digest("generation-context",input.generationContext)!==v3Digest("generation-context",context)||
    v3Digest("location-names",input.names)!==v3Digest("location-names",originals.names)||
    JSON.stringify(input.references)!==JSON.stringify(artifacts.map(a=>a.id))))throw new Error("V3_CREATIVE_INPUT_STALE");
  return{brief,originals,context,refs:artifacts};
}
export async function enqueueLocation(store:V3Store,w:RuntimeWorkspace) {
  if(!w.referenceCleanupPolicy)throw new Error("V3_LOCATION_SIMPLE_SETUP_REQUIRED");
  const {brief,context,refs,originals}=await locationInputs(w),prior=w.tasks.filter(t=>t.kind==="location").at(-1);
  if(prior&&["queued","running"].includes(prior.status))return;
  if(prior&&isLocationDirectorTask(prior)){
    const current=prior.input.briefHash===creativeBriefHash(brief)&&JSON.stringify(prior.input.references)===JSON.stringify(refs.map(a=>a.id));
    const available=await locationTaskStatus(prior,current);
    if(available.recoveryAvailable)throw new Error("V3_LOCATION_RECOVER_FIRST");
    if(available.canContinue)throw new Error("V3_LOCATION_CONTINUE_REQUIRED");
  }
  const current=latestArtifact(w,"location");
  if(current&&!current.approved_at&&!current.rejected_at)throw new Error("REVIEW_EXISTING_REFERENCE_FIRST");
  const config=v3OpenAIConfig();
  const input={provider:"openai",locationDirector:{version:LOCATION_VERSION,maxRequests:2,maxImageRequests:1},
    model:config.imageModel,directorModel:config.directorModel,brief,briefHash:creativeBriefHash(brief),generationContext:context,
    references:refs.map(a=>a.id),referenceBindings:refs.map(a=>({id:a.id,version:a.version,sha256:privateAssetSchema.parse(a.document.asset).sha256,role:a.kind})),
    names:originals.names,originalId:null,previous:current?.id??null,previousTask:prior?.id??null,referenceEpoch:referenceDeletedVersion(w.referenceDeletions,"location")};
  await store.rpc("ugc_v3_location_action",{p_owner:w.project.owner_user_id,p_project:w.project.project_id,p_action:"enqueue",p_payload:{input,requestKey:`location:${v3Digest("task-input",input)}`}});
}
export async function readLocationEnvelope(id:string) {
  const raw=await readSpool(id,"openai-response.json");if(!raw)return null;
  try{return{raw,...z.object({responseText:z.string(),httpStatus:z.number().int().min(200).max(299),requestId:z.string().nullable()}).parse(JSON.parse(raw.toString("utf8")))};}
  catch{throw new Error("V3_LOCATION_SAVED_RESPONSE_UNUSABLE");}
}
export function locationStructuredText(body:Record<string,unknown>) {
  if(body.status!=="completed")throw new Error("V3_LOCATION_DIRECTOR_INCOMPLETE");
  const output=z.array(z.object({type:z.string(),content:z.array(z.object({type:z.string(),text:z.string().optional()})).optional()})).parse(body.output);
  const text=output.flatMap(o=>o.type==="message"?o.content?.filter(c=>c.type==="output_text").map(c=>c.text??"")??[]:[]).join("");
  if(!text)throw new Error("V3_LOCATION_DIRECTOR_REFUSED");
  try{return JSON.parse(text) as unknown;}catch{throw new Error("V3_LOCATION_DIRECTOR_INVALID");}
}
export function locationImageBytes(body:Record<string,unknown>) {
  const value=z.object({data:z.array(z.object({b64_json:z.string().min(1).max(28000000)})).length(1)}).parse(body);
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(value.data[0].b64_json))throw new Error("V3_LOCATION_IMAGE_INVALID");
  return Buffer.from(value.data[0].b64_json,"base64");
}
export function parseLocationInstruction(task:Task,body:Record<string,unknown>) {
  const value=locationStructuredText(body);
  const direct=locationInstructionSchema.safeParse(value);
  if(direct.success)return direct.data;
  return (task.input.locationDirector as {version:string}).version===LEGACY_LOCATION_VERSION
    ?legacyLocationInstruction(value):locationInstructionSchema.parse(value);
}
export async function savedLocationImage(task:Task) {
  const state=savedLocationState(task),ids=[...state.requests.filter(r=>r.key==="repair").map(r=>r.id),...(state.sheetId?[state.sheetId]:[]),
    ...state.requests.filter(r=>r.key==="sheet").map(r=>r.id)];
  for(const id of new Set(ids)){
    try{const bytes=await readSpool(id,"image.png");if(bytes)return{id,image:await inspectLocationSheet(bytes)};}catch{/* Try the same request's saved raw result. */}
    try{const envelope=await readLocationEnvelope(id);if(envelope)return{id,image:await inspectLocationSheet(locationImageBytes(JSON.parse(envelope.responseText)))};}catch{/* No readable image in this saved result. */}
  }
  return null;
}
export async function locationTaskStatus(task:Task,current:boolean) {
  const state=savedLocationState(task),terminal=["failed","reconciliation_required"].includes(task.status);
  let recoverable=false;
  if(terminal){
    recoverable=!!await savedLocationImage(task);
    if(!recoverable&&current&&state.phase==="plan")try{const raw=await readLocationEnvelope(locationRequestId(task.id,"plan"));if(raw){parseLocationInstruction(task,JSON.parse(raw.responseText));recoverable=true;}}catch{/* Offer only usable saved output. */}
  }
  const relevant=state.requests.filter(r=>["plan","sheet","repair"].includes(r.key));
  const unresolved=relevant.some(r=>r.status==="intent"),rejected=relevant.some(r=>r.status==="rejected");
  const canContinue=terminal&&current&&!unresolved&&!rejected&&!recoverable&&state.phase==="sheet"&&task.error_code==="V3_LOCATION_CONTINUE_REQUIRED";
  return{phase:task.status==="done"?"complete":state.phase,label:locationStageLabel(task.status==="done"?"complete":state.phase),
    failureLabel:recoverable?"Saved Location output is available":locationFailureLabel(task.error_code),requestCount:state.requests.length,
    maxRequests:state.schema===LOCATION_VERSION?2:Math.max(2,state.requests.length),recoveryAvailable:recoverable,canContinue,
    canGenerate:terminal&&!unresolved&&!recoverable&&!canContinue,errorCode:task.error_code};
}
export async function resumeLocation(store:V3Store,w:RuntimeWorkspace,id:string,recover:boolean) {
  const task=w.tasks.find(t=>t.id===id&&isLocationDirectorTask(t));if(!task)throw new Error("V3_LOCATION_REQUEST_CHANGED");
  if(["queued","running","done"].includes(task.status))return;
  let current=true;try{await locationInputs(w,task.input);}catch{current=false;}
  const available=await locationTaskStatus(task,current);
  if(recover?!available.recoveryAvailable:!available.canContinue)throw new Error(recover?"V3_LOCATION_SAVED_RESPONSE_UNUSABLE":"V3_LOCATION_CONTINUE_UNAVAILABLE");
  await store.rpc("ugc_v3_location_action",{p_owner:w.project.owner_user_id,p_project:w.project.project_id,p_action:recover?"recover":"continue",p_payload:{id}});
}
function locationFailureLabel(code:string|null) {
  return({V3_LOCATION_INSTRUCTION_INVALID:"Location prompt could not be prepared",V3_LOCATION_STORAGE_FAILED:"Location storage failed",
    V3_LOCATION_CONTINUE_REQUIRED:"Saved Location prompt recovered — continue generation",V3_LOCATION_OUTCOME_UNKNOWN:"Location provider outcome needs reconciliation",
    V3_LOCATION_PROVIDER_REJECTED:"OpenAI Location request failed",V3_LOCATION_SAVED_RESPONSE_UNUSABLE:"Saved Location response is unavailable",
    V3_CREATIVE_INPUT_STALE:"Location inputs changed — save and generate again"} as Record<string,string>)[code??""]??"Location generation stopped";
}
