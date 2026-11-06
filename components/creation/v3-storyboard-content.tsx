import { ChevronDown } from "lucide-react";
import type { DirectorStoryboard } from "@/lib/final-video-generation-v3/contract";

const seconds = (ms: number) => `${ms / 1000}s`;
const transitions = { none: "No transition", cut: "Cut", fade_in: "Fade in", fade_out: "Fade out", crossfade: "Crossfade" };

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><dt className="text-xs font-semibold text-foreground">{label}</dt><dd className="text-sm leading-relaxed text-muted-foreground">{children}</dd></div>;
}

export function V3StoryboardContent({ storyboard }: { storyboard: DirectorStoryboard }) {
  const cast = "cast" in storyboard ? storyboard.cast : [];
  const renderShots = (shots: DirectorStoryboard["scenes"]) => (
    <ol className="space-y-2" aria-label="Storyboard shots">
      {shots.map(shot => <li key={shot.id}>
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 rounded-xl p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4 [&::-webkit-details-marker]:hidden">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">{shot.number}</span>
            <span className="min-w-0 flex-1 space-y-1">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm"><span className="font-semibold">Shot {shot.number}</span><span className="text-xs text-muted-foreground">{seconds(shot.endMs - shot.startMs)} · {seconds(shot.startMs)}–{seconds(shot.endMs)}</span></span>
              <span className="block text-sm leading-relaxed text-muted-foreground">{shot.purpose}</span>
              {"localStartMs" in shot && <span className="block text-xs text-muted-foreground">Clip timing: {seconds(shot.localStartMs)}–{seconds(shot.localEndMs)}</span>}
            </span>
            <ChevronDown aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground group-open:rotate-180" />
          </summary>
          <dl className="space-y-4 border-t border-border p-3 sm:p-4">
            <Detail label="Scene">{shot.description}</Detail>
            <Detail label="Camera">{shot.camera.shot} · {shot.camera.angle}. {shot.camera.framing}. {shot.camera.movement}. Zoom: {shot.camera.zoom}. Focus: {shot.camera.focus}.</Detail>
            <Detail label="Actions & performance"><ul className="space-y-2">{shot.actions.map((action, i) => <li key={i}><span className="text-xs font-medium text-foreground">{seconds(action.startMs)}–{seconds(action.endMs)}</span><p>{action.movement}. {action.gesture}. {action.expression}.</p></li>)}</ul></Detail>
            <Detail label="Product interaction">{shot.productInteraction}. Position: {shot.productPosition}.</Detail>
            <Detail label="Lighting & atmosphere">{shot.lighting.direction}. {shot.lighting.intensity}. {shot.lighting.colors}. {shot.lighting.atmosphere}.</Detail>
            <Detail label="Dialogue">{shot.speech.some(line => line.text.trim()) ? <ul className="space-y-3">{shot.speech.filter(line => line.text.trim()).map((line, i) => <li key={i}>
              <p className="text-xs font-medium text-foreground">{line.speaker === "narration" ? "Narration" : "characterId" in line ? cast.find(c => c.characterId === line.characterId)?.name ?? "Character" : "Character"} · {seconds(line.startMs)}–{seconds(line.endMs)}</p>
              <p className="mt-1 text-foreground">“{line.text}”</p>
              <p className="mt-1">{line.delivery.pace} pace, {line.delivery.energy} energy, {line.delivery.tone} tone, {line.delivery.style} delivery{line.delivery.emphasis === "light" ? ", light emphasis" : ""}. {line.deliveryNote}</p>
            </li>)}</ul> : "No spoken dialogue."}</Detail>
            <Detail label="Sound"><ul className="space-y-1">{(["background", "effects", "music"] as const).map(role => <li key={role}><span className="font-medium">{role === "background" ? "Ambience" : role === "effects" ? "Effects" : "Music"}:</span> {shot.audio[role].requirement === "none" ? "None" : `${shot.audio[role].description} (${shot.audio[role].requirement})`}</li>)}</ul></Detail>
            <Detail label="Transition & continuity">{transitions[shot.transition.type]}{shot.transition.durationMs > 0 ? ` · ${seconds(shot.transition.durationMs)}` : ""}. {shot.transitionNote}{shot.generationNotes && <p className="mt-1">{shot.generationNotes}</p>}</Detail>
          </dl>
        </details>
      </li>)}
    </ol>
  );
  return <div className="min-w-0 space-y-5 break-words">
    <header className="space-y-2">
      <p className="text-xs font-medium text-primary">{seconds(storyboard.durationMs)} · {storyboard.scenes.length} {storyboard.scenes.length === 1 ? "shot" : "shots"} · {storyboard.visualStyle}</p>
      <h3 className="text-base font-semibold text-foreground">{storyboard.title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{storyboard.concept}</p>
      {storyboard.version === "director-storyboard-connected-v1" && <p className="text-xs text-muted-foreground">{storyboard.clips.length} planned clips · One connected story. Approve or reject the complete Storyboard below.</p>}
      {cast.length > 0 && <p className="text-xs text-muted-foreground">Characters: {cast.map(c => c.name).join(", ")}</p>}
    </header>
    <details className="group rounded-lg bg-muted/40">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        Visual continuity & voice<ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
      </summary>
      <dl className="space-y-3 px-3 pb-3">
        <Detail label="Character">{storyboard.continuity.identity} {storyboard.continuity.appearance} {storyboard.continuity.outfit}</Detail>
        <Detail label="Product">{storyboard.continuity.product}</Detail>
        <Detail label="Location">{storyboard.continuity.location}</Detail>
        <Detail label="Tone & voice">{storyboard.tone}. {storyboard.voiceIntent}</Detail>
      </dl>
    </details>
    {storyboard.version === "director-storyboard-connected-v1" ? <ol className="space-y-3" aria-label="Planned story clips">
      {storyboard.clips.map(clip => <li key={clip.id} className="space-y-3 rounded-xl border border-border p-3 sm:p-4">
        <header className="space-y-1">
          <p className="text-xs font-medium text-primary">Clip {clip.number} · {seconds(clip.durationMs)} · {seconds(clip.startMs)}–{seconds(clip.endMs)}</p>
          <p className="text-sm text-foreground">{clip.purpose}</p>
        </header>
        <details className="rounded-lg bg-muted/40 p-3">
          <summary className="min-h-7 cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Continuity & audio</summary>
          <dl className="mt-3 space-y-3">
            <Detail label="Opening state">{clip.continuityIn}</Detail>
            <Detail label="Closing state">{clip.continuityOut}</Detail>
            <Detail label="Audio continuity">{clip.audioContinuity}</Detail>
          </dl>
        </details>
        {renderShots(storyboard.scenes.filter(shot => shot.clipId === clip.id))}
      </li>)}
    </ol> : renderShots(storyboard.scenes)}
  </div>;
}
