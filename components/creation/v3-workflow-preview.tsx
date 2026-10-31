"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { ProjectAsset } from "@/lib/media/types";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { uncheckedQuality, type Quality } from "@/lib/final-video-generation-v3/runtime-contract";
import { referenceBusy, v3ProgressLabel } from "@/lib/final-video-generation-v3/progress";
import { v3ActionErrorMessage } from "@/lib/final-video-generation-v3/reference-errors";
import { ReferenceRegenerationDialog } from "./reference-regeneration-dialog";
import { referenceFailureLabel } from "@/lib/final-video-generation-v3/reference-status";

const field = "w-full rounded-lg border border-border bg-background p-2 text-sm";
const money = (amount: number | null) => amount === null ? "Unavailable" : `$${(amount / 1_000_000).toFixed(4)}`;
const videoStateLabels: Record<RuntimeDto["runs"][number]["state"], string> = {
  queued: "Waiting to generate", submitting: "Starting video", provider_processing: "Generating video",
  reconciliation_required: "Video needs attention", result_saved: "Preparing preview", awaiting_review: "Ready for review",
  approved: "Approved video", failed: "Video needs attention", deleting: "Deleting video", deleted: "Video deleted",
};
const taskLabels: Record<string, string> = { character: "Character", product: "Product / Prop", location: "Location", storyboard: "Storyboard",
  package: "Generation Package", video: "Final Video", delete: "Deleting saved work", join: "Finishing video" };
type Action = (action: string, payload?: Record<string, unknown>) => Promise<boolean>;
function ReferenceTechnicalDetails({ task }: { task: RuntimeDto["tasks"][number] }) {
  const d = task.diagnostics;
  if (!d) return null;
  const yesNo = (value: boolean) => value ? "Yes" : "No";
  const fields = { Provider: d.provider, Model: d.model ?? "Not recorded", "Task ID": task.id, Stage: d.stage,
    "HTTP status": d.httpStatus ?? "Not recorded", "Error code": d.errorCode ?? "None recorded", "Request ID": d.requestId ?? "Not recorded",
    "Provider code": d.providerCode ?? "Not recorded",
    "Response saved": yesNo(d.responseSaved), "Image saved": yesNo(d.imageSaved), "Recovery available": yesNo(d.recoveryAvailable) };
  return <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Technical details</summary>
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">{Object.entries(fields).map(([label, value]) => <div key={label} className="contents">
      <dt>{label}</dt><dd className="min-w-0 break-all">{value}</dd></div>)}</dl></details>;
}
function VideoReview({ run, act, busy, segmentCount }: { run: RuntimeDto["runs"][number]; act: Action; busy: boolean; segmentCount: number }) {
  const [quality, setQuality] = useState<Quality>({ ...uncheckedQuality, ...(run.expectedDialogue.length ? {} : {
    dialoguePresence: "not_applicable", speechTiming: "not_applicable", lipAudioSync: "not_applicable" }) });
  const labels: Record<Exclude<keyof Quality, "notes">, string> = { characterContinuity: "Character continuity", productContinuity: "Product continuity",
    locationContinuity: "Location continuity", dialoguePresence: "Dialogue present", speechTiming: "Rough speech timing", lipAudioSync: "Visible lip/audio synchronization", visualQuality: "Visual quality" };
  return <section className="space-y-3 rounded-xl border border-border p-4" aria-label="Final video review">
    <h2 className="font-semibold">{run.state === "awaiting_review" ? segmentCount > 1 && run.segmentId !== "joined" ? "Segment ready for review" : "Final Video ready" : videoStateLabels[run.state]}</h2>
    {run.preview && <video controls playsInline preload="metadata" src={run.preview} className="max-h-[65dvh] w-full rounded-lg bg-black" />}
    <p className="text-sm text-muted-foreground">Actual duration: {run.actualDurationMs === null ? "Not measured" : `${run.actualDurationMs / 1000}s`}. Audio: {run.hasAudio === null ? "Not measured" : run.hasAudio ? "Present" : "Absent"}.</p>
    <details className="text-sm"><summary className="cursor-pointer">Expected dialogue and shot timing</summary>
      <ul className="mt-2 space-y-1">{run.expectedDialogue.map((line, i) => <li key={i}>{line.startMs / 1000}–{line.endMs / 1000}s · {line.speaker}: {line.text}</li>)}</ul>
      <p className="mt-2">{run.shotTimings.map(s => `Shot ${s.number}: ${s.startMs / 1000}–${s.endMs / 1000}s`).join("; ")}</p>
      <p className="mt-2 text-muted-foreground">These are intended timings. Review the actual words, sound, visible performance and continuity.</p></details>
    {run.state === "awaiting_review" && <>
      <div className="grid gap-3 sm:grid-cols-2">{Object.entries(labels).map(([key, label]) => <label key={key} className="space-y-1 text-sm">{label}
        <select className={field} value={quality[key as Exclude<keyof Quality, "notes">]} onChange={e => setQuality(q => ({ ...q, [key]: e.target.value }))}>
          <option value="not_checked">Not checked</option><option value="pass">Pass</option><option value="fail">Fail</option>
          {["productContinuity", "dialoguePresence", "speechTiming", "lipAudioSync"].includes(key) && <option value="not_applicable">Not applicable</option>}
        </select></label>)}</div>
      <label className="block space-y-1 text-sm">Review notes<textarea className={field} maxLength={4000} value={quality.notes} onChange={e => setQuality(q => ({ ...q, notes: e.target.value }))} /></label>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !run.current} onClick={() => void act("approve", { id: run.id, quality })}>{segmentCount > 1 && run.segmentId !== "joined" ? "Approve Segment" : "Approve Final Video"}</Button>
        <Button variant="outline" disabled={busy} onClick={() => void act("reject_delete", { id: run.id, quality })}>Reject and Delete</Button></div>
    </>}
    {["reconciliation_required", "provider_processing", "deleting"].includes(run.state) && <Button variant="outline" disabled={busy} onClick={() => void act("recover", { id: run.id })}>
      {run.state === "deleting" ? "Retry deletion" : "Recover saved work"}</Button>}
    {run.errorCode && <p role="status" className="break-words text-sm text-muted-foreground">{"This saved work needs attention. Check status or recover the saved result."}</p>}
  </section>;
}
export function V3WorkflowPreview({ initial, projectId, assets, dirty, revision }: { initial?: RuntimeDto; projectId: string; assets: ProjectAsset[]; dirty: boolean; revision: string }) {
  const [workspace, setWorkspace] = useState(initial ?? null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [maximum, setMaximum] = useState(""), [approvedHash, setApprovedHash] = useState<string | null>(null);
  const refreshLock = useRef(false), refreshRequested = useRef(false);
  const actionLock = useRef(false);
  const [regeneration, setRegeneration] = useState<{ kind: "character" | "product"; id: string; version: number } | null>(null);
  const [view, setView] = useState<"progress" | "references" | "storyboard" | "package" | "final">("references");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return;
    if (refreshLock.current) { refreshRequested.current = true; return; }
    refreshLock.current = true;
    try {
      do {
        refreshRequested.current = false;
        const response = await fetch(`/api/ugc/v3?project=${encodeURIComponent(projectId)}`, { cache: "no-store", signal });
        const body = await response.json(); if (!body.ok) throw new Error(body.code);
        if (!signal?.aborted) { setWorkspace(body.workspace); setError(""); }
      } while (refreshRequested.current && !signal?.aborted);
    }
    catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "V3_STATUS_UNAVAILABLE"); }
    finally { refreshLock.current = false; }
  }, [projectId]);
  useEffect(() => {
    const timer = setTimeout(() => { void refresh(); }, 0);
    return () => clearTimeout(timer);
  }, [refresh, revision]);
  const processing = workspace?.processing ?? false;
  useEffect(() => {
    if (!projectId || !processing) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const tick = async () => { await refresh(controller.signal); if (!controller.signal.aborted) timer = setTimeout(tick, 3000); };
    timer = setTimeout(tick, 3000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [projectId, processing, refresh]);
  const act: Action = async (action, payload = {}) => {
    if (actionLock.current) return false;
    actionLock.current = true; setBusy(true); setError("");
    try {
      const id = projectId;
      const response = await fetch("/api/ugc/v3", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, projectId: id, ...payload }) });
      const body = await response.json(); if (!body.ok) throw new Error(body.code); setWorkspace(body.workspace);
      if (action === "build_package") setApprovedHash(null);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "V3_ACTION_UNAVAILABLE"); return false; }
    finally { actionLock.current = false; setBusy(false); }
  };
  const p = workspace?.preflight;
  const locked = busy || dirty || !!workspace?.processing;
  const reference = (kind: "character" | "product") => assets.find(a => a.studioRole === kind && a.status === "uploaded" && !a.removedFromDraft);
  const latest = workspace?.artifacts.filter(a => a.activeSlot) ?? [];
  const failedReference = (kind: "character" | "product") => workspace?.tasks.filter(t => t.kind === kind).at(-1);
  const referencePayload = (kind: "character" | "product") => {
    const prior = failedReference(kind);
    return { kind, assetId: reference(kind)?.id,
      ...(prior?.canStartNew && prior.providerStarted ? { confirmNewRequest: true, failedTaskId: prior.id } : {}) };
  };
  const requestReference = (kind: "character" | "product") => {
    const current = latest.find(a => a.kind === kind);
    if (current) { setError(""); setRegeneration({ kind, id: current.id, version: current.version }); }
    else void act("reference", referencePayload(kind));
  };
  const continueRegeneration = async () => {
    if (!regeneration || busy || dirty || actionLock.current) return;
    const ok = await act("reference", { ...referencePayload(regeneration.kind),
      confirmedDeletion: true, expectedId: regeneration.id, expectedVersion: regeneration.version });
    if (ok) setRegeneration(null);
  };
  const currentApproved = (kind: string) => latest.some(a => a.kind === kind && a.current && a.approved && !a.rejected);
  const outdatedReferences = workspace?.tasks.some(t => ["character", "product", "location"].includes(t.kind) && t.status === "queued" && !t.current && !t.providerStarted);
  const referenceProviderUnavailable = ["character", "product", "location"].some(kind =>
    workspace?.tasks.filter(t => t.kind === kind).at(-1)?.errorCode === "V3_OPENAI_REFERENCE_PROVIDER_UNAVAILABLE");
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" aria-busy={busy}>
    <ReferenceRegenerationDialog kind={regeneration?.kind ?? null} busy={busy} blocked={dirty}
      error={error ? v3ActionErrorMessage(error) : dirty ? "Save your Studio changes before continuing." : ""}
      onCancel={() => setRegeneration(null)} onContinue={continueRegeneration} />
    <div className="flex shrink-0 flex-wrap items-center gap-1 self-start rounded-md border border-border bg-muted/40 p-0.5" role="group" aria-label="Preview view">
      {(["progress", "references", "storyboard", "package", "final"] as const).map(item => <button type="button" key={item} aria-pressed={view === item} onClick={() => setView(item)}
        className={`h-7 cursor-pointer rounded px-2.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none [@media(pointer:coarse)]:h-11 ${view === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
        {item === "progress" ? "Progress" : item === "references" ? "References" : item === "storyboard" ? "Storyboard" : item === "package" ? "Package" : "Final Video"}</button>)}
    </div>
    <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-1">
    {dirty && <p role="status" className="text-sm text-warning-foreground">Save your Studio changes before generating or approving. Changed style or direction requires fresh references.</p>}
    {busy && <p role="status" className="text-sm text-muted-foreground">Preparing your request…</p>}
    {error && <p role="alert" className="break-words rounded-lg border border-destructive/30 p-3 text-sm">{v3ActionErrorMessage(error)}</p>}
    {!workspace ? <p role="status" className="text-sm text-muted-foreground">Loading generation status…</p> : <>
      <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-sm text-muted-foreground">{v3ProgressLabel(workspace, !!reference("product"))}</p><Button variant="outline" disabled={busy} onClick={() => void refresh()}>Check status</Button></div>
      {outdatedReferences && <p role="status" className="text-sm text-warning-foreground">Your saved reference inputs changed. Generate again to replace the outdated, unstarted request and keep your uploaded sources.</p>}
      {referenceProviderUnavailable && <p role="alert" className="text-sm text-destructive">OpenAI reference generation is unavailable. Check the local OpenAI reference configuration, then generate again. No fallback provider was used.</p>}
      {(["character", "product"] as const).map(kind => {
        const task = failedReference(kind);
        if (!task?.diagnostics) return null;
        return <section key={kind} className="space-y-2 rounded-lg border border-border p-3" aria-label={`${kind === "character" ? "Character" : "Product"} reference diagnostics`}>
          <p role="status" className="text-sm font-medium">{referenceFailureLabel(kind, task.diagnostics)}</p>
          {task.canStartNew && <p className="text-sm text-muted-foreground">No usable current saved image is available. Generate {kind === "character" ? "Character" : "Product"} Sheet starts a new OpenAI request; it does not recover the previous attempt. Its prior provider outcome may be unconfirmed.</p>}
          {task.recoveryAvailable && <Button variant="outline" disabled={busy || !task.current} onClick={() => void act("recover_task", { id: task.id })}>Recover saved response</Button>}
          {workspace?.localEnabled && <ReferenceTechnicalDetails task={task} />}
        </section>;
      })}
      {view === "references" && <>
      <section className="space-y-3"><h2 className="font-semibold">References</h2><div className="flex flex-wrap gap-3">
        {(["character", "product"] as const).map(kind => <Button key={kind} variant="outline" disabled={busy || dirty || referenceBusy(workspace.tasks, kind) || !reference(kind)} onClick={() => requestReference(kind)}>
          {latest.some(a => a.kind === kind) ? "Regenerate" : "Generate"} {kind === "character" ? "Character Sheet" : "Product Sheet"}</Button>)}
        <Button variant="outline" disabled={locked || !currentApproved("character") || !!reference("product") && !currentApproved("product")} onClick={() => void act("reference", { kind: "location" })}>Generate Location</Button></div>
        {!reference("character") && <p className="text-sm text-muted-foreground">Add a Character using Sources, then save your creative direction in Properties.</p>}
        <div className="grid gap-3 sm:grid-cols-3">{latest.filter(a => a.kind !== "storyboard" && a.kind !== "joined" && !a.rejected).map(a => <article key={a.id} className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-medium capitalize">{a.kind} · version {a.version}</p>{a.preview && <Image unoptimized width={1024} height={1024} src={a.preview} alt={`${a.kind} reference candidate`} className="aspect-square w-full rounded-lg object-contain" />}
          {!a.current ? <p role="status" className="text-sm text-warning-foreground">Stale — regenerate and approve for the saved style and direction.</p> : a.approved ? <p className="text-sm">Approved</p> : <div className="flex flex-wrap gap-2"><Button size="sm" disabled={locked || !a.current} onClick={() => void act("review_artifact", { id: a.id, decision: "approve" })}>Approve</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("review_artifact", { id: a.id, kind: a.kind, expectedVersion: a.version, decision: "reject" })}>Reject</Button></div>}</article>)}</div></section>
      <details className="text-sm"><summary className="cursor-pointer">Reference history</summary><div className="mt-2 grid gap-3 sm:grid-cols-3">{workspace.artifacts.filter(a => ["character", "product", "location"].includes(a.kind) && (a.rejected || !latest.some(n => n.id === a.id))).map(a => <article key={a.id} className="space-y-2"><p className="capitalize">{a.kind} · version {a.version} · {a.rejected ? "Rejected" : a.approved ? "Previously approved" : "Earlier candidate"}</p>{a.preview && <Image unoptimized width={1024} height={1024} src={a.preview} alt={`Earlier ${a.kind} reference`} className="aspect-square w-full rounded-lg object-contain" />}</article>)}</div></details>
      </>}
      {view === "storyboard" && <section className="space-y-3"><h2 className="font-semibold">Storyboard</h2><Button variant="outline" disabled={locked || !currentApproved("character") || !currentApproved("location") || !!reference("product") && !currentApproved("product")} onClick={() => void act("storyboard")}>Generate Storyboard</Button>
        {workspace.artifacts.filter(a => a.storyboard && !a.rejected && !workspace.artifacts.some(n => n.kind === a.kind && n.version > a.version)).map(a => <article key={a.id} className="space-y-3 rounded-xl border border-border p-4"><p>{a.storyboard!.concept}</p>
          {a.storyboard!.scenes.map(s => <details key={s.id}><summary className="cursor-pointer text-sm">Shot {s.number}: {s.startMs / 1000}–{s.endMs / 1000}s · {s.purpose}</summary>
            <div className="mt-2 space-y-2 break-words text-sm">{Object.entries(s).filter(([key]) => !["id", "number", "startMs", "endMs", "purpose"].includes(key)).map(([key, value]) => <div key={key}><p className="font-medium capitalize">{key.replaceAll(/([A-Z])/g, " $1")}</p><ReadableDirection value={value} /></div>)}</div></details>)}
          {!a.current ? <p role="status" className="text-sm text-warning-foreground">Storyboard is stale. Regenerate after approving current references.</p> : a.approved ? <p className="text-sm">Storyboard approved</p> : <div className="flex gap-2"><Button disabled={locked || !a.current} onClick={() => void act("review_artifact", { id: a.id, decision: "approve" })}>Approve Storyboard</Button>
            <Button variant="outline" disabled={busy} onClick={() => void act("review_artifact", { id: a.id, decision: "reject" })}>Reject Storyboard</Button></div>}</article>)}</section>}
      {view === "package" && <section className="space-y-3 rounded-xl border border-border p-4"><h2 className="font-semibold">Generation Package</h2>
        {workspace.packageStale && <p role="status" className="text-sm text-warning-foreground">This package needs rebuilding. Regenerate and approve references and Storyboard for your saved style and direction first.</p>}
        <Button variant="outline" disabled={locked || !currentApproved("storyboard")} onClick={() => void act("build_package")}>Build package and estimate</Button>
        {p && <><p className="text-sm">{p.durationMs / 1000}s · {p.aspectRatio} · {p.currentness === "current" ? "Ready for review" : "Needs rebuilding"}</p>
          <p className="text-sm">Estimated video cost: {money(p.estimatedCostMicrousd)}</p><p className="text-sm">Authorized maximum: {money(p.authorizedMaximumMicrousd)}</p>
          <label className="block space-y-1 text-sm">Maximum authorized USD<input type="number" min="0" step="0.000001" className={field} value={maximum} onChange={e => setMaximum(e.target.value)} /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approvedHash === p.packageHash} onChange={e => setApprovedHash(e.target.checked ? p.packageHash : null)} />I reviewed this exact package and approve the displayed request and cost limit.</label>
          <Button variant="outline" disabled={locked || approvedHash !== p.packageHash || !maximum} onClick={() => void act("authorize", { operatorApproved: true, packageId: p.packageId, packageHash: p.packageHash, quoteId: p.quoteId, maximumMicrousd: Math.floor(Number(maximum) * 1_000_000) })}>Approve Generation Package</Button>
          {p.issues.length > 0 && <p role="status" className="text-sm text-muted-foreground">Video generation is awaiting setup or approval.</p>}
          {!p.transportEnabled && <p className="text-sm text-muted-foreground">Video generation is currently unavailable. Your saved work is preserved.</p>}
          <Button disabled={locked || !p.canSubmit} onClick={() => void act("generate", { packageId: p.packageId, packageHash: p.packageHash })}>Generate Final Video</Button></>}
      </section>}
      {view === "progress" && workspace.tasks.filter(t => t.status !== "done" && t.errorCode !== "V3_REFERENCE_REQUEST_SUPERSEDED" &&
        (!["character", "product", "location"].includes(t.kind) || workspace.tasks.filter(n => n.kind === t.kind).at(-1)?.id === t.id)).map(t => <div key={t.id} className="space-y-1"><p role="status" className="text-sm text-muted-foreground">{t.diagnostics ? referenceFailureLabel(t.kind, t.diagnostics) : `${taskLabels[t.kind]}: ${t.status === "queued" ? "Waiting" : t.status === "running" ? "Preparing" : "Recovery required"}`}</p>
        {(t.recoveryAvailable || t.status === "reconciliation_required" && t.kind === "storyboard") && <Button variant="outline" disabled={busy} onClick={() => void act("recover_task", { id: t.id })}>Recover saved response</Button>}
        {t.kind === "join" && t.status === "failed" && <Button variant="outline" disabled={busy} onClick={() => void act("recover_task", { id: t.id })}>Recover local join</Button>}</div>)}
      {view === "final" && workspace.runs.filter(r => !p || r.packageId === p.packageId).map(r => <VideoReview key={r.id} run={r} act={act} busy={locked} segmentCount={p?.segmentCount ?? 1} />)}
      {view === "final" && p && workspace.runs.some(r => r.packageId !== p.packageId) && <details className="space-y-3"><summary className="cursor-pointer text-sm">Earlier attempts and saved work</summary>
        {workspace.runs.filter(r => r.packageId !== p.packageId).map(r => <VideoReview key={r.id} run={r} act={act} busy={locked} segmentCount={1} />)}</details>}
      {workspace.complete && <p role="status" className="font-semibold">Complete</p>}
    </>}
    </div>
  </div>;
}

function ReadableDirection({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return <ul className="space-y-1">{value.map((item, i) => <li key={i}><ReadableDirection value={item} /></li>)}</ul>;
  if (typeof value === "object") return <dl className="space-y-1">{Object.entries(value).map(([key, item]) => <div key={key}><dt className="inline font-medium capitalize">{key.replaceAll(/([A-Z])/g, " $1")}: </dt><dd className="inline"><ReadableDirection value={item} /></dd></div>)}</dl>;
  return <span>{String(value)}</span>;
}
