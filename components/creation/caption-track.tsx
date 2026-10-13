"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { setCaptionPreferenceAction, setCaptionStyleAction } from "@/app/actions/captions";
import { captionTrackSchema, type CaptionTrack } from "@/lib/captions/contract";
import { captionStyleSelectionSchema, type CaptionStyleSelection } from "@/lib/captions/style";
import { SceneCaptionPreview } from "./scene-caption-preview";

export function CaptionTrackPreview({ projectId, jobId }: { projectId: string; jobId: string }) {
  const [data, setData] = useState<{ track: CaptionTrack | null; enabled: boolean; style: CaptionStyleSelection } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [savingStyle, setSavingStyle] = useState(false);
  const alive = useRef(true), sequence = useRef(0), savingRef = useRef(false);
  const endpoint = `/api/captions?${new URLSearchParams({ projectId, jobId })}`;
  const load = useCallback(async () => {
    if (savingRef.current) return;
    const request = ++sequence.current;
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const value = await response.json();
      if (typeof value.enabled !== "boolean") throw new Error();
      const track = value.track === null ? null : captionTrackSchema.parse(value.track);
      const style = captionStyleSelectionSchema.parse(value.style);
      if (alive.current && request === sequence.current) { setData({ track, enabled: value.enabled, style }); setError(""); }
    } catch { if (alive.current && request === sequence.current) setError("Captions are unavailable. Check captions to refresh."); }
    finally { if (alive.current && request === sequence.current) setLoading(false); }
  }, [endpoint]);
  useEffect(() => {
    alive.current = true;
    const invalidate = () => { alive.current = false; sequence.current++; };
    // The initial read is async; activation reads use the same stale-response guard.
    void Promise.resolve().then(() => { if (alive.current) return load(); });
    const activate = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", activate); window.addEventListener("pageshow", activate);
    document.addEventListener("visibilitychange", activate);
    return () => {
      invalidate();
      window.removeEventListener("focus", activate); window.removeEventListener("pageshow", activate);
      document.removeEventListener("visibilitychange", activate);
    };
  }, [load]);
  async function change(enabled: boolean) {
    savingRef.current = true; sequence.current++; setSaving(true); setLoading(false);
    try {
      const result = await setCaptionPreferenceAction({ projectId, jobId, enabled });
      if (!result.ok) throw new Error();
      if (alive.current) { setData(current => current ? { ...current, enabled } : current); setError(""); }
    } catch { if (alive.current) setError("Your caption choice could not be saved."); }
    finally { savingRef.current = false; if (alive.current) setSaving(false); }
  }
  async function changeStyle(style: CaptionStyleSelection) {
    if (!data || savingRef.current) return;
    const previous = data.style;
    savingRef.current = true; sequence.current++; setSavingStyle(true); setLoading(false);
    setData(current => current ? { ...current, style } : current);
    try {
      const result = await setCaptionStyleAction({ projectId, jobId, style });
      if (!result.ok) throw new Error();
      if (alive.current) setError("");
    } catch {
      if (alive.current) {
        setData(current => current ? { ...current, style: previous } : current);
        setError("Your caption style could not be saved.");
      }
    } finally { savingRef.current = false; if (alive.current) setSavingStyle(false); }
  }
  const track = data?.track;
  return <div className="space-y-3 border-t border-border pt-4" aria-label="Captions">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex min-h-11 items-center gap-3 text-body-sm font-medium">
        <input type="checkbox" className="size-5 accent-primary" checked={data?.enabled ?? true}
          disabled={!data || saving || savingStyle || loading} onChange={event => void change(event.target.checked)} />
        Captions: {data?.enabled === false ? "Off" : "On"}
      </label>
      <Button type="button" variant="outline" disabled={loading || saving || savingStyle} onClick={() => void load()}>
        {loading ? "Checking captions…" : "Check captions"}
      </Button>
    </div>
    <p role="status" aria-live="polite" className="text-body-sm text-muted-foreground">
      {error || (track?.status === "timing_issue" ? "Caption timing issue" : track?.status === "ready" ?
        track.cues.length ? "Captions ready — estimated phrase timing" : "Captions ready — no spoken narration" : "Preparing captions")}
    </p>
    {track?.status === "ready" && track.cues.length > 0 && <>
      <p className="text-caption text-muted-foreground">Timing follows the measured narration window and is estimated, not word-perfect. Your choice applies to this generation’s future video.</p>
      {data && <SceneCaptionPreview projectId={projectId} jobId={jobId} track={track} enabled={data.enabled}
        style={data.style} savingStyle={savingStyle} onStyleChange={next => void changeStyle(next)} />}
      <details className="text-body-sm">
        <summary className="cursor-pointer py-2 font-medium">Preview {track.cues.length} caption {track.cues.length === 1 ? "cue" : "cues"}</summary>
        <ol className="max-h-64 space-y-3 overflow-y-auto py-2">
          {track.cues.map(cue => <li key={cue.id} className="space-y-1 break-words">
            <p className="font-mono text-caption text-muted-foreground">Scene {cue.scene_order} · {(cue.start_ms / 1000).toFixed(3)}–{(cue.end_ms / 1000).toFixed(3)} s</p>
            <p>{cue.text}</p>
          </li>)}
        </ol>
      </details>
      <div className="flex flex-wrap gap-4 text-body-sm">
        <a className="min-h-11 py-3 text-link underline" href={`${endpoint}&format=srt`}>Download SRT</a>
        <a className="min-h-11 py-3 text-link underline" href={`${endpoint}&format=vtt`}>Download VTT</a>
      </div>
    </>}
    {track?.status === "timing_issue" && <p className="text-caption text-muted-foreground">The saved narration could not fit readable captions. No caption track is ready for rendering.</p>}
  </div>;
}
