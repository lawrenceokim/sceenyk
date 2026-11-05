"use client";

import { useId } from "react";
import { studioModeLabel } from "@/lib/studio-mode/contract";
import { useStudioMode } from "./studio-mode-provider";

export function StudioModeSelector({ collapsed = false }: { collapsed?: boolean }) {
  const { mode, ready, pending, error, select, retry } = useStudioMode();
  const id = useId();
  const active = `${studioModeLabel(mode)} Studio active`;
  return <div className="shrink-0 px-2 pb-1 pt-2" data-studio-mode-selector>
    <fieldset disabled={!ready || pending} aria-busy={pending || !ready} aria-describedby={`${id}-status`} className={`min-w-0 ${collapsed ? "w-full" : "w-1/2"}`}>
      <legend className="sr-only">Studio mode</legend>
      <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-0.5">
        {(["basic", "pro"] as const).map(value => <label key={value} title={`${studioModeLabel(value)} Studio`} className="min-w-0 cursor-pointer has-disabled:cursor-wait">
          <input type="radio" name={id} value={value} checked={mode === value} onChange={() => select(value)} aria-label={`${studioModeLabel(value)} Studio`} className="peer sr-only" />
          <span className={`flex items-center justify-center rounded-md px-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-sidebar-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-60 motion-reduce:transition-none ${collapsed ? "min-h-8" : "min-h-6"} ${value === "pro" ? "peer-checked:bg-primary peer-checked:text-primary-foreground" : "peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-sm"}`}>
            {collapsed ? <><span aria-hidden="true">{value === "pro" ? "P" : "B"}</span><span className="sr-only">{studioModeLabel(value)}</span></> : studioModeLabel(value)}
          </span>
        </label>)}
      </div>
    </fieldset>
    <p id={`${id}-status`} role="status" aria-live="polite" className="sr-only">
      {!ready && !error ? "Loading Studio mode…" : pending ? "Saving Studio mode…" : active}
    </p>
    {error && <div className="mt-1 text-[10px] leading-4 text-destructive" role="alert">
      <span className={collapsed ? "sr-only" : undefined}>{error} </span>
      <button type="button" onClick={retry} aria-label="Reload Studio mode" title={error} className="min-h-8 rounded px-1 underline focus-visible:outline-2 focus-visible:outline-ring">Retry</button>
    </div>}
  </div>;
}

export function StudioModeBadge() {
  const { mode, ready, error } = useStudioMode();
  return <span role="status" aria-label={ready ? `${studioModeLabel(mode)} Studio active` : error ? "Studio mode unavailable" : "Loading Studio mode"} aria-live="polite" aria-busy={!ready && !error} data-studio-mode={ready ? mode : undefined}
    className={`inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded-md border px-1.5 text-[10px] font-medium ${ready && mode === "pro" ? "border-primary/25 bg-primary/10 text-primary" : "border-border bg-muted/50 text-muted-foreground"}`}>
    {ready ? studioModeLabel(mode) : "…"}
  </span>;
}
