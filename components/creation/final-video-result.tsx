"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
type Video={id:string;url:string;downloadUrl:string;durationMs:number;width:number;height:number};
export function FinalVideoResult({projectId,jobId}:{projectId:string;jobId:string}){
  const [attempt,setAttempt]=useState(0),[state,setState]=useState<{video?:Video;error?:string}>({});
  useEffect(()=>{
    const abort=new AbortController();
    void fetch(`/api/media/final?${new URLSearchParams({projectId,jobId})}`,{cache:"no-store",signal:abort.signal}).then(async response=>{
      if(!response.ok)throw new Error("unavailable");const result=await response.json();
      if(!abort.signal.aborted)setState({video:result.video});
    }).catch(()=>{if(!abort.signal.aborted)setState({error:"Your video couldn’t be loaded. Refresh the video to try again."});});
    return()=>abort.abort();
  },[projectId,jobId,attempt]);
  return <div className="space-y-3">
    {state.video&&<><video controls playsInline preload="metadata" src={state.video.url} aria-label="Final generated video" className="max-h-96 w-full rounded-lg bg-muted" onError={()=>setState({error:"Video access may have expired. Refresh the video to continue."})}/>
      <a className="sceenyk-interactive inline-flex min-h-11 items-center rounded-lg px-3 text-body-sm font-semibold text-link" href={state.video.downloadUrl} download="sceenyk-video.mp4">Download video</a></>}
    {!state.video&&!state.error&&<p className="text-body-sm text-muted-foreground">Loading your video…</p>}
    {state.error&&<p role="alert" className="text-body-sm text-destructive">{state.error}</p>}
    <Button type="button" variant="outline" onClick={()=>{setState({});setAttempt(n=>n+1);}}>Refresh video</Button>
  </div>;
}
