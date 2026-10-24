"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AccountAction } from "@/components/account-action";
import { enqueueUgcGenerationAction, ugcJobProgressAction, ugcReadinessAction } from "@/app/actions/ugc-generation";
import { ugcInputIssue, uniqueUgcIssues, type UgcInputIssue, type UgcReadiness } from "@/lib/ugc-jobs/input-contract";
import type { UgcJobProgress } from "@/lib/ugc-jobs/contract";

export function UgcGenerationControls({ projectId, revision, localIssues, dirty, hasLocalReferences, mediaBusy, mediaError, signedIn, authReady }: {
  projectId: string | null; revision: string; localIssues: UgcInputIssue[];
  dirty: boolean; hasLocalReferences: boolean; mediaBusy: boolean; mediaError: boolean;
  signedIn: boolean; authReady: boolean;
}) {
  const helpId = useId();
  const [refresh, setRefresh] = useState(0);
  const revisionKey = JSON.stringify([projectId, revision]);
  const readKey = JSON.stringify([revisionKey, refresh]);
  const eligible = !!projectId && signedIn && authReady && !dirty && !hasLocalReferences && !mediaBusy && !mediaError && !localIssues.length;
  const [read, setRead] = useState<{ key: string; result: UgcReadiness }>();
  const [submission, setSubmission] = useState<{ key: string; busy: boolean; job?: UgcJobProgress; issues?: UgcInputIssue[] }>();
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!eligible || !projectId) return;
    let active = true;
    void ugcReadinessAction(projectId).then(result => {
      if (active) setRead({ key: readKey, result });
    }).catch(() => {
      if (active) setRead({ key: readKey, result: { ready: false, issues: [ugcInputIssue("READINESS_UNAVAILABLE")] } });
    });
    return () => { active = false; };
  }, [eligible, projectId, readKey]);

  const readiness = read?.key === readKey ? read.result : null;
  const current = submission?.key === revisionKey ? submission : undefined;
  const job = current?.job;
  const busyJob = !!job && !["failed", "cancelled", "completed"].includes(job.status);
  const pauseLabel = job?.stage === "product_reference" ? "Character ready" : job?.stage === "character_reference" ? "References analyzed" : "Inputs validated";
  const checking = eligible && !readiness;
  const issues = uniqueUgcIssues([
    ...(!signedIn ? [ugcInputIssue("AUTHENTICATION_REQUIRED")] : []),
    ...(!projectId || dirty ? [ugcInputIssue("SAVE_PROJECT_REQUIRED")] : []),
    ...localIssues,
    ...(hasLocalReferences || mediaBusy ? [ugcInputIssue("MEDIA_NOT_READY")] : []),
    ...(mediaError ? [ugcInputIssue("MEDIA_UNAVAILABLE")] : []),
    ...(eligible ? readiness?.issues ?? [] : []),
    ...current?.issues ?? [],
  ]);
  const disabled = !eligible || !readiness?.ready || checking || !!submission?.busy || busyJob || !!current?.issues?.length;

  async function prepare() {
    if (disabled || !projectId || inFlight.current) return;
    inFlight.current = true;
    if (attempt.current?.key !== revisionKey || job && !busyJob) attempt.current = { key: revisionKey, id: crypto.randomUUID() };
    const idempotencyKey = attempt.current.id;
    setSubmission({ key: revisionKey, busy: true });
    try {
      const result = await enqueueUgcGenerationAction({ projectId, idempotencyKey });
      setSubmission(result.ok ? { key: revisionKey, busy: false, job: result.job } : { key: revisionKey, busy: false, issues: result.issues });
    } catch { setSubmission({ key: revisionKey, busy: false, issues: [ugcInputIssue("READINESS_UNAVAILABLE")] }); }
    finally { inFlight.current = false; }
  }

  async function checkStatus() {
    if (!job || !projectId) return;
    try {
      const result = await ugcJobProgressAction({ projectId, jobId: job.id });
      setSubmission(current => current?.key !== revisionKey || current.job?.id !== job.id ? current : result.ok
        ? { key: revisionKey, busy: false, job: result.job }
        : { ...current, issues: [ugcInputIssue("READINESS_UNAVAILABLE")] });
    } catch {
      setSubmission(current => current?.key === revisionKey && current.job?.id === job.id
        ? { ...current, issues: [ugcInputIssue("READINESS_UNAVAILABLE")] } : current);
    }
  }

  return <div className="space-y-2">
    <Button type="button" size="lg" className="generation-submit" disabled={disabled} aria-busy={checking || !!submission?.busy} aria-describedby={helpId} onClick={() => void prepare()}>
      {submission?.busy ? "Preparing request…" : busyJob ? job?.paused ? pauseLabel : "Generation requested" : checking ? "Checking inputs…" : job ? "Prepare new generation" : "Prepare generation"}
    </Button>
    {!signedIn && <AccountAction intent="sign-in" disabled={!authReady}>Sign in to generate</AccountAction>}
    <div id={helpId} className="space-y-1 text-caption text-muted-foreground" role="status" aria-live="polite">
      {issues.map(issue => <p key={`${issue.code}:${issue.field}`}>{issue.message}</p>)}
      {job && <p>{job.message}</p>}
      {!job && <p>Video generation is not available yet.</p>}
    </div>
    {eligible && !checking && !submission?.busy && !busyJob && <Button type="button" variant="ghost" size="sm" onClick={() => {
      setSubmission(current => current?.key === revisionKey && !current.job ? undefined : current);
      setRefresh(value => value + 1);
    }}>Check inputs</Button>}
    {job && busyJob && <Button type="button" variant="ghost" size="sm" onClick={() => void checkStatus()}>Check status</Button>}
  </div>;
}
