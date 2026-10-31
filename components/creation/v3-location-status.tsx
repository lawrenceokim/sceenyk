"use client";
import { Button } from "@/components/ui/button";
import { v3ActionErrorMessage } from "@/lib/final-video-generation-v3/reference-errors";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";

export function V3LocationStatus({task,busy,dirty,act}:{task:RuntimeDto["tasks"][number]|undefined;busy:boolean;dirty:boolean;
  act:(action:string,payload:Record<string,unknown>)=>Promise<boolean>}) {
  if(!task?.location||!["failed","reconciliation_required"].includes(task.status))return null;
  const location=task.location;
  return <section className="space-y-2 rounded-lg border border-border p-3" aria-label="Location generation status">
    <p role="status" className="text-sm font-medium">{location.failureLabel}</p>
    {location.recoveryAvailable?<p className="text-sm text-muted-foreground">Recover the saved output for your review without another OpenAI request or AI image check.</p>:location.errorCode&&<p className="text-sm text-muted-foreground">{v3ActionErrorMessage(location.errorCode)}</p>}
    {location.recoveryAvailable&&<Button variant="outline" disabled={busy||dirty} onClick={()=>void act("recover_task",{id:task.id})}>Recover saved Location work</Button>}
    {location.canContinue&&<Button variant="outline" disabled={busy||dirty} onClick={()=>void act("location_continue",{id:task.id})}>Continue Location generation</Button>}
    {location.canGenerate&&!location.recoveryAvailable&&!location.canContinue&&<p className="text-sm text-muted-foreground">Generate Location starts a new attempt using the saved requirements. It does not regenerate your Character or Product.</p>}
  </section>;
}
