"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { storyboardErrorMessage, storyboardStatusLabel, storyboardQueueMessage, type Storyboard, type StoryboardScene, type StoryboardReview } from "@/lib/storyboard/contract";
import { storyboardRecoveryMessage } from "@/lib/storyboard/recovery-contract";
import type { StoryboardValidationReport } from "@/lib/storyboard/validation-diagnostics";
import { speechIntervalBudget } from "@/lib/storyboard/speech-budget";
import { inspectStoryboard } from "@/lib/storyboard/validation";
import { proposeExecutionRepair, type RepairChange } from "@/lib/storyboard/execution-repair";
import { defaultDelivery, type VoiceDelivery, type Transition } from "@/lib/execution-v1/contract";

function ValidationDetails({ report }: { report: StoryboardValidationReport }) {
  return <details open={!report.valid} className="rounded-md border border-border p-2 text-xs">
    <summary className="cursor-pointer font-medium">{report.requestIndex === undefined ? "Storyboard" : `Original saved response ${report.requestIndex + 1}`} validation: {report.valid ? "passed" : `${report.issues.length} issues`}</summary>
    <ol className="mt-2 space-y-2 break-words">{report.issues.map((issue, index) => <li key={index} className="space-y-1">
      <p className="font-medium">{issue.sceneNumber ? `Scene ${issue.sceneNumber} · ` : ""}{issue.code}</p>
      <p className="font-mono text-muted-foreground">{issue.fieldPath}</p>
      <p>Expected: {issue.expected} ({issue.expectedType}). Received: {String(issue.received)} ({issue.receivedType}).</p>
    </li>)}</ol>
    {report.normalizations.length > 0 && <p className="mt-2 text-muted-foreground">{report.normalizations.length} safe format corrections evaluated locally. Original response preserved.</p>}
    {report.normalizations.map((change, index) => <p key={index} className="mt-1 break-words text-muted-foreground">{change.code} · {change.fieldPath} · {String(change.from)} → {change.to}</p>)}
  </details>;
}

const fieldClass = "w-full min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60";
function Choice({ label, value, choices, onChange }: { label: string; value: string; choices: readonly string[]; onChange?: (value: string) => void }) {
  return <label className="block space-y-1 text-xs text-muted-foreground"><span>{label}</span><select className={fieldClass} value={value} disabled={!onChange} onChange={e => onChange?.(e.target.value)}>
    {!choices.includes(value) && <option value={value}>Choose a supported value</option>}{choices.map(v => <option key={v} value={v}>{v}</option>)}
  </select></label>;
}
function Delivery({ value, onChange }: { value: VoiceDelivery; onChange?: (value: VoiceDelivery) => void }) {
  const choices = { pace: ["slow", "natural", "energetic"], energy: ["calm", "balanced", "lively"], tone: ["neutral", "warm", "confident"], emphasis: ["none", "light"], style: ["natural", "conversational", "expressive"] };
  return <div className="grid grid-cols-2 gap-2">{(Object.keys(choices) as (keyof VoiceDelivery)[]).map(key => <Choice key={key} label={key} value={value[key]} choices={choices[key]}
    onChange={onChange ? next => onChange({ ...value, [key]: next }) : undefined} />)}</div>;
}
function Field({ label, value, onChange, multiline = true }: { label: string; value: string; onChange?: (value: string) => void; multiline?: boolean }) {
  return <label className="block min-w-0 space-y-1 text-xs text-muted-foreground"><span>{label}</span>
    {onChange ? multiline ? <textarea className={fieldClass} rows={3} value={value} maxLength={label === "Generation prompt" ? 8000 : 2000}
      onChange={event => onChange(event.target.value)} /> : <input className={fieldClass} value={value} onChange={event => onChange(event.target.value)} /> :
      <span className="block whitespace-pre-wrap break-words text-foreground">{value}</span>}
  </label>;
}
function Time({ label, value, onChange }: { label: string; value: number; onChange?: (value: number) => void }) {
  return <label className="space-y-1 text-xs text-muted-foreground"><span>{label} (seconds)</span><input type="number" min={0} max={30} step={0.001}
    className={fieldClass} value={value / 1000} disabled={!onChange} onChange={event => onChange?.(Math.round(Number(event.target.value) * 1000))} /></label>;
}
const stamp = (ms: number) => `${(ms / 1000).toFixed(3)}s`;

function SpeechTiming({ speech, pace }: { speech: StoryboardScene["speech"][number]; pace: Storyboard["voice"]["pace"] }) {
  if (!Number.isSafeInteger(speech.startMs) || !Number.isSafeInteger(speech.endMs) || speech.startMs < 0 || speech.endMs <= speech.startMs) return <p className="text-xs text-warning-foreground">Enter a valid positive speech interval before checking its budget.</p>;
  const budget = speechIntervalBudget(speech.startMs, speech.endMs, typeof speech.delivery === "string" ? pace : speech.delivery.pace);
  return <p className="text-xs text-muted-foreground">{speech.text.trim() ? speech.text.trim().split(/\s+/u).length : 0} words · preferred {budget.preferredTargetWords}, absolute maximum {budget.maximumWords} · {[...speech.text.replace(/\s/gu, "")].length} characters · preferred {budget.preferredTargetNonspaceCharacters}, absolute maximum {budget.maximumNonspaceCharacters}</p>;
}
function Scene({ scene, onChange, onSpeechTextChange, pace }: { scene: StoryboardScene; onChange?: (scene: StoryboardScene) => void;
  onSpeechTextChange?: (index: number, text: string) => void; pace: Storyboard["voice"]["pace"] }) {
  const strings = ["purpose", "description", "productInteraction", "productPosition", "generationNotes", "generationPrompt"] as const;
  const labels = { purpose: "Purpose", description: "Description", productInteraction: "Product interaction", productPosition: "Product positioning", transition: "Transition", generationNotes: "Additional generation directions", generationPrompt: "Generation prompt" };
  return <details className="rounded-lg border border-border bg-card/60 p-3" open={onChange || onSpeechTextChange ? true : undefined}>
    <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
      Scene {scene.number} · {stamp(scene.startMs)}–{stamp(scene.endMs)}<span className="mt-1 block text-xs font-normal text-muted-foreground">{scene.purpose}</span>
    </summary>
    <div className="mt-3 space-y-4">
      {onChange && <div className="grid grid-cols-2 gap-2"><Time label="Scene start" value={scene.startMs} onChange={startMs => onChange({ ...scene, startMs })} />
        <Time label="Scene end" value={scene.endMs} onChange={endMs => onChange({ ...scene, endMs })} /></div>}
      {strings.slice(0, 4).map(key => <Field key={key} label={labels[key]} value={scene[key]} onChange={onChange && (value => onChange({ ...scene, [key]: value }))} />)}
      <div className="space-y-3"><h4 className="text-xs font-medium">Character actions</h4>
        {scene.actions.map((action, index) => <div key={index} className="space-y-2 rounded-md border border-border p-2">
          <p className="text-xs text-muted-foreground">{stamp(action.startMs)}–{stamp(action.endMs)}</p>
          {onChange && <div className="grid grid-cols-2 gap-2">{(["startMs", "endMs"] as const).map(key => <Time key={key} label={key === "startMs" ? "Action start" : "Action end"} value={action[key]}
            onChange={value => onChange({ ...scene, actions: scene.actions.map((item, i) => i === index ? { ...item, [key]: value } : item) })} />)}</div>}
          {(["movement", "gesture", "expression"] as const).map(key => <Field key={key} label={key} value={action[key]} onChange={onChange && (value =>
            onChange({ ...scene, actions: scene.actions.map((item, i) => i === index ? { ...item, [key]: value } : item) }))} />)}
        </div>)}
      </div>
      {(["camera", "lighting"] as const).map(group => <div key={group} className="space-y-2"><h4 className="text-xs font-medium capitalize">{group}</h4>
        {Object.entries(scene[group]).map(([key, value]) => <Field key={key} label={key} value={value} onChange={onChange && (next => onChange({ ...scene, [group]: { ...scene[group], [key]: next } }))} />)}
      </div>)}
      <div className="space-y-2"><h4 className="text-xs font-medium">Audio cues</h4>{(["background", "effects", "music"] as const).map(role => {
        const cue = scene.audio[role];
        return typeof cue === "string" ? <Field key={role} label={role} value={cue} /> : <div key={role} className="space-y-2 rounded border border-border p-2">
          <Choice label={`${role} requirement`} value={cue.requirement} choices={["none", "optional"]} onChange={onChange ? next => onChange({ ...scene, audio: { ...scene.audio, [role]: { ...cue, requirement: next, assetId: null } } }) : undefined} />
          <Field label={`${role} description (optional cue only)`} value={cue.description} onChange={onChange ? next => onChange({ ...scene, audio: { ...scene.audio, [role]: { ...cue, description: next } } }) : undefined} />
          <p className="text-xs text-muted-foreground">Optional cues are not generated or mixed. V1 has no owned music/SFX binding.</p></div>;
      })}</div>
      <div className="space-y-2"><h4 className="text-xs font-medium">Dialogue and narration</h4>
        {!scene.speech.length && <p className="text-xs text-muted-foreground">No speech in this scene.</p>}
        {scene.speech.map((speech, index) => <div key={index} className="space-y-2 rounded-md border border-border p-2">
          <p className="text-xs text-muted-foreground">{speech.speaker} · {stamp(speech.startMs)}–{stamp(speech.endMs)} · same Character voice</p>
          <SpeechTiming speech={speech} pace={pace} />
          {onChange && <><label className="block text-xs text-muted-foreground">Speech type<select className={fieldClass} value={speech.speaker} onChange={event => onChange({ ...scene,
            speech: scene.speech.map((item, i) => i === index ? { ...item, speaker: event.target.value as "character" | "narration" } : item) })}>
            <option value="character">Character dialogue</option><option value="narration">Narration in Character voice</option></select></label>
            <div className="grid grid-cols-2 gap-2">{(["startMs", "endMs"] as const).map(key => <Time key={key} label={key === "startMs" ? "Speech start" : "Speech end"} value={speech[key]}
              onChange={value => onChange({ ...scene, speech: scene.speech.map((item, i) => i === index ? { ...item, [key]: value } : item) })} />)}</div></>}
          <Field label="Spoken words" value={speech.text} onChange={onChange ? value => onChange({ ...scene, speech: scene.speech.map((item, i) => i === index ? { ...item, text: value } : item) }) : onSpeechTextChange ? value => onSpeechTextChange(index, value) : undefined} />
          {typeof speech.delivery === "string" ? <Field label="Legacy voice delivery" value={speech.delivery} /> : <>
            <Delivery value={speech.delivery} onChange={onChange ? value => onChange({ ...scene, speech: scene.speech.map((item, i) => i === index ? { ...item, delivery: value } : item) }) : undefined} />
            <Field label="Descriptive performance note (not an execution requirement)" value={speech.deliveryNote ?? ""} onChange={onChange ? value => onChange({ ...scene, speech: scene.speech.map((item, i) => i === index ? { ...item, deliveryNote: value } : item) }) : undefined} />
          </>}
          {onChange && <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...scene, speech: scene.speech.filter((_, i) => i !== index) })}>Remove speech</Button>}
        </div>)}
        {onChange && scene.speech.length < 8 && <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...scene, speech: [...scene.speech,
          { startMs: scene.startMs, endMs: scene.endMs, speaker: "character", characterAssetId: scene.characterAssetId, text: "", delivery: defaultDelivery(pace), deliveryNote: "" }] })}>Add speech</Button>}
      </div>
      <div className="space-y-2"><Choice label="Executable transition" value={typeof scene.transition === "string" ? "legacy" : scene.transition.type} choices={["none", "cut", "fade_in", "fade_out", "crossfade"]}
        onChange={onChange ? next => onChange({ ...scene, transition: { type: next as Transition["type"], durationMs: next === "none" || next === "cut" ? 0 : 400 } }) : undefined} />
        {typeof scene.transition !== "string" && <Time label="Transition duration" value={scene.transition.durationMs} onChange={onChange ? value => { if (typeof scene.transition !== "string") onChange({ ...scene, transition: { ...scene.transition, durationMs: value } }); } : undefined} />}
        <Field label="Transition description (not execution data)" value={scene.transitionNote ?? (typeof scene.transition === "string" ? scene.transition : "")} onChange={onChange ? value => onChange({ ...scene, transitionNote: value }) : undefined} />
      </div>
      {strings.slice(4).map(key => <Field key={key} label={labels[key]} value={scene[key]} onChange={key !== "generationPrompt" && onChange ? value => onChange({ ...scene, [key]: value }) : undefined} />)}
    </div>
  </details>;
}

export function StoryboardReviewPanel(props: { projectId: string; jobId: string; storyboard?: StoryboardReview; eligible: boolean; enabled: boolean;
  checkStatus: () => void; onSaved: (storyboard: StoryboardReview) => void }) {
  return <StoryboardCard key={`${props.jobId}:${props.storyboard?.id ?? "new"}:${props.storyboard?.version ?? 0}`} {...props} />;
}
function StoryboardCard({ projectId, jobId, storyboard, eligible, enabled, checkStatus, onSaved }: {
  projectId: string; jobId: string; storyboard?: StoryboardReview; eligible: boolean; enabled: boolean;
  checkStatus: () => void; onSaved: (storyboard: StoryboardReview) => void;
}) {
  const [draft, setDraft] = useState<Storyboard | null>(storyboard?.document ?? null);
  const [editing, setEditing] = useState(false); const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [confirmDelete, setConfirmDelete] = useState(false);
  const [validation, setValidation] = useState<StoryboardValidationReport | null>(null);
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const [repairChanges, setRepairChanges] = useState<RepairChange[] | null>(null);
  const saveRequestId = useRef<string | null>(null);
  const normalEditing = editing && manualIndex === null;
  const running = useRef(false);
  const active = !!storyboard && ["queued", "running", "deleting"].includes(storyboard.state) && !storyboard.error;
  async function act(action: "generate" | "save" | "accept" | "reject" | "retry" | "recover") {
    if (running.current) return; running.current = true; setBusy(action); setError(""); setValidation(null);
    try {
      if (action === "save") saveRequestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/ugc/storyboard", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, jobId, version: storyboard?.version ?? 0, action: action === "save" && repairChanges ? "repair_execution" : action,
          ...(action === "save" ? { requestId: saveRequestId.current } : {}),
          ...(storyboard ? { storyboardId: storyboard.id } : {}), ...(["save", "recover"].includes(action) ? { document: draft } : {}),
          ...(action === "recover" ? { requestIndex: manualIndex } : {}) }), signal: AbortSignal.timeout(30_000) });
      const result = await response.json();
      if (result.validation) setValidation(result.validation);
      if (!response.ok || !result.ok) throw new Error(result.message || "Storyboard could not be saved.");
      if (result.storyboard) onSaved(result.storyboard);
      else checkStatus();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Storyboard could not be saved."); checkStatus(); }
    finally { running.current = false; setBusy(""); }
  }
  const canEdit = !!draft && draft.schemaVersion === 2 && !active && storyboard?.current;
  function checkLocalTiming() {
    if (!draft) return;
    const first = draft.scenes[0];
    const result = inspectStoryboard(draft, { durationMs: draft.durationMs, aspectRatio: draft.aspectRatio, visualStyle: draft.visualStyle, tone: draft.tone,
      character: first.characterAssetId, product: first.productAssetId, location: first.locationAssetId });
    setValidation({ validatorVersion: 2, valid: result.issues.length === 0, issues: result.issues, normalizations: [] });
  }
  return <section aria-label="Storyboard" data-lenis-prevent tabIndex={0} className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto overscroll-contain rounded-lg border border-border bg-card/40 p-3">
    <h3 className="text-sm font-medium">AI Storyboard</h3>
    <p role="status" className="text-xs text-muted-foreground">{busy === "save" || busy === "recover" ? "Saving storyboard…" : busy === "reject" ? "Deleting storyboard…" : storyboard ?
      !storyboard.current && !["deleting", "deleted"].includes(storyboard.state) ? "Storyboard needs regeneration" : storyboardStatusLabel(storyboard) : "Plan scenes and a script from your approved references and saved idea."}</p>
    {!eligible && !draft && <p className="text-xs text-muted-foreground">Approve the current Character, Product and Location references first.</p>}
    {!enabled && <p className="text-xs text-muted-foreground">Storyboard generation is awaiting server setup.</p>}
    {storyboard && !storyboard.current && storyboard.state !== "deleted" && <p className="text-xs text-warning-foreground">Inputs or approved references changed. This storyboard needs regeneration. Saved scenes are preserved for review; Reject and Delete before generating a replacement.</p>}
    {storyboard?.error && <p role="status" className="text-xs text-warning-foreground">{storyboard.recovery ? storyboardRecoveryMessage(storyboard.recovery) : storyboardErrorMessage(storyboard.error)}</p>}
    {storyboard?.document && !storyboard.error && storyboard.recovery?.validations?.some(report => !report.valid) && <p className="text-xs text-muted-foreground">Your saved storyboard passed validation. Reports for the unchanged original provider responses are retained below for inspection.</p>}
    {storyboard?.recovery?.validations?.map(report => <ValidationDetails key={report.requestIndex} report={report} />)}
    {validation && <ValidationDetails report={validation} />}
    {draft?.schemaVersion === 1 && storyboard?.current && !active && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => {
      const repair = proposeExecutionRepair(draft); setDraft(repair.document); setRepairChanges(repair.changes); setEditing(true); setDirty(true);
    }}>Review local V1 execution repair</Button>}
    {repairChanges && <details open className="rounded border border-border p-3 text-xs"><summary className="cursor-pointer font-medium">Review proposed execution changes</summary>
      <p className="mt-2">Nothing is saved or approved yet. Save creates a new review revision; the prior approval and package remain in history. No AI request is made.</p>
      <ol className="mt-2 space-y-2">{repairChanges.map((c, i) => <li key={i}>Scene {c.scene} · {c.field}: {c.before} → {c.after}. {c.reason}</li>)}</ol></details>}
    {!!storyboard?.manualRecoveries?.length && <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">You can shorten the saved dialogue yourself, check timing locally and save it for review without OpenAI or a worker. Original responses stay preserved. Timestamps, actions, voice and approved assets stay fixed.</p>
      {storyboard.manualRecoveries.map(candidate => <Button key={candidate.requestIndex} type="button" size="sm" variant="outline" disabled={!!busy || manualIndex !== null}
        onClick={() => { setManualIndex(candidate.requestIndex); setDraft(structuredClone(candidate.document)); setEditing(true); setDirty(false); setValidation(null); setError(""); }}>
        Edit saved response {candidate.requestIndex + 1} dialogue</Button>)}
    </div>}
    {storyboard?.recovery && storyboard.requestCount > 0 && <details className="rounded-md border border-border p-2 text-xs">
      <summary className="cursor-pointer font-medium">Provider and recovery details</summary>
      <dl className="mt-2 space-y-1 break-words text-muted-foreground">
        <div><dt className="inline font-medium">Recovery: </dt><dd className="inline">{storyboard.recovery.availability.replaceAll("_", " ")}</dd></div>
        <div><dt className="inline font-medium">Last failure phase: </dt><dd className="inline">{storyboard.recovery.diagnostic?.phase ?? "Not retained"}</dd></div>
        <div><dt className="inline font-medium">Error category: </dt><dd className="inline">{storyboard.recovery.diagnostic?.category ?? "Unknown — original exception not retained"}</dd></div>
        <div><dt className="inline font-medium">Provider status: </dt><dd className="inline">{storyboard.recovery.receipt?.status ?? storyboard.recovery.diagnostic?.providerStatus ?? storyboard.recovery.metadata?.providerStatus ?? "Not retained"}</dd></div>
        <div><dt className="inline font-medium">HTTP status: </dt><dd className="inline">{storyboard.recovery.diagnostic?.httpStatus ?? storyboard.recovery.metadata?.httpStatus ?? "Not retained"}</dd></div>
        <div><dt className="inline font-medium">Provider code: </dt><dd className="inline">{storyboard.recovery.diagnostic?.providerCode ?? "Not retained"}</dd></div>
        <div><dt className="inline font-medium">Request ID: </dt><dd className="inline">{storyboard.recovery.diagnostic?.requestId ?? storyboard.recovery.metadata?.requestId ?? storyboard.recovery.receipt?.requestId ?? "Not retained"}</dd></div>
        <div><dt className="inline font-medium">Response ID: </dt><dd className="inline">{storyboard.recovery.diagnostic?.responseId ?? storyboard.recovery.metadata?.responseId ?? storyboard.recovery.receipt?.responseId ?? "Not retained"}</dd></div>
        <div><dt className="inline font-medium">Client request ID: </dt><dd className="inline">{storyboard.recovery.diagnostic?.clientRequestId ?? storyboard.recovery.metadata?.clientRequestId ?? "Not retained"}</dd></div>
      </dl>
    </details>}
    {(!storyboard || storyboard.state === "deleted") && eligible && <Button type="button" size="sm" disabled={!enabled || !!busy} onClick={() => void act("generate")}>{busy ? "Starting…" : "Generate Storyboard"}</Button>}
    {storyboard && storyboardQueueMessage(storyboard) && <p role="status" className={storyboard.execution === "queued_delayed" || storyboard.execution === "stalled" ? "text-xs text-warning-foreground" : "text-xs text-muted-foreground"}>{storyboardQueueMessage(storyboard)}</p>}
    {storyboard && <p className="text-xs text-muted-foreground">Worker attempts: {storyboard.attempts ?? 0}/3 · Provider requests: {storyboard.requestCount ?? 0}/2</p>}
    {active && storyboard?.state !== "queued" && !storyboardQueueMessage(storyboard) && <p className="text-xs text-muted-foreground">{storyboard?.state === "deleting" ? "Removing storyboard content. Approved references are preserved." : "Planning and validating your scenes. Progress is saved automatically."}</p>}
    {draft && storyboard?.state !== "deleting" && <>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{draft.durationMs / 1000}s</span><span>{draft.aspectRatio}</span><span>{draft.visualStyle}</span><span>{draft.tone}</span></div>
      <fieldset disabled={!!busy} className="min-w-0 space-y-3">
        <Field label="Title" value={draft.title} onChange={normalEditing ? title => { setDraft({ ...draft, title }); setDirty(true); } : undefined} />
        <Field label="Concept" value={draft.concept} onChange={normalEditing ? concept => { setDraft({ ...draft, concept }); setDirty(true); } : undefined} />
        <details className="rounded-md border border-border p-2"><summary className="cursor-pointer text-xs font-medium">Voice and continuity</summary>
          <div className="mt-2 space-y-3"><Field label="Stable Character voice" value={draft.voice.description} onChange={normalEditing ? description => { setDraft({ ...draft, voice: { ...draft.voice, description } }); setDirty(true); } : undefined} />
            {normalEditing ? <label className="block text-xs text-muted-foreground">Voice pace<select className={fieldClass} value={draft.voice.pace} onChange={event => { setDraft({ ...draft, voice: { ...draft.voice, pace: event.target.value as Storyboard["voice"]["pace"] } }); setDirty(true); }}>
              <option value="slow">Slow</option><option value="natural">Natural</option><option value="energetic">Energetic</option></select></label> : <p className="text-xs text-muted-foreground">Pace: {draft.voice.pace}</p>}
            {(Object.keys(draft.continuity) as (keyof Storyboard["continuity"])[]).map(key => <Field key={key} label={key} value={draft.continuity[key]} onChange={normalEditing ? value => { setDraft({ ...draft, continuity: { ...draft.continuity, [key]: value } }); setDirty(true); } : undefined} />)}
          </div>
        </details>
        <ol aria-label="Scene timeline" className="space-y-3">{draft.scenes.map((scene, index) => <li key={index}><Scene scene={scene} pace={draft.voice.pace}
          onSpeechTextChange={manualIndex !== null ? (lineIndex, text) => { setDraft({ ...draft, scenes: draft.scenes.map((item, i) => i === index ?
            { ...item, speech: item.speech.map((line, j) => j === lineIndex ? { ...line, text } : line) } : item) }); setDirty(true); setValidation(null); } : undefined} onChange={normalEditing ? next => {
          setDraft({ ...draft, scenes: draft.scenes.map((item, i) => index === i ? next : item) }); setDirty(true);
        } : undefined} /></li>)}</ol>
      </fieldset>
      {editing && <p className="text-xs text-muted-foreground">Keep the exact selected duration, whole-second scenes and explicit transition timing. Crossfades need matching scene overlap. Keep speech within its interval. Save before accepting.</p>}
      <div className="flex flex-wrap gap-2">
        {!editing && canEdit && <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => setEditing(true)}>Edit storyboard</Button>}
        {editing && <>{manualIndex !== null && <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={checkLocalTiming}>Check dialogue timing</Button>}
          <Button type="button" size="sm" disabled={!!busy || !dirty || !storyboard?.current} onClick={() => void act(manualIndex !== null ? "recover" : "save")}>{busy === "save" || busy === "recover" ? "Saving…" : manualIndex !== null ? "Save repaired storyboard" : "Save storyboard"}</Button>
          <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => { setDraft(storyboard?.document ?? null); setDirty(false); setEditing(false); setManualIndex(null); setRepairChanges(null); setValidation(null); }}>Cancel edits</Button></>}
        {storyboard?.state === "review" && <Button type="button" size="sm" disabled={!!busy || dirty || !storyboard.current || draft?.schemaVersion !== 2} onClick={() => void act("accept")}>Accept Storyboard</Button>}
      </div>
      {storyboard?.state === "approved" && storyboard.current && !dirty && !repairChanges && <p className="text-xs text-success-foreground">Storyboard saved and approved. Paused before preparing the video-generation package.</p>}
    </>}
    {storyboard?.canRetry && <Button type="button" size="sm" variant="outline" disabled={!enabled || !!busy} onClick={() => void act("retry")}>{storyboard.state === "deleting" ? "Retry deletion" : "Retry saved storyboard work"}</Button>}
    {storyboard?.canDelete && !confirmDelete && <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => setConfirmDelete(true)}>Reject and Delete</Button>}
    {confirmDelete && <div className="space-y-2 rounded-md border border-border p-3">
      {storyboard?.recovery?.validations?.some(report => !report.valid) && <p className="text-xs text-warning-foreground">Review the validation errors above first. Deletion removes the saved responses; recovery cannot rewrite creative content or fit excessive dialogue into its interval. Generating a replacement is a separate paid action.</p>}
      <p className="text-xs text-muted-foreground">Delete this storyboard and unsaved edits? Character, Product and Location references stay approved. Generate Storyboard will be available after deletion.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={!!busy} onClick={() => void act("reject")}>Confirm deletion</Button>
        <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => setConfirmDelete(false)}>Keep storyboard</Button></div></div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </section>;
}
