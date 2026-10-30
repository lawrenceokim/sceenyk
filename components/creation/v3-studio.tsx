"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { authorizeMediaAction, finalizeMediaAction } from "@/app/actions/media";
import { uploadFileDirectly } from "@/lib/media/upload-client";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { uncheckedQuality, type Quality } from "@/lib/final-video-generation-v3/runtime-contract";

const field = "w-full rounded-lg border border-border bg-background p-2 text-sm";
const money = (amount: number | null) => amount === null ? "Unavailable" : `$${(amount / 1_000_000).toFixed(4)}`;
type Action = (action: string, payload?: Record<string, unknown>) => Promise<void>;
function VideoReview({ run, act, busy, segmentCount }: { run: RuntimeDto["runs"][number]; act: Action; busy: boolean; segmentCount: number }) {
  const [quality, setQuality] = useState<Quality>({ ...uncheckedQuality, ...(run.expectedDialogue.length ? {} : {
    dialoguePresence: "not_applicable", speechTiming: "not_applicable", lipAudioSync: "not_applicable" }) });
  const labels: Record<Exclude<keyof Quality, "notes">, string> = { characterContinuity: "Character continuity", productContinuity: "Product continuity",
    locationContinuity: "Location continuity", dialoguePresence: "Dialogue present", speechTiming: "Rough speech timing", lipAudioSync: "Visible lip/audio synchronization", visualQuality: "Visual quality" };
  return <section className="space-y-3 rounded-xl border border-border p-4" aria-label="Final video review">
    <h2 className="font-semibold">{run.state === "awaiting_review" ? segmentCount > 1 && run.segmentId !== "joined" ? "Segment ready for review" : "Final Video ready" : run.state === "approved" ? "Approved video" : run.state.replaceAll("_", " ")}</h2>
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
    {run.errorCode && <p role="status" className="break-words text-sm text-muted-foreground">{run.errorCode.replaceAll("_", " ")}</p>}
  </section>;
}
export function V3Studio({ initial }: { initial: RuntimeDto | null }) {
  const [workspace, setWorkspace] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [prompt, setPrompt] = useState(""), [duration, setDuration] = useState("10"), [ratio, setRatio] = useState("9:16");
  const [maximum, setMaximum] = useState(""), [approvedHash, setApprovedHash] = useState<string | null>(null);
  const refreshLock = useRef(false), createId = useRef<string | null>(null);
  const projectId = workspace?.projectId;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!projectId || refreshLock.current) return;
    refreshLock.current = true;
    try { const response = await fetch(`/api/ugc/v3?project=${encodeURIComponent(projectId)}`, { cache: "no-store", signal });
      const body = await response.json(); if (!body.ok) throw new Error(body.code); if (!signal?.aborted) setWorkspace(body.workspace); }
    catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "V3_STATUS_UNAVAILABLE"); }
    finally { refreshLock.current = false; }
  }, [projectId]);
  const processing = workspace?.processing ?? false;
  useEffect(() => {
    if (!projectId || !processing) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const tick = async () => { await refresh(controller.signal); if (!controller.signal.aborted) timer = setTimeout(tick, 3000); };
    timer = setTimeout(tick, 3000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [projectId, processing, refresh]);
  const act: Action = async (action, payload = {}) => {
    if (busy) return; setBusy(true); setError("");
    try {
      const id = projectId ?? (createId.current ??= crypto.randomUUID());
      const response = await fetch("/api/ugc/v3", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, projectId: id, ...payload }) });
      const body = await response.json(); if (!body.ok) throw new Error(body.code); setWorkspace(body.workspace);
      if (!projectId) history.replaceState(null, "", `/studio/v3?project=${id}`);
      if (action === "build_package") setApprovedHash(null);
    } catch (e) { setError(e instanceof Error ? e.message : "V3_ACTION_UNAVAILABLE"); }
    finally { setBusy(false); }
  };
  const upload = async (kind: "character" | "product", file: File) => {
    if (!projectId || busy) return; setBusy(true); setError("");
    try {
      const grant = await authorizeMediaAction({ projectId, requestId: crypto.randomUUID(), filename: file.name, mimeType: file.type,
        sizeBytes: file.size, kind: "image", studioRole: "freestyle", referenceId: null });
      if (!grant.ok) throw new Error(grant.message);
      if (grant.value.upload) await uploadFileDirectly(file, grant.value.upload, () => {}, new AbortController().signal);
      const finished = await finalizeMediaAction({ projectId, assetId: grant.value.asset.id }); if (!finished.ok) throw new Error(finished.message);
      const response = await fetch("/api/ugc/v3", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reference", projectId, kind, assetId: grant.value.asset.id }) });
      const body = await response.json(); if (!body.ok) throw new Error(body.code); setWorkspace(body.workspace);
    } catch (e) { setError(e instanceof Error ? e.message : "V3_UPLOAD_FAILED"); }
    finally { setBusy(false); }
  };
  const p = workspace?.preflight;
  return <div className="space-y-5" aria-busy={busy}>
    {busy && <p role="status" className="text-sm text-muted-foreground">Preparing your request…</p>}
    {error && <p role="alert" className="break-words rounded-lg border border-destructive/30 p-3 text-sm">{error.replaceAll("_", " ")}</p>}
    {!workspace ? <form className="space-y-4" onSubmit={e => { e.preventDefault(); void act("create", { fields: { id: createId.current ??= crypto.randomUUID(), mode: "create",
      title: "Fresh V3 test", category: "product-ad", creationType: "ugc", ugcType: "advertisement", prompt,
      settings: { duration, aspectRatio: ratio, visualStyle: "Realistic", tone: "Professional" } } }); }}>
      <label className="block space-y-1 text-sm">Creative brief<textarea required maxLength={2000} className={field} value={prompt} onChange={e => setPrompt(e.target.value)} /></label>
      <div className="flex gap-3"><label className="space-y-1 text-sm">Duration<select className={field} value={duration} onChange={e => setDuration(e.target.value)}>{[5, 10, 30].map(n => <option key={n} value={n}>{n}s</option>)}</select></label>
        <label className="space-y-1 text-sm">Aspect ratio<select className={field} value={ratio} onChange={e => setRatio(e.target.value)}>{["9:16", "16:9", "1:1"].map(r => <option key={r}>{r}</option>)}</select></label></div>
      <p className="text-sm text-muted-foreground">Creates a new project for fresh references and a 480p audiovisual test.</p><Button disabled={busy} type="submit">Create new V3 project</Button>
    </form> : <>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">480p · Native audio · Private project</p><Button variant="outline" disabled={busy} onClick={() => void refresh()}>Check status</Button></div>
      <p className="text-sm text-muted-foreground">Reference and Storyboard generation may incur OpenAI charges. The video estimate covers Higgsfield only.</p>
      <section className="space-y-3"><h2 className="font-semibold">References</h2><div className="flex flex-wrap gap-3">
        {(["character", "product"] as const).map(kind => <label key={kind} className="space-y-1 text-sm">{kind === "character" ? "New Character image" : "Product / Prop image (optional)"}
          <input disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" className={field} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(kind, f); e.target.value = ""; }} /></label>)}
        <Button variant="outline" disabled={busy || !workspace.artifacts.some(a => a.kind === "character" && a.approved)} onClick={() => void act("reference", { kind: "location" })}>Generate Location</Button></div>
        <div className="grid gap-3 sm:grid-cols-3">{workspace.artifacts.filter(a => a.kind !== "storyboard" && a.kind !== "joined" && !a.rejected && !workspace.artifacts.some(n => n.kind === a.kind && n.version > a.version)).map(a => <article key={a.id} className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-medium capitalize">{a.kind} · version {a.version}</p>{a.preview && <Image unoptimized width={1024} height={1024} src={a.preview} alt={`${a.kind} reference candidate`} className="aspect-square w-full rounded-lg object-contain" />}
          {a.approved ? <p className="text-sm">Approved</p> : <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void act("review_artifact", { id: a.id, decision: "approve" })}>Approve</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("review_artifact", { id: a.id, decision: "reject" })}>Reject</Button></div>}</article>)}</div></section>
      <section className="space-y-3"><h2 className="font-semibold">Storyboard</h2><Button variant="outline" disabled={busy} onClick={() => void act("storyboard")}>Generate Storyboard</Button>
        {workspace.artifacts.filter(a => a.storyboard && !a.rejected && !workspace.artifacts.some(n => n.kind === a.kind && n.version > a.version)).map(a => <article key={a.id} className="space-y-3 rounded-xl border border-border p-4"><p>{a.storyboard!.concept}</p>
          {a.storyboard!.scenes.map(s => <details key={s.id}><summary className="cursor-pointer text-sm">Shot {s.number}: {s.startMs / 1000}–{s.endMs / 1000}s · {s.purpose}</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{JSON.stringify(s, null, 2)}</pre></details>)}
          {a.approved ? <p className="text-sm">Storyboard approved</p> : <div className="flex gap-2"><Button disabled={busy} onClick={() => void act("review_artifact", { id: a.id, decision: "approve" })}>Approve Storyboard</Button>
            <Button variant="outline" disabled={busy} onClick={() => void act("review_artifact", { id: a.id, decision: "reject" })}>Reject Storyboard</Button></div>}</article>)}</section>
      <section className="space-y-3 rounded-xl border border-border p-4"><h2 className="font-semibold">Generation Package</h2>
        <Button variant="outline" disabled={busy} onClick={() => void act("build_package")}>Build package and estimate</Button>
        {p && <><p className="text-sm">{p.segmentCount} continuous segment{p.segmentCount === 1 ? "" : "s"} · {p.durationMs / 1000}s · {p.aspectRatio} · {p.currentness}</p>
          <p className="text-sm">Estimated Higgsfield cost: {money(p.estimatedCostMicrousd)}</p><p className="text-sm">Authorized maximum: {money(p.authorizedMaximumMicrousd)}</p>
          <label className="block space-y-1 text-sm">Maximum authorized USD<input type="number" min="0" step="0.000001" className={field} value={maximum} onChange={e => setMaximum(e.target.value)} /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approvedHash === p.packageHash} onChange={e => setApprovedHash(e.target.checked ? p.packageHash : null)} />I reviewed this exact package and approve the displayed request and cost limit.</label>
          <Button variant="outline" disabled={busy || approvedHash !== p.packageHash || !maximum} onClick={() => void act("authorize", { operatorApproved: true, packageId: p.packageId, packageHash: p.packageHash, quoteId: p.quoteId, maximumMicrousd: Math.floor(Number(maximum) * 1_000_000) })}>Authorize exact package</Button>
          {p.issues.length > 0 && <p role="status" className="break-words text-sm text-muted-foreground">{p.issues.join(" · ").replaceAll("_", " ")}</p>}
          {!p.transportEnabled && <p className="text-sm text-muted-foreground">Paid transport is disabled. Local activation for this exact package is required before generation.</p>}
          <Button disabled={busy || !p.canSubmit} onClick={() => void act("generate", { packageId: p.packageId, packageHash: p.packageHash })}>Generate Final Video</Button></>}
      </section>
      {workspace.tasks.filter(t => t.status !== "done").map(t => <div key={t.id} className="space-y-1"><p role="status" className="text-sm text-muted-foreground capitalize">{t.kind}: {t.status.replaceAll("_", " ")}{t.errorCode ? ` · ${t.errorCode.replaceAll("_", " ")}` : ""}</p>
        {t.status === "reconciliation_required" && ["character", "product", "location", "storyboard"].includes(t.kind) && <Button variant="outline" disabled={busy} onClick={() => void act("recover_task", { id: t.id })}>Recover saved response</Button>}
        {t.kind === "join" && t.status === "failed" && <Button variant="outline" disabled={busy} onClick={() => void act("recover_task", { id: t.id })}>Recover local join</Button>}</div>)}
      {workspace.runs.filter(r => !p || r.packageId === p.packageId).map(r => <VideoReview key={r.id} run={r} act={act} busy={busy} segmentCount={p?.segmentCount ?? 1} />)}
      {p && workspace.runs.some(r => r.packageId !== p.packageId) && <details className="space-y-3"><summary className="cursor-pointer text-sm">Earlier V3 attempts and saved work</summary>
        {workspace.runs.filter(r => r.packageId !== p.packageId).map(r => <VideoReview key={r.id} run={r} act={act} busy={busy} segmentCount={1} />)}</details>}
      {workspace.complete && <p role="status" className="font-semibold">Complete</p>}
    </>}
  </div>;
}
