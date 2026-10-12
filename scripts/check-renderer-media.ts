// Native synthetic media acceptance; no providers, hosted writes or settlement.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {runMediaCommand} from "../lib/media-preparation/ffmpeg";
import {compositionPlanSchema} from "../lib/composition/contract";
import {serveLocalMedia,runRenderer,muxNarration,validateFinalFile} from "../lib/final-render/media";
async function main(){
const require=createRequire(import.meta.url),ffmpeg=process.env.FFMPEG_PATH??require('ffmpeg-static') as string;
const binary=promisify(execFile),directory=await fs.mkdtemp(path.join(tmpdir(),'sceenyk-render-native-'));
let server:Awaited<ReturnType<typeof serveLocalMedia>>|undefined;let count=0;
const check=(name:string,value:unknown)=>{assert.ok(value,name);count++;console.log(JSON.stringify({passed:name}));};
try{
  const visualA=randomUUID(),visualB=randomUUID(),audio=randomUUID();
  const files=new Map<string,string>([[visualA,path.join(directory,'red.mp4')],[visualB,path.join(directory,'blue.mp4')],[audio,path.join(directory,'voice.mp3')]]);
  for(const [id,color] of [[visualA,'red'],[visualB,'blue']])await runMediaCommand('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-f','lavfi','-i',`color=c=${color}:s=640x360:r=24:d=6`,'-f','lavfi','-i','sine=frequency=200:duration=6','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-y',files.get(id)!]);
  await runMediaCommand('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-f','lavfi','-i','sine=frequency=880:duration=1.28','-c:a','libmp3lame','-y',files.get(audio)!]);
  const plan=compositionPlanSchema.parse({schema_version:1,generation_job_id:randomUUID(),aspect_ratio:'16:9',total_duration_ms:10000,configuration:{schema_version:1,narration_offset_ms:400,technical_tolerance_ms:0},status:'ready',issues:[],scenes:[visualA,visualB].map((id,i)=>({scene_execution_id:randomUUID(),scene_order:i+1,start_ms:i*5000,end_ms:(i+1)*5000,duration_ms:5000,visual:{asset_kind:'scene_asset',asset_id:id,media_type:'video',actual_duration_ms:6000,input_start_ms:0,input_end_ms:5000},narration:i===0?{asset_id:audio,start_offset_ms:400,actual_duration_ms:1280,start_ms:400,end_ms:1680,trailing_silence_ms:3320}:null,transition:{type:'cut',duration_ms:0},timing_status:'valid'}))});
  server=await serveLocalMedia(files);
  check('private loopback file requires random exact capability',(await fetch(server.sources[visualA].replace(/\/[^/]+\/[^/]+$/,'/unknown/'+visualA))).status===404);
  const range=await fetch(server.sources[visualA],{headers:{Range:'bytes=10-20'}});check('loopback serves bounded video range',range.status===206&&(await range.arrayBuffer()).byteLength===11);
  await fs.writeFile(path.join(directory,'input.json'),JSON.stringify({plan,sources:server.sources}));
  const start=Date.now();await runRenderer(directory,AbortSignal.timeout(180000));await muxNarration(directory,files,plan);
  const file=path.join(directory,'output.mp4'),output=await validateFinalFile(file,plan);
  check('native Remotion produces probed H264 AAC private-ready MP4',output.videoCodec==='h264'&&output.audioCodec==='aac'&&output.sizeBytes>0);
  check('native render obeys 10s duration shape and fps',Math.abs(output.durationMs-10000)<=85&&output.width===640&&output.height===360&&output.fps===24);
  const raw=async(args:string[])=>{const result=await binary(ffmpeg,['-v','error','-nostdin',...args],{encoding:'buffer',windowsHide:true,maxBuffer:1000000,timeout:30000,env:{NODE_ENV:'test',PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP}});return result.stdout;};
  for(const [time,channel] of [['0.5',0],['5.5',2]] as const){const pixel=await raw(['-ss',time,'-i',file,'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);check('native output places correct visual at '+time+'s',pixel[channel]>200&&pixel[(channel+1)%3]<40);}
  const rms=async(time:string)=>{const pcm=await raw(['-ss',time,'-i',file,'-t','0.1','-vn','-ac','1','-ar','48000','-f','s16le','pipe:1']);let sum=0;for(let i=0;i<pcm.length;i+=2)sum+=pcm.readInt16LE(i)**2;return Math.sqrt(sum/(pcm.length/2));};
  check('narration is audible only in its configured window',await rms('0.8')>100);
  check('offset preserves silence before narration',await rms('0.1')<5);
  check('short narration preserves trailing silence',await rms('3')<5);
  check('silent scene stays silent despite native input video audio',await rms('7')<5);
  await assert.rejects(()=>validateFinalFile(file,{...plan,total_duration_ms:9000}),/DURATION_MISMATCH/);check('native receipt refuses wrong total duration',true);
  const invalid=path.join(directory,'invalid.mp4');await fs.writeFile(invalid,'invalid');await assert.rejects(()=>validateFinalFile(invalid,plan),/INVALID_OUTPUT/);check('native receipt refuses malformed bytes',true);
  console.log(JSON.stringify({checks:count,renderDurationMs:Date.now()-start,outputBytes:output.sizeBytes,dimensions:[output.width,output.height],fps:24,scope:'local native synthetic acceptance; hosted Render Free unverified'}));
}catch(error){
  const probe=await runMediaCommand('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path.join(directory,'output.mp4')]).then(value=>JSON.parse(value)).catch(()=>null);
  console.log(JSON.stringify({diagnostic:probe?{streams:probe.streams.map((s:{codec_type:string;codec_name:string;pix_fmt:string;width:number;height:number;avg_frame_rate:string;duration:string})=>({type:s.codec_type,codec:s.codec_name,pixelFormat:s.pix_fmt,width:s.width,height:s.height,fps:s.avg_frame_rate,duration:s.duration})),duration:probe.format.duration}:null}));
  throw error;
}finally{
  await server?.close();assert.equal(path.dirname(directory),path.resolve(tmpdir()));assert.ok(path.basename(directory).startsWith('sceenyk-render-native-'));await fs.rm(directory,{recursive:true,force:true});
}
assert.equal(await fs.stat(directory).catch(()=>null),null);console.log(JSON.stringify({passed:'native renderer scratch removed'}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'NATIVE_RENDER_CHECK_FAILED');process.exitCode=1;});
