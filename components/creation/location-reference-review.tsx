"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { locationMessages, locationPlanSchema, type LocationPlan, type LocationReview } from "@/lib/location-reference/contract";

const fields: { key: keyof LocationPlan; label: string; max: number }[] = [
  { key: "name", label: "Location name", max: 120 }, { key: "environment", label: "Location description", max: 2000 },
  { key: "lighting", label: "Lighting and atmosphere", max: 600 }, { key: "visualStyle", label: "Visual style", max: 400 },
  { key: "cameraFraming", label: "Camera framing", max: 600 }, { key: "imagePrompt", label: "Image-generation prompt", max: 4000 },
];
export function LocationReferenceReview({ projectId, jobId, location, eligible, enabled, checkStatus }: {
  projectId: string; jobId: string; location?: LocationReview; eligible: boolean; enabled: boolean; checkStatus: () => void;
}) {
  if (!location) return <section aria-label="Location Reference" className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
    <h3 className="text-sm font-medium">Location Reference</h3>
    <p className="text-xs text-muted-foreground">{eligible ? "Preparing location. The local UGC worker will prepare a plan for your review when Location is enabled." :
      "Approve Character and Product references to prepare your location."}</p>
  </section>;
  return <LocationEditor key={`${jobId}:${location.id}:${location.version}`} {...{ projectId, jobId, location, enabled, checkStatus }} />;
}
function LocationEditor({ projectId, jobId, location, enabled, checkStatus }: {
  projectId: string; jobId: string; location: LocationReview; enabled: boolean; checkStatus: () => void;
}) {
  const [plan, setPlan] = useState<LocationPlan | null>(location.plan);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [imageFailed, setImageFailed] = useState(false); const [imageLoaded, setImageLoaded] = useState(false);
  const running = useRef(false);
  const editable = location.state === "plan_review";
  const mutable = enabled && location.dependenciesCurrent;
  async function act(action: "generate" | "accept" | "reject" | "retry_saving" | "resume") {
    if (running.current) return;
    if (action === "generate" && !locationPlanSchema.safeParse(plan).success) { setError("Complete all location fields within the shown limits."); return; }
    running.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/ugc/location", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, jobId, version: location.version, action, ...(action === "generate" ? { plan } : {}) }),
        signal: AbortSignal.timeout(20_000) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Location could not be saved.");
      checkStatus();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Location could not be saved."); checkStatus(); }
    finally { running.current = false; setBusy(false); }
  }
  return <section aria-label="Location Reference" className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-medium">Location Reference</h3>
      <p role="status" className={location.state === "approved" ? "text-xs text-success-foreground" : "text-xs text-muted-foreground"}>{locationMessages[location.phase]}</p>
    </div>
    {!location.dependenciesCurrent && <p className="text-xs text-warning-foreground">Character or Product approval changed. This location is preserved; it cannot be approved against the changed references.</p>}
    {location.imageAvailable && location.candidateId && <div className="overflow-hidden rounded-md border border-border bg-muted/20">
      {!imageFailed ? <>
        {/* Authenticated, no-store image endpoint; no public provider or R2 URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/ugc/location?${new URLSearchParams({ projectId, jobId, candidateId: location.candidateId })}`}
          alt={location.plan ? `${location.plan.name}: ${location.plan.environment}` : "Generated location reference"}
          className="max-h-[70dvh] w-full object-contain" onLoad={() => setImageLoaded(true)} onError={() => setImageFailed(true)} />
        {!imageLoaded && <p className="p-3 text-xs text-muted-foreground">Loading private location preview…</p>}
      </> : <p role="alert" className="p-3 text-xs text-destructive">Location preview could not load. Check status and storage before accepting.</p>}
    </div>}
    {plan && <div className="space-y-2.5">{fields.map(({ key, label, max }) => editable ? <label key={key} className="block space-y-1 text-xs">
      <span>{label}</span><textarea value={plan[key]} maxLength={max} rows={key === "name" ? 1 : key === "environment" || key === "imagePrompt" ? 4 : 2}
        disabled={!mutable || busy} onChange={event => setPlan({ ...plan, [key]: event.target.value })}
        className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60" />
    </label> : <div key={key} className="space-y-0.5"><p className="text-xs font-medium">{label}</p><p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{plan[key]}</p></div>)}</div>}
    {editable && <p className="text-xs text-muted-foreground">Generate Location saves your edits and requests one image.</p>}
    {location.state === "image_review" && <p className="text-xs leading-relaxed text-muted-foreground">Check the scene, visual style, consistent lighting, surroundings and framing. Reject if a main character or featured product appears. Reject and Regenerate removes this candidate and requests one replacement with the same reviewed plan.</p>}
    {location.state === "approved" && <p className="text-xs text-muted-foreground">Location saved privately. Generation paused before storyboard.</p>}
    {location.error && <p role="status" className="text-xs text-warning-foreground">{location.error === "LOCATION_RECONCILIATION_REQUIRED" ?
      "The previous request needs reconciliation. Retry saving only checks for an existing stored image; it never generates another image." : "Location stopped safely. Previous references and the location plan are preserved."}</p>}
    <div className="flex flex-wrap gap-2">
      {editable && <Button type="button" size="sm" disabled={!mutable || busy} onClick={() => void act("generate")}>{busy ? "Saving…" : "Generate Location"}</Button>}
      {location.state === "image_review" && <>
        <Button type="button" size="sm" disabled={!mutable || busy || !imageLoaded || imageFailed} onClick={() => void act("accept")}>Accept Location</Button>
        <Button type="button" size="sm" variant="outline" disabled={!enabled || busy} onClick={() => void act("reject")}>Reject and Regenerate</Button>
      </>}
      {location.canRetrySaving && <Button type="button" size="sm" variant="outline" disabled={!mutable || busy} onClick={() => void act("retry_saving")}>Retry saving</Button>}
      {location.canResume && <Button type="button" size="sm" variant="outline" disabled={!mutable || busy} onClick={() => void act("resume")}>Resume location</Button>}
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={checkStatus}>Check status</Button>
    </div>
    {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
  </section>;
}
