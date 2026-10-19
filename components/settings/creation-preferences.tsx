"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { aspectRatios } from "@/lib/projects/options";
import { creationCategories } from "@/components/creation/creation-options";
import { creationPreferencesSchema, type CreationPreferences } from "@/lib/settings/contract";
import { saveCreationPreferencesAction } from "@/app/actions/settings";

export function CreationPreferencesForm({ clerkUserId, preferences }: { clerkUserId: string; preferences: CreationPreferences }) {
  const { userId, isLoaded } = useAuth();
  if (!isLoaded) return <p role="status">Loading creation defaults…</p>;
  if (userId !== clerkUserId) return <p role="status">Reopen Settings for your current account.</p>;
  return <PreferenceForm key={userId} clerkUserId={clerkUserId} preferences={preferences} />;
}
function PreferenceForm({ clerkUserId, preferences }: { clerkUserId: string; preferences: CreationPreferences }) {
  const [value, setValue] = useState(preferences);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // A response for an unmounted account must never become the next account's state.
  async function save() {
    if (running.current) return;
    running.current = true; setBusy(true); setMessage(""); setError(false);
    try {
      const result = await saveCreationPreferencesAction(value);
      if (!alive.current) return;
      if (result.ok && result.data.clerkUserId === clerkUserId) { setValue(result.data.preferences); setMessage("Creation defaults saved. They apply to new projects only."); }
      else { setError(true); setMessage(result.ok ? "Reopen Settings for your current account." : result.message); }
    } catch { if (alive.current) { setError(true); setMessage("Your defaults couldn’t be saved. Please try again."); } }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return <form className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-5 p-5 sm:p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `} onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
    <div className="space-y-2"><label className="text-body-sm font-medium" htmlFor="default-aspect">Default aspect ratio</label><select id="default-aspect" name="aspectRatio" value={value.aspectRatio} onChange={event => setValue(creationPreferencesSchema.parse({ ...value, aspectRatio: event.target.value }))} className="sceenyk-input min-h-11 w-full rounded-lg border border-input bg-field px-3">{aspectRatios.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
    <div className="space-y-2"><label className="text-body-sm font-medium" htmlFor="default-category">Default creation category</label><select id="default-category" name="category" value={value.category} onChange={event => setValue(creationPreferencesSchema.parse({ ...value, category: event.target.value }))} className="sceenyk-input min-h-11 w-full rounded-lg border border-input bg-field px-3">{creationCategories.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}</select></div>
  </fieldset><div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save defaults"}</Button><p role="status" className={error ? "text-body-sm text-destructive" : "text-body-sm text-muted-foreground"}>{message}</p></div></form>;
}
