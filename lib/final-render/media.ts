import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createReadStream, createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { fileTypeFromBuffer } from "file-type";
import { inspectR2Object, readR2AnalysisMedia } from "@/lib/storage/r2";
import { runMediaCommand } from "@/lib/media-preparation/ffmpeg";
import { PreparationError } from "@/lib/media-preparation/contract";
import type { CompositionPlan } from "@/lib/composition/contract";
import { renderConfiguration, renderShape, RenderError } from "./contract";

export async function downloadPrivateMedia(asset: { storage_key: string; verified_etag: string; size_bytes: number; mime_type: string }, file: string, maximum: number = renderConfiguration.maximumInputBytes) {
  if (asset.size_bytes<=0 || asset.size_bytes>maximum) throw new RenderError("SOURCE_UNAVAILABLE");
  const head = await inspectR2Object(asset.storage_key);
  if (!head || head.etag!==asset.verified_etag || head.sizeBytes!==asset.size_bytes || head.mimeType!==asset.mime_type || (await fileTypeFromBuffer(head.header))?.mime!==asset.mime_type) throw new RenderError("SOURCE_UNAVAILABLE");
  const signal = AbortSignal.timeout(120_000);
  const stream = await readR2AnalysisMedia(asset.storage_key,asset.verified_etag,asset.size_bytes,signal);
  let bytes=0;
  await pipeline(Readable.fromWeb(stream as import("node:stream/web").ReadableStream),new Transform({transform(chunk: Buffer,_encoding,callback){bytes+=chunk.length;callback(bytes>maximum ? new RenderError("SOURCE_UNAVAILABLE") : null,chunk);}}),createWriteStream(file,{flags:"wx"}),{signal});
  if(bytes!==asset.size_bytes)throw new RenderError("SOURCE_UNAVAILABLE");
}
export async function fileSha256(file: string) {
  const hash=createHash("sha256");for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest("hex");
}
export async function muxNarration(directory:string,files:Map<string,string>,plan:CompositionPlan){
  // The persisted absolute millisecond placements are used verbatim at 48kHz.
  // This avoids clipping speech at video-frame quantization boundaries.
  const args=["-hide_banner","-loglevel","error","-nostdin","-y","-protocol_whitelist","file,pipe","-i",path.join(directory,"visual.mp4")];
  const spoken=plan.scenes.flatMap(s=>s.narration?[s.narration]:[]),filters:string[]=[];
  const total=(plan.total_duration_ms/1000).toFixed(3);
  if(spoken.length){
    for(const [index,n]of spoken.entries()){
      const file=files.get(n.asset_id);if(!file)throw new RenderError("SOURCE_UNAVAILABLE");
      args.push("-protocol_whitelist","file,pipe","-i",file);
      filters.push(`[${index+1}:a:0]aresample=${renderConfiguration.audioSampleRate},asetpts=PTS-STARTPTS,adelay=${n.start_ms*renderConfiguration.audioSampleRate/1000}S:all=1[a${index}]`);
    }
    filters.push(`${spoken.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${spoken.length}:normalize=0:dropout_transition=0,apad,atrim=duration=${total}[audio]`);
  }else filters.push(`anullsrc=r=${renderConfiguration.audioSampleRate}:cl=stereo,atrim=duration=${total}[audio]`);
  args.push("-filter_complex",filters.join(';'),"-map","0:v:0","-map","[audio]","-c:v","copy","-c:a",renderConfiguration.audioCodec,"-b:a",renderConfiguration.audioBitrate,"-ar",String(renderConfiguration.audioSampleRate),"-ac","2","-t",total,"-fs",String(renderConfiguration.maximumOutputBytes+1),"-movflags","+faststart",path.join(directory,"output.mp4"));
  try{await runMediaCommand("ffmpeg",args);}catch(error){throw new RenderError(error instanceof PreparationError&&error.code==="PROCESSOR_TIMEOUT"?"RENDER_TIMEOUT":"RENDER_FAILED");}
}
export async function validateFinalFile(file: string,plan: CompositionPlan) {
  const sizeBytes=(await fs.stat(file)).size;
  if(sizeBytes<=0||sizeBytes>renderConfiguration.maximumOutputBytes)throw new RenderError("INVALID_OUTPUT");
  const handle=await fs.open(file,"r");let signature:Buffer;
  try{signature=Buffer.alloc(8192);const read=await handle.read(signature,0,8192,0);signature=signature.subarray(0,read.bytesRead);}finally{await handle.close();}
  if((await fileTypeFromBuffer(signature))?.mime!=="video/mp4")throw new RenderError("INVALID_OUTPUT");
  const finiteDuration=z.coerce.number().finite().positive();
  const stream=z.object({codec_type:z.string(),codec_name:z.string(),duration:finiteDuration,width:z.number().optional(),height:z.number().optional(),pix_fmt:z.string().optional(),avg_frame_rate:z.string().optional()});
  let raw;try{raw=await runMediaCommand("ffprobe",["-v","error","-protocol_whitelist","file,pipe","-show_streams","-show_format","-of","json",file]);}catch(error){if(error instanceof PreparationError&&error.temporary)throw new RenderError("RENDER_UNAVAILABLE",true);throw new RenderError("INVALID_OUTPUT");}
  let probe;try{probe=z.object({streams:z.array(stream).length(2),format:z.object({duration:finiteDuration})}).parse(JSON.parse(raw));}catch{throw new RenderError("INVALID_OUTPUT");}
  const video=probe.streams?.filter((s:{codec_type:string})=>s.codec_type==="video"),audio=probe.streams?.filter((s:{codec_type:string})=>s.codec_type==="audio");
  const expected=renderShape(plan.aspect_ratio),v=video?.[0],a=audio?.[0];
  const [n,d]=(v?.avg_frame_rate??"").split("/").map(Number),durationMs=Math.round(Number(probe.format?.duration)*1000);
  if(video?.length!==1||audio?.length!==1||v.codec_name!=="h264"||v.pix_fmt!=="yuv420p"||a.codec_name!=="aac"||v.width!==expected.width||v.height!==expected.height||n/d!==24||!Number.isSafeInteger(durationMs))throw new RenderError("INVALID_OUTPUT");
  if([durationMs,v.duration*1000,a.duration*1000].some(duration=>Math.abs(duration-plan.total_duration_ms)>renderConfiguration.outputToleranceMs))throw new RenderError("DURATION_MISMATCH");
  return {sizeBytes,sha256:await fileSha256(file),durationMs,...expected,fps:24 as const,videoCodec:"h264" as const,audioCodec:"aac" as const};
}
// Loopback-only, random capability, exact file allowlist, streaming/range reads.
// No disk paths, R2 keys or signed provider URLs enter Remotion props.
export async function serveLocalMedia(files: Map<string,string>) {
  const token=randomUUID(),server=createServer(async(req,res)=>{
    const id=req.url?.split("/");const file=id?.length===3&&id[1]===token?files.get(id[2]):undefined;
    if(!file||!['GET','HEAD'].includes(req.method??'')){res.writeHead(404);res.end();return;}
    try{const size=(await fs.stat(file)).size;const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),size-1):size-1;
      if(start>end||start>=size){res.writeHead(416);res.end();return;}
      res.writeHead(range?206:200,{"Content-Length":end-start+1,"Accept-Ranges":"bytes","Cache-Control":"no-store","Access-Control-Allow-Origin":"*",...(range?{"Content-Range":`bytes ${start}-${end}/${size}`}:{})});
      if(req.method==='HEAD'){res.end();return;}const stream=createReadStream(file,{start,end});res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);
    }catch{res.destroy();}
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==='string')throw new RenderError("RENDER_FAILED");
  return {sources:Object.fromEntries([...files.keys()].map(id=>[id,`http://127.0.0.1:${address.port}/${token}/${id}`])),close:()=>new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();})};
}
export function runRenderer(directory: string,signal:AbortSignal) {
  return new Promise<void>((resolve,reject)=>{
    execFile(process.execPath,["--import=tsx","workers/final-render/render-child.ts",directory],{
      windowsHide:true,signal,timeout:renderConfiguration.processTimeoutMs,killSignal:"SIGTERM",maxBuffer:65536,
      env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,HOME:process.env.HOME,NODE_ENV:"production",REMOTION_BROWSER_EXECUTABLE:process.env.REMOTION_BROWSER_EXECUTABLE},
    },(error,_stdout,stderr)=>{if(!error){resolve();return;}reject(new RenderError(stderr.trim()==="RESOURCE_LIMIT"?"RESOURCE_LIMIT":error.killed?"RENDER_TIMEOUT":"RENDER_FAILED"));});
  });
}
