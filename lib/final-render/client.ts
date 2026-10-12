import "server-only";
import { randomUUID } from "node:crypto";
import { workerConnection } from "@/lib/media-preparation/config";
import { signWorkerRequest, workerTimestampHeader, workerNonceHeader, workerSignatureHeader } from "@/lib/media-preparation/auth";

export async function requestFinalRender(renderJobId:string){
  const connection=workerConnection();
  // Existing deployment hosts /render. A later separate deployment can route
  // this identifier-only transport without changing any renderer authority.
  const url=new URL("/render",connection.url),timestamp=String(Date.now()),nonce=randomUUID(),body=JSON.stringify({renderJobId});
  const response=await fetch(url,{method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(120_000),headers:{"Content-Type":"application/json",[workerTimestampHeader]:timestamp,[workerNonceHeader]:nonce,[workerSignatureHeader]:signWorkerRequest(connection.secret,"POST","/render",timestamp,nonce,body)},body});
  if(!response.ok){await response.body?.cancel();throw new Error("RENDER_WORKER_UNAVAILABLE");}
  await response.body?.cancel();
}
