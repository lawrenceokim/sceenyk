import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";

export function CreationHeader({ saved = false }: { saved?: boolean }) {
  return (
    <>
      <Link
        href={saved ? "/dashboard#projects" : "/"}
        className="nav-link mb-6"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {saved ? "Back to your projects" : "Back to inspiration"}
      </Link>
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="max-w-2xl">
          <p className="eyebrow">THE IMAGINATION STUDIO</p>
          <h1 className="mt-3 text-heading-2 font-bold tracking-tight md:text-heading-1">
            Create with Sceenyk
          </h1>
          <p className="mt-3 text-body-lg text-muted-foreground">
            Describe your next scene, bring your own media, and set the creative
            direction.
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-border bg-accent px-3 py-2 text-caption font-medium text-accent-foreground">
          <Sparkles className="size-4" aria-hidden="true" />
          {saved ? "Project draft" : "Your creative brief"}
        </span>
      </div>
    </>
  );
}
