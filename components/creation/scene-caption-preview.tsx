"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StudioPropertyControls } from "./studio-property-controls";
import { Button } from "@/components/ui/button";
import type { CaptionTrack } from "@/lib/captions/contract";
import { activeCaptionCue } from "@/lib/captions/preview-timing";
import { previewCaptionPaint, resolveCaptionStyle, selectionForCaptionPreset, type CaptionStyleSelection } from "@/lib/captions/style";
import { compositionPlanSchema, type CompositionPlan } from "@/lib/composition/contract";

type Scene = CompositionPlan["scenes"][number];
type Media = { sceneId: string; mediaType: "image" | "video"; url: string; expiresAt: string };
const timeLabel = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function SceneCaptionPreview({ projectId, jobId, track, enabled, style, savingStyle, onStyleChange }: {
  projectId: string; jobId: string; track: CaptionTrack; enabled: boolean;
  style: CaptionStyleSelection; savingStyle: boolean; onStyleChange: (style: CaptionStyleSelection) => void;
}) {
  const [plan, setPlan] = useState<CompositionPlan | null>(null);
  const [sceneId, setSceneId] = useState("");
  const [media, setMedia] = useState<Media | null>(null);
  const [error, setError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [frameHeight, setFrameHeight] = useState(0);
  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const [displayMs, setDisplayMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const frame = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null);
  const animation = useRef<number | null>(null), imageStarted = useRef(0), imageElapsed = useRef(0);
  const lastDisplay = useRef(-1), sceneRequest = useRef(0);
  const scene = plan?.scenes.find(item => item.scene_execution_id === sceneId) ?? null;

  useEffect(() => {
    let active = true;
    void fetch(`/api/composition?${new URLSearchParams({ projectId, jobId })}`, { cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(value => {
        const parsed = compositionPlanSchema.parse(value.plan);
        if (parsed.status !== "ready" || parsed.generation_job_id !== jobId ||
          parsed.total_duration_ms !== track.total_duration_ms || parsed.aspect_ratio !== track.aspect_ratio) throw new Error();
        if (active) { setPlan(parsed); setSceneId(parsed.scenes[0].scene_execution_id); setError(""); }
      })
      .catch(() => { if (active) setError("Scene preview is unavailable. Refresh this page to try again."); });
    return () => { active = false; };
  }, [projectId, jobId, track.total_duration_ms, track.aspect_ratio]);

  const loadMedia = useCallback(async (selectedSceneId: string) => {
    const request = ++sceneRequest.current;
    setLoadingMedia(true); setMediaError(""); setMedia(null);
    try {
      const response = await fetch(`/api/media/scene-preview?${new URLSearchParams({ projectId, jobId, sceneId: selectedSceneId })}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const value = await response.json() as Media;
      if (value.sceneId !== selectedSceneId || !["video", "image"].includes(value.mediaType) || !value.url) throw new Error();
      if (request === sceneRequest.current) setMedia(value);
    } catch { if (request === sceneRequest.current) setMediaError("Scene media is unavailable. Refresh preview to request access again."); }
    finally { if (request === sceneRequest.current) setLoadingMedia(false); }
  }, [projectId, jobId]);

  useEffect(() => {
    if (!sceneId) return;
    void Promise.resolve().then(() => loadMedia(sceneId));
  }, [sceneId, loadMedia]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setFrameHeight(entries[0]?.contentRect.height ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, [media, sceneId]);

  const sync = useCallback((item: Scene, mediaTimeMs: number, force = false) => {
    const relative = Math.max(0, Math.min(item.duration_ms, Math.round(mediaTimeMs) - (item.visual?.input_start_ms ?? 0)));
    const cueId = activeCaptionCue(track, item, mediaTimeMs)?.id ?? null;
    setActiveCueId(previous => previous === cueId ? previous : cueId);
    if (force || Math.abs(relative - lastDisplay.current) >= 200 || relative === item.duration_ms) {
      lastDisplay.current = relative; setDisplayMs(relative);
    }
  }, [track]);

  const stopAnimation = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  }, []);
  useEffect(() => () => stopAnimation(), [stopAnimation]);

  function selectScene(id: string) {
    stopAnimation(); video.current?.pause(); setPlaying(false); setActiveCueId(null);
    setDisplayMs(0); lastDisplay.current = -1; imageElapsed.current = 0;
    setSceneId(id);
  }

  function startClock(item: Scene) {
    stopAnimation();
    const tick = () => {
      const current = item.visual?.media_type === "video" ? Math.round((video.current?.currentTime ?? 0) * 1000) :
        (item.visual?.input_start_ms ?? 0) + imageElapsed.current + (performance.now() - imageStarted.current);
      if (current >= (item.visual?.input_end_ms ?? 0)) {
        if (item.visual?.media_type === "video") video.current?.pause();
        imageElapsed.current = item.duration_ms;
        sync(item, item.visual?.input_end_ms ?? 0, true); setPlaying(false); stopAnimation(); return;
      }
      sync(item, current);
      animation.current = requestAnimationFrame(tick);
    };
    animation.current = requestAnimationFrame(tick);
  }

  async function togglePlayback() {
    if (!scene?.visual || !media) return;
    if (playing) {
      if (scene.visual.media_type === "video") video.current?.pause();
      else { imageElapsed.current = Math.min(scene.duration_ms, imageElapsed.current + performance.now() - imageStarted.current);
        sync(scene, scene.visual.input_start_ms + imageElapsed.current, true); stopAnimation(); setPlaying(false); }
      return;
    }
    if (displayMs >= scene.duration_ms) seek(0);
    if (scene.visual.media_type === "video") {
      try { await video.current?.play(); } catch { setMediaError("Playback could not start. Refresh preview and try again."); }
    } else {
      imageStarted.current = performance.now(); setPlaying(true); startClock(scene);
    }
  }

  function seek(relativeMs: number) {
    if (!scene?.visual) return;
    const bounded = Math.max(0, Math.min(scene.duration_ms, relativeMs));
    if (scene.visual.media_type === "video" && video.current) video.current.currentTime = (scene.visual.input_start_ms + bounded) / 1000;
    else { imageElapsed.current = bounded; imageStarted.current = performance.now(); }
    sync(scene, scene.visual.input_start_ms + bounded, true);
  }

  if (error) return <p role="status" className="text-body-sm text-muted-foreground">{error}</p>;
  if (!scene?.visual) return <p role="status" className="text-body-sm text-muted-foreground">Loading scene preview…</p>;
  const resolvedStyle = resolveCaptionStyle(style, track.aspect_ratio);
  const safe = resolvedStyle.safe_area_percent;
  const cue = track.cues.find(item => item.id === activeCueId);
  return <section className="space-y-3 rounded-lg border border-border p-3" aria-label="Scene caption overlay preview">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-body-sm font-semibold">Scene preview</h3>
      <label className="text-caption">Scene{" "}
        <select className="min-h-11 rounded-md border border-input bg-background px-2 text-foreground" value={sceneId} onChange={event => selectScene(event.target.value)}>
          {plan?.scenes.map(item => <option key={item.scene_execution_id} value={item.scene_execution_id}>Scene {item.scene_order}{item.narration ? " · narrated" : " · silent"}</option>)}
        </select>
      </label>
    </div>
    <div ref={frame} className="relative mx-auto w-full overflow-hidden rounded-md bg-neutral-950" style={{ aspectRatio: track.aspect_ratio.replace(":", " / "), maxWidth: track.aspect_ratio === "9:16" ? "20rem" : undefined }}>
      {media?.sceneId === sceneId && scene.visual.media_type === "video" && <video key={sceneId + media.url} ref={video} src={media.url}
        className="absolute inset-0 size-full object-contain" playsInline preload="metadata" muted={muted}
        onLoadedMetadata={event => { event.currentTarget.currentTime = scene.visual!.input_start_ms / 1000; sync(scene, scene.visual!.input_start_ms, true); }}
        onPlay={() => { setPlaying(true); startClock(scene); }}
        onPause={() => { stopAnimation(); setPlaying(false); sync(scene, Math.round((video.current?.currentTime ?? 0) * 1000), true); }}
        onSeeked={() => { const element = video.current; if (!element) return; const ms = Math.round(element.currentTime * 1000);
          if (ms < scene.visual!.input_start_ms || ms > scene.visual!.input_end_ms) { element.currentTime = Math.max(scene.visual!.input_start_ms, Math.min(scene.visual!.input_end_ms, ms)) / 1000; return; }
          sync(scene, ms, true); }}
        onTimeUpdate={() => sync(scene, Math.round((video.current?.currentTime ?? 0) * 1000))}
        onError={() => setMediaError("Video access expired or playback failed. Refresh preview to try again.")} />}
      {media?.sceneId === sceneId && scene.visual.media_type === "image" && <div role="img" aria-label={`Visual for scene ${scene.scene_order}`} className="absolute inset-0 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(media.url)})` }} />}
      {enabled && cue && <div data-caption-cue={cue.id} className="pointer-events-none absolute z-10" style={{ left: `${safe.horizontal}%`, right: `${safe.horizontal}%`, [resolvedStyle.position]: `${safe.vertical}%`, textAlign: resolvedStyle.alignment }}>
        <span className="inline-block max-w-full break-words" style={previewCaptionPaint(resolvedStyle, frameHeight)}>{cue.text}</span>
      </div>}
      {!media && <span className="absolute inset-0 grid place-items-center text-body-sm text-white">{loadingMedia ? "Loading private scene…" : "Scene unavailable"}</span>}
    </div>
    {mediaError && <p role="status" className="text-caption text-destructive">{mediaError}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" disabled={!media || loadingMedia} onClick={() => void togglePlayback()}>{playing ? "Pause" : displayMs >= scene.duration_ms ? "Replay" : "Play"}</Button>
      {scene.visual.media_type === "video" && <Button type="button" variant="outline" disabled={!media} onClick={() => { const next = !muted; setMuted(next); if (video.current) video.current.muted = next; }}>{muted ? "Unmute" : "Mute"}</Button>}
      <label className="min-w-32 flex-1 text-caption">Seek scene <input type="range" className="w-full accent-primary" min={0} max={scene.duration_ms} step={1} value={displayMs} disabled={!media} onChange={event => seek(Number(event.target.value))} /></label>
      <span className="text-caption tabular-nums text-muted-foreground">{timeLabel(displayMs)} / {timeLabel(scene.duration_ms)}</span>
      <Button type="button" variant="ghost" disabled={loadingMedia} onClick={() => void loadMedia(sceneId)}>Refresh preview</Button>
    </div>
    <StudioPropertyControls><div className="mt-3 grid grid-cols-2 gap-3 text-caption">
      <label>Preset <select className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-2 text-foreground" value={style.preset} disabled={savingStyle} onChange={event => onStyleChange(selectionForCaptionPreset(event.target.value as CaptionStyleSelection["preset"]))}><option value="default">Default</option><option value="clean">Clean</option><option value="bold">Bold</option></select></label>
      <label>Position <select className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-2 text-foreground" value={style.position} disabled={savingStyle} onChange={event => onStyleChange({ ...style, position: event.target.value as CaptionStyleSelection["position"] })}><option value="bottom">Bottom</option><option value="top">Top</option></select></label>
      <label>Text size <select className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-2 text-foreground" value={style.size} disabled={savingStyle} onChange={event => onStyleChange({ ...style, size: event.target.value as CaptionStyleSelection["size"] })}><option value="normal">Default</option><option value="large">Large</option></select></label>
      <label>Alignment <select className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-2 text-foreground" value={style.alignment} disabled={savingStyle} onChange={event => onStyleChange({ ...style, alignment: event.target.value as CaptionStyleSelection["alignment"] })}><option value="center">Center</option><option value="left">Left</option></select></label>
      <label>Contrast <select className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-2 text-foreground" value={style.contrast} disabled={savingStyle} onChange={event => onStyleChange({ ...style, contrast: event.target.value as CaptionStyleSelection["contrast"] })}><option value="default">Default</option><option value="high">High</option><option value="shadow">Shadow</option></select></label>
    </div>
    </StudioPropertyControls>
    <p role="status" className="text-caption text-muted-foreground">{savingStyle ? "Saving caption style…" : "Caption style is saved for this generation."} Timing is estimated from the saved narration window.</p>
  </section>;
}
