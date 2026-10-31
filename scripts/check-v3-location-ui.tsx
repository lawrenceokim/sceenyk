import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement, ReactNode } from "react";
import { V3LocationStatus } from "../components/creation/v3-location-status";
import { v3ProgressLabel, referenceBusy } from "../lib/final-video-generation-v3/progress";
import type { RuntimeDto } from "../lib/final-video-generation-v3/runtime-server";

let checks=0;
const equal=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
const ok=(v:unknown)=>{assert.ok(v);checks++;};
const calls:{action:string;payload:Record<string,unknown>}[]=[];
const act=async(action:string,payload:Record<string,unknown>)=>{calls.push({action,payload});return true;};
const base:RuntimeDto["tasks"][number]={id:"10000000-0000-4000-8000-000000000001",kind:"location",status:"failed",current:true,
  createdAt:new Date().toISOString(),leaseUntil:null,errorCode:"V3_LOCATION_STORAGE_FAILED",providerStarted:true,
  diagnostics:null,recoveryAvailable:true,canStartNew:false,
  location:{phase:"publish",label:"Saving Location",failureLabel:"Location storage failed",errorCode:"V3_LOCATION_STORAGE_FAILED",
    requestCount:2,maxRequests:2,recoveryAvailable:true,canContinue:false,canGenerate:false}};
function nodes(node:ReactNode):ReactElement<{children?:ReactNode;disabled?:boolean;onClick?:()=>void}>[]{
  if(!node||typeof node!=="object")return[];
  if(Array.isArray(node))return node.flatMap(nodes);
  const element=node as ReactElement<{children?:ReactNode;disabled?:boolean;onClick?:()=>void}>;
  return [element,...nodes(element.props.children)];
}
const recoverTree=V3LocationStatus({task:base,busy:false,dirty:false,act});
const markup=renderToStaticMarkup(recoverTree);ok(markup.includes("Location storage failed"));ok(markup.includes("Recover saved Location work"));ok(!markup.includes("Continue Location generation"));
const recover=nodes(recoverTree).find(n=>n.props.children==="Recover saved Location work")!;
recover.props.onClick!();equal(calls,[{action:"recover_task",payload:{id:base.id}}]);
for(const constraint of [{busy:true,dirty:false},{busy:false,dirty:true}]){
  const tree=V3LocationStatus({task:base,...constraint,act});equal(nodes(tree).find(n=>n.props.children==="Recover saved Location work")?.props.disabled,true);
}
equal(nodes(V3LocationStatus({task:{...base,current:false},busy:false,dirty:false,act})).find(n=>n.props.children==="Recover saved Location work")?.props.disabled,false);
const continuing={...base,errorCode:"V3_LOCATION_CONTINUE_REQUIRED",recoveryAvailable:false,
  location:{...base.location!,phase:"sheet" as const,errorCode:"V3_LOCATION_CONTINUE_REQUIRED",recoveryAvailable:false,canContinue:true}};
const continueTree=V3LocationStatus({task:continuing,busy:false,dirty:false,act});
nodes(continueTree).find(n=>n.props.children==="Continue Location generation")!.props.onClick!();equal(calls.at(-1),{action:"location_continue",payload:{id:base.id}});
ok(renderToStaticMarkup(continueTree).includes("explicitly authorizes"));
const missing={...base,status:"reconciliation_required" as const,errorCode:"V3_LOCATION_OUTCOME_UNKNOWN",recoveryAvailable:false,
  location:{...base.location!,failureLabel:"Location provider outcome needs reconciliation",errorCode:"V3_LOCATION_OUTCOME_UNKNOWN",recoveryAvailable:false}};
const missingMarkup=renderToStaticMarkup(<V3LocationStatus task={missing} busy={false} dirty={false} act={act}/>);
ok(!missingMarkup.includes("Recover saved Location work"));ok(!missingMarkup.includes("Continue Location generation"));ok(missingMarkup.includes("reconcile"));
equal(referenceBusy([missing],"location"),true);
const failed={...base,canStartNew:true,recoveryAvailable:false,location:{...base.location!,recoveryAvailable:false,canGenerate:true}};
equal(referenceBusy([failed],"location"),false);ok(renderToStaticMarkup(<V3LocationStatus task={failed} busy={false} dirty={false} act={act}/>).includes("It does not regenerate your Character or Product"));
for(const [phase,label]of Object.entries({plan:"Planning Location",sheet:"Generating Location sheet",publish:"Saving Location"})){
  const task={...base,status:"queued" as const,location:{...base.location!,phase,label,requestCount:1}};
  equal(v3ProgressLabel({complete:false,tasks:[task],artifacts:[],runs:[]},true),label);
}
equal(V3LocationStatus({task:{...base,status:"done"},busy:false,dirty:false,act}),null);
equal(V3LocationStatus({task:{...base,kind:"character",location:null},busy:false,dirty:false,act}),null);
console.info(`${checks} Location status, recovery/Continue handlers, generation fences and stage-label checks passed; zero network calls.`);
