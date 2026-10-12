// Actual FFmpeg/ffprobe with synthetic local files; no provider or hosted writes.
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sourceTiming, segmentTiming, milliseconds, validateSourceDuration } from "../lib/media-preparation/timing";
import { normalization, normalizationKey } from "../lib/media-preparation/config";
import { runMediaCommand, probeMedia, extractSegment } from "../lib/media-preparation/ffmpeg";

async function main() {
 const checks: string[] = [], check = (name: string, value: unknown) => { assert.ok(value, name); checks.push(name); };
 const dir = await mkdtemp(path.join(tmpdir(), "sceenyk-preparation-test-"));
 try {
  check("canonical timing uses rounded integer milliseconds", milliseconds(1.23456) === 1235 && sourceTiming(2,7,5).durationMs === 5000);
  assert.throws(()=>segmentTiming(2.5,7,5)); assert.throws(()=>segmentTiming(null,7000,5000));
  for (const bad of [-1, NaN, Infinity, "2", null]) assert.throws(()=>milliseconds(bad));
  check("invalid and nonnumeric times rejected",true);
  for(const times of [[2,2,5],[7,2,5],[2,7,4],[0,.0001,.0001]])assert.throws(()=>sourceTiming(...times as [number,number,number]));
  check("empty/reversed/inconsistent ranges rejected",true);
  assert.throws(()=>validateSourceDuration(7000,6000));assert.throws(()=>validateSourceDuration(7000,0));
  check("out-of-range and unavailable source durations rejected",true);
  const source=path.join(dir,'source.mp4');
  await runMediaCommand('ffmpeg',['-v','error','-nostdin','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration=12','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',source]);
  const output=path.join(dir,'segment.mp4'), config=normalization('16:9');
  const result=await extractSegment(source,output,sourceTiming(2,7,5),config);
  check('five-second subsegment extracted from real twelve-second video',result.source.durationMs===12000&&Math.abs(result.prepared.durationMs-5000)<=43&&result.mode==='transcode');
  check('normalization retains 640x360 framing, 24fps and no audio',result.prepared.width===640&&result.prepared.height===360&&result.prepared.fps===24&&!result.prepared.hasAudio);
  // Known color intervals independently prove seeking; transcoding the wrong
  // first frame could otherwise produce a different hash just from compression.
  const clock=path.join(dir,'color-clock.mp4'),clockSlice=path.join(dir,'clock-slice.mp4');
  await runMediaCommand('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=red:size=640x360:rate=24:duration=2','-f','lavfi','-i','color=blue:size=640x360:rate=24:duration=5','-f','lavfi','-i','color=green:size=640x360:rate=24:duration=5','-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0','-c:v','libx264','-pix_fmt','yuv420p',clock]);
  await extractSegment(clock,clockSlice,sourceTiming(2,7,5),config);
  const pixel=async(file:string,time:number)=>(await runMediaCommand('ffmpeg',['-v','error','-ss',String(time),'-i',file,'-frames:v','1','-vf','scale=1:1','-f','framemd5','-'])).trim().split(/\r?\n/).at(-1)?.split(',').at(-1)?.trim();
  check('segment starts at requested source position',await pixel(clockSlice,0)===await pixel(clock,2)&&await pixel(clockSlice,0)!==await pixel(clock,0));
  await assert.rejects(extractSegment(source,path.join(dir,'bad.mp4'),sourceTiming(10,15,5),config),e=>e instanceof Error&&e.message==='SOURCE_RANGE_EXCEEDED');
  check('real source probe prevents overrun before extraction',true);
  const full=await extractSegment(source,path.join(dir,'copy.mp4'),sourceTiming(0,12,12),config);
  check('suitable whole H264 source is copied without recompression',full.mode==='copy');
  const withAudio=path.join(dir,'audio.mp4');
  await runMediaCommand('ffmpeg',['-v','error','-y','-i',source,'-f','lavfi','-i','sine=frequency=440:duration=12','-c:v','copy','-c:a','aac','-shortest',withAudio]);
  const silent=await extractSegment(withAudio,path.join(dir,'silent.mp4'),sourceTiming(0,12,12),config);
  check('suitable video stream is remuxed while dropping audio',silent.source.hasAudio&&!silent.prepared.hasAudio&&silent.mode==='copy');
  const portrait=path.join(dir,'portrait.mp4');
  await runMediaCommand('ffmpeg',['-v','error','-nostdin','-y','-f','lavfi','-i','testsrc2=size=360x640:rate=24:duration=3','-an','-c:v','libx264','-pix_fmt','yuv420p',portrait]);
  const upright=await extractSegment(portrait,path.join(dir,'upright.mp4'),sourceTiming(0,3,3),normalization('9:16'));
  check('portrait geometry preserved without crop',upright.prepared.width===360&&upright.prepared.height===640);
  const landscape=await extractSegment(portrait,path.join(dir,'padded.mp4'),sourceTiming(0,3,3),config);
  check('aspect conversion fits and pads without cropping',landscape.prepared.width===1280&&landscape.prepared.height===720);
  const rotated=path.join(dir,'rotated.mp4');
  await runMediaCommand('ffmpeg',['-v','error','-y','-display_rotation','90','-i',portrait,'-c','copy',rotated]);
  const rotatedProbe=await probeMedia(rotated);
  const oriented=await extractSegment(rotated,path.join(dir,'oriented.mp4'),sourceTiming(0,3,3),config);
  check('display rotation becomes correct upright pixels with cleared metadata',Math.abs(rotatedProbe.rotation)===90&&oriented.prepared.rotation===0&&oriented.prepared.width===640&&oriented.prepared.height===360);
  check('normalization identity changes for different framing',normalizationKey(config)!==normalizationKey(normalization('9:16')));
  check('test files confined to dedicated temporary directory',(await readdir(dir)).every(f=>!f.includes('..')));
  console.log(JSON.stringify({passed:checks.length,checks,scope:'actual local FFmpeg and ffprobe; no paid calls'},null,2));
 } finally {
  const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(resolved).startsWith('sceenyk-preparation-test-'));
  await rm(resolved,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'PREPARATION_TEST_FAILED');process.exitCode=1;});
