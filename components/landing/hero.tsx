import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Clapperboard,
  Layers,
  Sparkles,
} from "lucide-react";
import { AccountAction } from "@/components/account-action";
import { SceneArtwork } from "@/components/scene-artwork";
import { buttonVariants } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="hero-section relative isolate overflow-hidden border-b border-border">
      <div className="sceenyk-container relative grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1fr_1.05fr] lg:gap-10">
        <div className="min-w-0">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-caption font-medium text-accent-foreground">
            <span className="size-1.5 rounded-full bg-brand-purple" />
            Your imagination. A whole production studio.
          </p>
          <h1 className="max-w-xl text-heading-1 font-bold tracking-tight sm:text-display-lg lg:text-heading-1 xl:text-display-lg">
            Big ideas.
            <br />
            Beautiful scenes.
            <br />
            <span className="text-link">One creative flow.</span>
          </h1>
          <p className="mt-6 max-w-lg text-body-lg text-muted-foreground">
            Turn your ideas, videos, and product images into finished content.
            From the first spark to the final scene, Sceenyk brings it all
            together.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <AccountAction size="lg">
              Create with Sceenyk{" "}
              <ArrowUpRight className="size-5" aria-hidden="true" />
            </AccountAction>
            <a
              href="#how-it-works"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              See how it works{" "}
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-4 flex items-center gap-2 text-caption text-muted-foreground">
            <Sparkles className="size-4 text-link" aria-hidden="true" />
            Start with 2 free short generations at launch.
          </p>
        </div>
        <div className="relative min-w-0 lg:pl-4">
          <div className="scene-board relative overflow-hidden rounded-2xl border border-border bg-card shadow-popover">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 text-caption sm:px-5">
              <span className="flex items-center gap-2 font-medium">
                <Clapperboard className="size-4 text-link" aria-hidden="true" />
                The imagination studio
              </span>
              <span className="text-muted-foreground">Concept preview</span>
            </div>
            <div className="relative aspect-[16/10] overflow-hidden">
              <SceneArtwork className="size-full" />
              <div className="art-caption absolute inset-x-0 bottom-0 px-5 pb-5 pt-14">
                <span className="mb-2 inline-flex rounded-md border border-primary-foreground/25 bg-neutral-950/70 px-2 py-1 text-caption text-primary-foreground">
                  01 / THE OTHER SIDE
                </span>
                <p className="text-heading-3 font-semibold tracking-tight text-primary-foreground">
                  A world that starts with a thought.
                </p>
              </div>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              <div className="flex items-start gap-3 rounded-lg bg-field p-3 text-body-sm">
                <Sparkles
                  className="mt-0.5 size-4 shrink-0 text-link"
                  aria-hidden="true"
                />
                <p className="text-muted-foreground">
                  “An otherworldly landscape. Violet skies. A cinematic escape.”
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2" aria-hidden="true">
                <div className="overflow-hidden rounded-md">
                  <SceneArtwork className="aspect-[16/9] w-full" />
                  <div className="mt-1 text-caption text-muted-foreground">
                    Scene 01
                  </div>
                </div>
                <div className="overflow-hidden rounded-md">
                  <SceneArtwork
                    variant="gaming"
                    className="aspect-[16/9] w-full"
                  />
                  <div className="mt-1 text-caption text-muted-foreground">
                    Scene 02
                  </div>
                </div>
                <div className="overflow-hidden rounded-md">
                  <SceneArtwork
                    variant="product"
                    className="aspect-[16/9] w-full"
                  />
                  <div className="mt-1 text-caption text-muted-foreground">
                    Scene 03
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-caption text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Layers className="size-3.5 text-link" aria-hidden="true" />
                  Scenes
                </span>
                <span className="flex items-center gap-1.5">
                  <AudioLines
                    className="size-3.5 text-secondary-foreground"
                    aria-hidden="true"
                  />
                  Voice & sound
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-link" aria-hidden="true" />
                  One finished story
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="sceenyk-container pb-8">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-caption font-medium tracking-wide text-muted-foreground sm:justify-between">
          <span className="text-foreground">FROM A SPARK TO THE SCREEN</span>
          <span>IDEAS & PROMPTS</span>
          <span>VIDEO & IMAGES</span>
          <span>PRODUCTS & STORIES</span>
          <span className="flex items-center gap-2 text-link">
            FINISHED CONTENT{" "}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </section>
  );
}
