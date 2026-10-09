import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { CreationWorkspace } from "@/components/creation/creation-workspace";

export const metadata: Metadata = {
  title: "Create with Sceenyk — Your imagination studio",
  description:
    "Explore your next scene. Choose a content type, describe your idea, and preview local media in the Sceenyk creation workspace.",
};

export default function CreatePage() {
  return (
    <div className="sceenyk-container py-8 md:py-12">
      <Link href="/" className="nav-link mb-6">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to inspiration
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
          Workspace preview
        </span>
      </div>
      <CreationWorkspace />
    </div>
  );
}
