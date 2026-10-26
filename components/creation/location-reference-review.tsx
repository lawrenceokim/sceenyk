"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { locationErrorMessage, locationMessages, type LocationReview } from "@/lib/location-reference/contract";

export function LocationReferenceReview(props: {
  projectId: string; jobId: string; location?: LocationReview; eligible: boolean; enabled: boolean; checkStatus: () => void;
}) {
  return <LocationCard key={`${props.jobId}:${props.location?.id ?? "new"}:${props.location?.version ?? 0}`} {...props} />;
}
function LocationCard({ projectId, jobId, location, eligible, enabled, checkStatus }: {
  projectId: string; jobId: string; location?: LocationReview; eligible: boolean; enabled: boolean; checkStatus: () => void;
}) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [operation, setOperation] = useState("");
  const [imageFailed, setImageFailed] = useState(false); const [imageLoaded, setImageLoaded] = useState(false);
  const running = useRef(false);
  const idle = !location || location.canGenerate;
  const mutable = enabled && eligible;
  useEffect(() => {
    if (!busy || !["retry_saving", "reject", "retry_delete"].includes(operation)) return;
    const timer = setInterval(checkStatus, 2500);
    return () => clearInterval(timer);
  }, [busy, operation, checkStatus]);
  async function act(action: "generate" | "accept" | "reject" | "retry_saving" | "retry_delete" | "resume") {
    if (running.current) return;
    running.current = true; setBusy(true); setOperation(action); setError("");
    try {
      const response = await fetch("/api/ugc/location", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, jobId, version: location?.version ?? 0, action, ...(location ? { locationId: location.id } : {}) }), signal: AbortSignal.timeout(action === "retry_saving" ? 180_000 : 45_000) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Location could not be saved.");
      checkStatus();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Location could not be saved."); checkStatus(); }
    finally { running.current = false; setBusy(false); }
  }
  return <section aria-label="Location Reference" className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-medium">Location Reference</h3>
      {location && !idle && <p role="status" className={location.state === "approved" ? "text-xs text-success-foreground" : "text-xs text-muted-foreground"}>{locationMessages[location.phase]}</p>}
    </div>
    {!eligible && <p className="text-xs text-muted-foreground">Approve Character and Product references to generate your location.</p>}
    {idle && eligible && <p className="text-xs text-muted-foreground">Create a filming environment from your saved scene, references and video settings.</p>}
    {location && !location.dependenciesCurrent && <p className="text-xs text-warning-foreground">Saved source details, settings or reference approvals changed. Generate a new location for the updated project.</p>}
    {location?.imageAvailable && location.candidateId && !(busy && ["reject", "retry_delete"].includes(operation)) && <div className="overflow-hidden rounded-md border border-border bg-muted/20">
      {!imageFailed ? <>
        {/* Authenticated no-store endpoint; the private plan and R2 key stay on the server. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/ugc/location?${new URLSearchParams({ projectId, jobId, candidateId: location.candidateId })}`}
          alt="Generated filming location reference" className="max-h-[70dvh] w-full object-contain"
          onLoad={() => setImageLoaded(true)} onError={() => setImageFailed(true)} />
        {!imageLoaded && <p className="p-3 text-xs text-muted-foreground">Loading private location preview…</p>}
      </> : <p role="alert" className="p-3 text-xs text-destructive">Location preview could not load. Check status and storage before accepting.</p>}
    </div>}
    {location?.state === "image_review" && <p className="text-xs leading-relaxed text-muted-foreground">Check the scene, visual style, lighting, surroundings and framing. Reject and Delete removes only this candidate. Generate Location is a separate action after deletion.</p>}
    {location?.state === "approved" && <p className="text-xs text-muted-foreground">Location saved privately. Generation paused before storyboard.</p>}
    {location?.error && <p role="status" className="text-xs text-warning-foreground">{locationErrorMessage(location.error, location.providerCompleted)}</p>}
    {location?.diagnostic && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Operation details</summary>
      <p className="mt-1 break-words">{location.diagnostic.phase} · {location.diagnostic.code}{location.diagnostic.databaseCode ? ` · ${location.diagnostic.databaseCode}` : ""}{location.diagnostic.causeCode ? ` · ${location.diagnostic.causeCode}` : ""}{location.diagnostic.httpStatus ? ` · HTTP ${location.diagnostic.httpStatus}` : ""}</p>
    </details>}
    {busy && operation === "retry_saving" && <p role="status" className="text-xs text-muted-foreground">Recovering saved location. No new image is being generated.</p>}
    {busy && ["reject", "retry_delete"].includes(operation) && <p role="status" className="text-xs text-muted-foreground">Deleting the rejected location. No new generation will start.</p>}
    <div className="flex flex-wrap gap-2">
      {idle && <Button type="button" size="sm" disabled={!mutable || busy} onClick={() => void act("generate")}>{busy ? "Starting…" : "Generate Location"}</Button>}
      {location?.state === "image_review" && <>
        <Button type="button" size="sm" disabled={!mutable || !location.dependenciesCurrent || busy || !imageLoaded || imageFailed} onClick={() => void act("accept")}>Accept Location</Button>
      </>}
      {location?.canDelete && <Button type="button" size="sm" variant="outline" disabled={!enabled || busy} onClick={() => void act("reject")}>Reject and Delete</Button>}
      {location?.canRetryDelete && <Button type="button" size="sm" variant="outline" disabled={!enabled || busy} onClick={() => void act("retry_delete")}>Retry deletion</Button>}
      {location?.canRetrySaving && <Button type="button" size="sm" variant="outline" disabled={!mutable || busy} onClick={() => void act("retry_saving")}>Retry saving</Button>}
      {location?.canResume && <Button type="button" size="sm" variant="outline" disabled={!mutable || busy} onClick={() => void act("resume")}>Resume location</Button>}
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={checkStatus}>Check status</Button>
    </div>
    {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
  </section>;
}
