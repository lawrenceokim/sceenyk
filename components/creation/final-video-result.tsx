"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { StudioToolbarAction } from "./studio-toolbar-actions";
import { StudioPropertyControls } from "./studio-property-controls";
import { MediaPreviewSkeleton } from "@/components/ui/skeleton";
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
  return <div className="space-y-3 max-767:flex max-767:min-h-0 max-767:flex-col">
    {state.video&&<><video controls playsInline preload="metadata" src={state.video.url} aria-label="Final generated video" className="max-h-96 w-full rounded-lg bg-muted max-767:min-h-0 max-767:flex-1 max-767:max-h-full max-767:object-contain" onError={()=>setState({error:"Video access may have expired. Refresh the video to continue."})}/>
      <StudioToolbarAction><a className={`
      [@layer_components]:[transition:border-color_var(--duration-fast),_box-shadow_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] studio-export sceenyk-interactive
      inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-body-sm font-semibold text-link
      [.studio-toolbar_&&]:min-h-[32px] [.studio-toolbar_&&]:h-[32px] [.studio-toolbar_&&]:pt-[4px]
      [.studio-toolbar_&&]:pr-[10px] [.studio-toolbar_&&]:pb-[4px] [.studio-toolbar_&&]:pl-[10px]
      [.studio-toolbar_&&]:[border:1px_solid_var(--border)] [.studio-toolbar_&&]:rounded-[8px]
      [.studio-toolbar_&&]:[background:var(--field)] [.studio-toolbar_&&]:text-[color:var(--foreground)]
      [.studio-toolbar_&&]:text-[length:12px] container-max-530:[.studio-toolbar_&&]:w-[32px]
      container-max-530:[.studio-toolbar_&&]:pt-[0] container-max-530:[.studio-toolbar_&&]:pr-[0]
      container-max-530:[.studio-toolbar_&&]:pb-[0] container-max-530:[.studio-toolbar_&&]:pl-[0]
      container-max-530:[.studio-toolbar_&&]:justify-center container-max-530:[.studio-toolbar_&&_span]:hidden
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:3px]
      [@layer_components]:[@media_(hover:_hover)]:[&:hover:not(:disabled,_[aria-disabled='true'])]:[border-color:var(--ring)]
      [@layer_components]:[@media_(hover:_hover)]:[&:hover:not(:disabled,_[aria-disabled='true'])]:[box-shadow:var(--elevation-card),_var(--glow-primary)]
      [[data-workspace-shell]_&&:hover]:[box-shadow:none] [[data-workspace-shell]_&&:hover]:[border-color:var(--input)]
    `} href={state.video.downloadUrl} download="sceenyk-video.mp4" aria-label="Export video"><Download className="size-4" aria-hidden="true" /><span>Export</span></a></StudioToolbarAction></>}
    {!state.video&&!state.error&&<MediaPreviewSkeleton className="aspect-video max-h-96 w-full rounded-lg max-767:min-h-0 max-767:flex-1 max-767:max-h-full" />}
    <StudioPropertyControls>{state.error&&<p role="alert" className="text-body-sm text-destructive">{state.error}</p>}
    <Button type="button" variant="outline" onClick={()=>{setState({});setAttempt(n=>n+1);}}>Refresh video</Button></StudioPropertyControls>
  </div>;
}
